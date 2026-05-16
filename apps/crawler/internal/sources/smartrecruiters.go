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

type SmartRecruiters struct {
	HTTP      *http.Client
	Companies []string
}

func NewSmartRecruiters(companies []string) *SmartRecruiters {
	return &SmartRecruiters{
		HTTP:      &http.Client{Timeout: 30 * time.Second},
		Companies: companies,
	}
}

func (s *SmartRecruiters) Name() string { return "smartrecruiters" }

type srPosting struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	ApplyURL     string `json:"applyUrl"`
	Ref          string `json:"ref"`
	ReleasedDate string `json:"releasedDate"`
	Location     struct {
		City    string `json:"city"`
		Region  string `json:"region"`
		Country string `json:"country"`
		Remote  bool   `json:"remote"`
	} `json:"location"`
	Department       struct{ Label string `json:"label"` } `json:"department"`
	Industry         struct{ Label string `json:"label"` } `json:"industry"`
	Function         struct{ Label string `json:"label"` } `json:"function"`
	ExperienceLevel  struct{ Label string `json:"label"` } `json:"experienceLevel"`
	TypeOfEmployment struct{ Label string `json:"label"` } `json:"typeOfEmployment"`
	Company          struct{ Name string `json:"name"` }  `json:"company"`
}

type srPostingsResponse struct {
	Content    []srPosting `json:"content"`
	TotalFound int         `json:"totalFound"`
	Limit      int         `json:"limit"`
	Offset     int         `json:"offset"`
}

func (s *SmartRecruiters) Fetch(ctx context.Context, out chan<- pipeline.JobJSON) error {
	for _, slug := range s.Companies {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := s.fetchOne(ctx, slug, out); err != nil {
			log.Printf("[smartrecruiters:%s] %v", slug, err)
		}
	}
	return nil
}

func (s *SmartRecruiters) fetchOne(ctx context.Context, slug string, out chan<- pipeline.JobJSON) error {
	const pageSize = 100
	companyDisplay := prettyCompany(slug)
	count := 0
	offset := 0
	for {
		url := fmt.Sprintf(
			"https://api.smartrecruiters.com/v1/companies/%s/postings?limit=%d&offset=%d",
			slug, pageSize, offset,
		)
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return err
		}
		req.Header.Set("Accept", "application/json")

		resp, err := s.HTTP.Do(req)
		if err != nil {
			return err
		}

		if resp.StatusCode == http.StatusNotFound {
			resp.Body.Close()
			return fmt.Errorf("404 (slug not on smartrecruiters?)")
		}
		if resp.StatusCode >= 300 {
			body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
			resp.Body.Close()
			return fmt.Errorf("status=%d: %s", resp.StatusCode, body)
		}

		var data srPostingsResponse
		if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
			resp.Body.Close()
			return err
		}
		resp.Body.Close()

		if len(data.Content) == 0 {
			break
		}

		if err := s.emit(ctx, slug, companyDisplay, data.Content, out, &count); err != nil {
			return err
		}

		offset += len(data.Content)
		if data.TotalFound > 0 && offset >= data.TotalFound {
			break
		}
		if len(data.Content) < pageSize {
			break
		}
	}
	log.Printf("[smartrecruiters:%s] %d jobs", slug, count)
	return nil
}

func (s *SmartRecruiters) emit(
	ctx context.Context,
	slug, companyDisplay string,
	content []srPosting,
	out chan<- pipeline.JobJSON,
	count *int,
) error {
	for _, j := range content {
		title := strings.TrimSpace(j.Name)
		if title == "" {
			continue
		}
		display := companyDisplay
		if j.Company.Name != "" {
			display = j.Company.Name
		}

		var loc string
		if j.Location.Remote {
			loc = "Remote"
			if j.Location.Country != "" {
				loc = "Remote · " + strings.ToUpper(j.Location.Country)
			}
		} else {
			parts := []string{}
			if j.Location.City != "" {
				parts = append(parts, j.Location.City)
			}
			if j.Location.Region != "" && j.Location.Region != j.Location.City {
				parts = append(parts, j.Location.Region)
			}
			if j.Location.Country != "" {
				parts = append(parts, strings.ToUpper(j.Location.Country))
			}
			loc = strings.Join(parts, ", ")
		}

		remote := "unknown"
		if j.Location.Remote {
			remote = "remote"
		} else if loc != "" {
			remote = "onsite"
		}

		// Title + dept + function gives the embedder enough signal.
		// Description requires a per-posting fetch; deferred for v1.
		desc := strings.TrimSpace(j.Department.Label)
		if j.Function.Label != "" {
			if desc != "" {
				desc += " · "
			}
			desc += j.Function.Label
		}

		applyURL := j.ApplyURL
		if applyURL == "" {
			applyURL = fmt.Sprintf("https://jobs.smartrecruiters.com/%s/%s", slug, j.ID)
		}

		meta := pipeline.JobMetadata{
			Title:           title,
			Company:         display,
			Location:        loc,
			Country:         classifyCountry(loc),
			RemoteStatus:    remote,
			ExperienceLevel: classifyLevelFromBody(title, desc),
			Source:          "smartrecruiters",
			SourceURL:       applyURL,
			ScrapedAt:       time.Now().UnixMilli(),
			PostedAt:        parseRFC3339Millis(j.ReleasedDate),
			Description:     desc,
		}
		ApplySalary(&meta.SalaryMin, &meta.SalaryMax, &meta.SalaryCurrency, &meta.SalaryPeriod, &meta.SalaryRange, desc)
		job := pipeline.JobJSON{
			ID:       fmt.Sprintf("smartrecruiters:%s:%s", slug, j.ID),
			Vector:   nil,
			Metadata: meta,
		}

		select {
		case <-ctx.Done():
			return ctx.Err()
		case out <- job:
			*count++
		}
	}
	return nil
}
