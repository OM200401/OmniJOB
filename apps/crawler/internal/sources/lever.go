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

type Lever struct {
	HTTP      *http.Client
	Companies []string
}

func NewLever(companies []string) *Lever {
	return &Lever{
		HTTP:      &http.Client{Timeout: 30 * time.Second},
		Companies: companies,
	}
}

func (l *Lever) Name() string { return "lever" }

type leverJob struct {
	ID         string `json:"id"`
	Text       string `json:"text"`
	HostedURL  string `json:"hostedUrl"`
	Categories struct {
		Location   string `json:"location"`
		Team       string `json:"team"`
		Commitment string `json:"commitment"`
	} `json:"categories"`
	WorkplaceType   string `json:"workplaceType"` // "remote" | "hybrid" | "on-site"
	DescriptionText string `json:"descriptionPlain"`
	Description     string `json:"description"`
	AdditionalPlain string `json:"additionalPlain"` // Lever often puts salary blurbs here
	CreatedAt       int64  `json:"createdAt"`
}

func (l *Lever) Fetch(ctx context.Context, out chan<- pipeline.JobJSON) error {
	for _, slug := range l.Companies {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := l.fetchOne(ctx, slug, out); err != nil {
			log.Printf("[lever:%s] %v", slug, err)
		}
	}
	return nil
}

func (l *Lever) fetchOne(ctx context.Context, slug string, out chan<- pipeline.JobJSON) error {
	url := fmt.Sprintf("https://api.lever.co/v0/postings/%s?mode=json", slug)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := l.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return fmt.Errorf("404 (slug not on lever?)")
	}
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("status=%d: %s", resp.StatusCode, body)
	}

	var jobs []leverJob
	if err := json.NewDecoder(resp.Body).Decode(&jobs); err != nil {
		return err
	}

	companyDisplay := prettyCompany(slug)
	count := 0
	for _, j := range jobs {
		desc := j.DescriptionText
		if desc == "" {
			desc = stripHTML(j.Description)
		}

		remote := classifyRemoteFromKeyword(j.WorkplaceType)
		if remote == "unknown" {
			remote = classifyRemote(j.Categories.Location, desc)
		}

		title := strings.TrimSpace(j.Text)
		meta := pipeline.JobMetadata{
			Title:           title,
			Company:         companyDisplay,
			Location:        j.Categories.Location,
			Country:         classifyCountry(j.Categories.Location),
			RemoteStatus:    remote,
			ExperienceLevel: classifyLevel(title),
			Source:          "lever",
			SourceURL:       j.HostedURL,
			ScrapedAt:       time.Now().UnixMilli(),
			PostedAt:        j.CreatedAt, // Lever already returns ms
			Description:     desc,
		}
		ApplySalary(&meta.SalaryMin, &meta.SalaryMax, &meta.SalaryCurrency, &meta.SalaryPeriod, &meta.SalaryRange,
			j.AdditionalPlain, desc)
		job := pipeline.JobJSON{
			ID:       fmt.Sprintf("lever:%s:%s", slug, j.ID),
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
	log.Printf("[lever:%s] %d jobs", slug, count)
	return nil
}
