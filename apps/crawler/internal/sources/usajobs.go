package sources

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/omnijob/crawler/internal/pipeline"
)

// USAJobs is the official US federal government jobs portal. Its public Search
// API requires two free headers:
//
//	User-Agent:        <your-registered-email>
//	Authorization-Key: <key from developer.usajobs.gov>
//
// Both are obtained instantly at https://developer.usajobs.gov/APIRequest. The
// adapter no-ops if either is missing so deployments without the key just skip
// this source rather than failing.

type USAJobs struct {
	HTTP   *http.Client
	APIKey string
	UA     string
	// MaxPages caps the crawl depth. The federal index can be 30k+ jobs;
	// 5 pages × 500 results = 2500 jobs per run is a sensible default.
	MaxPages int
}

func NewUSAJobs(apiKey, ua string) *USAJobs {
	return &USAJobs{
		HTTP:     &http.Client{Timeout: 30 * time.Second},
		APIKey:   apiKey,
		UA:       ua,
		MaxPages: 5,
	}
}

func (u *USAJobs) Name() string { return "usajobs" }

type usajResponse struct {
	SearchResult struct {
		SearchResultCount    int                 `json:"SearchResultCount"`
		SearchResultCountAll int                 `json:"SearchResultCountAll"`
		SearchResultItems    []usajResultItem    `json:"SearchResultItems"`
	} `json:"SearchResult"`
}

type usajResultItem struct {
	MatchedObjectID         string             `json:"MatchedObjectId"`
	MatchedObjectDescriptor usajPositionDescr  `json:"MatchedObjectDescriptor"`
}

type usajPositionDescr struct {
	PositionID            string                 `json:"PositionID"`
	PositionTitle         string                 `json:"PositionTitle"`
	PositionURI           string                 `json:"PositionURI"`
	PositionLocation      []usajLoc              `json:"PositionLocation"`
	OrganizationName      string                 `json:"OrganizationName"`
	DepartmentName        string                 `json:"DepartmentName"`
	QualificationSummary  string                 `json:"QualificationSummary"`
	PositionRemuneration  []usajRemuneration     `json:"PositionRemuneration"`
	PublicationStartDate  string                 `json:"PublicationStartDate"`
	UserArea              usajUserArea           `json:"UserArea"`
}

type usajLoc struct {
	LocationName string `json:"LocationName"`
	CountryCode  string `json:"CountryCode"`
}

type usajRemuneration struct {
	MinimumRange     string `json:"MinimumRange"`
	MaximumRange     string `json:"MaximumRange"`
	RateIntervalCode string `json:"RateIntervalCode"`
	Description      string `json:"Description"`
}

type usajUserArea struct {
	Details struct {
		JobSummary string `json:"JobSummary"`
	} `json:"Details"`
}

func (u *USAJobs) Fetch(ctx context.Context, out chan<- pipeline.JobJSON) error {
	if u.APIKey == "" || u.UA == "" {
		log.Printf("[usajobs] skipped (set USAJOBS_API_KEY + USAJOBS_USER_AGENT to enable)")
		return nil
	}
	for page := 1; page <= u.MaxPages; page++ {
		if err := ctx.Err(); err != nil {
			return err
		}
		got, err := u.fetchPage(ctx, page, out)
		if err != nil {
			log.Printf("[usajobs:p%d] %v", page, err)
			break
		}
		if got == 0 {
			break
		}
	}
	return nil
}

func (u *USAJobs) fetchPage(ctx context.Context, page int, out chan<- pipeline.JobJSON) (int, error) {
	const perPage = 500
	url := fmt.Sprintf("https://data.usajobs.gov/api/search?ResultsPerPage=%d&Page=%d", perPage, page)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("Host", "data.usajobs.gov")
	req.Header.Set("User-Agent", u.UA)
	req.Header.Set("Authorization-Key", u.APIKey)
	req.Header.Set("Accept", "application/json")

	resp, err := u.HTTP.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return 0, fmt.Errorf("status=%d: %s", resp.StatusCode, body)
	}
	var data usajResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return 0, err
	}

	count := 0
	for _, item := range data.SearchResult.SearchResultItems {
		d := item.MatchedObjectDescriptor
		title := strings.TrimSpace(d.PositionTitle)
		if title == "" {
			continue
		}
		company := strings.TrimSpace(d.OrganizationName)
		if company == "" {
			company = strings.TrimSpace(d.DepartmentName)
		}
		if company == "" {
			company = "U.S. Federal Government"
		}

		loc := ""
		country := "US"
		if len(d.PositionLocation) > 0 {
			loc = strings.TrimSpace(d.PositionLocation[0].LocationName)
			if c := strings.ToUpper(strings.TrimSpace(d.PositionLocation[0].CountryCode)); c != "" {
				if c == "USA" {
					country = "US"
				} else {
					country = c
				}
			}
		}

		summary := strings.TrimSpace(d.UserArea.Details.JobSummary)
		if summary == "" {
			summary = strings.TrimSpace(d.QualificationSummary)
		}
		desc := stripHTML(summary)

		smin, smax, currency, period := pickRemuneration(d.PositionRemuneration)

		meta := pipeline.JobMetadata{
			Title:           title,
			Company:         company,
			Location:        loc,
			Country:         country,
			RemoteStatus:    classifyRemote(loc, desc),
			ExperienceLevel: classifyLevelFromBody(title, desc),
			// USAJobs is the federal job board - every posting is by
			// definition government. Pre-fill the industry tag so the
			// server-side classifier doesn't have to re-derive it.
			Industry:        "government",
			Source:          "usajobs",
			SourceURL:       d.PositionURI,
			ScrapedAt:       time.Now().UnixMilli(),
			PostedAt:        parseRFC3339Millis(d.PublicationStartDate),
			Description:     desc,
		}
		if smin > 0 || smax > 0 {
			meta.SalaryMin = smin
			meta.SalaryMax = smax
			meta.SalaryCurrency = currency
			meta.SalaryPeriod = period
			meta.SalaryRange = formatSalaryRange(int64(smin), int64(smax), currency)
		} else {
			ApplySalary(&meta.SalaryMin, &meta.SalaryMax, &meta.SalaryCurrency, &meta.SalaryPeriod, &meta.SalaryRange, desc)
		}

		id := d.PositionID
		if id == "" {
			id = item.MatchedObjectID
		}
		select {
		case <-ctx.Done():
			return count, ctx.Err()
		case out <- pipeline.JobJSON{
			ID:       fmt.Sprintf("usajobs:%s", sanitizeID(id)),
			Metadata: meta,
		}:
			count++
		}
	}
	log.Printf("[usajobs:p%d] %d jobs", page, count)
	return count, nil
}

func pickRemuneration(rs []usajRemuneration) (smin, smax int, currency, period string) {
	if len(rs) == 0 {
		return 0, 0, "", ""
	}
	r := rs[0]
	if v, err := strconv.ParseFloat(r.MinimumRange, 64); err == nil {
		smin = int(v)
	}
	if v, err := strconv.ParseFloat(r.MaximumRange, 64); err == nil {
		smax = int(v)
	}
	currency = "USD"
	switch strings.ToUpper(strings.TrimSpace(r.RateIntervalCode)) {
	case "PA", "PER YEAR":
		period = "annual"
	case "PH", "PER HOUR":
		period = "hourly"
	case "PD", "PER DAY":
		period = "daily"
	case "BW", "BIWEEKLY":
		period = "biweekly"
	default:
		period = "annual"
	}
	return
}
