package sources

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/omnijob/crawler/internal/pipeline"
)

// Amazon adapter. amazon.jobs exposes a JSON search API at
// /en/search.json that returns paginated job listings with rich
// metadata (title, locations, posted_date, description). The endpoint
// has been stable for years and is what the public careers site
// hydrates from. No auth required; politeness budget = 1 req/sec via
// the per-page sleep below.
//
// We paginate with offset++=100 until either the page returns fewer
// than result_limit jobs or we hit MaxJobs. The site reports total
// "hits" up front; we cap our pull to avoid burning the whole crawler
// budget on a single source.
type Amazon struct {
	HTTP   *http.Client
	// MaxJobs caps the pull per run. amazon.jobs surfaces ~25k+ open
	// roles at any time; pulling everything would dominate the run
	// budget. 5000 is enough to cover the bulk of the index growth
	// per cycle without crowding out other sources. Override via
	// AMAZON_MAX_JOBS env var.
	MaxJobs int
}

func NewAmazon(maxJobs int) *Amazon {
	if maxJobs <= 0 {
		maxJobs = 5000
	}
	return &Amazon{
		HTTP:    &http.Client{Timeout: 30 * time.Second},
		MaxJobs: maxJobs,
	}
}

func (a *Amazon) Name() string { return "amazon" }

type amazonJob struct {
	ID                 string   `json:"id"`
	Title              string   `json:"title"`
	JobPath            string   `json:"job_path"`
	CompanyName        string   `json:"company_name"`
	Description        string   `json:"description"`
	BasicQualifications string  `json:"basic_qualifications"`
	PreferredQualifications string `json:"preferred_qualifications"`
	Responsibilities   string   `json:"responsibilities"`
	BusinessCategory   string   `json:"business_category"`
	JobCategory        string   `json:"job_category"`
	JobFamily          string   `json:"job_family"`
	JobScheduleType    string   `json:"job_schedule_type"`
	Location           string   `json:"location"`
	NormalizedLocation string   `json:"normalized_location"`
	CountryCode        string   `json:"country_code"`
	PostedDate         string   `json:"posted_date"`
}

type amazonSearchResponse struct {
	Error string      `json:"error"`
	Hits  int         `json:"hits"`
	Jobs  []amazonJob `json:"jobs"`
}

func (a *Amazon) Fetch(ctx context.Context, out chan<- pipeline.JobJSON) error {
	const pageSize = 100
	emitted := 0
	for offset := 0; emitted < a.MaxJobs; offset += pageSize {
		if err := ctx.Err(); err != nil {
			return err
		}
		page, err := a.fetchPage(ctx, offset, pageSize)
		if err != nil {
			log.Printf("[amazon] offset=%d: %v", offset, err)
			// Stop on hard errors; the next run will retry. We don't
			// want to spin forever on a broken endpoint.
			return nil
		}
		if len(page.Jobs) == 0 {
			break
		}
		for _, j := range page.Jobs {
			if emitted >= a.MaxJobs {
				break
			}
			job := a.normalize(j)
			select {
			case <-ctx.Done():
				return ctx.Err()
			case out <- job:
				emitted++
			}
		}
		if len(page.Jobs) < pageSize {
			break
		}
		// Politeness: ~1 req/sec. amazon.jobs doesn't publish a rate
		// limit but historically blocks aggressive scrapers; 1s sleep
		// keeps us well under any reasonable threshold and is barely
		// felt across 50 pages (~50s total).
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(800 * time.Millisecond):
		}
	}
	log.Printf("[amazon] %d jobs", emitted)
	return nil
}

func (a *Amazon) fetchPage(ctx context.Context, offset, limit int) (*amazonSearchResponse, error) {
	u, _ := url.Parse("https://www.amazon.jobs/en/search.json")
	q := u.Query()
	q.Set("result_limit", fmt.Sprintf("%d", limit))
	q.Set("offset", fmt.Sprintf("%d", offset))
	// sort=recent makes pagination stable: each page is a contiguous
	// slice of the most-recently-posted set. Without it, page N could
	// contain duplicates of page N-1 as Amazon's default ranking shifts.
	q.Set("sort", "recent")
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
	// Amazon's search.json refuses non-browser-shaped requests. A standard
	// UA + Accept header is sufficient; we don't need cookies or X-CSRF.
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; OmniJob/1.0; +https://omnijob.local)")
	req.Header.Set("Accept", "application/json, text/plain, */*")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")

	resp, err := a.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 256))
		return nil, fmt.Errorf("status=%d: %s", resp.StatusCode, body)
	}
	var data amazonSearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}
	if data.Error != "" {
		return nil, fmt.Errorf("api error: %s", data.Error)
	}
	return &data, nil
}

// normalize joins the structured Amazon job fields into the common
// JobJSON shape. Description is a concat of the four prose blocks
// Amazon returns separately because the search response only includes
// the "description" field for some categories - falling back to the
// qualifications + responsibilities blocks ensures the embedder always
// has something to chew on.
func (a *Amazon) normalize(j amazonJob) pipeline.JobJSON {
	desc := strings.TrimSpace(j.Description)
	parts := []string{desc}
	if s := strings.TrimSpace(j.Responsibilities); s != "" {
		parts = append(parts, "Responsibilities:\n"+s)
	}
	if s := strings.TrimSpace(j.BasicQualifications); s != "" {
		parts = append(parts, "Basic qualifications:\n"+s)
	}
	if s := strings.TrimSpace(j.PreferredQualifications); s != "" {
		parts = append(parts, "Preferred qualifications:\n"+s)
	}
	fullDesc := stripHTML(strings.Join(parts, "\n\n"))

	loc := strings.TrimSpace(j.NormalizedLocation)
	if loc == "" {
		loc = strings.TrimSpace(j.Location)
	}
	// amazon.jobs returns ISO-3 country codes ("USA", "CAN", "BRA") in
	// country_code, but the API ingest schema requires ISO-2 ("US", "CA",
	// "BR") and rejects anything else with 422. Only accept the raw value
	// when it's already 2 chars; otherwise classify from the location
	// string ("San Francisco, California, USA" -> "US"). Without this every
	// Amazon job was silently dropped at ingest.
	rawCC := strings.ToUpper(strings.TrimSpace(j.CountryCode))
	country := ""
	if len(rawCC) == 2 {
		country = rawCC
	} else {
		country = classifyCountry(loc)
	}

	companyName := strings.TrimSpace(j.CompanyName)
	if companyName == "" {
		companyName = "Amazon"
	}

	sourceURL := "https://www.amazon.jobs" + j.JobPath
	title := strings.TrimSpace(j.Title)

	meta := pipeline.JobMetadata{
		Title:           title,
		Company:         companyName,
		Location:        loc,
		Country:         country,
		RemoteStatus:    classifyRemote(loc, fullDesc),
		ExperienceLevel: classifyLevelFromBody(title, fullDesc),
		Source:          "amazon",
		SourceURL:       sourceURL,
		ScrapedAt:       time.Now().UnixMilli(),
		PostedAt:        parseAmazonDate(j.PostedDate),
		Description:     fullDesc,
	}
	ApplySalary(&meta.SalaryMin, &meta.SalaryMax, &meta.SalaryCurrency, &meta.SalaryPeriod, &meta.SalaryRange, fullDesc)
	return pipeline.JobJSON{
		ID:       fmt.Sprintf("amazon:%s", j.ID),
		Vector:   nil,
		Metadata: meta,
	}
}

// parseAmazonDate parses Amazon's "May 14, 2026" / "January 3, 2026"
// posted_date format. Returns 0 on parse failure - upstream code uses
// scraped_at as the fallback for sort purposes.
func parseAmazonDate(s string) int64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}
	for _, layout := range []string{"January 2, 2006", "Jan 2, 2006", "2006-01-02"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UnixMilli()
		}
	}
	return 0
}
