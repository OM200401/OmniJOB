package sources

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/omnijob/crawler/internal/pipeline"
)

// Reed.co.uk is the UK's largest job board with a documented public API at
// https://www.reed.co.uk/api. Free tier requires a key (instant signup at
// reed.co.uk/developers). Authentication is HTTP Basic with the key as the
// username and an empty password. Each query returns up to 100 results;
// `totalResults` lets us bound the paging.
//
// Strong UK / EMEA volume signal — complements the US-skewed ATS adapters.
//
// No-op if REED_API_KEY is missing.

type Reed struct {
	HTTP     *http.Client
	APIKey   string
	Queries  []string
	MaxPages int
}

// DefaultReedQueries — broad seeds. Reed's API requires either keywords or a
// location parameter; running with no filter returns 0 results. Operators
// override via REED_QUERIES env (CSV of keyword strings).
var DefaultReedQueries = []string{
	"software engineer",
	"data engineer",
	"machine learning",
	"frontend developer",
	"backend developer",
	"devops",
	"product manager",
}

func NewReed(apiKey string, queries []string, maxPages int) *Reed {
	if maxPages <= 0 {
		maxPages = 3
	}
	if len(queries) == 0 {
		queries = DefaultReedQueries
	}
	return &Reed{
		HTTP:     &http.Client{Timeout: 30 * time.Second},
		APIKey:   apiKey,
		Queries:  queries,
		MaxPages: maxPages,
	}
}

func (r *Reed) Name() string { return "reed" }

type reedResponse struct {
	Results      []reedJob `json:"results"`
	TotalResults int       `json:"totalResults"`
}

type reedJob struct {
	JobID            int64   `json:"jobId"`
	EmployerName     string  `json:"employerName"`
	JobTitle         string  `json:"jobTitle"`
	LocationName     string  `json:"locationName"`
	MinimumSalary    float64 `json:"minimumSalary"`
	MaximumSalary    float64 `json:"maximumSalary"`
	Currency         string  `json:"currency"`
	ExpirationDate   string  `json:"expirationDate"`
	Date             string  `json:"date"`
	JobDescription   string  `json:"jobDescription"`
	Applications     int     `json:"applications"`
	JobURL           string  `json:"jobUrl"`
}

func (r *Reed) Fetch(ctx context.Context, out chan<- pipeline.JobJSON) error {
	if r.APIKey == "" {
		log.Printf("[reed] skipped (set REED_API_KEY to enable)")
		return nil
	}
	for _, q := range r.Queries {
		if err := ctx.Err(); err != nil {
			return err
		}
		for page := 0; page < r.MaxPages; page++ {
			got, total, err := r.fetchPage(ctx, q, page, out)
			if err != nil {
				log.Printf("[reed:%s:p%d] %v", q, page, err)
				break
			}
			if got == 0 {
				break
			}
			// Reed totals up jobs across pagination via `resultsToTake` offset
			// (page × 100). Stop once we've consumed everything advertised.
			if (page+1)*100 >= total {
				break
			}
		}
	}
	return nil
}

func (r *Reed) fetchPage(ctx context.Context, query string, page int, out chan<- pipeline.JobJSON) (int, int, error) {
	const perPage = 100
	q := url.Values{}
	q.Set("keywords", query)
	q.Set("resultsToTake", fmt.Sprintf("%d", perPage))
	q.Set("resultsToSkip", fmt.Sprintf("%d", page*perPage))
	endpoint := "https://www.reed.co.uk/api/1.0/search?" + q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return 0, 0, err
	}
	req.SetBasicAuth(r.APIKey, "")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "OmniJob-Crawler/1.0")

	resp, err := r.HTTP.Do(req)
	if err != nil {
		return 0, 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return 0, 0, fmt.Errorf("status=%d: %s", resp.StatusCode, body)
	}
	var data reedResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return 0, 0, err
	}

	count := 0
	for _, j := range data.Results {
		title := strings.TrimSpace(j.JobTitle)
		company := strings.TrimSpace(j.EmployerName)
		if title == "" || company == "" {
			continue
		}
		desc := stripHTML(j.JobDescription)
		loc := strings.TrimSpace(j.LocationName)

		meta := pipeline.JobMetadata{
			Title:           title,
			Company:         company,
			Location:        loc,
			Country:         "GB",
			RemoteStatus:    classifyRemote(loc, desc),
			ExperienceLevel: classifyLevel(title),
			Source:          "reed",
			SourceURL:       j.JobURL,
			ScrapedAt:       time.Now().UnixMilli(),
			PostedAt:        reedDate(j.Date),
			Description:     desc,
		}
		if j.MinimumSalary > 0 || j.MaximumSalary > 0 {
			meta.SalaryMin = int(j.MinimumSalary)
			meta.SalaryMax = int(j.MaximumSalary)
			meta.SalaryCurrency = strings.ToUpper(strings.TrimSpace(j.Currency))
			if meta.SalaryCurrency == "" {
				meta.SalaryCurrency = "GBP"
			}
			meta.SalaryPeriod = "annual"
			meta.SalaryRange = formatSalaryRange(int64(meta.SalaryMin), int64(meta.SalaryMax), meta.SalaryCurrency)
		} else {
			ApplySalary(&meta.SalaryMin, &meta.SalaryMax, &meta.SalaryCurrency, &meta.SalaryPeriod, &meta.SalaryRange, desc)
		}

		select {
		case <-ctx.Done():
			return count, data.TotalResults, ctx.Err()
		case out <- pipeline.JobJSON{
			ID:       fmt.Sprintf("reed:%d", j.JobID),
			Metadata: meta,
		}:
			count++
		}
	}
	log.Printf("[reed:%s:p%d] %d/%d", query, page, count, data.TotalResults)
	return count, data.TotalResults, nil
}

// Reed posts dates as "DD/MM/YYYY". Convert to UnixMilli; 0 on parse failure.
func reedDate(s string) int64 {
	if s == "" {
		return 0
	}
	for _, layout := range []string{"02/01/2006", "2006-01-02"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UnixMilli()
		}
	}
	return 0
}
