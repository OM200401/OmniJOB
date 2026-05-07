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

// The Muse exposes a documented public API at
// https://www.themuse.com/api/public/jobs that returns 20 results per page
// and reports `page_count` so paging is bounded. No API key is required for
// basic use but registered keys (free, instant) raise the rate limit from
// 500/hr to 3600/hr - operators set MUSE_API_KEY to enable.
//
// Volume sanity-checked at ~500k active postings across all categories.

type TheMuse struct {
	HTTP     *http.Client
	APIKey   string
	MaxPages int
}

func NewTheMuse(apiKey string, maxPages int) *TheMuse {
	if maxPages <= 0 {
		maxPages = 50 // 50 × 20 = 1000 jobs/run; bump via MUSE_MAX_PAGES
	}
	return &TheMuse{
		HTTP:     &http.Client{Timeout: 30 * time.Second},
		APIKey:   apiKey,
		MaxPages: maxPages,
	}
}

func (m *TheMuse) Name() string { return "themuse" }

type museResponse struct {
	Page      int        `json:"page"`
	PageCount int        `json:"page_count"`
	Results   []museJob  `json:"results"`
}

type museJob struct {
	ID            int64           `json:"id"`
	Name          string          `json:"name"`
	Contents      string          `json:"contents"`
	PublicationDate string        `json:"publication_date"`
	Levels        []museName      `json:"levels"`
	Categories    []museName      `json:"categories"`
	Locations     []museName      `json:"locations"`
	Tags          []museName      `json:"tags"`
	Refs          map[string]any  `json:"refs"`
	Company       struct {
		Name string `json:"name"`
	} `json:"company"`
	ShortName string `json:"short_name"`
}

type museName struct {
	Name string `json:"name"`
}

func (m *TheMuse) Fetch(ctx context.Context, out chan<- pipeline.JobJSON) error {
	for page := 0; page < m.MaxPages; page++ {
		if err := ctx.Err(); err != nil {
			return err
		}
		got, last, err := m.fetchPage(ctx, page, out)
		if err != nil {
			log.Printf("[themuse:p%d] %v", page, err)
			break
		}
		if got == 0 || last {
			break
		}
	}
	return nil
}

func (m *TheMuse) fetchPage(ctx context.Context, page int, out chan<- pipeline.JobJSON) (int, bool, error) {
	url := fmt.Sprintf("https://www.themuse.com/api/public/jobs?page=%d&descending=true", page)
	if m.APIKey != "" {
		url += "&api_key=" + m.APIKey
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, true, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "OmniJob-Crawler/1.0 (+https://omnijob.app)")

	resp, err := m.HTTP.Do(req)
	if err != nil {
		return 0, true, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return 0, true, fmt.Errorf("status=%d: %s", resp.StatusCode, body)
	}
	var data museResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return 0, true, err
	}

	count := 0
	for _, j := range data.Results {
		title := strings.TrimSpace(j.Name)
		company := strings.TrimSpace(j.Company.Name)
		if title == "" || company == "" {
			continue
		}
		desc := stripHTML(j.Contents)

		loc := ""
		if len(j.Locations) > 0 {
			loc = strings.TrimSpace(j.Locations[0].Name)
		}
		// "Flexible / Remote" comes through as a location name; honor it.
		remote := classifyRemote(loc, desc)
		if strings.Contains(strings.ToLower(loc), "flexible") {
			remote = "remote"
		}

		level := ""
		if len(j.Levels) > 0 {
			level = strings.ToLower(j.Levels[0].Name)
		}
		expLevel := classifyMuseLevel(level, title)

		jobURL := museRefURL(j.Refs, j.ShortName, j.ID)

		meta := pipeline.JobMetadata{
			Title:           title,
			Company:         company,
			Location:        loc,
			Country:         classifyCountry(loc),
			RemoteStatus:    remote,
			ExperienceLevel: expLevel,
			Source:          "themuse",
			SourceURL:       jobURL,
			ScrapedAt:       time.Now().UnixMilli(),
			PostedAt:        parseRFC3339Millis(j.PublicationDate),
			Description:     desc,
		}
		ApplySalary(&meta.SalaryMin, &meta.SalaryMax, &meta.SalaryCurrency, &meta.SalaryPeriod, &meta.SalaryRange, desc)

		select {
		case <-ctx.Done():
			return count, true, ctx.Err()
		case out <- pipeline.JobJSON{
			ID:       fmt.Sprintf("themuse:%d", j.ID),
			Metadata: meta,
		}:
			count++
		}
	}
	log.Printf("[themuse:p%d] %d jobs", page, count)
	last := page+1 >= data.PageCount
	return count, last, nil
}

func museRefURL(refs map[string]any, shortName string, id int64) string {
	if refs != nil {
		if v, ok := refs["landing_page"].(string); ok && v != "" {
			return v
		}
	}
	if shortName != "" {
		return "https://www.themuse.com/jobs/" + shortName
	}
	return fmt.Sprintf("https://www.themuse.com/jobs/%d", id)
}

// The Muse uses level labels like "Senior Level", "Mid Level", "Internship".
// Fall back to the title-based classifier when the label is empty.
func classifyMuseLevel(label, title string) string {
	switch {
	case strings.Contains(label, "intern"):
		return "intern"
	case strings.Contains(label, "entry"):
		return "junior"
	case strings.Contains(label, "mid"):
		return "mid"
	case strings.Contains(label, "senior"):
		return "senior"
	case strings.Contains(label, "manager") || strings.Contains(label, "management"):
		return "manager"
	case strings.Contains(label, "executive"):
		return "executive"
	}
	return classifyLevel(title)
}
