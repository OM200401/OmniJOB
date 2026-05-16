package sources

import (
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/omnijob/crawler/internal/pipeline"
)

// Personio is the dominant SMB ATS in DACH (Germany / Austria / Switzerland).
// Each tenant exposes a public XML feed at one of:
//
//	https://{tenant}.jobs.personio.com/xml
//	https://{tenant}.jobs.personio.de/xml
//
// The .com host is the English-language default; .de is sometimes the only
// host configured. We try both before giving up.

type Personio struct {
	HTTP      *http.Client
	Companies []string
}

func NewPersonio(companies []string) *Personio {
	return &Personio{
		HTTP:      &http.Client{Timeout: 30 * time.Second},
		Companies: companies,
	}
}

func (p *Personio) Name() string { return "personio" }

type personioFeed struct {
	XMLName   xml.Name           `xml:"workzag-jobs"`
	Positions []personioPosition `xml:"position"`
}

type personioPosition struct {
	ID                 string                 `xml:"id"`
	Subcompany         string                 `xml:"subcompany"`
	Office             string                 `xml:"office"`
	Department         string                 `xml:"department"`
	RecruitingCategory string                 `xml:"recruitingCategory"`
	Name               string                 `xml:"name"`
	EmploymentType     string                 `xml:"employmentType"`
	Seniority          string                 `xml:"seniority"`
	Schedule           string                 `xml:"schedule"`
	YearsOfExperience  string                 `xml:"yearsOfExperience"`
	Occupation         string                 `xml:"occupation"`
	OccupationCategory string                 `xml:"occupationCategory"`
	CreatedAt          string                 `xml:"createdAt"`
	Descriptions       personioJobDescriptions `xml:"jobDescriptions"`
}

type personioJobDescriptions struct {
	Items []personioJobDescription `xml:"jobDescription"`
}

type personioJobDescription struct {
	Name  string `xml:"name"`
	Value string `xml:"value"`
}

func (p *Personio) Fetch(ctx context.Context, out chan<- pipeline.JobJSON) error {
	for i, slug := range p.Companies {
		if err := ctx.Err(); err != nil {
			return err
		}
		// Cloudflare-fronted; spacing requests avoids the per-IP rate limit
		// that 429s us if we hit several tenants back-to-back.
		if i > 0 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(800 * time.Millisecond):
			}
		}
		if err := p.fetchOne(ctx, slug, out); err != nil {
			log.Printf("[personio:%s] %v", slug, err)
		}
	}
	return nil
}

func (p *Personio) fetchOne(ctx context.Context, slug string, out chan<- pipeline.JobJSON) error {
	hosts := []string{
		fmt.Sprintf("https://%s.jobs.personio.com/xml", slug),
		fmt.Sprintf("https://%s.jobs.personio.de/xml", slug),
	}

	var feed personioFeed
	var lastErr error
	usedHost := ""
	for _, url := range hosts {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			lastErr = err
			continue
		}
		req.Header.Set("Accept", "application/xml,text/xml,*/*")
		// Personio's CDN is more permissive with a browser-style UA than the
		// generic crawler UA. The XML feed is intended to be public.
		req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; OmniJob/1.0; +https://omnijob.app)")

		resp, err := p.HTTP.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, 8*1024*1024))
		resp.Body.Close()
		if readErr != nil {
			lastErr = readErr
			continue
		}
		if resp.StatusCode >= 300 {
			lastErr = fmt.Errorf("status=%d", resp.StatusCode)
			continue
		}
		if err := xml.Unmarshal(body, &feed); err != nil {
			lastErr = fmt.Errorf("xml decode: %w", err)
			continue
		}
		usedHost = strings.TrimSuffix(url, "/xml")
		lastErr = nil
		break
	}
	if lastErr != nil {
		return lastErr
	}
	if len(feed.Positions) == 0 {
		return fmt.Errorf("0 positions (likely tenant misconfigured)")
	}

	companyDisplay := prettyCompany(slug)
	count := 0
	for _, pos := range feed.Positions {
		title := pickPersonioName(pos.Name)
		if title == "" {
			continue
		}
		desc := buildPersonioDescription(pos.Descriptions.Items)

		loc := strings.TrimSpace(pickPersonioName(pos.Office))
		country := classifyCountry(loc)

		remote := classifyRemote(loc, desc)
		// Personio doesn't have a structured remote flag; lean on description
		// keywords + the office field. Default to onsite if location set.
		if remote == "unknown" && loc != "" {
			remote = "onsite"
		}

		level := classifyPersonioLevel(pos.Seniority, title, desc)

		jobURL := fmt.Sprintf("%s/job/%s", usedHost, pos.ID)

		meta := pipeline.JobMetadata{
			Title:           title,
			Company:         companyDisplay,
			Location:        loc,
			Country:         country,
			RemoteStatus:    remote,
			ExperienceLevel: level,
			Source:          "personio",
			SourceURL:       jobURL,
			ScrapedAt:       time.Now().UnixMilli(),
			PostedAt:        parseRFC3339Millis(pos.CreatedAt),
			Description:     desc,
		}
		ApplySalary(&meta.SalaryMin, &meta.SalaryMax, &meta.SalaryCurrency, &meta.SalaryPeriod, &meta.SalaryRange, desc)
		job := pipeline.JobJSON{
			ID:       fmt.Sprintf("personio:%s:%s", slug, pos.ID),
			Metadata: meta,
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case out <- job:
			count++
		}
	}
	log.Printf("[personio:%s] %d jobs", slug, count)
	return nil
}

// Personio ships job-description blocks as a list of (name, value HTML) pairs
// with names like "Your role", "Your skills", "Why us". Concatenate them all.
func buildPersonioDescription(items []personioJobDescription) string {
	var b strings.Builder
	for _, it := range items {
		v := stripHTML(it.Value)
		if v == "" {
			continue
		}
		if it.Name != "" {
			b.WriteString(it.Name)
			b.WriteString(": ")
		}
		b.WriteString(v)
		b.WriteString("\n\n")
	}
	return strings.TrimSpace(b.String())
}

// Personio occasionally wraps the visible name in CDATA inside translation
// blocks; for simple feeds it's just the string. Trim either way.
func pickPersonioName(s string) string {
	return strings.TrimSpace(s)
}

func classifyPersonioLevel(seniority, title, description string) string {
	s := strings.ToLower(strings.TrimSpace(seniority))
	switch s {
	case "entry-level", "entry level", "junior":
		return "junior"
	case "experienced", "mid", "professional":
		return "mid"
	case "senior":
		return "senior"
	case "lead", "principal":
		return "principal"
	case "manager":
		return "manager"
	case "director":
		return "director"
	case "executive", "c-level":
		return "executive"
	case "intern", "internship", "student":
		return "intern"
	}
	return classifyLevelFromBody(title, description)
}
