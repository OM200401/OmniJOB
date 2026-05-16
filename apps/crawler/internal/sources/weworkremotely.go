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

// WeWorkRemotely publishes per-category RSS feeds. The title of each item is
// "<Company>: <Role>" (or "<Company>: <Role> at <Company>" for some posts);
// the description contains the role copy.

type WeWorkRemotely struct {
	HTTP       *http.Client
	Categories []string
}

// DefaultWWRCategories covers the categories whose listings are most relevant
// for a software-skewed user base. The category slugs match the URL path on
// weworkremotely.com.
var DefaultWWRCategories = []string{
	"remote-programming-jobs",
	"remote-devops-sysadmin-jobs",
	"remote-design-jobs",
	"remote-product-jobs",
	"remote-customer-support-jobs",
	"remote-sales-and-marketing-jobs",
	"remote-management-and-finance-jobs",
}

func NewWeWorkRemotely(cats []string) *WeWorkRemotely {
	if len(cats) == 0 {
		cats = DefaultWWRCategories
	}
	return &WeWorkRemotely{
		HTTP:       &http.Client{Timeout: 30 * time.Second},
		Categories: cats,
	}
}

func (w *WeWorkRemotely) Name() string { return "weworkremotely" }

type wwrFeed struct {
	XMLName xml.Name  `xml:"rss"`
	Channel wwrChan   `xml:"channel"`
}

type wwrChan struct {
	Items []wwrItem `xml:"item"`
}

type wwrItem struct {
	Title       string `xml:"title"`
	Link        string `xml:"link"`
	Guid        string `xml:"guid"`
	PubDate     string `xml:"pubDate"`
	Region      string `xml:"region"`
	Description string `xml:"description"`
}

func (w *WeWorkRemotely) Fetch(ctx context.Context, out chan<- pipeline.JobJSON) error {
	for _, cat := range w.Categories {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := w.fetchCategory(ctx, cat, out); err != nil {
			log.Printf("[weworkremotely:%s] %v", cat, err)
		}
	}
	return nil
}

func (w *WeWorkRemotely) fetchCategory(ctx context.Context, cat string, out chan<- pipeline.JobJSON) error {
	url := fmt.Sprintf("https://weworkremotely.com/categories/%s.rss", cat)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/rss+xml,application/xml")
	req.Header.Set("User-Agent", "OmniJob-Crawler/1.0")

	resp, err := w.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("status=%d: %s", resp.StatusCode, body)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8*1024*1024))
	if err != nil {
		return err
	}
	var feed wwrFeed
	if err := xml.Unmarshal(body, &feed); err != nil {
		return fmt.Errorf("xml decode: %w", err)
	}

	count := 0
	for _, it := range feed.Channel.Items {
		company, role := splitWWRTitle(it.Title)
		if company == "" || role == "" {
			continue
		}
		desc := stripHTML(it.Description)
		posted := parseRSSDate(it.PubDate)
		region := strings.TrimSpace(it.Region)

		meta := pipeline.JobMetadata{
			Title:           role,
			Company:         company,
			Location:        region,
			Country:         classifyCountry(region),
			RemoteStatus:    "remote",
			ExperienceLevel: classifyLevelFromBody(role, desc),
			Source:          "weworkremotely",
			SourceURL:       strings.TrimSpace(it.Link),
			ScrapedAt:       time.Now().UnixMilli(),
			PostedAt:        posted,
			Description:     desc,
		}
		ApplySalary(&meta.SalaryMin, &meta.SalaryMax, &meta.SalaryCurrency, &meta.SalaryPeriod, &meta.SalaryRange, desc)

		id := strings.TrimSpace(it.Guid)
		if id == "" {
			id = strings.TrimSpace(it.Link)
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case out <- pipeline.JobJSON{
			ID:       fmt.Sprintf("weworkremotely:%s", sanitizeID(id)),
			Metadata: meta,
		}:
			count++
		}
	}
	log.Printf("[weworkremotely:%s] %d jobs", cat, count)
	return nil
}

// "Acme Corp: Senior Backend Engineer" → ("Acme Corp", "Senior Backend Engineer").
// Falls back to (title, "") if no colon is present.
func splitWWRTitle(t string) (company, role string) {
	t = strings.TrimSpace(t)
	if i := strings.Index(t, ":"); i > 0 {
		return strings.TrimSpace(t[:i]), strings.TrimSpace(t[i+1:])
	}
	return t, ""
}

// RSS dates use RFC1123Z. Defensive: try a couple of layouts.
func parseRSSDate(s string) int64 {
	if s == "" {
		return 0
	}
	for _, layout := range []string{
		time.RFC1123Z,
		time.RFC1123,
		"Mon, 2 Jan 2006 15:04:05 -0700",
		"Mon, 2 Jan 2006 15:04:05 MST",
	} {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UnixMilli()
		}
	}
	return 0
}
