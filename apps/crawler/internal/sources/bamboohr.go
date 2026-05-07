package sources

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/omnijob/crawler/internal/pipeline"
)

// BambooHR exposes a public JSON listing at
//
//	https://{tenant}.bamboohr.com/careers/list
//
// and a per-job detail at
//
//	https://{tenant}.bamboohr.com/careers/{id}/detail
//
// Tenants without a public-careers feed redirect /careers/list to
// www.bamboohr.com (size ≈ 47 KB) - we treat that as "tenant not on bamboo".
// The detail endpoint adds the rich description; we fetch it per job, with a
// small inter-request delay to stay polite to the Cloudflare-fronted CDN.

type BambooHR struct {
	HTTP      *http.Client
	Companies []string
}

func NewBambooHR(companies []string) *BambooHR {
	return &BambooHR{
		HTTP:      &http.Client{Timeout: 30 * time.Second},
		Companies: companies,
	}
}

func (b *BambooHR) Name() string { return "bamboohr" }

type bambooListResponse struct {
	Meta struct {
		TotalCount int `json:"totalCount"`
	} `json:"meta"`
	Result []bambooListEntry `json:"result"`
}

type bambooListEntry struct {
	ID                    string `json:"id"`
	JobOpeningName        string `json:"jobOpeningName"`
	DepartmentLabel       string `json:"departmentLabel"`
	EmploymentStatusLabel string `json:"employmentStatusLabel"`
	Location              struct {
		City  string `json:"city"`
		State string `json:"state"`
	} `json:"location"`
	IsRemote     any    `json:"isRemote"`
	LocationType string `json:"locationType"`
}

type bambooDetailResponse struct {
	Result struct {
		JobOpening struct {
			JobOpeningShareURL string `json:"jobOpeningShareUrl"`
			JobOpeningName     string `json:"jobOpeningName"`
			DepartmentLabel    string `json:"departmentLabel"`
			Location           struct {
				City           string `json:"city"`
				State          string `json:"state"`
				PostalCode     string `json:"postalCode"`
				AddressCountry string `json:"addressCountry"`
			} `json:"location"`
			Description string `json:"description"`
			DatePosted  string `json:"datePosted"`
		} `json:"jobOpening"`
	} `json:"result"`
}

func (b *BambooHR) Fetch(ctx context.Context, out chan<- pipeline.JobJSON) error {
	for i, slug := range b.Companies {
		if err := ctx.Err(); err != nil {
			return err
		}
		if i > 0 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(500 * time.Millisecond):
			}
		}
		if err := b.fetchOne(ctx, slug, out); err != nil {
			log.Printf("[bamboohr:%s] %v", slug, err)
		}
	}
	return nil
}

func (b *BambooHR) fetchOne(ctx context.Context, slug string, out chan<- pipeline.JobJSON) error {
	listURL := fmt.Sprintf("https://%s.bamboohr.com/careers/list", slug)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, listURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; OmniJob/1.0; +https://omnijob.app)")

	resp, err := b.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 256))
		return fmt.Errorf("status=%d: %s", resp.StatusCode, body)
	}
	// Tenants without a careers feed redirect /careers/list to the BambooHR
	// marketing homepage - surface as a clear error rather than parse HTML.
	ctype := resp.Header.Get("Content-Type")
	if !strings.Contains(strings.ToLower(ctype), "json") {
		return fmt.Errorf("non-json (slug not on bamboohr?) content-type=%s", ctype)
	}

	var data bambooListResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return err
	}

	companyDisplay := prettyCompany(slug)
	count := 0
	for _, e := range data.Result {
		if err := ctx.Err(); err != nil {
			return err
		}
		job, ok := b.fetchDetail(ctx, slug, e, companyDisplay)
		if !ok {
			continue
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case out <- job:
			count++
		}
	}
	log.Printf("[bamboohr:%s] %d jobs", slug, count)
	return nil
}

func (b *BambooHR) fetchDetail(ctx context.Context, slug string, e bambooListEntry, companyDisplay string) (pipeline.JobJSON, bool) {
	title := strings.TrimSpace(e.JobOpeningName)
	if title == "" {
		return pipeline.JobJSON{}, false
	}

	detailURL := fmt.Sprintf("https://%s.bamboohr.com/careers/%s/detail", slug, e.ID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, detailURL, nil)
	if err != nil {
		return pipeline.JobJSON{}, false
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; OmniJob/1.0; +https://omnijob.app)")

	resp, err := b.HTTP.Do(req)
	if err != nil {
		return pipeline.JobJSON{}, false
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return pipeline.JobJSON{}, false
	}

	var detail bambooDetailResponse
	if err := json.NewDecoder(resp.Body).Decode(&detail); err != nil {
		return pipeline.JobJSON{}, false
	}

	jo := detail.Result.JobOpening
	desc := stripHTML(jo.Description)

	loc := strings.TrimSpace(strings.Join(skipEmpty(
		jo.Location.City,
		jo.Location.State,
		jo.Location.AddressCountry,
	), ", "))
	if loc == "" {
		loc = strings.TrimSpace(strings.Join(skipEmpty(e.Location.City, e.Location.State), ", "))
	}

	// BambooHR's locationType: "0"=on-site, "1"=remote, "2"=hybrid (observed).
	remote := "unknown"
	switch e.LocationType {
	case "1":
		remote = "remote"
	case "2":
		remote = "hybrid"
	case "0":
		remote = "onsite"
	default:
		remote = classifyRemote(loc, desc)
	}

	jobURL := jo.JobOpeningShareURL
	if jobURL == "" {
		jobURL = fmt.Sprintf("https://%s.bamboohr.com/careers/%s", slug, e.ID)
	}

	meta := pipeline.JobMetadata{
		Title:           title,
		Company:         companyDisplay,
		Location:        loc,
		Country:         classifyCountry(loc),
		RemoteStatus:    remote,
		ExperienceLevel: classifyLevel(title),
		Source:          "bamboohr",
		SourceURL:       jobURL,
		ScrapedAt:       time.Now().UnixMilli(),
		PostedAt:        parseRFC3339Millis(jo.DatePosted),
		Description:     desc,
	}
	ApplySalary(&meta.SalaryMin, &meta.SalaryMax, &meta.SalaryCurrency, &meta.SalaryPeriod, &meta.SalaryRange, desc)

	return pipeline.JobJSON{
		ID:       fmt.Sprintf("bamboohr:%s:%s", slug, sanitizeID(e.ID)),
		Metadata: meta,
	}, true
}
