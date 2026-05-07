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

// Careerjet is an international meta-search aggregator with an affiliate
// search API at https://public.api.careerjet.net/search. Free affiliate
// signup is at careerjet.com/partners/api — they require an `affid`, a
// `user_ip`, and a `user_agent` to be passed through on every request so
// they can attribute clicks. The API returns up to 99 results per page.
//
// The API technically responds without an affid for low-volume testing, but
// the ToS requires it for production use; we no-op without CAREERJET_AFFID.

type Careerjet struct {
	HTTP    *http.Client
	AffID   string
	UA      string
	Locales []string // e.g. en_US, en_GB, en_CA, en_AU
	Pages   int
}

// DefaultCareerjetLocales — Careerjet's locale tags are "<lang>_<country>".
// English-speaking markets only; operators expand via CAREERJET_LOCALES.
var DefaultCareerjetLocales = []string{"en_US", "en_GB", "en_CA", "en_AU"}

func NewCareerjet(affID, ua string, locales []string, pages int) *Careerjet {
	if pages <= 0 {
		pages = 5
	}
	if len(locales) == 0 {
		locales = DefaultCareerjetLocales
	}
	if ua == "" {
		ua = "OmniJob-Crawler/1.0 (+https://omnijob.app)"
	}
	return &Careerjet{
		HTTP:    &http.Client{Timeout: 30 * time.Second},
		AffID:   affID,
		UA:      ua,
		Locales: locales,
		Pages:   pages,
	}
}

func (c *Careerjet) Name() string { return "careerjet" }

type cjResponse struct {
	Type    string   `json:"type"` // "JOBS" on success
	Hits    int      `json:"hits"`
	Pages   int      `json:"pages"`
	Page    int      `json:"page"`
	Jobs    []cjJob  `json:"jobs"`
	Error   string   `json:"error"`
}

type cjJob struct {
	Title       string `json:"title"`
	Locations   string `json:"locations"`
	Description string `json:"description"`
	Date        string `json:"date"`
	Company     string `json:"company"`
	Salary      string `json:"salary"`
	URL         string `json:"url"`
	Site        string `json:"site"`
}

func (c *Careerjet) Fetch(ctx context.Context, out chan<- pipeline.JobJSON) error {
	if c.AffID == "" {
		log.Printf("[careerjet] skipped (set CAREERJET_AFFID to enable)")
		return nil
	}
	for _, locale := range c.Locales {
		if err := ctx.Err(); err != nil {
			return err
		}
		for page := 1; page <= c.Pages; page++ {
			got, totalPages, err := c.fetchPage(ctx, locale, page, out)
			if err != nil {
				log.Printf("[careerjet:%s:p%d] %v", locale, page, err)
				break
			}
			if got == 0 || page >= totalPages {
				break
			}
		}
	}
	return nil
}

func (c *Careerjet) fetchPage(ctx context.Context, locale string, page int, out chan<- pipeline.JobJSON) (int, int, error) {
	q := url.Values{}
	q.Set("locale_code", locale)
	q.Set("affid", c.AffID)
	q.Set("user_ip", "127.0.0.1") // server-side; Careerjet uses for fraud only
	q.Set("user_agent", c.UA)
	q.Set("pagesize", "99")
	q.Set("page", fmt.Sprintf("%d", page))
	// "*" matches everything; Careerjet requires a non-empty keyword.
	q.Set("keywords", "engineer OR developer OR designer")
	endpoint := "https://public.api.careerjet.net/search?" + q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return 0, 0, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", c.UA)

	resp, err := c.HTTP.Do(req)
	if err != nil {
		return 0, 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return 0, 0, fmt.Errorf("status=%d: %s", resp.StatusCode, body)
	}
	var data cjResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return 0, 0, err
	}
	if data.Error != "" {
		return 0, 0, fmt.Errorf("api: %s", data.Error)
	}

	count := 0
	for i, j := range data.Jobs {
		title := strings.TrimSpace(j.Title)
		company := strings.TrimSpace(j.Company)
		if title == "" || company == "" {
			continue
		}
		desc := stripHTML(j.Description)

		meta := pipeline.JobMetadata{
			Title:           title,
			Company:         company,
			Location:        j.Locations,
			Country:         classifyCountryFromLocale(locale, j.Locations),
			RemoteStatus:    classifyRemote(j.Locations, desc),
			ExperienceLevel: classifyLevel(title),
			Source:          "careerjet",
			SourceURL:       j.URL,
			ScrapedAt:       time.Now().UnixMilli(),
			PostedAt:        parseRFC3339Millis(j.Date),
			Description:     desc,
		}
		ApplySalary(&meta.SalaryMin, &meta.SalaryMax, &meta.SalaryCurrency, &meta.SalaryPeriod, &meta.SalaryRange, j.Salary, desc)

		// Careerjet doesn't expose a stable per-job ID — derive a stable one
		// from the URL plus the page index so re-fetches dedup correctly.
		id := j.URL
		if id == "" {
			id = fmt.Sprintf("%s-p%d-%d", locale, page, i)
		}

		select {
		case <-ctx.Done():
			return count, data.Pages, ctx.Err()
		case out <- pipeline.JobJSON{
			ID:       fmt.Sprintf("careerjet:%s:%s", locale, sanitizeID(id)),
			Metadata: meta,
		}:
			count++
		}
	}
	log.Printf("[careerjet:%s:p%d] %d/%d", locale, page, count, data.Hits)
	return count, data.Pages, nil
}

// classifyCountryFromLocale prefers the locale tail (en_US → US) and falls
// back to free-text classification on the location string.
func classifyCountryFromLocale(locale, loc string) string {
	if i := strings.LastIndex(locale, "_"); i > 0 && i+1 < len(locale) {
		c := strings.ToUpper(locale[i+1:])
		if len(c) == 2 {
			return c
		}
	}
	return classifyCountry(loc)
}
