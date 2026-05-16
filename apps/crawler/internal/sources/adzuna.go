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

// Adzuna is a job-search aggregator with a documented public API at
// developer.adzuna.com. Free tier: register to get app_id + app_key, then
// 250-1000 calls/month depending on country (per the developer portal). The
// API spans 16 countries; we default to the English-speaking subset to keep
// the candidate pool tightly aligned with the OmniJOB user base.
//
// The adapter no-ops if either ADZUNA_APP_ID or ADZUNA_APP_KEY is missing -
// no key is committed in repo. Operators set both env vars to enable.
//
// Rate limit per call is the bottleneck rather than total volume, so we cap
// pages-per-country at MaxPages × 50 results.

type Adzuna struct {
	HTTP      *http.Client
	AppID     string
	AppKey    string
	Countries []string // ISO-2 lowercase ("us", "gb", "ca", "au", …)
	MaxPages  int
}

// DefaultAdzunaCountries - Adzuna's English-speaking markets. Operators
// override via ADZUNA_COUNTRIES=<csv>. The full set Adzuna supports as of
// 2026: us, gb, au, ca, de, fr, in, it, nl, nz, pl, sg, za, es, mx, br.
var DefaultAdzunaCountries = []string{"us", "gb", "ca", "au", "in", "sg"}

func NewAdzuna(appID, appKey string, countries []string, maxPages int) *Adzuna {
	if maxPages <= 0 {
		maxPages = 5 // 5 pages × 50 results × 6 countries = 1500 jobs/run
	}
	if len(countries) == 0 {
		countries = DefaultAdzunaCountries
	}
	return &Adzuna{
		HTTP:      &http.Client{Timeout: 30 * time.Second},
		AppID:     appID,
		AppKey:    appKey,
		Countries: countries,
		MaxPages:  maxPages,
	}
}

func (a *Adzuna) Name() string { return "adzuna" }

type adzunaResponse struct {
	Results []adzunaJob `json:"results"`
	Count   int         `json:"count"`
}

type adzunaJob struct {
	ID            string  `json:"id"`
	Title         string  `json:"title"`
	Description   string  `json:"description"`
	Created       string  `json:"created"`
	RedirectURL   string  `json:"redirect_url"`
	SalaryMin     float64 `json:"salary_min"`
	SalaryMax     float64 `json:"salary_max"`
	SalaryIsPredicted string `json:"salary_is_predicted"`
	Company       struct {
		DisplayName string `json:"display_name"`
	} `json:"company"`
	Location struct {
		DisplayName string   `json:"display_name"`
		Area        []string `json:"area"`
	} `json:"location"`
	ContractTime string `json:"contract_time"`
	ContractType string `json:"contract_type"`
	Category     struct {
		Label string `json:"label"`
		Tag   string `json:"tag"`
	} `json:"category"`
}

func (a *Adzuna) Fetch(ctx context.Context, out chan<- pipeline.JobJSON) error {
	if a.AppID == "" || a.AppKey == "" {
		log.Printf("[adzuna] skipped (set ADZUNA_APP_ID + ADZUNA_APP_KEY to enable)")
		return nil
	}
	for _, country := range a.Countries {
		if err := ctx.Err(); err != nil {
			return err
		}
		for page := 1; page <= a.MaxPages; page++ {
			got, err := a.fetchPage(ctx, country, page, out)
			if err != nil {
				log.Printf("[adzuna:%s:p%d] %v", country, page, err)
				break
			}
			if got == 0 {
				break
			}
		}
	}
	return nil
}

func (a *Adzuna) fetchPage(ctx context.Context, country string, page int, out chan<- pipeline.JobJSON) (int, error) {
	const perPage = 50
	url := fmt.Sprintf(
		"https://api.adzuna.com/v1/api/jobs/%s/search/%d?app_id=%s&app_key=%s&results_per_page=%d&content-type=application/json",
		country, page, a.AppID, a.AppKey, perPage,
	)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "OmniJob-Crawler/1.0")

	resp, err := a.HTTP.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return 0, fmt.Errorf("status=%d: %s", resp.StatusCode, body)
	}
	var data adzunaResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return 0, err
	}

	count := 0
	for _, j := range data.Results {
		title := strings.TrimSpace(j.Title)
		company := strings.TrimSpace(j.Company.DisplayName)
		if title == "" || company == "" {
			continue
		}
		desc := stripHTML(j.Description)
		loc := strings.TrimSpace(j.Location.DisplayName)

		country2 := strings.ToUpper(country)
		if country2 == "GB" && strings.Contains(strings.ToLower(loc), "remote") {
			// noop - keep GB as resolved country
		}

		meta := pipeline.JobMetadata{
			Title:           title,
			Company:         company,
			Location:        loc,
			Country:         country2,
			RemoteStatus:    classifyRemote(loc, desc),
			ExperienceLevel: classifyLevelFromBody(title, desc),
			Source:          "adzuna",
			SourceURL:       j.RedirectURL,
			ScrapedAt:       time.Now().UnixMilli(),
			PostedAt:        parseRFC3339Millis(j.Created),
			Description:     desc,
		}
		// Adzuna returns predicted salaries - only trust ones marked non-predicted.
		if (j.SalaryMin > 0 || j.SalaryMax > 0) && j.SalaryIsPredicted == "0" {
			meta.SalaryMin = int(j.SalaryMin)
			meta.SalaryMax = int(j.SalaryMax)
			meta.SalaryCurrency = adzunaCurrency(country)
			meta.SalaryPeriod = "annual"
			meta.SalaryRange = formatSalaryRange(int64(meta.SalaryMin), int64(meta.SalaryMax), meta.SalaryCurrency)
		} else {
			ApplySalary(&meta.SalaryMin, &meta.SalaryMax, &meta.SalaryCurrency, &meta.SalaryPeriod, &meta.SalaryRange, desc)
		}

		select {
		case <-ctx.Done():
			return count, ctx.Err()
		case out <- pipeline.JobJSON{
			ID:       fmt.Sprintf("adzuna:%s:%s", country, sanitizeID(j.ID)),
			Metadata: meta,
		}:
			count++
		}
	}
	log.Printf("[adzuna:%s:p%d] %d jobs", country, page, count)
	return count, nil
}

func adzunaCurrency(country string) string {
	switch strings.ToLower(country) {
	case "us":
		return "USD"
	case "gb":
		return "GBP"
	case "ca":
		return "CAD"
	case "au":
		return "AUD"
	case "nz":
		return "NZD"
	case "in":
		return "INR"
	case "sg":
		return "SGD"
	case "za":
		return "ZAR"
	case "de", "fr", "nl", "it", "es", "pl":
		return "EUR"
	case "br":
		return "BRL"
	case "mx":
		return "MXN"
	}
	return "USD"
}
