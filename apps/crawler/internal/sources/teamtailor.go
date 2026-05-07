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

// Teamtailor is a Stockholm-based ATS popular with Nordic and continental
// European SMBs. Each tenant exposes a public widget JSON endpoint at
//
//	https://{tenant}.teamtailor.com/widget/v1/jobs
//
// The response follows the JSON:API shape but we only care about the
// flattened `attributes` block on each entry. Relations (department/location)
// can be scoped via include params; for a simple ingest we resolve them out
// of the included block when present.

type Teamtailor struct {
	HTTP      *http.Client
	Companies []string
}

func NewTeamtailor(companies []string) *Teamtailor {
	return &Teamtailor{
		HTTP:      &http.Client{Timeout: 30 * time.Second},
		Companies: companies,
	}
}

func (t *Teamtailor) Name() string { return "teamtailor" }

type ttResponse struct {
	Data     []ttResource `json:"data"`
	Included []ttResource `json:"included"`
	Links    struct {
		Next string `json:"next"`
	} `json:"links"`
}

type ttResource struct {
	ID            string             `json:"id"`
	Type          string             `json:"type"`
	Attributes    map[string]any     `json:"attributes"`
	Relationships map[string]ttRelat `json:"relationships"`
}

type ttRelat struct {
	Data ttRelatData `json:"data"`
}

type ttRelatData struct {
	ID   string `json:"id"`
	Type string `json:"type"`
}

func (t *Teamtailor) Fetch(ctx context.Context, out chan<- pipeline.JobJSON) error {
	for _, slug := range t.Companies {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := t.fetchOne(ctx, slug, out); err != nil {
			log.Printf("[teamtailor:%s] %v", slug, err)
		}
	}
	return nil
}

func (t *Teamtailor) fetchOne(ctx context.Context, slug string, out chan<- pipeline.JobJSON) error {
	url := fmt.Sprintf("https://%s.teamtailor.com/widget/v1/jobs?include=location,department&page[size]=100", slug)
	count := 0
	for url != "" {
		if err := ctx.Err(); err != nil {
			return err
		}
		page, err := t.fetchPage(ctx, url)
		if err != nil {
			return err
		}
		// Build a lookup over included resources for relation resolution.
		incIdx := map[string]ttResource{}
		for _, inc := range page.Included {
			incIdx[inc.Type+":"+inc.ID] = inc
		}
		for _, j := range page.Data {
			if j.Type != "jobs" {
				continue
			}
			job, ok := t.toJob(slug, j, incIdx)
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
		url = page.Links.Next
	}
	log.Printf("[teamtailor:%s] %d jobs", slug, count)
	return nil
}

func (t *Teamtailor) fetchPage(ctx context.Context, url string) (*ttResponse, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.api+json")
	req.Header.Set("User-Agent", "OmniJob-Crawler/1.0")

	resp, err := t.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("404 (slug not on teamtailor?)")
	}
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, fmt.Errorf("status=%d: %s", resp.StatusCode, body)
	}
	var data ttResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}
	return &data, nil
}

func (t *Teamtailor) toJob(slug string, j ttResource, inc map[string]ttResource) (pipeline.JobJSON, bool) {
	title := strings.TrimSpace(stringAttr(j.Attributes, "title"))
	if title == "" {
		return pipeline.JobJSON{}, false
	}
	body := stripHTML(stringAttr(j.Attributes, "body"))
	pitch := stripHTML(stringAttr(j.Attributes, "pitch"))
	desc := strings.TrimSpace(strings.Join([]string{pitch, body}, "\n\n"))

	loc := ""
	if rel := j.Relationships["location"]; rel.Data.ID != "" {
		if r, ok := inc[rel.Data.Type+":"+rel.Data.ID]; ok {
			city := stringAttr(r.Attributes, "city")
			country := stringAttr(r.Attributes, "country")
			loc = strings.TrimSpace(strings.Join(skipEmpty(city, country), ", "))
		}
	}
	if loc == "" {
		// Some tenants flatten location into the job attributes.
		loc = strings.TrimSpace(stringAttr(j.Attributes, "location"))
	}

	remote := canonRemoteFromTT(stringAttr(j.Attributes, "remote-status"))
	if remote == "unknown" {
		remote = classifyRemote(loc, desc)
	}

	posted := parseRFC3339Millis(stringAttr(j.Attributes, "created-at"))
	if posted == 0 {
		posted = parseRFC3339Millis(stringAttr(j.Attributes, "published-at"))
	}

	url := stringAttr(j.Attributes, "career-url")
	if url == "" {
		url = fmt.Sprintf("https://%s.teamtailor.com/jobs/%s", slug, j.ID)
	}

	companyDisplay := prettyCompany(slug)
	meta := pipeline.JobMetadata{
		Title:           title,
		Company:         companyDisplay,
		Location:        loc,
		Country:         classifyCountry(loc),
		RemoteStatus:    remote,
		ExperienceLevel: classifyLevel(title),
		Source:          "teamtailor",
		SourceURL:       url,
		ScrapedAt:       time.Now().UnixMilli(),
		PostedAt:        posted,
		Description:     desc,
	}
	ApplySalary(&meta.SalaryMin, &meta.SalaryMax, &meta.SalaryCurrency, &meta.SalaryPeriod, &meta.SalaryRange, desc)

	return pipeline.JobJSON{
		ID:       fmt.Sprintf("teamtailor:%s:%s", slug, j.ID),
		Metadata: meta,
	}, true
}

func canonRemoteFromTT(s string) string {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "fully", "fully-remote", "remote":
		return "remote"
	case "hybrid", "partial":
		return "hybrid"
	case "no-remote", "none", "on-site", "onsite":
		return "onsite"
	}
	return "unknown"
}

func stringAttr(m map[string]any, k string) string {
	if m == nil {
		return ""
	}
	if v, ok := m[k]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func skipEmpty(parts ...string) []string {
	out := parts[:0]
	for _, p := range parts {
		if strings.TrimSpace(p) != "" {
			out = append(out, p)
		}
	}
	return out
}
