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

// Breezy HR exposes a public JSON feed at https://{tenant}.breezy.hr/json for
// each tenant that opts in. The feed lists current openings (no description -
// description requires fetching the per-job HTML page, which we skip to keep
// the crawler cheap; title + location + salary still embed usefully).
//
// The CDN refuses non-browser-style UAs and 403s on root paths; the /json path
// itself works with a regular UA.

type Breezy struct {
	HTTP      *http.Client
	Companies []string
}

func NewBreezy(companies []string) *Breezy {
	return &Breezy{
		HTTP:      &http.Client{Timeout: 30 * time.Second},
		Companies: companies,
	}
}

func (b *Breezy) Name() string { return "breezy" }

type breezyPosition struct {
	ID            string `json:"id"`
	FriendlyID    string `json:"friendly_id"`
	Name          string `json:"name"`
	URL           string `json:"url"`
	PublishedDate string `json:"published_date"`
	Type          struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"type"`
	Department string `json:"department"`
	Salary     string `json:"salary"`
	Company    struct {
		Name       string `json:"name"`
		FriendlyID string `json:"friendly_id"`
	} `json:"company"`
	Location  breezyLocation   `json:"location"`
	Locations []breezyLocation `json:"locations"`
}

type breezyLocation struct {
	Country struct {
		Name string `json:"name"`
		ID   string `json:"id"`
	} `json:"country"`
	City     string `json:"city"`
	IsRemote bool   `json:"is_remote"`
	Name     string `json:"name"`
	ID       string `json:"id"`
}

func (b *Breezy) Fetch(ctx context.Context, out chan<- pipeline.JobJSON) error {
	for _, slug := range b.Companies {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := b.fetchOne(ctx, slug, out); err != nil {
			log.Printf("[breezy:%s] %v", slug, err)
		}
	}
	return nil
}

func (b *Breezy) fetchOne(ctx context.Context, slug string, out chan<- pipeline.JobJSON) error {
	url := fmt.Sprintf("https://%s.breezy.hr/json", slug)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	// Breezy's CDN 403s the empty/curl UA; a generic browser-flavor UA passes.
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; OmniJob/1.0; +https://omnijob.app)")

	resp, err := b.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return fmt.Errorf("404 (slug not on breezy?)")
	}
	if resp.StatusCode == http.StatusForbidden {
		return fmt.Errorf("403 (slug not on breezy or feed disabled)")
	}
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("status=%d: %s", resp.StatusCode, body)
	}

	var positions []breezyPosition
	if err := json.NewDecoder(resp.Body).Decode(&positions); err != nil {
		return err
	}

	count := 0
	for _, p := range positions {
		title := strings.TrimSpace(p.Name)
		if title == "" {
			continue
		}
		loc := pickBreezyLocation(p)
		country := loc.Country.ID
		if country == "" {
			country = classifyCountry(loc.Name)
		}
		remote := "unknown"
		if loc.IsRemote {
			remote = "remote"
		} else if loc.Name != "" {
			remote = "onsite"
		}
		// Use salary text + department + location as the embed-friendly synopsis.
		desc := strings.TrimSpace(strings.Join(skipEmpty(
			p.Department,
			p.Type.Name,
			loc.Name,
			p.Salary,
		), " · "))

		company := strings.TrimSpace(p.Company.Name)
		if company == "" {
			company = prettyCompany(slug)
		}
		jobURL := strings.TrimSpace(p.URL)
		if jobURL == "" {
			jobURL = fmt.Sprintf("https://%s.breezy.hr/p/%s", slug, p.ID)
		}

		meta := pipeline.JobMetadata{
			Title:           title,
			Company:         company,
			Location:        loc.Name,
			Country:         country,
			RemoteStatus:    remote,
			ExperienceLevel: classifyLevelFromBody(title, desc),
			Source:          "breezy",
			SourceURL:       jobURL,
			ScrapedAt:       time.Now().UnixMilli(),
			PostedAt:        parseRFC3339Millis(p.PublishedDate),
			Description:     desc,
		}
		// Breezy's salary string is free-form ("£27k - £35k"); ApplySalary parses it.
		ApplySalary(&meta.SalaryMin, &meta.SalaryMax, &meta.SalaryCurrency, &meta.SalaryPeriod, &meta.SalaryRange, p.Salary, desc)

		select {
		case <-ctx.Done():
			return ctx.Err()
		case out <- pipeline.JobJSON{
			ID:       fmt.Sprintf("breezy:%s:%s", slug, sanitizeID(p.ID)),
			Metadata: meta,
		}:
			count++
		}
	}
	log.Printf("[breezy:%s] %d jobs", slug, count)
	return nil
}

// pickBreezyLocation prefers the primary entry from `locations[]` (the array
// form is what Breezy uses for multi-location postings); falls back to the
// flat `location` field on legacy single-location feeds.
func pickBreezyLocation(p breezyPosition) breezyLocation {
	for _, l := range p.Locations {
		if l.Name != "" {
			return l
		}
	}
	return p.Location
}
