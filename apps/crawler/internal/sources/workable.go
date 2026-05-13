package sources

import (
	"bytes"
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

type Workable struct {
	HTTP      *http.Client
	Companies []string
}

func NewWorkable(companies []string) *Workable {
	return &Workable{
		HTTP:      &http.Client{Timeout: 30 * time.Second},
		Companies: companies,
	}
}

func (w *Workable) Name() string { return "workable" }

// Body for the v3 jobs search. Empty arrays = no filter, returns all
// published jobs for the account. Verified live against revolut and
// several other tenants 2026-05-13.
type workableSearchRequest struct {
	Query      string   `json:"query"`
	Department []string `json:"department"`
	Location   []string `json:"location"`
	Workplace  []string `json:"workplace"`
	Worktype   []string `json:"worktype"`
}

type workableJobsResponse struct {
	Total   int `json:"total"`
	Results []struct {
		ID             string `json:"id"`
		Shortcode      string `json:"shortcode"`
		Title          string `json:"title"`
		Department     string `json:"department"`
		Description    string `json:"description"`
		URL            string `json:"url"`
		ApplicationURL string `json:"application_url"`
		Shortlink      string `json:"shortlink"`
		Telecommuting  bool   `json:"telecommuting"`
		Remote         bool   `json:"remote"`
		Location       struct {
			Country string `json:"country"`
			City    string `json:"city"`
			Region  string `json:"region"`
		} `json:"location"`
		PublishedOn string `json:"published_on"`
		Created     string `json:"created"`
	} `json:"results"`
}

func (w *Workable) Fetch(ctx context.Context, out chan<- pipeline.JobJSON) error {
	for _, slug := range w.Companies {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := w.fetchOne(ctx, slug, out); err != nil {
			log.Printf("[workable:%s] %v", slug, err)
		}
	}
	return nil
}

func (w *Workable) fetchOne(ctx context.Context, slug string, out chan<- pipeline.JobJSON) error {
	// Workable's v3 public API moved from GET ?state=published to a POST
	// with a JSON search body. The old GET path now 404s. Verified the
	// current shape by inspecting apply.workable.com/{slug}/ network
	// traffic 2026-05-13. Empty arrays mean "no filter on this dimension".
	url := fmt.Sprintf("https://apply.workable.com/api/v3/accounts/%s/jobs", slug)
	body, err := json.Marshal(workableSearchRequest{
		Query:      "",
		Department: []string{},
		Location:   []string{},
		Workplace:  []string{},
		Worktype:   []string{},
	})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	// Origin matters: Workable's CDN returns 403 to bare API clients without
	// it. Setting it to the tenant's own apply origin mimics the in-browser
	// flow without claiming an external referrer.
	req.Header.Set("Origin", "https://apply.workable.com")
	req.Header.Set("Referer", fmt.Sprintf("https://apply.workable.com/%s/", slug))

	resp, err := w.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return fmt.Errorf("404 (slug not on workable?)")
	}
	if resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("status=%d: %s", resp.StatusCode, respBody)
	}

	var data workableJobsResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return err
	}

	companyDisplay := prettyCompany(slug)
	count := 0
	for _, j := range data.Results {
		title := strings.TrimSpace(j.Title)
		if title == "" {
			continue
		}

		// Build location string.
		parts := []string{}
		if j.Location.City != "" {
			parts = append(parts, j.Location.City)
		}
		if j.Location.Region != "" && j.Location.Region != j.Location.City {
			parts = append(parts, j.Location.Region)
		}
		if j.Location.Country != "" {
			parts = append(parts, j.Location.Country)
		}
		loc := strings.Join(parts, ", ")

		isRemote := j.Remote || j.Telecommuting
		remote := "unknown"
		if isRemote {
			remote = "remote"
		} else if loc != "" {
			remote = "onsite"
		}

		desc := stripHTML(j.Description)
		if desc == "" {
			desc = j.Department
		}

		jobURL := j.URL
		if jobURL == "" {
			jobURL = j.Shortlink
		}
		if jobURL == "" && j.Shortcode != "" {
			jobURL = fmt.Sprintf("https://apply.workable.com/%s/j/%s/", slug, j.Shortcode)
		}

		posted := parseRFC3339Millis(j.PublishedOn)
		if posted == 0 {
			posted = parseRFC3339Millis(j.Created)
		}

		jobID := j.ID
		if jobID == "" {
			jobID = j.Shortcode
		}

		job := pipeline.JobJSON{
			ID:     fmt.Sprintf("workable:%s:%s", slug, jobID),
			Vector: nil,
			Metadata: pipeline.JobMetadata{
				Title:           title,
				Company:         companyDisplay,
				Location:        loc,
				Country:         classifyCountry(loc),
				RemoteStatus:    remote,
				ExperienceLevel: classifyLevel(title),
				Source:          "workable",
				SourceURL:       jobURL,
				ScrapedAt:       time.Now().UnixMilli(),
				PostedAt:        posted,
				Description:     desc,
			},
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case out <- job:
			count++
		}
	}
	log.Printf("[workable:%s] %d jobs", slug, count)
	return nil
}
