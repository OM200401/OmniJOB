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

type Ashby struct {
	HTTP      *http.Client
	Companies []string
}

func NewAshby(companies []string) *Ashby {
	return &Ashby{
		HTTP:      &http.Client{Timeout: 30 * time.Second},
		Companies: companies,
	}
}

func (a *Ashby) Name() string { return "ashby" }

type ashbyJobsResponse struct {
	Jobs []struct {
		ID                  string `json:"id"`
		Title               string `json:"title"`
		LocationName        string `json:"locationName"`
		EmploymentType      string `json:"employmentType"`
		IsRemote            bool   `json:"isRemote"`
		IsListed            bool   `json:"isListed"`
		JobURL              string `json:"jobUrl"`
		ApplyURL            string `json:"applyUrl"`
		DescriptionPlain    string `json:"descriptionPlain"`
		DescriptionHTML     string `json:"descriptionHtml"`
		PublishedDate       string `json:"publishedAt"`
		Department          string `json:"department"`
		SecondaryLocations  []struct {
			LocationName string `json:"locationName"`
		} `json:"secondaryLocations"`
	} `json:"jobs"`
}

func (a *Ashby) Fetch(ctx context.Context, out chan<- pipeline.JobJSON) error {
	for _, slug := range a.Companies {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := a.fetchOne(ctx, slug, out); err != nil {
			log.Printf("[ashby:%s] %v", slug, err)
		}
	}
	return nil
}

func (a *Ashby) fetchOne(ctx context.Context, slug string, out chan<- pipeline.JobJSON) error {
	url := fmt.Sprintf("https://api.ashbyhq.com/posting-api/job-board/%s?includeCompensation=true", slug)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")

	resp, err := a.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return fmt.Errorf("404 (slug not on ashby?)")
	}
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("status=%d: %s", resp.StatusCode, body)
	}

	var data ashbyJobsResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return err
	}

	companyDisplay := prettyCompany(slug)
	count := 0
	for _, j := range data.Jobs {
		if !j.IsListed {
			continue
		}
		desc := j.DescriptionPlain
		if desc == "" {
			desc = stripHTML(j.DescriptionHTML)
		}

		var remote string
		if j.IsRemote {
			remote = "remote"
		} else {
			remote = classifyRemote(j.LocationName, desc)
		}

		title := strings.TrimSpace(j.Title)
		meta := pipeline.JobMetadata{
			Title:           title,
			Company:         companyDisplay,
			Location:        j.LocationName,
			Country:         classifyCountry(j.LocationName),
			RemoteStatus:    remote,
			ExperienceLevel: classifyLevel(title),
			Source:          "ashby",
			SourceURL:       j.JobURL,
			ScrapedAt:       time.Now().UnixMilli(),
			PostedAt:        parseRFC3339Millis(j.PublishedDate),
			Description:     desc,
		}
		ApplySalary(&meta.SalaryMin, &meta.SalaryMax, &meta.SalaryCurrency, &meta.SalaryPeriod, &meta.SalaryRange, desc)
		job := pipeline.JobJSON{
			ID:       fmt.Sprintf("ashby:%s:%s", slug, j.ID),
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
	log.Printf("[ashby:%s] %d jobs", slug, count)
	return nil
}
