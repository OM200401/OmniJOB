// seed-canadian queries the public Wikidata SPARQL endpoint for Canadian
// companies (and their subclasses: publicly traded company, Crown corporation,
// non-profit, etc.) that publish an official website, and emits the result as
// a sorted, deduped JSON list keyed by registrable domain.
//
// Why: the sitemap+JSON-LD adapter (internal/sources/sitemap.go) needs a seed
// list of company careers pages to crawl. Hand-seeding (RBC, Loblaw, OpenText)
// doesn't scale. Wikidata has free, structured, machine-readable coverage of
// ~thousands of Canadian companies with their canonical homepages, which is
// the exact prerequisite for the next step: probing each homepage's sitemap
// for a JSON-LD JobPosting and auto-emitting a SITEMAP_FEEDS entry.
//
// Run:
//
//	go run ./cmd/seed-canadian -out=../../data/canadian-employers.json
//
// This is offline operator tooling. It does NOT touch the live crawler and
// has zero impact on per-run wall-clock; it just produces a static JSON
// artifact that downstream discovery tooling consumes.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// SPARQL endpoint accepts query+format via GET. No API key required, but a
// descriptive User-Agent is the documented norm — Wikidata may throttle
// anonymous traffic.
const sparqlEndpoint = "https://query.wikidata.org/sparql"

// Canadian organizations with an official website. We walk both P31
// (instance of) and P279 (subclass of) transitively from Q4830453
// (business) so we catch publicly-traded companies, Crown corporations,
// banks, retailers, etc. without enumerating each subtype by hand.
// P17=Q16 restricts country to Canada; P856 is the homepage.
//
// LIMIT is a guardrail against runaway responses; Wikidata caps query
// time at 60s anyway. Empirically Canadian business coverage is well
// under 5000 entries, so 5000 is comfortably generous.
const sparqlQuery = `SELECT ?company ?companyLabel ?website WHERE {
  ?company wdt:P31/wdt:P279* wd:Q4830453 ;
           wdt:P17 wd:Q16 ;
           wdt:P856 ?website .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
LIMIT 5000`

type sparqlBinding struct {
	Value string `json:"value"`
}

type sparqlResponse struct {
	Results struct {
		Bindings []map[string]sparqlBinding `json:"bindings"`
	} `json:"results"`
}

// Company is the on-disk record we emit. Domain is the deduplication key
// (registrable host, lowercased, www stripped) so the downstream sitemap
// prober has a single canonical form to work with.
type Company struct {
	Name       string `json:"name"`
	Domain     string `json:"domain"`
	Website    string `json:"website"`
	WikidataID string `json:"wikidata_id"`
}

func main() {
	out := flag.String("out", "data/canadian-employers.json", "output JSON path (created if missing)")
	flag.Parse()

	companies, err := fetchCompanies()
	if err != nil {
		log.Fatalf("wikidata fetch: %v", err)
	}

	// Dedupe by registrable domain. Multiple Wikidata entries occasionally
	// resolve to the same homepage (subsidiary share parent's site); we keep
	// the first occurrence after a stable sort by name so the artifact is
	// reproducible across runs.
	sort.Slice(companies, func(i, j int) bool {
		return strings.ToLower(companies[i].Name) < strings.ToLower(companies[j].Name)
	})
	seen := map[string]bool{}
	deduped := make([]Company, 0, len(companies))
	for _, c := range companies {
		if c.Domain == "" || seen[c.Domain] {
			continue
		}
		seen[c.Domain] = true
		deduped = append(deduped, c)
	}

	if err := writeJSON(*out, deduped); err != nil {
		log.Fatalf("write: %v", err)
	}
	log.Printf("wrote %d companies (%d raw, %d deduped) to %s",
		len(deduped), len(companies), len(companies)-len(deduped), *out)
}

func fetchCompanies() ([]Company, error) {
	u, err := url.Parse(sparqlEndpoint)
	if err != nil {
		return nil, err
	}
	q := u.Query()
	q.Set("query", sparqlQuery)
	q.Set("format", "json")
	u.RawQuery = q.Encode()

	req, err := http.NewRequest(http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "OmniJob-seed/0.1 (https://github.com/OM200401/OmniJOB; admin@omnijob.local)")
	req.Header.Set("Accept", "application/sparql-results+json")

	client := &http.Client{Timeout: 90 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return nil, fmt.Errorf("status %d: %s", resp.StatusCode, body)
	}

	var sp sparqlResponse
	if err := json.NewDecoder(resp.Body).Decode(&sp); err != nil {
		return nil, err
	}

	out := make([]Company, 0, len(sp.Results.Bindings))
	for _, b := range sp.Results.Bindings {
		entity := b["company"].Value
		domain := extractDomain(b["website"].Value)
		if domain == "" {
			continue
		}
		out = append(out, Company{
			Name:       b["companyLabel"].Value,
			Domain:     domain,
			Website:    b["website"].Value,
			WikidataID: lastPathSegment(entity),
		})
	}
	return out, nil
}

// extractDomain returns the lowercase registrable host with leading "www."
// stripped. Returns "" for malformed URLs so the caller can skip cleanly.
func extractDomain(raw string) string {
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return ""
	}
	h := strings.ToLower(u.Host)
	return strings.TrimPrefix(h, "www.")
}

func lastPathSegment(s string) string {
	if i := strings.LastIndex(s, "/"); i >= 0 {
		return s[i+1:]
	}
	return s
}

func writeJSON(path string, v any) error {
	if dir := filepath.Dir(path); dir != "" && dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return err
		}
	}
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	enc := json.NewEncoder(f)
	enc.SetIndent("", "  ")
	return enc.Encode(v)
}
