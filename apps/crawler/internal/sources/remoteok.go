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

// RemoteOK exposes a public JSON feed at https://remoteok.com/api whose first
// element is a legal/metadata blob and remaining elements are job postings.
// All jobs are remote by definition.

type RemoteOK struct {
	HTTP *http.Client
}

func NewRemoteOK() *RemoteOK {
	return &RemoteOK{HTTP: &http.Client{Timeout: 30 * time.Second}}
}

func (r *RemoteOK) Name() string { return "remoteok" }

type roEntry struct {
	ID          json.RawMessage `json:"id"`
	Slug        string          `json:"slug"`
	Company     string          `json:"company"`
	Position    string          `json:"position"`
	Tags        []string        `json:"tags"`
	Description string          `json:"description"`
	Location    string          `json:"location"`
	SalaryMin   json.Number     `json:"salary_min"`
	SalaryMax   json.Number     `json:"salary_max"`
	URL         string          `json:"url"`
	ApplyURL    string          `json:"apply_url"`
	Date        string          `json:"date"`
	EpochSecs   json.Number     `json:"epoch"`
	// Legal-blob fields (first element) — used to detect & skip.
	Legal string `json:"legal"`
}

func (r *RemoteOK) Fetch(ctx context.Context, out chan<- pipeline.JobJSON) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://remoteok.com/api", nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	// RemoteOK's CDN serves a sensible response only when a UA is present.
	req.Header.Set("User-Agent", "OmniJob-Crawler/1.0 (+https://omnijob.app)")

	resp, err := r.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("status=%d: %s", resp.StatusCode, body)
	}

	var entries []roEntry
	if err := json.NewDecoder(resp.Body).Decode(&entries); err != nil {
		return err
	}

	count := 0
	for _, e := range entries {
		// Skip the legal-blob first element.
		if e.Legal != "" || e.Position == "" {
			continue
		}
		title := strings.TrimSpace(e.Position)
		company := strings.TrimSpace(e.Company)
		if title == "" || company == "" {
			continue
		}

		desc := stripHTML(e.Description)
		if len(e.Tags) > 0 {
			desc = strings.TrimSpace(desc + "\n\nTags: " + strings.Join(e.Tags, ", "))
		}

		jobURL := strings.TrimSpace(e.URL)
		if jobURL == "" && e.Slug != "" {
			jobURL = "https://remoteok.com/remote-jobs/" + e.Slug
		}
		if jobURL == "" {
			jobURL = strings.TrimSpace(e.ApplyURL)
		}

		posted := parseRFC3339Millis(e.Date)
		if posted == 0 {
			if n, err := e.EpochSecs.Int64(); err == nil && n > 0 {
				posted = n * 1000
			}
		}

		smin, _ := e.SalaryMin.Int64()
		smax, _ := e.SalaryMax.Int64()

		idStr := strings.Trim(string(e.ID), `"`)
		if idStr == "" {
			idStr = e.Slug
		}

		meta := pipeline.JobMetadata{
			Title:           title,
			Company:         company,
			Location:        e.Location,
			Country:         classifyCountry(e.Location),
			RemoteStatus:    "remote",
			ExperienceLevel: classifyLevel(title),
			Source:          "remoteok",
			SourceURL:       jobURL,
			ScrapedAt:       time.Now().UnixMilli(),
			PostedAt:        posted,
			Description:     desc,
		}
		if smin > 0 || smax > 0 {
			meta.SalaryMin = int(smin)
			meta.SalaryMax = int(smax)
			meta.SalaryCurrency = "USD"
			meta.SalaryPeriod = "annual"
			meta.SalaryRange = formatSalaryRange(smin, smax, "USD")
		} else {
			ApplySalary(&meta.SalaryMin, &meta.SalaryMax, &meta.SalaryCurrency, &meta.SalaryPeriod, &meta.SalaryRange, desc)
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case out <- pipeline.JobJSON{
			ID:       fmt.Sprintf("remoteok:%s", sanitizeID(idStr)),
			Metadata: meta,
		}:
			count++
		}
	}
	log.Printf("[remoteok] %d jobs", count)
	return nil
}

// formatSalaryRange renders a structured min/max into the human-readable
// salary_range string used elsewhere ("$110k – $140k USD").
func formatSalaryRange(min, max int64, currency string) string {
	if min == 0 && max == 0 {
		return ""
	}
	if min == 0 {
		return fmt.Sprintf("up to %s %s", thousandsK(max), currency)
	}
	if max == 0 {
		return fmt.Sprintf("from %s %s", thousandsK(min), currency)
	}
	return fmt.Sprintf("%s – %s %s", thousandsK(min), thousandsK(max), currency)
}

func thousandsK(n int64) string {
	if n == 0 {
		return "0"
	}
	if n >= 1000 && n%1000 == 0 {
		return "$" + strconv.FormatInt(n/1000, 10) + "k"
	}
	if n >= 1000 {
		return fmt.Sprintf("$%.1fk", float64(n)/1000)
	}
	return "$" + strconv.FormatInt(n, 10)
}
