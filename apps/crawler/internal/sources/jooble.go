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

// Jooble is a multi-country job-search aggregator with a POST-based REST API
// at https://jooble.org/api/{key}. Free tier requires registering via their
// help center form to receive a key (jooble.org/api/about). The API is
// keyword-based — there's no "list everything" mode — so we issue a small
// set of broad seed queries per region, dedup downstream by ID.
//
// No-op if JOOBLE_API_KEY is missing.

type Jooble struct {
	HTTP    *http.Client
	APIKey  string
	Queries []JoobleQuery
	Pages   int
}

// JoobleQuery — one (keywords, location) tuple. Location can be a country
// name like "United States" or a city; Jooble's geocoder is forgiving.
type JoobleQuery struct {
	Keywords string
	Location string
}

// DefaultJoobleQueries — broad seed queries that cover the OmniJOB user base
// (NA tech). Operators override via JOOBLE_QUERIES env (CSV of "kw|loc"
// tuples). Kept short because each query consumes a request and the free
// tier is bounded.
var DefaultJoobleQueries = []JoobleQuery{
	{Keywords: "software engineer", Location: "United States"},
	{Keywords: "software engineer", Location: "Canada"},
	{Keywords: "data engineer", Location: "United States"},
	{Keywords: "machine learning", Location: "United States"},
	{Keywords: "frontend developer", Location: "Remote"},
	{Keywords: "backend developer", Location: "Remote"},
}

func NewJooble(apiKey string, queries []JoobleQuery, pages int) *Jooble {
	if pages <= 0 {
		pages = 3
	}
	if len(queries) == 0 {
		queries = DefaultJoobleQueries
	}
	return &Jooble{
		HTTP:    &http.Client{Timeout: 30 * time.Second},
		APIKey:  apiKey,
		Queries: queries,
		Pages:   pages,
	}
}

func (j *Jooble) Name() string { return "jooble" }

type joobleRequest struct {
	Keywords string `json:"keywords"`
	Location string `json:"location"`
	Page     int    `json:"page,omitempty"`
}

type joobleResponse struct {
	TotalCount int         `json:"totalCount"`
	Jobs       []joobleJob `json:"jobs"`
}

type joobleJob struct {
	ID       int64  `json:"id"`
	Title    string `json:"title"`
	Location string `json:"location"`
	Snippet  string `json:"snippet"`
	Salary   string `json:"salary"`
	Source   string `json:"source"`
	Type     string `json:"type"`
	Link     string `json:"link"`
	Company  string `json:"company"`
	Updated  string `json:"updated"`
}

func (j *Jooble) Fetch(ctx context.Context, out chan<- pipeline.JobJSON) error {
	if j.APIKey == "" {
		log.Printf("[jooble] skipped (set JOOBLE_API_KEY to enable)")
		return nil
	}
	for _, q := range j.Queries {
		if err := ctx.Err(); err != nil {
			return err
		}
		for page := 1; page <= j.Pages; page++ {
			got, err := j.fetchPage(ctx, q, page, out)
			if err != nil {
				log.Printf("[jooble:%s/%s:p%d] %v", q.Keywords, q.Location, page, err)
				break
			}
			if got == 0 {
				break
			}
		}
	}
	return nil
}

func (j *Jooble) fetchPage(ctx context.Context, q JoobleQuery, page int, out chan<- pipeline.JobJSON) (int, error) {
	body, err := json.Marshal(joobleRequest{Keywords: q.Keywords, Location: q.Location, Page: page})
	if err != nil {
		return 0, err
	}
	url := "https://jooble.org/api/" + j.APIKey
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return 0, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "OmniJob-Crawler/1.0")

	resp, err := j.HTTP.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return 0, fmt.Errorf("status=%d: %s", resp.StatusCode, respBody)
	}
	var data joobleResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return 0, err
	}

	count := 0
	for _, jb := range data.Jobs {
		title := strings.TrimSpace(jb.Title)
		company := strings.TrimSpace(jb.Company)
		if title == "" {
			continue
		}
		// Jooble sometimes leaves company blank when the source is a small
		// board. Fall back to the source attribution so the JobCard isn't
		// completely empty.
		if company == "" {
			company = strings.TrimSpace(jb.Source)
		}
		if company == "" {
			continue
		}
		desc := stripHTML(jb.Snippet)

		meta := pipeline.JobMetadata{
			Title:           title,
			Company:         company,
			Location:        jb.Location,
			Country:         classifyCountry(jb.Location),
			RemoteStatus:    classifyRemote(jb.Location, desc),
			ExperienceLevel: classifyLevel(title),
			Source:          "jooble",
			SourceURL:       jb.Link,
			ScrapedAt:       time.Now().UnixMilli(),
			PostedAt:        parseRFC3339Millis(jb.Updated),
			Description:     desc,
		}
		// Jooble's salary field is a free-text blurb (e.g. "$120,000 a year");
		// run it through the regex parser like any other freeform candidate.
		ApplySalary(&meta.SalaryMin, &meta.SalaryMax, &meta.SalaryCurrency, &meta.SalaryPeriod, &meta.SalaryRange, jb.Salary, desc)

		select {
		case <-ctx.Done():
			return count, ctx.Err()
		case out <- pipeline.JobJSON{
			ID:       fmt.Sprintf("jooble:%d", jb.ID),
			Metadata: meta,
		}:
			count++
		}
	}
	log.Printf("[jooble:%s/%s:p%d] %d jobs", q.Keywords, q.Location, page, count)
	return count, nil
}
