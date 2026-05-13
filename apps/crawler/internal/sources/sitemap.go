package sources

import (
	"context"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"log"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/omnijob/crawler/internal/pipeline"
)

// Sitemap is a generic JSON-LD JobPosting scraper. It accepts a sitemap URL
// (or a sitemap-index URL that points to per-section sitemaps), enumerates
// the job-detail URLs, fetches each, extracts the JSON-LD JobPosting
// schema, and emits JobJSON. Works across any careers-site CMS that
// follows schema.org/JobPosting for SEO - which is most modern ones,
// including Phenom People (RBC, Bell, Rogers, US healthcare), many iCIMS
// customers, many SuccessFactors customers, and miscellaneous proprietary
// career sites.
//
// Per-feed config:
//   SitemapFeed{
//     SourceLabel: stable ID for this feed (used in job ID + Source)
//     SitemapURL:  url of the sitemap or sitemap-index
//     URLPattern:  regex; only URLs matching this are treated as job pages
//     Company:     fallback company name when JSON-LD's hiringOrganization is missing
//     Country:     fallback ISO-2 when JSON-LD's address lacks countryCode
//     MaxPages:    optional cap on how many job pages to scrape this run
//                  (defaults to 1000; protects against runaway sites)
//   }
//
// Override at runtime via SITEMAP_FEEDS env CSV; see ParseSitemapFeeds.

type SitemapFeed struct {
	SourceLabel string
	SitemapURL  string
	URLPattern  string
	Company     string
	Country     string
	MaxPages    int
}

type Sitemap struct {
	HTTP  *http.Client
	Feeds []SitemapFeed
	// Per-feed concurrency for the page-fetching pass. Modest by default
	// because we're talking to single-host CDNs and don't want to look
	// abusive. Override via SITEMAP_FETCH_CONCURRENCY.
	FetchConcurrency int
}

func NewSitemap(feeds []SitemapFeed, concurrency int) *Sitemap {
	if concurrency <= 0 {
		concurrency = 4
	}
	return &Sitemap{
		HTTP: &http.Client{Timeout: 30 * time.Second},
		// Default 1000 max pages per feed unless overridden.
		Feeds:            feeds,
		FetchConcurrency: concurrency,
	}
}

func (s *Sitemap) Name() string { return "sitemap" }

// XML envelope shapes - covers both sitemap and sitemap-index formats.
type sitemapURLSet struct {
	XMLName xml.Name         `xml:"urlset"`
	URLs    []sitemapURLNode `xml:"url"`
}

type sitemapURLNode struct {
	Loc     string `xml:"loc"`
	LastMod string `xml:"lastmod"`
}

type sitemapIndex struct {
	XMLName xml.Name              `xml:"sitemapindex"`
	Maps    []sitemapIndexNodeXML `xml:"sitemap"`
}

type sitemapIndexNodeXML struct {
	Loc     string `xml:"loc"`
	LastMod string `xml:"lastmod"`
}

// JSON-LD JobPosting shape. We pluck only the fields we use; unknown fields
// are ignored. Note: jobLocation can be either an object or an array of
// objects (multi-location postings); we accept the json.RawMessage and
// decode both shapes manually.
type jsonLDJobPosting struct {
	Type        string          `json:"@type"`
	Title       string          `json:"title"`
	Description string          `json:"description"`
	DatePosted  string          `json:"datePosted"`
	ValidThrough string         `json:"validThrough"`
	HiringOrg   json.RawMessage `json:"hiringOrganization"`
	JobLocation json.RawMessage `json:"jobLocation"`
	Employment  json.RawMessage `json:"employmentType"`
	Identifier  json.RawMessage `json:"identifier"`
	URL         string          `json:"url"`
	Industry    string          `json:"industry"`
	BaseSalary  json.RawMessage `json:"baseSalary"`
}

func (s *Sitemap) Fetch(ctx context.Context, out chan<- pipeline.JobJSON) error {
	for _, feed := range s.Feeds {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := s.fetchFeed(ctx, feed, out); err != nil {
			log.Printf("[sitemap:%s] %v", feed.SourceLabel, err)
		}
	}
	return nil
}

func (s *Sitemap) fetchFeed(ctx context.Context, feed SitemapFeed, out chan<- pipeline.JobJSON) error {
	urls, err := s.collectJobURLs(ctx, feed)
	if err != nil {
		return fmt.Errorf("sitemap fetch: %w", err)
	}
	maxPages := feed.MaxPages
	if maxPages <= 0 {
		maxPages = 1000
	}
	if len(urls) > maxPages {
		log.Printf("[sitemap:%s] capping %d URLs at %d", feed.SourceLabel, len(urls), maxPages)
		urls = urls[:maxPages]
	}
	log.Printf("[sitemap:%s] %d job URLs", feed.SourceLabel, len(urls))

	// Fanout page fetches under a small concurrency budget. Each worker
	// pulls a URL, extracts JSON-LD, emits the JobJSON. Errors are logged
	// per-page so one broken page doesn't kill the feed.
	work := make(chan string)
	var wg sync.WaitGroup
	var count, errors int
	var mu sync.Mutex

	for i := 0; i < s.FetchConcurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for url := range work {
				if err := ctx.Err(); err != nil {
					return
				}
				job, err := s.scrapeJobPage(ctx, feed, url)
				if err != nil {
					mu.Lock()
					errors++
					mu.Unlock()
					continue
				}
				if job == nil {
					continue
				}
				select {
				case <-ctx.Done():
					return
				case out <- *job:
					mu.Lock()
					count++
					mu.Unlock()
				}
			}
		}()
	}

	for _, u := range urls {
		select {
		case <-ctx.Done():
			close(work)
			wg.Wait()
			return ctx.Err()
		case work <- u:
		}
	}
	close(work)
	wg.Wait()
	log.Printf("[sitemap:%s] %d jobs emitted, %d errors", feed.SourceLabel, count, errors)
	return nil
}

// collectJobURLs follows the sitemap (or sitemap-index → child sitemaps)
// and returns the subset of URLs matching the feed's URLPattern. Recurses
// only one level deep on sitemap-index (per the sitemaps.org spec).
func (s *Sitemap) collectJobURLs(ctx context.Context, feed SitemapFeed) ([]string, error) {
	pattern, err := regexp.Compile(feed.URLPattern)
	if err != nil {
		return nil, fmt.Errorf("URLPattern: %w", err)
	}

	rawURLs, err := s.collectAllURLs(ctx, feed.SitemapURL, 0)
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(rawURLs))
	for _, u := range rawURLs {
		if pattern.MatchString(u) {
			out = append(out, u)
		}
	}
	return out, nil
}

func (s *Sitemap) collectAllURLs(ctx context.Context, sitemapURL string, depth int) ([]string, error) {
	if depth > 2 {
		return nil, nil
	}
	body, err := s.fetchBytes(ctx, sitemapURL)
	if err != nil {
		return nil, err
	}
	// Try sitemap-index first; fall through to urlset.
	var idx sitemapIndex
	if err := xml.Unmarshal(body, &idx); err == nil && len(idx.Maps) > 0 {
		all := []string{}
		for _, m := range idx.Maps {
			loc := strings.TrimSpace(m.Loc)
			if loc == "" {
				continue
			}
			sub, err := s.collectAllURLs(ctx, loc, depth+1)
			if err != nil {
				log.Printf("[sitemap] child %s: %v", loc, err)
				continue
			}
			all = append(all, sub...)
		}
		return all, nil
	}
	var set sitemapURLSet
	if err := xml.Unmarshal(body, &set); err != nil {
		return nil, fmt.Errorf("parse: %w", err)
	}
	out := make([]string, 0, len(set.URLs))
	for _, n := range set.URLs {
		loc := strings.TrimSpace(n.Loc)
		if loc != "" {
			out = append(out, loc)
		}
	}
	return out, nil
}

var jsonLDRe = regexp.MustCompile(`(?is)<script[^>]+type=["']application/ld\+json["'][^>]*>(.*?)</script>`)

func (s *Sitemap) scrapeJobPage(ctx context.Context, feed SitemapFeed, url string) (*pipeline.JobJSON, error) {
	body, err := s.fetchBytes(ctx, url)
	if err != nil {
		return nil, err
	}
	// Pull every JSON-LD block, pick the first that's @type JobPosting.
	matches := jsonLDRe.FindAllStringSubmatch(string(body), -1)
	var jp *jsonLDJobPosting
	for _, m := range matches {
		raw := strings.TrimSpace(m[1])
		// JSON-LD bodies sometimes have HTML entity-escaped quotes; unescape
		// the minimum set we observe in the wild.
		raw = strings.ReplaceAll(raw, "&quot;", "\"")
		var probe map[string]any
		if err := json.Unmarshal([]byte(raw), &probe); err != nil {
			continue
		}
		if t, ok := probe["@type"].(string); ok && t == "JobPosting" {
			var typed jsonLDJobPosting
			if err := json.Unmarshal([]byte(raw), &typed); err == nil {
				jp = &typed
				break
			}
		}
	}
	if jp == nil || strings.TrimSpace(jp.Title) == "" {
		return nil, nil
	}

	company := strings.TrimSpace(extractOrgName(jp.HiringOrg))
	if company == "" {
		company = feed.Company
	}
	if company == "" {
		return nil, nil
	}
	locStr, country := extractLocation(jp.JobLocation)
	if country == "" {
		country = feed.Country
	}
	if country == "" && locStr != "" {
		country = classifyCountry(locStr)
	}

	posted := parseGenericRSSDate(jp.DatePosted)
	desc := stripHTML(strings.ReplaceAll(jp.Description, "&lt;", "<"))
	desc = strings.ReplaceAll(desc, "&gt;", ">")
	desc = strings.ReplaceAll(desc, "&amp;", "&")

	jobID := strings.TrimSpace(extractIdentifier(jp.Identifier))
	if jobID == "" {
		// Fall back to a hash of the URL so we still have a stable ID.
		jobID = hashKey(url)
	}

	job := &pipeline.JobJSON{
		ID:     fmt.Sprintf("sitemap:%s:%s", feed.SourceLabel, jobID),
		Vector: nil,
		Metadata: pipeline.JobMetadata{
			Title:           strings.TrimSpace(jp.Title),
			Company:         company,
			Location:        locStr,
			Country:         country,
			RemoteStatus:    classifyRemote(locStr, desc),
			ExperienceLevel: classifyLevel(jp.Title),
			Source:          "sitemap:" + feed.SourceLabel,
			SourceURL:       url,
			ScrapedAt:       time.Now().UnixMilli(),
			PostedAt:        posted,
			Description:     desc,
		},
	}
	return job, nil
}

func (s *Sitemap) fetchBytes(ctx context.Context, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; OmniJob/1.0)")
	req.Header.Set("Accept", "*/*")
	resp, err := s.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("status=%d", resp.StatusCode)
	}
	// Limit each page to 1 MB - way bigger than legitimate job pages, but
	// caps a single bad URL.
	return io.ReadAll(io.LimitReader(resp.Body, 1024*1024))
}

// extractOrgName accepts either a string or a {name: string} object.
func extractOrgName(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return s
	}
	var obj struct {
		Name string `json:"name"`
	}
	if err := json.Unmarshal(raw, &obj); err == nil {
		return obj.Name
	}
	return ""
}

// extractLocation pulls a human "City, Region, Country" string + country
// ISO-2 from a JobPosting.jobLocation block. Accepts the object form and
// the array-of-objects form (multi-location postings); on array, returns
// the first entry.
func extractLocation(raw json.RawMessage) (string, string) {
	if len(raw) == 0 {
		return "", ""
	}
	// Single object.
	var single placeNode
	if err := json.Unmarshal(raw, &single); err == nil && (single.Address.Locality != "" || single.Address.Region != "" || single.Address.Country != "") {
		return single.toString()
	}
	// Array of objects.
	var arr []placeNode
	if err := json.Unmarshal(raw, &arr); err == nil && len(arr) > 0 {
		return arr[0].toString()
	}
	return "", ""
}

type placeNode struct {
	Address struct {
		Locality string `json:"addressLocality"`
		Region   string `json:"addressRegion"`
		Country  string `json:"addressCountry"`
	} `json:"address"`
}

func (p placeNode) toString() (string, string) {
	parts := []string{}
	if p.Address.Locality != "" {
		parts = append(parts, p.Address.Locality)
	}
	if p.Address.Region != "" {
		parts = append(parts, p.Address.Region)
	}
	if p.Address.Country != "" {
		parts = append(parts, p.Address.Country)
	}
	loc := strings.Join(parts, ", ")
	country := ""
	if len(p.Address.Country) == 2 {
		country = strings.ToUpper(p.Address.Country)
	}
	return loc, country
}

func extractIdentifier(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		return s
	}
	var obj struct {
		Value string `json:"value"`
	}
	if err := json.Unmarshal(raw, &obj); err == nil {
		return obj.Value
	}
	return ""
}

// ParseSitemapFeeds parses the SITEMAP_FEEDS env CSV. Format per entry,
// joined by ';':
//   <label>|<sitemap_url>|<url_pattern>|<company>|<country>|<max_pages>
// Fields 4-6 optional. max_pages 0 = 1000 default.
func ParseSitemapFeeds(raw string) []SitemapFeed {
	out := []SitemapFeed{}
	if raw == "" {
		return out
	}
	for _, entry := range strings.Split(raw, ";") {
		parts := strings.Split(entry, "|")
		if len(parts) < 3 {
			continue
		}
		label := strings.TrimSpace(parts[0])
		url := strings.TrimSpace(parts[1])
		pat := strings.TrimSpace(parts[2])
		if label == "" || url == "" || pat == "" {
			continue
		}
		f := SitemapFeed{SourceLabel: label, SitemapURL: url, URLPattern: pat}
		if len(parts) >= 4 {
			f.Company = strings.TrimSpace(parts[3])
		}
		if len(parts) >= 5 {
			f.Country = strings.TrimSpace(parts[4])
		}
		if len(parts) >= 6 {
			f.MaxPages = atoiOrZero(strings.TrimSpace(parts[5]))
		}
		out = append(out, f)
	}
	return out
}

func atoiOrZero(s string) int {
	n := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			return 0
		}
		n = n*10 + int(c-'0')
	}
	return n
}

// DefaultSitemapFeeds - Canadian-heavy seed list of careers sites that
// publish JSON-LD JobPosting schema on each job page. Verified by hand
// 2026-05-13. Add more by inspecting any company's careers site: if
// /sitemap.xml or /sitemap_index.xml exposes per-job URLs and each job
// page's <head> contains a JobPosting JSON-LD block, the site works
// with this adapter without writing custom code.
var DefaultSitemapFeeds = []SitemapFeed{
	{
		SourceLabel: "rbc",
		SitemapURL:  "https://jobs.rbc.com/ca/en/sitemap_index.xml",
		URLPattern:  `^https://jobs\.rbc\.com/ca/en/job/`,
		Company:     "Royal Bank of Canada",
		Country:     "CA",
		MaxPages:    1500,
	},
	{
		// Loblaw - Canada's largest grocery + retail employer. Sitemap
		// returned 2126 job URLs on first probe; cap at 2500 to absorb
		// growth without runaway.
		SourceLabel: "loblaw",
		SitemapURL:  "https://careers.loblaw.ca/sitemap-7706e169-en.xml",
		URLPattern:  `^https://careers\.loblaw\.ca/.+/job/`,
		Company:     "Loblaw Companies",
		Country:     "CA",
		MaxPages:    2500,
	},
	{
		// OpenText - Canadian-headquartered enterprise SaaS. Sitemap
		// returned 229 job URLs. Includes US + global postings; the per-
		// page JSON-LD's addressCountry is the source of truth for
		// country, with feed Country as fallback only when missing.
		SourceLabel: "opentext",
		SitemapURL:  "https://careers.opentext.com/sitemap.xml",
		URLPattern:  `^https://careers\.opentext\.com/.+/job/`,
		Company:     "OpenText",
		Country:     "CA",
		MaxPages:    500,
	},
}
