// sitemap-prober consumes the seed list from cmd/seed-canadian and probes
// each company's domain for a public sitemap that yields JSON-LD JobPosting
// pages. Domains that pass all checks are emitted as ready-to-paste
// SITEMAP_FEEDS env entries; everything else is skipped silently.
//
// Why: cmd/seed-canadian gives us ~3800 candidate Canadian companies; only
// a fraction host their own careers site with the right schema. Manually
// inspecting each one is prohibitive. This tool automates the inspection
// and emits a curated config file the operator reviews and ships.
//
// Output format (one feed per line, joined by ; for the SITEMAP_FEEDS
// env var consumed by sources/sitemap.go:ParseSitemapFeeds):
//
//	<label>|<sitemap_url>|<url_pattern>|<company>|CA|<max_pages>
//
// Run:
//
//	go run ./cmd/sitemap-prober \
//	  -seeds=../../data/canadian-employers.json \
//	  -out=../../data/sitemap-feeds.txt \
//	  -concurrency=16 \
//	  -limit=0
//
// The tool is read-only against the live crawler - it produces a static
// artifact that the operator decides whether and when to deploy.
package main

import (
	"context"
	"encoding/json"
	"encoding/xml"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Candidate sitemap paths probed per domain, in order of typical
// likelihood. We stop at the first 200 that parses as a valid sitemap or
// sitemap-index. Ordering is empirical: /sitemap.xml is overwhelmingly
// the canonical location; the /careers and /jobs variants catch companies
// that segment their corporate site from the careers subsite.
var sitemapPaths = []string{
	"/sitemap.xml",
	"/sitemap_index.xml",
	"/careers/sitemap.xml",
	"/jobs/sitemap.xml",
}

// Subdomain variants probed when the apex domain misses. Most careers
// portals live at careers.* or jobs.*.
var subdomainPrefixes = []string{"careers", "jobs"}

// jobURLHints are substrings that suggest a URL is a job-detail page
// rather than a marketing page. A sitemap URL must contain at least one
// of these to be eligible as a sample for JSON-LD inspection.
var jobURLHints = []string{
	"/job/", "/jobs/", "/career/", "/careers/",
	"/posting/", "/postings/", "/opportunity/", "/opportunities/",
	"/role/", "/roles/", "/req/", "/requisition/",
	"/vacancy/", "/vacancies/", "/position/", "/positions/",
}

// jsonLDRe matches any application/ld+json block. We then check the
// content for "@type":"JobPosting".
var jsonLDRe = regexp.MustCompile(`(?is)<script[^>]+type=["']application/ld\+json["'][^>]*>(.*?)</script>`)

// Sitemap XML envelopes - duplicated from sources/sitemap.go rather than
// imported to keep this tool free of cross-package dependencies and
// runnable standalone.
type sitemapURLSet struct {
	XMLName xml.Name `xml:"urlset"`
	URLs    []struct {
		Loc string `xml:"loc"`
	} `xml:"url"`
}

type sitemapIndex struct {
	XMLName xml.Name `xml:"sitemapindex"`
	Maps    []struct {
		Loc string `xml:"loc"`
	} `xml:"sitemap"`
}

type Company struct {
	Name       string `json:"name"`
	Domain     string `json:"domain"`
	Website    string `json:"website"`
	WikidataID string `json:"wikidata_id"`
}

// Hit is what we emit for a successful probe: a fully-formed feed entry
// the operator can drop into SITEMAP_FEEDS.
type Hit struct {
	Label      string
	SitemapURL string
	URLPattern string
	Company    string
	Country    string
	MaxPages   int
}

func (h Hit) Line() string {
	return fmt.Sprintf("%s|%s|%s|%s|%s|%d", h.Label, h.SitemapURL, h.URLPattern, h.Company, h.Country, h.MaxPages)
}

func main() {
	seeds := flag.String("seeds", "data/canadian-employers.json", "input seed JSON from cmd/seed-canadian")
	outPath := flag.String("out", "data/sitemap-feeds.txt", "output feed-config path")
	concurrency := flag.Int("concurrency", 16, "concurrent probe workers")
	limit := flag.Int("limit", 0, "max companies to probe (0 = all)")
	timeoutSec := flag.Int("timeout", 10, "per-request timeout seconds")
	flag.Parse()

	companies, err := loadSeeds(*seeds)
	if err != nil {
		log.Fatalf("load seeds: %v", err)
	}
	if *limit > 0 && len(companies) > *limit {
		companies = companies[:*limit]
	}
	log.Printf("probing %d companies with concurrency=%d", len(companies), *concurrency)

	client := &http.Client{Timeout: time.Duration(*timeoutSec) * time.Second}
	in := make(chan Company)
	out := make(chan Hit)

	var wg sync.WaitGroup
	var probed, hits int64
	for i := 0; i < *concurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for c := range in {
				atomic.AddInt64(&probed, 1)
				h, ok := probe(client, c)
				if ok {
					atomic.AddInt64(&hits, 1)
					out <- h
				}
				if n := atomic.LoadInt64(&probed); n%200 == 0 {
					log.Printf("progress: %d/%d probed, %d hits", n, len(companies), atomic.LoadInt64(&hits))
				}
			}
		}()
	}

	// Producer
	go func() {
		for _, c := range companies {
			in <- c
		}
		close(in)
	}()

	// Collector + closer
	go func() {
		wg.Wait()
		close(out)
	}()

	hitsList := []Hit{}
	for h := range out {
		hitsList = append(hitsList, h)
		log.Printf("hit: %s  ->  %s", h.Label, h.SitemapURL)
	}

	if err := writeFeeds(*outPath, hitsList); err != nil {
		log.Fatalf("write: %v", err)
	}
	log.Printf("done - probed=%d hits=%d wrote=%s", atomic.LoadInt64(&probed), len(hitsList), *outPath)
}

func loadSeeds(path string) ([]Company, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	var out []Company
	if err := json.NewDecoder(f).Decode(&out); err != nil {
		return nil, err
	}
	return out, nil
}

// probe tries each sitemap path/subdomain combo for the company. Returns
// the first valid hit (sitemap parses + at least one URL inside is a
// JobPosting per JSON-LD inspection of a sampled page) or (Hit{}, false).
func probe(client *http.Client, c Company) (Hit, bool) {
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	hostsToTry := []string{c.Domain}
	for _, prefix := range subdomainPrefixes {
		hostsToTry = append(hostsToTry, prefix+"."+c.Domain)
	}

	for _, host := range hostsToTry {
		for _, path := range sitemapPaths {
			if ctx.Err() != nil {
				return Hit{}, false
			}
			sitemapURL := "https://" + host + path
			urls, ok := fetchSitemapURLs(ctx, client, sitemapURL)
			if !ok || len(urls) == 0 {
				continue
			}
			jobURLs := filterJobURLs(urls)
			if len(jobURLs) == 0 {
				continue
			}
			if !sampleHasJobPostingJSONLD(ctx, client, jobURLs) {
				continue
			}
			return Hit{
				Label:      deriveLabel(c.Domain),
				SitemapURL: sitemapURL,
				URLPattern: deriveURLPattern(jobURLs),
				Company:    c.Name,
				Country:    "CA",
				MaxPages:   500,
			}, true
		}
	}
	return Hit{}, false
}

// fetchSitemapURLs returns the flat list of URLs from a sitemap or
// sitemap-index. Bounded recursion: an index is descended one level
// (matches the live adapter's behavior); deeper nesting is rare in
// practice and not worth the round-trip budget on a prober pass.
func fetchSitemapURLs(ctx context.Context, client *http.Client, sitemapURL string) ([]string, bool) {
	body, ok := fetchBytes(ctx, client, sitemapURL, 2*1024*1024)
	if !ok {
		return nil, false
	}
	// Try sitemap-index first; valid index XML with zero entries is treated
	// as a parse fail and falls through to urlset.
	var idx sitemapIndex
	if err := xml.Unmarshal(body, &idx); err == nil && len(idx.Maps) > 0 {
		// Descend into at most 3 children; prefer ones with hints in the URL.
		preferred := []string{}
		others := []string{}
		for _, m := range idx.Maps {
			loc := strings.TrimSpace(m.Loc)
			if loc == "" {
				continue
			}
			if hasJobHint(loc) {
				preferred = append(preferred, loc)
			} else {
				others = append(others, loc)
			}
		}
		children := append(preferred, others...)
		if len(children) > 3 {
			children = children[:3]
		}
		all := []string{}
		for _, c := range children {
			child, ok := fetchSitemapURLs(ctx, client, c)
			if ok {
				all = append(all, child...)
			}
		}
		return all, len(all) > 0
	}
	var set sitemapURLSet
	if err := xml.Unmarshal(body, &set); err != nil {
		return nil, false
	}
	out := make([]string, 0, len(set.URLs))
	for _, n := range set.URLs {
		loc := strings.TrimSpace(n.Loc)
		if loc != "" {
			out = append(out, loc)
		}
	}
	return out, len(out) > 0
}

func filterJobURLs(urls []string) []string {
	out := make([]string, 0, len(urls))
	for _, u := range urls {
		if hasJobHint(u) {
			out = append(out, u)
		}
	}
	return out
}

func hasJobHint(u string) bool {
	lower := strings.ToLower(u)
	for _, h := range jobURLHints {
		if strings.Contains(lower, h) {
			return true
		}
	}
	return false
}

// sampleHasJobPostingJSONLD fetches up to 2 sample URLs and checks if any
// contains a JSON-LD block with @type=JobPosting. We only need one
// positive sample to confirm the schema is in use sitewide.
func sampleHasJobPostingJSONLD(ctx context.Context, client *http.Client, urls []string) bool {
	samples := urls
	if len(samples) > 2 {
		samples = samples[:2]
	}
	for _, u := range samples {
		body, ok := fetchBytes(ctx, client, u, 1024*1024)
		if !ok {
			continue
		}
		matches := jsonLDRe.FindAllSubmatch(body, -1)
		for _, m := range matches {
			raw := strings.TrimSpace(string(m[1]))
			raw = strings.ReplaceAll(raw, "&quot;", "\"")
			if strings.Contains(raw, `"@type":"JobPosting"`) ||
				strings.Contains(raw, `"@type": "JobPosting"`) {
				return true
			}
		}
	}
	return false
}

func fetchBytes(ctx context.Context, client *http.Client, rawURL string, maxBytes int64) ([]byte, bool) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, false
	}
	req.Header.Set("User-Agent", "OmniJob-prober/0.1 (+https://github.com/OM200401/OmniJOB)")
	req.Header.Set("Accept", "*/*")
	resp, err := client.Do(req)
	if err != nil {
		return nil, false
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return nil, false
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxBytes))
	if err != nil {
		return nil, false
	}
	return body, true
}

// deriveLabel turns a domain into a stable lowercase slug used as the
// SourceLabel for the sitemap feed (also forms part of each job's ID).
// We strip the TLD and any internal dots so e.g. "scotiabank.com" ->
// "scotiabank" and "great-west-life.com" -> "great-west-life".
func deriveLabel(domain string) string {
	d := strings.ToLower(domain)
	if i := strings.Index(d, "."); i > 0 {
		d = d[:i]
	}
	// Replace any remaining non-slug-safe characters.
	return regexp.MustCompile(`[^a-z0-9-]`).ReplaceAllString(d, "")
}

// deriveURLPattern computes a regex that anchors on the longest common
// path prefix across the sample job URLs. Falls back to the host root if
// no useful prefix exists. The pattern is the gate the live adapter
// uses to decide which sitemap URLs to actually scrape, so it has to be
// permissive enough to match real jobs but tight enough to skip
// marketing pages.
func deriveURLPattern(urls []string) string {
	if len(urls) == 0 {
		return `^https?://`
	}
	if len(urls) == 1 {
		// One sample: use up-to-last-/ as the prefix.
		u := urls[0]
		if i := strings.LastIndex(u, "/"); i > 0 {
			return "^" + regexp.QuoteMeta(u[:i+1])
		}
		return "^" + regexp.QuoteMeta(u)
	}
	common := longestCommonPrefix(urls)
	if i := strings.LastIndex(common, "/"); i > 0 {
		common = common[:i+1]
	}
	if common == "" || !strings.Contains(common, "://") {
		// Common prefix doesn't even include scheme - fall back to first URL.
		u, err := url.Parse(urls[0])
		if err == nil {
			return fmt.Sprintf(`^https?://%s/`, regexp.QuoteMeta(u.Host))
		}
		return `^https?://`
	}
	return "^" + regexp.QuoteMeta(common)
}

func longestCommonPrefix(strs []string) string {
	if len(strs) == 0 {
		return ""
	}
	prefix := strs[0]
	for _, s := range strs[1:] {
		j := 0
		for j < len(prefix) && j < len(s) && prefix[j] == s[j] {
			j++
		}
		prefix = prefix[:j]
		if prefix == "" {
			break
		}
	}
	return prefix
}

func writeFeeds(path string, hits []Hit) error {
	if dir := filepath.Dir(path); dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}
	// Stable order so reruns produce a deterministic file (helps the
	// operator diff before deploying).
	sort.Slice(hits, func(i, j int) bool { return hits[i].Label < hits[j].Label })
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	for _, h := range hits {
		if _, err := fmt.Fprintln(f, h.Line()); err != nil {
			return err
		}
	}
	return nil
}
