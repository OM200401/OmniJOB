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

type Greenhouse struct {
	HTTP      *http.Client
	Companies []string
}

func NewGreenhouse(companies []string) *Greenhouse {
	return &Greenhouse{
		HTTP:      &http.Client{Timeout: 30 * time.Second},
		Companies: companies,
	}
}

func (g *Greenhouse) Name() string { return "greenhouse" }

type ghJobsResponse struct {
	Jobs []struct {
		ID          int64  `json:"id"`
		Title       string `json:"title"`
		AbsoluteURL string `json:"absolute_url"`
		Content     string `json:"content"` // HTML, sometimes URL-encoded
		Location    struct {
			Name string `json:"name"`
		} `json:"location"`
		UpdatedAt string `json:"updated_at"`
		Offices   []struct {
			Name     string `json:"name"`
			Location string `json:"location"`
		} `json:"offices"`
		Departments []struct {
			Name string `json:"name"`
		} `json:"departments"`
	} `json:"jobs"`
}

func (g *Greenhouse) Fetch(ctx context.Context, out chan<- pipeline.JobJSON) error {
	for _, slug := range g.Companies {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := g.fetchOne(ctx, slug, out); err != nil {
			log.Printf("[greenhouse:%s] %v", slug, err)
		}
	}
	return nil
}

func (g *Greenhouse) fetchOne(ctx context.Context, slug string, out chan<- pipeline.JobJSON) error {
	url := fmt.Sprintf("https://boards-api.greenhouse.io/v1/boards/%s/jobs?content=true", slug)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := g.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return fmt.Errorf("404 (slug not on greenhouse?)")
	}
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("status=%d: %s", resp.StatusCode, body)
	}

	var data ghJobsResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return err
	}

	companyDisplay := prettyCompany(slug)
	count := 0
	for _, j := range data.Jobs {
		desc := stripHTML(j.Content)
		loc := j.Location.Name
		if loc == "" && len(j.Offices) > 0 {
			loc = j.Offices[0].Name
		}
		remote := classifyRemote(loc, desc)

		title := strings.TrimSpace(j.Title)
		meta := pipeline.JobMetadata{
			Title:           title,
			Company:         companyDisplay,
			Location:        loc,
			Country:         classifyCountry(loc),
			RemoteStatus:    remote,
			ExperienceLevel: classifyLevel(title),
			Source:          "greenhouse",
			SourceURL:       j.AbsoluteURL,
			ScrapedAt:       time.Now().UnixMilli(),
			PostedAt:        parseRFC3339Millis(j.UpdatedAt),
			Description:     desc,
		}
		ApplySalary(&meta.SalaryMin, &meta.SalaryMax, &meta.SalaryCurrency, &meta.SalaryPeriod, &meta.SalaryRange, desc)
		job := pipeline.JobJSON{
			ID:       fmt.Sprintf("greenhouse:%s:%d", slug, j.ID),
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
	log.Printf("[greenhouse:%s] %d jobs", slug, count)
	return nil
}
