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
	"sync"
	"time"

	"github.com/omnijob/crawler/internal/pipeline"
)

// Workday's public Customer Experience Service (CXS) API. Each tenant exposes
// a public job board at `{tenant}.{region}.myworkdayjobs.com/{site}` and a
// JSON endpoint at `/wday/cxs/{tenant}/{site}/jobs`. The site path varies per
// tenant (External_Career_Site, External, careers, etc.) and the region path
// (wd1/wd5/wd12/wd103/...) is determined by where the customer was provisioned.
//
// Given that Workday alone covers most of the Fortune 500, even a hand-curated
// short list of tenants delivers a meaningful jobs-count uplift compared to the
// pure-startup ATSes. Bad mappings produce 404s that we log and skip.

type WorkdayCompany struct {
	Display string // "Salesforce"
	Tenant  string // "salesforce"
	Region  string // "wd12"
	Site    string // "External_Career_Site"
}

type Workday struct {
	HTTP      *http.Client
	Companies []WorkdayCompany
	// Cap per-company to keep one giant tenant from monopolising the run.
	MaxPerCompany int
	// How many job-detail pages to fetch in parallel per company. The detail
	// fetch contains the actual job description, which is what we embed.
	DetailConcurrency int
}

func NewWorkday(companies []WorkdayCompany) *Workday {
	return &Workday{
		HTTP:              &http.Client{Timeout: 30 * time.Second},
		Companies:         companies,
		MaxPerCompany:     400,
		DetailConcurrency: 4,
	}
}

func (w *Workday) Name() string { return "workday" }

type wdJobsRequest struct {
	AppliedFacets map[string]any `json:"appliedFacets"`
	Limit         int            `json:"limit"`
	Offset        int            `json:"offset"`
	SearchText    string         `json:"searchText"`
}

type wdListResponse struct {
	Total       int            `json:"total"`
	JobPostings []wdJobPosting `json:"jobPostings"`
}

type wdJobPosting struct {
	Title         string   `json:"title"`
	ExternalPath  string   `json:"externalPath"`
	LocationsText string   `json:"locationsText"`
	PostedOn      string   `json:"postedOn"`
	BulletFields  []string `json:"bulletFields"`
	TimeType      string   `json:"timeType"`
}

type wdDetailResponse struct {
	JobPostingInfo struct {
		Title          string `json:"title"`
		Description    string `json:"jobDescription"` // HTML
		Location       string `json:"location"`
		PostedOn       string `json:"postedOn"`
		StartDate      string `json:"startDate"`
		ExternalURL    string `json:"externalUrl"`
		JobReqID       string `json:"jobReqId"`
		JobPostingID   string `json:"id"`
		TimeType       string `json:"timeType"`
		RemoteType     string `json:"remoteType"` // sometimes set
		WorkSpace      string `json:"workSpace"`
	} `json:"jobPostingInfo"`
}

func (w *Workday) Fetch(ctx context.Context, out chan<- pipeline.JobJSON) error {
	for _, c := range w.Companies {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := w.fetchCompany(ctx, c, out); err != nil {
			log.Printf("[workday:%s] %v", c.Tenant, err)
		}
	}
	return nil
}

func (w *Workday) fetchCompany(ctx context.Context, c WorkdayCompany, out chan<- pipeline.JobJSON) error {
	display := c.Display
	if display == "" {
		display = prettyCompany(c.Tenant)
	}

	listings, err := w.listAllPostings(ctx, c)
	if err != nil {
		return err
	}
	if len(listings) == 0 {
		return fmt.Errorf("0 postings (likely tenant/site/region misconfigured)")
	}
	if w.MaxPerCompany > 0 && len(listings) > w.MaxPerCompany {
		listings = listings[:w.MaxPerCompany]
	}

	type detailedJob struct {
		listing wdJobPosting
		detail  wdDetailResponse
		ok      bool
	}

	in := make(chan wdJobPosting)
	resCh := make(chan detailedJob)
	var detailWG sync.WaitGroup
	for i := 0; i < w.DetailConcurrency; i++ {
		detailWG.Add(1)
		go func() {
			defer detailWG.Done()
			for p := range in {
				d, derr := w.fetchDetail(ctx, c, p.ExternalPath)
				if derr != nil {
					select {
					case <-ctx.Done():
						return
					case resCh <- detailedJob{listing: p, ok: false}:
					}
					continue
				}
				select {
				case <-ctx.Done():
					return
				case resCh <- detailedJob{listing: p, detail: d, ok: true}:
				}
			}
		}()
	}
	go func() {
		for _, p := range listings {
			select {
			case <-ctx.Done():
				close(in)
				return
			case in <- p:
			}
		}
		close(in)
	}()
	go func() {
		detailWG.Wait()
		close(resCh)
	}()

	count := 0
	skipped := 0
	for r := range resCh {
		if !r.ok {
			skipped++
			continue
		}
		title := strings.TrimSpace(firstNonEmpty(r.detail.JobPostingInfo.Title, r.listing.Title))
		desc := stripHTML(r.detail.JobPostingInfo.Description)
		loc := firstNonEmpty(r.detail.JobPostingInfo.Location, r.listing.LocationsText)
		remote := classifyRemoteFromKeyword(r.detail.JobPostingInfo.RemoteType)
		if remote == "unknown" {
			remote = classifyRemote(loc, desc)
		}
		urlPath := strings.TrimPrefix(r.listing.ExternalPath, "/")
		jobURL := fmt.Sprintf("https://%s.%s.myworkdayjobs.com/en-US/%s/%s",
			c.Tenant, c.Region, c.Site, urlPath)
		if r.detail.JobPostingInfo.ExternalURL != "" {
			jobURL = r.detail.JobPostingInfo.ExternalURL
		}

		meta := pipeline.JobMetadata{
			Title:           title,
			Company:         display,
			Location:        loc,
			Country:         classifyCountry(loc),
			RemoteStatus:    remote,
			ExperienceLevel: classifyLevel(title),
			Source:          "workday",
			SourceURL:       jobURL,
			ScrapedAt:       time.Now().UnixMilli(),
			PostedAt:        parseWorkdayPosted(r.detail.JobPostingInfo.PostedOn, r.listing.PostedOn),
			Description:     desc,
		}
		ApplySalary(&meta.SalaryMin, &meta.SalaryMax, &meta.SalaryCurrency, &meta.SalaryPeriod, &meta.SalaryRange, desc)

		jobID := strings.TrimSpace(r.detail.JobPostingInfo.JobReqID)
		if jobID == "" {
			jobID = strings.TrimSpace(r.detail.JobPostingInfo.JobPostingID)
		}
		if jobID == "" {
			jobID = r.listing.ExternalPath
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case out <- pipeline.JobJSON{
			ID:       fmt.Sprintf("workday:%s:%s", c.Tenant, sanitizeID(jobID)),
			Metadata: meta,
		}:
			count++
		}
	}
	log.Printf("[workday:%s] %d jobs (%d detail-failed)", c.Tenant, count, skipped)
	return nil
}

func (w *Workday) listAllPostings(ctx context.Context, c WorkdayCompany) ([]wdJobPosting, error) {
	const pageSize = 20
	out := []wdJobPosting{}
	offset := 0
	for {
		if err := ctx.Err(); err != nil {
			return out, err
		}
		page, total, err := w.listPage(ctx, c, offset, pageSize)
		if err != nil {
			return nil, err
		}
		out = append(out, page...)
		offset += len(page)
		if len(page) == 0 || offset >= total {
			break
		}
		if w.MaxPerCompany > 0 && offset >= w.MaxPerCompany {
			break
		}
	}
	return out, nil
}

func (w *Workday) listPage(
	ctx context.Context, c WorkdayCompany, offset, limit int,
) ([]wdJobPosting, int, error) {
	url := fmt.Sprintf("https://%s.%s.myworkdayjobs.com/wday/cxs/%s/%s/jobs",
		c.Tenant, c.Region, c.Tenant, c.Site)
	body, _ := json.Marshal(wdJobsRequest{
		AppliedFacets: map[string]any{},
		Limit:         limit,
		Offset:        offset,
		SearchText:    "",
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "OmniJob-Crawler/1.0")

	resp, err := w.HTTP.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return nil, 0, fmt.Errorf("404 (tenant/region/site mismatch)")
	}
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, 0, fmt.Errorf("list status=%d: %s", resp.StatusCode, b)
	}
	var data wdListResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, 0, err
	}
	return data.JobPostings, data.Total, nil
}

func (w *Workday) fetchDetail(
	ctx context.Context, c WorkdayCompany, externalPath string,
) (wdDetailResponse, error) {
	var zero wdDetailResponse
	url := fmt.Sprintf("https://%s.%s.myworkdayjobs.com/wday/cxs/%s/%s%s",
		c.Tenant, c.Region, c.Tenant, c.Site, externalPath)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return zero, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "OmniJob-Crawler/1.0")
	resp, err := w.HTTP.Do(req)
	if err != nil {
		return zero, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return zero, fmt.Errorf("detail status=%d", resp.StatusCode)
	}
	var data wdDetailResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return zero, err
	}
	return data, nil
}

func firstNonEmpty(vs ...string) string {
	for _, v := range vs {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

// Workday accepts varied date strings: "Posted Yesterday", "Posted 30+ Days
// Ago", "2026-04-15T..." for the structured one. Be tolerant.
func parseWorkdayPosted(structured, label string) int64 {
	if t := parseRFC3339Millis(structured); t != 0 {
		return t
	}
	// Fall back to label parsing for "Posted Today" / "Posted Yesterday" /
	// "Posted N Days Ago". We only get day granularity which is fine for
	// freshness scoring.
	now := time.Now()
	l := strings.ToLower(label)
	switch {
	case strings.Contains(l, "today"):
		return now.UnixMilli()
	case strings.Contains(l, "yesterday"):
		return now.Add(-24 * time.Hour).UnixMilli()
	}
	// "Posted 5 Days Ago" / "Posted 30+ Days Ago"
	for _, w := range strings.Fields(l) {
		var n int
		// crude integer parse - stop at first non-digit
		for _, c := range w {
			if c < '0' || c > '9' {
				break
			}
			n = n*10 + int(c-'0')
		}
		if n > 0 {
			return now.Add(-time.Duration(n) * 24 * time.Hour).UnixMilli()
		}
	}
	return 0
}

// sanitizeID strips chars that would confuse the ingest ID format.
func sanitizeID(s string) string {
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, " ", "_")
	s = strings.ReplaceAll(s, "/", "-")
	return s
}
