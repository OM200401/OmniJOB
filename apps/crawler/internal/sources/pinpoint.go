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

// Pinpoint exposes a public board JSON at
//
//	https://{tenant}.pinpointhq.com/postings.json
//
// (the authenticated /api/v1/jobs endpoint requires a tenant token; the
// public /postings.json one does not). Each posting is fully populated with
// title / description / location / compensation, so we don't need a per-job
// detail fetch.

type Pinpoint struct {
	HTTP      *http.Client
	Companies []string
}

func NewPinpoint(companies []string) *Pinpoint {
	return &Pinpoint{
		HTTP:      &http.Client{Timeout: 30 * time.Second},
		Companies: companies,
	}
}

func (p *Pinpoint) Name() string { return "pinpoint" }

type pinpointResponse struct {
	Data []pinpointPosting `json:"data"`
}

type pinpointPosting struct {
	ID                       string `json:"id"`
	Title                    string `json:"title"`
	Description              string `json:"description"`
	KeyResponsibilities      string `json:"key_responsibilities"`
	SkillsKnowledgeExpertise string `json:"skills_knowledge_expertise"`
	Benefits                 string `json:"benefits"`
	URL                      string `json:"url"`
	EmploymentType           string `json:"employment_type"`
	WorkplaceType            string `json:"workplace_type"`
	CompensationMinimum      json.Number `json:"compensation_minimum"`
	CompensationMaximum      json.Number `json:"compensation_maximum"`
	CompensationCurrency     string `json:"compensation_currency"`
	CompensationFrequency    string `json:"compensation_frequency"`
	Location                 *struct {
		City     string `json:"city"`
		Province string `json:"province"`
		Name     string `json:"name"`
	} `json:"location"`
	Job *struct {
		ID         string `json:"id"`
		Department *struct {
			Name string `json:"name"`
		} `json:"department"`
		PublishedAt string `json:"published_at"`
	} `json:"job"`
}

func (p *Pinpoint) Fetch(ctx context.Context, out chan<- pipeline.JobJSON) error {
	for _, slug := range p.Companies {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := p.fetchOne(ctx, slug, out); err != nil {
			log.Printf("[pinpoint:%s] %v", slug, err)
		}
	}
	return nil
}

func (p *Pinpoint) fetchOne(ctx context.Context, slug string, out chan<- pipeline.JobJSON) error {
	url := fmt.Sprintf("https://%s.pinpointhq.com/postings.json", slug)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "OmniJob-Crawler/1.0")

	resp, err := p.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return fmt.Errorf("404 (slug not on pinpoint?)")
	}
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("status=%d: %s", resp.StatusCode, body)
	}

	var data pinpointResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return err
	}

	companyDisplay := prettyCompany(slug)
	count := 0
	for _, post := range data.Data {
		title := strings.TrimSpace(post.Title)
		if title == "" {
			continue
		}

		// Concatenate the structured sections — Pinpoint splits content across
		// description / key_responsibilities / skills / benefits.
		desc := strings.TrimSpace(strings.Join(skipEmpty(
			stripHTML(post.Description),
			stripHTML(post.KeyResponsibilities),
			stripHTML(post.SkillsKnowledgeExpertise),
			stripHTML(post.Benefits),
		), "\n\n"))

		loc := ""
		if post.Location != nil {
			loc = strings.TrimSpace(post.Location.Name)
			if loc == "" {
				loc = strings.TrimSpace(strings.Join(skipEmpty(post.Location.City, post.Location.Province), ", "))
			}
		}

		remote := canonRemoteFromPinpoint(post.WorkplaceType)
		if remote == "unknown" {
			remote = classifyRemote(loc, desc)
		}

		posted := int64(0)
		if post.Job != nil {
			posted = parseRFC3339Millis(post.Job.PublishedAt)
		}

		meta := pipeline.JobMetadata{
			Title:           title,
			Company:         companyDisplay,
			Location:        loc,
			Country:         classifyCountry(loc),
			RemoteStatus:    remote,
			ExperienceLevel: classifyLevel(title),
			Source:          "pinpoint",
			SourceURL:       strings.TrimSpace(post.URL),
			ScrapedAt:       time.Now().UnixMilli(),
			PostedAt:        posted,
			Description:     desc,
		}
		// Prefer structured comp when present; fall back to in-description parsing.
		if min, max, cur, period := pinpointSalary(post); max > 0 {
			meta.SalaryMin = int(min)
			meta.SalaryMax = int(max)
			meta.SalaryCurrency = cur
			meta.SalaryPeriod = period
			meta.SalaryRange = formatSalaryRange(min, max, cur)
		} else {
			ApplySalary(&meta.SalaryMin, &meta.SalaryMax, &meta.SalaryCurrency, &meta.SalaryPeriod, &meta.SalaryRange, desc)
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case out <- pipeline.JobJSON{
			ID:       fmt.Sprintf("pinpoint:%s:%s", slug, sanitizeID(post.ID)),
			Metadata: meta,
		}:
			count++
		}
	}
	log.Printf("[pinpoint:%s] %d jobs", slug, count)
	return nil
}

func canonRemoteFromPinpoint(s string) string {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "remote", "fully_remote":
		return "remote"
	case "hybrid":
		return "hybrid"
	case "onsite", "on_site", "office":
		return "onsite"
	}
	return "unknown"
}

func pinpointSalary(post pinpointPosting) (int64, int64, string, string) {
	min, _ := post.CompensationMinimum.Int64()
	max, _ := post.CompensationMaximum.Int64()
	cur := strings.ToUpper(strings.TrimSpace(post.CompensationCurrency))
	if cur == "" {
		cur = "USD"
	}
	period := "annual"
	switch strings.ToLower(strings.TrimSpace(post.CompensationFrequency)) {
	case "hourly", "hour", "per_hour":
		period = "hourly"
	case "monthly", "month":
		period = "monthly"
	case "weekly", "week":
		period = "weekly"
	case "daily", "day":
		period = "daily"
	}
	return min, max, cur, period
}
