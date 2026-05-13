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

// RSS is a generic source that ingests jobs from any standard RSS 2.0 feed.
// Used for provincial / municipal / institutional job boards that publish
// open RSS - Government of Canada, provincial public services, universities,
// hospitals, etc. Each feed entry becomes a JobJSON with the feed's
// configured company/source-label, the item's title as job title, and the
// item's description as the body. Salary / level / remote are inferred from
// title + description text since RSS doesn't have structured fields.
//
// Feed list comes from RSS_FEEDS env CSV in the form:
//   "<source-label>|<url>|<company-display>|<default-country-iso2>"
// Multiple entries separated by ";". Example:
//   RSS_FEEDS="ops|https://.../jobs.rss|Ontario Public Service|CA;bc|https://.../feed|BC Public Service|CA"
//
// Failures per-feed are logged and skipped; one bad feed doesn't break the
// rest of the run.

type RSSFeed struct {
	SourceLabel string // short ID used in job ID + Source field (e.g. "ops", "bc_gov")
	URL         string
	Company     string // human-readable employer name shown on cards
	Country     string // ISO-2; used when items don't carry a location
}

type RSS struct {
	HTTP  *http.Client
	Feeds []RSSFeed
}

func NewRSS(feeds []RSSFeed) *RSS {
	return &RSS{
		HTTP:  &http.Client{Timeout: 30 * time.Second},
		Feeds: feeds,
	}
}

// DefaultRSSFeeds - Canadian public-sector seed feeds. These are open
// government data feeds intended for syndication. Override at runtime via
// the RSS_FEEDS env var (CSV-of-tuples format documented in ParseRSSFeeds).
// Failure to fetch any single feed is logged and skipped; the run
// continues. Slugs / URLs may drift; operators update this list when
// 404s appear in the log.
var DefaultRSSFeeds = []RSSFeed{
	// Government of Canada Open Data - federal job postings RSS.
	{SourceLabel: "gc_jobs", URL: "https://www.canada.ca/en/news/web-feeds/jobs.xml", Company: "Government of Canada", Country: "CA"},
	// Ontario Public Service careers feed (provincial). RSS endpoint may
	// not exist - feed will 404 cleanly and be skipped if so.
	{SourceLabel: "ops", URL: "https://www.gojobs.gov.on.ca/RSSFeed.aspx", Company: "Ontario Public Service", Country: "CA"},
	// BC Public Service jobs feed.
	{SourceLabel: "bc_gov", URL: "https://search.employment.gov.bc.ca/cgi-bin/a/highlightjob.cgi?rss=1", Company: "BC Public Service", Country: "CA"},
	// City of Toronto jobs RSS.
	{SourceLabel: "toronto", URL: "https://jobs.toronto.ca/rss.cfm", Company: "City of Toronto", Country: "CA"},
	// City of Vancouver jobs RSS.
	{SourceLabel: "vancouver", URL: "https://careers.vancouver.ca/rss.cfm", Company: "City of Vancouver", Country: "CA"},
	// City of Calgary - careers RSS.
	{SourceLabel: "calgary", URL: "https://careers.calgary.ca/psp/career/EMPLOYEE/HRMS/c/HRS_HRAM_FL.HRS_CG_SEARCH_FL.GBL.RSS", Company: "City of Calgary", Country: "CA"},
	// Health Match BC - healthcare jobs for BC.
	{SourceLabel: "healthmatchbc", URL: "https://www.healthmatchbc.org/rss/jobs", Company: "Health Match BC", Country: "CA"},
	// City of Ottawa.
	{SourceLabel: "ottawa", URL: "https://ottawa.ca/en/city-hall/jobs-city/career-opportunities/rss.xml", Company: "City of Ottawa", Country: "CA"},
}

func (r *RSS) Name() string { return "rss" }

// rssRoot matches the standard RSS 2.0 envelope plus the minimum atom-style
// fallbacks we observe in the wild. xml.Decoder skips unknown elements so
// extra channel-level metadata is harmless.
type rssRoot struct {
	XMLName xml.Name `xml:"rss"`
	Channel struct {
		Title string    `xml:"title"`
		Items []rssItem `xml:"item"`
	} `xml:"channel"`
}

type rssItem struct {
	Title       string `xml:"title"`
	Link        string `xml:"link"`
	Description string `xml:"description"`
	Category    string `xml:"category"`
	Location    string `xml:"location"`
	PubDate     string `xml:"pubDate"`
	GUID        string `xml:"guid"`
}

func (r *RSS) Fetch(ctx context.Context, out chan<- pipeline.JobJSON) error {
	for _, feed := range r.Feeds {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := r.fetchOne(ctx, feed, out); err != nil {
			log.Printf("[rss:%s] %v", feed.SourceLabel, err)
		}
	}
	return nil
}

func (r *RSS) fetchOne(ctx context.Context, feed RSSFeed, out chan<- pipeline.JobJSON) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, feed.URL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/rss+xml, application/xml, text/xml")
	req.Header.Set("User-Agent", "OmniJob-Crawler/1.0")

	resp, err := r.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("status=%d: %s", resp.StatusCode, body)
	}

	var data rssRoot
	if err := xml.NewDecoder(resp.Body).Decode(&data); err != nil {
		return fmt.Errorf("parse: %w", err)
	}

	count := 0
	for _, it := range data.Channel.Items {
		title := strings.TrimSpace(it.Title)
		if title == "" {
			continue
		}
		desc := stripHTML(it.Description)

		// Location preference: the item's <location> if present (non-standard
		// but some Canadian gov feeds include it), else parsed from the
		// description text leading line, else fall back to the feed-level
		// default country alone.
		loc := strings.TrimSpace(it.Location)
		if loc == "" {
			loc = extractLocationHint(desc)
		}

		country := classifyCountry(loc)
		if country == "" {
			country = feed.Country
		}

		// Stable per-feed ID. GUID if provided, otherwise hash of link, else
		// hash of title (worst case: re-ingest on title change, acceptable).
		id := strings.TrimSpace(it.GUID)
		if id == "" {
			id = strings.TrimSpace(it.Link)
		}
		if id == "" {
			id = title
		}

		job := pipeline.JobJSON{
			ID:     fmt.Sprintf("rss:%s:%s", feed.SourceLabel, hashKey(id)),
			Vector: nil,
			Metadata: pipeline.JobMetadata{
				Title:           title,
				Company:         feed.Company,
				Location:        loc,
				Country:         country,
				RemoteStatus:    classifyRemote(loc, desc),
				ExperienceLevel: classifyLevel(title),
				Source:          "rss:" + feed.SourceLabel,
				SourceURL:       strings.TrimSpace(it.Link),
				ScrapedAt:       time.Now().UnixMilli(),
				PostedAt:        parseGenericRSSDate(it.PubDate),
				Description:     desc,
			},
		}
		ApplySalary(
			&job.Metadata.SalaryMin,
			&job.Metadata.SalaryMax,
			&job.Metadata.SalaryCurrency,
			&job.Metadata.SalaryPeriod,
			&job.Metadata.SalaryRange,
			"", desc,
		)

		select {
		case <-ctx.Done():
			return ctx.Err()
		case out <- job:
			count++
		}
	}
	log.Printf("[rss:%s] %d jobs", feed.SourceLabel, count)
	return nil
}

// ParseRSSFeeds parses the RSS_FEEDS env CSV into a list of RSSFeed structs.
// Format: "<label>|<url>|<company>|<country>", multiple separated by ";".
// Whitespace around fields is trimmed. Entries with empty url are skipped.
func ParseRSSFeeds(raw string) []RSSFeed {
	out := []RSSFeed{}
	if raw == "" {
		return out
	}
	for _, entry := range strings.Split(raw, ";") {
		parts := strings.Split(entry, "|")
		if len(parts) < 2 {
			continue
		}
		label := strings.TrimSpace(parts[0])
		url := strings.TrimSpace(parts[1])
		if label == "" || url == "" {
			continue
		}
		company := label
		country := ""
		if len(parts) >= 3 {
			company = strings.TrimSpace(parts[2])
			if company == "" {
				company = label
			}
		}
		if len(parts) >= 4 {
			country = strings.TrimSpace(parts[3])
		}
		out = append(out, RSSFeed{
			SourceLabel: label,
			URL:         url,
			Company:     company,
			Country:     country,
		})
	}
	return out
}

// parseGenericRSSDate parses the RFC 1123Z + a few other formats RSS feeds
// emit in the wild. Returns 0 (unknown) when no format matches; the
// ScrapedAt fallback in upsertJob handles missing PostedAt. Named with the
// "Generic" prefix to avoid colliding with weworkremotely.go's parseRSSDate
// which is wwr-specific.
func parseGenericRSSDate(s string) int64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}
	formats := []string{
		time.RFC1123Z, // "Mon, 02 Jan 2006 15:04:05 -0700" (most common)
		time.RFC1123,  // "Mon, 02 Jan 2006 15:04:05 MST"
		time.RFC3339,  // ISO-8601
		"2006-01-02T15:04:05Z",
		"2006-01-02 15:04:05",
		"02 Jan 2006 15:04:05 -0700",
	}
	for _, f := range formats {
		if t, err := time.Parse(f, s); err == nil {
			return t.UnixMilli()
		}
	}
	return 0
}

// extractLocationHint scans the leading 200 chars of the description for a
// "Location: <foo>" line common to government RSS feeds. Returns the
// extracted value or "".
func extractLocationHint(desc string) string {
	if len(desc) > 400 {
		desc = desc[:400]
	}
	for _, ln := range strings.Split(desc, "\n") {
		ln = strings.TrimSpace(ln)
		// Match "Location: Toronto, ON" / "City: Vancouver" / "Place of work: ..."
		for _, prefix := range []string{"Location:", "City:", "Place of work:", "Work location:"} {
			if strings.HasPrefix(ln, prefix) {
				v := strings.TrimSpace(strings.TrimPrefix(ln, prefix))
				if len(v) > 0 && len(v) < 200 {
					return v
				}
			}
		}
	}
	return ""
}

// hashKey is a cheap deterministic short slug. Avoids depending on
// crypto/sha256 here when we just need stable IDs.
func hashKey(s string) string {
	var h uint32 = 2166136261
	for i := 0; i < len(s); i++ {
		h ^= uint32(s[i])
		h *= 16777619
	}
	return fmt.Sprintf("%08x", h)
}
