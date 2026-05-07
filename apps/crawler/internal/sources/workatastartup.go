package sources

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/omnijob/crawler/internal/pipeline"
)

// Y Combinator's "Work at a Startup" (workatastartup.com) does not expose a
// stable public JSON API — the GraphQL endpoint is session-gated. The public
// HTML pages are server-rendered with the full props payload embedded as an
// Inertia.js attribute:
//
//	<div id="app" data-page="...JSON-with-html-entities..." />
//
// We extract that JSON, decode entities, and pull the `props.jobs[]` list. To
// expand coverage past the 30-job home-page slice we walk the role-link routes
// (Engineering, Design, etc.), which return distinct slices and combined yield
// a few hundred unique listings. The listing objects don't include
// descriptions; we synthesize a short, embed-friendly synopsis from the
// structured fields we get (companyOneLiner + role + salary + location).

type WorkAtAStartup struct {
	HTTP  *http.Client
	Roles []string
}

func NewWorkAtAStartup(roles []string) *WorkAtAStartup {
	if len(roles) == 0 {
		roles = DefaultWorkAtAStartupRoles
	}
	return &WorkAtAStartup{
		HTTP:  &http.Client{Timeout: 30 * time.Second},
		Roles: roles,
	}
}

func (w *WorkAtAStartup) Name() string { return "workatastartup" }

// DefaultWorkAtAStartupRoles mirrors the categories surfaced in the YC public
// nav. Each route returns up to ~30 jobs with little overlap across categories.
var DefaultWorkAtAStartupRoles = []string{
	"", // home page (`/jobs`) — broadest, no role filter
	"l/software-engineer",
	"l/designer",
	"l/product-manager",
	"l/operations",
	"l/sales-manager",
	"l/marketing",
	"l/recruiting",
	"l/science",
	"l/finance",
	"l/legal",
}

type ycInertia struct {
	Props struct {
		Jobs []ycJob `json:"jobs"`
	} `json:"props"`
}

type ycJob struct {
	ID                  int64  `json:"id"`
	Title               string `json:"title"`
	JobType             string `json:"jobType"`
	Location            string `json:"location"`
	RoleType            string `json:"roleType"`
	Salary              string `json:"salary"`
	CompanyName         string `json:"companyName"`
	CompanySlug         string `json:"companySlug"`
	CompanyBatch        string `json:"companyBatch"`
	CompanyOneLiner     string `json:"companyOneLiner"`
	CompanyLastActiveAt string `json:"companyLastActiveAt"`
	ApplyURL            string `json:"applyUrl"`
}

var ycDataPageRe = regexp.MustCompile(`data-page="([^"]+)"`)

func (w *WorkAtAStartup) Fetch(ctx context.Context, out chan<- pipeline.JobJSON) error {
	seen := map[int64]bool{}
	count := 0
	for i, role := range w.Roles {
		if err := ctx.Err(); err != nil {
			return err
		}
		if i > 0 {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(400 * time.Millisecond):
			}
		}
		jobs, err := w.fetchRole(ctx, role)
		if err != nil {
			log.Printf("[workatastartup:%s] %v", roleSlug(role), err)
			continue
		}
		for _, j := range jobs {
			if seen[j.ID] {
				continue
			}
			seen[j.ID] = true
			out2, ok := w.toJob(j)
			if !ok {
				continue
			}
			select {
			case <-ctx.Done():
				return ctx.Err()
			case out <- out2:
				count++
			}
		}
	}
	log.Printf("[workatastartup] %d jobs", count)
	return nil
}

func roleSlug(r string) string {
	if r == "" {
		return "all"
	}
	return r
}

func (w *WorkAtAStartup) fetchRole(ctx context.Context, role string) ([]ycJob, error) {
	url := "https://www.workatastartup.com/jobs"
	if role != "" {
		url = url + "/" + role
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	// The site returns 406 to UAs without an Accept header that includes html.
	req.Header.Set("Accept", "text/html,application/xhtml+xml")
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; OmniJob/1.0; +https://omnijob.app)")

	resp, err := w.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, fmt.Errorf("status=%d: %s", resp.StatusCode, body)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4*1024*1024))
	if err != nil {
		return nil, err
	}

	m := ycDataPageRe.FindSubmatch(body)
	if m == nil {
		return nil, fmt.Errorf("no data-page attribute (page shape changed?)")
	}
	raw := html.UnescapeString(string(m[1]))
	var page ycInertia
	if err := json.Unmarshal([]byte(raw), &page); err != nil {
		return nil, fmt.Errorf("decode data-page: %w", err)
	}
	return page.Props.Jobs, nil
}

func (w *WorkAtAStartup) toJob(j ycJob) (pipeline.JobJSON, bool) {
	title := strings.TrimSpace(j.Title)
	company := strings.TrimSpace(j.CompanyName)
	if title == "" || company == "" {
		return pipeline.JobJSON{}, false
	}

	loc := strings.TrimSpace(j.Location)
	desc := strings.TrimSpace(strings.Join(skipEmpty(
		j.CompanyOneLiner,
		j.RoleType,
		j.JobType,
		loc,
		j.Salary,
	), " · "))

	remote := classifyRemote(loc, desc)

	jobURL := strings.TrimSpace(j.ApplyURL)
	if jobURL == "" && j.CompanySlug != "" {
		jobURL = fmt.Sprintf("https://www.workatastartup.com/companies/%s", j.CompanySlug)
	}

	meta := pipeline.JobMetadata{
		Title:           title,
		Company:         company,
		Location:        loc,
		Country:         classifyCountry(loc),
		RemoteStatus:    remote,
		ExperienceLevel: classifyLevel(title),
		Source:          "workatastartup",
		SourceURL:       jobURL,
		ScrapedAt:       time.Now().UnixMilli(),
		Description:     desc,
	}
	ApplySalary(&meta.SalaryMin, &meta.SalaryMax, &meta.SalaryCurrency, &meta.SalaryPeriod, &meta.SalaryRange, j.Salary, desc)

	return pipeline.JobJSON{
		ID:       fmt.Sprintf("workatastartup:%d", j.ID),
		Metadata: meta,
	}, true
}
