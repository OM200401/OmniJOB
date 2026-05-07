// discover probes public ATS endpoints for a list of company names and emits
// confirmed (adapter, slug) tuples to stdout + a JSONL file.
//
// Why: companies.go is hand-curated at ~300 slugs across 8 ATSes. Each ATS
// hosts thousands of public boards we're not crawling. Slug-probing every
// known company against every ATS multiplies coverage without writing new
// adapter code.
//
// Run:
//   go run ./cmd/discover -seeds=seeds/companies.txt -out=discovered.jsonl
//
// Approach: for each company name, generate slug variants (e.g. "Stripe Inc"
// → ["stripe", "stripeinc", "stripe-inc"]) and probe each variant against
// every adapter's public list endpoint. A 200 with the expected JSON shape
// is a hit. Workers fan out across companies; each worker probes all
// adapters for its company in parallel.
package main

import (
	"bufio"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"
)

type adapter struct {
	name    string
	urlFor  func(slug string) string
	verify  func(status int, body []byte) bool
}

var adapters = []adapter{
	{
		name:   "greenhouse",
		urlFor: func(s string) string { return fmt.Sprintf("https://boards-api.greenhouse.io/v1/boards/%s/jobs?content=false", s) },
		verify: func(status int, body []byte) bool {
			if status != 200 {
				return false
			}
			return jsonHasKey(body, "jobs")
		},
	},
	{
		name:   "lever",
		urlFor: func(s string) string { return fmt.Sprintf("https://api.lever.co/v0/postings/%s?limit=1", s) },
		verify: func(status int, body []byte) bool {
			if status != 200 {
				return false
			}
			// Lever returns a top-level array; just confirm parseable JSON.
			return len(body) > 0 && (body[0] == '[' || body[0] == '{')
		},
	},
	{
		name:   "ashby",
		urlFor: func(s string) string { return fmt.Sprintf("https://api.ashbyhq.com/posting-api/job-board/%s", s) },
		verify: func(status int, body []byte) bool {
			if status != 200 {
				return false
			}
			return jsonHasKey(body, "jobs")
		},
	},
	{
		name:   "smartrecruiters",
		urlFor: func(s string) string { return fmt.Sprintf("https://api.smartrecruiters.com/v1/companies/%s/postings?limit=1", s) },
		verify: func(status int, body []byte) bool {
			if status != 200 {
				return false
			}
			// API returns 200 with `{"totalFound":0,"content":[]}` for any
			// company name (existent or not). Accept only when at least one
			// posting exists — that proves the slug is real AND actively
			// hiring (which is what discovery wants anyway).
			return jsonHasNonZeroNumber(body, "totalFound")
		},
	},
	{
		name:   "recruitee",
		urlFor: func(s string) string { return fmt.Sprintf("https://%s.recruitee.com/api/offers/", s) },
		verify: func(status int, body []byte) bool {
			if status != 200 {
				return false
			}
			return jsonHasKey(body, "offers")
		},
	},
	{
		name:   "bamboohr",
		urlFor: func(s string) string { return fmt.Sprintf("https://%s.bamboohr.com/careers/list", s) },
		verify: func(status int, body []byte) bool {
			if status != 200 {
				return false
			}
			return jsonHasKey(body, "result")
		},
	},
	{
		name:   "breezy",
		urlFor: func(s string) string { return fmt.Sprintf("https://%s.breezy.hr/json", s) },
		verify: func(status int, body []byte) bool {
			if status != 200 {
				return false
			}
			return len(body) > 0 && body[0] == '['
		},
	},
	{
		name:   "pinpoint",
		urlFor: func(s string) string { return fmt.Sprintf("https://%s.pinpointhq.com/postings.json", s) },
		verify: func(status int, body []byte) bool {
			if status != 200 {
				return false
			}
			return jsonHasKey(body, "data") || (len(body) > 0 && body[0] == '[')
		},
	},
}

var nonAlnum = regexp.MustCompile(`[^a-z0-9]+`)

// slugVariants returns common slug forms for a company name.
// "Stripe Inc"   → ["stripe", "stripeinc", "stripe-inc"]
// "Y Combinator" → ["ycombinator", "y-combinator"]
// "Q&A Co"       → ["qandaco", "qa", "q-and-a-co"] (... approximate)
func slugVariants(name string) []string {
	s := strings.ToLower(strings.TrimSpace(name))
	s = strings.ReplaceAll(s, "&", "and")
	s = strings.ReplaceAll(s, "+", "plus")
	s = strings.ReplaceAll(s, "'", "")
	s = strings.ReplaceAll(s, ".", "")

	flat := nonAlnum.ReplaceAllString(s, "")
	hyph := strings.Trim(nonAlnum.ReplaceAllString(s, "-"), "-")

	out := []string{}
	seen := map[string]bool{}
	add := func(v string) {
		if v == "" || seen[v] {
			return
		}
		seen[v] = true
		out = append(out, v)
	}
	add(flat)
	add(hyph)

	// Strip common suffixes that companies sometimes drop in their slug.
	for _, suf := range []string{"inc", "llc", "ltd", "corp", "co", "company", "labs", "technologies", "tech"} {
		if strings.HasSuffix(flat, suf) && len(flat) > len(suf)+2 {
			add(strings.TrimSuffix(flat, suf))
			add(strings.TrimSuffix(hyph, "-"+suf))
		}
	}
	return out
}

// jsonHasNonZeroNumber returns true if the body contains `"key":` followed by
// a numeric value > 0. Used by SmartRecruiters where the API returns 200 with
// totalFound:0 for any (real or fake) company.
func jsonHasNonZeroNumber(body []byte, k string) bool {
	needle := []byte(`"` + k + `":`)
	limit := 4096
	if len(body) < limit {
		limit = len(body)
	}
	region := body[:limit]
	for i := 0; i+len(needle) < len(region); i++ {
		if !equalBytes(region[i:i+len(needle)], needle) {
			continue
		}
		// Skip whitespace after the colon.
		j := i + len(needle)
		for j < len(region) && (region[j] == ' ' || region[j] == '\t') {
			j++
		}
		if j >= len(region) {
			return false
		}
		c := region[j]
		// Reject leading 0 / negative; require [1-9].
		if c >= '1' && c <= '9' {
			return true
		}
		return false
	}
	return false
}

// jsonHasKey returns true if the JSON body has a top-level key matching `k`.
// Avoids a full json.Unmarshal — we only need a structural sanity check.
func jsonHasKey(body []byte, k string) bool {
	if len(body) < len(k)+2 {
		return false
	}
	needle := []byte(`"` + k + `"`)
	// Limit the search window so a giant page doesn't slow us down.
	limit := 4096
	if len(body) < limit {
		limit = len(body)
	}
	return contains(body[:limit], needle)
}

func contains(haystack, needle []byte) bool {
	if len(needle) == 0 || len(haystack) < len(needle) {
		return false
	}
	for i := 0; i <= len(haystack)-len(needle); i++ {
		if equalBytes(haystack[i:i+len(needle)], needle) {
			return true
		}
	}
	return false
}

func equalBytes(a, b []byte) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

type hit struct {
	Company string `json:"company"`
	Adapter string `json:"adapter"`
	Slug    string `json:"slug"`
	URL     string `json:"url"`
}

func main() {
	seedsFile := flag.String("seeds", "seeds/companies.txt", "newline-separated company names")
	outFile := flag.String("out", "discovered.jsonl", "JSONL output path")
	workers := flag.Int("workers", 16, "concurrent companies probed")
	timeout := flag.Duration("timeout", 8*time.Second, "per-request timeout")
	flag.Parse()

	companies, err := readSeeds(*seedsFile)
	if err != nil {
		log.Fatalf("seeds: %v", err)
	}
	log.Printf("seeds=%d adapters=%d workers=%d", len(companies), len(adapters), *workers)

	out, err := os.Create(*outFile)
	if err != nil {
		log.Fatalf("out: %v", err)
	}
	defer out.Close()

	httpClient := &http.Client{Timeout: *timeout}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	queue := make(chan string, len(companies))
	results := make(chan hit, 64)
	var wg sync.WaitGroup
	for i := 0; i < *workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for company := range queue {
				probeCompany(ctx, httpClient, company, results)
			}
		}()
	}
	go func() {
		for _, c := range companies {
			queue <- c
		}
		close(queue)
		wg.Wait()
		close(results)
	}()

	enc := json.NewEncoder(out)
	enc.SetEscapeHTML(false)
	hitCount := 0
	byAdapter := map[string]int{}
	for r := range results {
		_ = enc.Encode(r)
		hitCount++
		byAdapter[r.Adapter]++
	}
	log.Printf("done — total_hits=%d", hitCount)
	for _, a := range adapters {
		log.Printf("  %s: %d", a.name, byAdapter[a.name])
	}
}

func readSeeds(path string) ([]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	out := []string{}
	seen := map[string]bool{}
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key := strings.ToLower(line)
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, line)
	}
	return out, sc.Err()
}

// probeCompany runs every adapter probe in parallel for a single company,
// emitting hits onto results.
func probeCompany(ctx context.Context, hc *http.Client, company string, results chan<- hit) {
	variants := slugVariants(company)
	if len(variants) == 0 {
		return
	}
	var wg sync.WaitGroup
	// Per-adapter: try variants sequentially. We stop after the first hit per
	// (company, adapter) since that's the canonical slug for this company.
	for _, a := range adapters {
		wg.Add(1)
		go func(a adapter) {
			defer wg.Done()
			for _, v := range variants {
				if ctx.Err() != nil {
					return
				}
				url := a.urlFor(v)
				if probe(ctx, hc, url, a.verify) {
					results <- hit{Company: company, Adapter: a.name, Slug: v, URL: url}
					return
				}
			}
		}(a)
	}
	wg.Wait()
}

func probe(ctx context.Context, hc *http.Client, url string, verify func(int, []byte) bool) bool {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return false
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "OmniJob-Discover/1.0")
	resp, err := hc.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 32*1024))
	if err != nil {
		return false
	}
	return verify(resp.StatusCode, body)
}
