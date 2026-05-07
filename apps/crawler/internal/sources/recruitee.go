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

type Recruitee struct {
	HTTP      *http.Client
	Companies []string
}

func NewRecruitee(companies []string) *Recruitee {
	return &Recruitee{
		HTTP:      &http.Client{Timeout: 30 * time.Second},
		Companies: companies,
	}
}

func (r *Recruitee) Name() string { return "recruitee" }

type recruiteeOffersResponse struct {
	Offers []struct {
		ID            int64  `json:"id"`
		Title         string `json:"title"`
		Department    string `json:"department"`
		City          string `json:"city"`
		Country       string `json:"country"`
		CountryCode   string `json:"country_code"`
		Location      string `json:"location"`
		Remote        bool   `json:"remote"`
		URL           string `json:"url"`
		CareersURL    string `json:"careers_url"`
		CareersAppURL string `json:"careers_apply_url"`
		Description   string `json:"description"`
		Requirements  string `json:"requirements"`
		CreatedAt     string `json:"created_at"`
		PublishedAt   string `json:"published_at"`
		Status        string `json:"status"`
		EmploymentType string `json:"employment_type_code"`
	} `json:"offers"`
}

func (r *Recruitee) Fetch(ctx context.Context, out chan<- pipeline.JobJSON) error {
	for _, slug := range r.Companies {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := r.fetchOne(ctx, slug, out); err != nil {
			log.Printf("[recruitee:%s] %v", slug, err)
		}
	}
	return nil
}

func (r *Recruitee) fetchOne(ctx context.Context, slug string, out chan<- pipeline.JobJSON) error {
	url := fmt.Sprintf("https://%s.recruitee.com/api/offers/", slug)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := r.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return fmt.Errorf("404 (slug not on recruitee?)")
	}
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("status=%d: %s", resp.StatusCode, body)
	}

	var data recruiteeOffersResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return err
	}

	companyDisplay := prettyCompany(slug)
	count := 0
	for _, j := range data.Offers {
		if j.Status != "" && j.Status != "published" {
			continue
		}
		title := strings.TrimSpace(j.Title)
		if title == "" {
			continue
		}

		loc := j.Location
		if loc == "" {
			parts := []string{}
			if j.City != "" {
				parts = append(parts, j.City)
			}
			if j.Country != "" {
				parts = append(parts, j.Country)
			}
			loc = strings.Join(parts, ", ")
		}

		remote := "unknown"
		if j.Remote {
			remote = "remote"
		} else if loc != "" {
			remote = "onsite"
		}

		desc := stripHTML(j.Description)
		if j.Requirements != "" {
			desc = desc + "\n\n" + stripHTML(j.Requirements)
			desc = strings.TrimSpace(desc)
		}

		jobURL := j.CareersURL
		if jobURL == "" {
			jobURL = j.URL
		}
		if jobURL == "" {
			jobURL = j.CareersAppURL
		}

		country := strings.ToUpper(strings.TrimSpace(j.CountryCode))
		if country == "" {
			country = classifyCountry(loc)
		}

		posted := parseRFC3339Millis(j.PublishedAt)
		if posted == 0 {
			posted = parseRFC3339Millis(j.CreatedAt)
		}

		meta := pipeline.JobMetadata{
			Title:           title,
			Company:         companyDisplay,
			Location:        loc,
			Country:         country,
			RemoteStatus:    remote,
			ExperienceLevel: classifyLevel(title),
			Source:          "recruitee",
			SourceURL:       jobURL,
			ScrapedAt:       time.Now().UnixMilli(),
			PostedAt:        posted,
			Description:     desc,
		}
		ApplySalary(&meta.SalaryMin, &meta.SalaryMax, &meta.SalaryCurrency, &meta.SalaryPeriod, &meta.SalaryRange, desc)
		job := pipeline.JobJSON{
			ID:       fmt.Sprintf("recruitee:%s:%d", slug, j.ID),
			Vector:   nil,
			Metadata: meta,
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case out <- job:
			count++
		}
	}
	log.Printf("[recruitee:%s] %d jobs", slug, count)
	return nil
}
