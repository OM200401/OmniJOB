package sources

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/omnijob/crawler/internal/pipeline"
)

// Hacker News "Ask HN: Who is hiring?" - a monthly thread posted by user
// `whoishiring`. Each top-level comment is a job posting from a founder or
// hiring manager. High signal because there's no recruiter funnel: the person
// posting is usually the person you'd report to.
//
// We use the Algolia HN search API to find the latest N threads and the
// items endpoint to walk each thread's top-level comments.
//
// Convention for the first line of a posting (loosely followed):
//
//	Company | Role | Location | (REMOTE/ONSITE/HYBRID) | (VISA) | $salary | URL
//
// Anything below the first line is treated as the job description.

type HackerNews struct {
	HTTP *http.Client
	// How many recent monthly threads to ingest. 1 = current month only.
	// 3 covers the last quarter for users who missed earlier postings.
	Months int
}

func NewHackerNews(months int) *HackerNews {
	if months <= 0 {
		months = 1
	}
	return &HackerNews{
		HTTP:   &http.Client{Timeout: 30 * time.Second},
		Months: months,
	}
}

func (h *HackerNews) Name() string { return "hackernews" }

type hnSearchResponse struct {
	Hits []struct {
		ObjectID  string `json:"objectID"`
		Title     string `json:"title"`
		CreatedAt string `json:"created_at"`
	} `json:"hits"`
}

type hnItem struct {
	ID          int64    `json:"id"`
	Type        string   `json:"type"`
	Author      string   `json:"author"`
	Text        string   `json:"text"`
	CreatedAt   string   `json:"created_at"`
	CreatedAtI  int64    `json:"created_at_i"`
	Title       string   `json:"title"`
	URL         string   `json:"url"`
	Children    []hnItem `json:"children"`
	StoryID     int64    `json:"story_id"`
	ParentID    int64    `json:"parent_id"`
}

func (h *HackerNews) Fetch(ctx context.Context, out chan<- pipeline.JobJSON) error {
	threads, err := h.findHiringThreads(ctx, h.Months)
	if err != nil {
		return err
	}
	if len(threads) == 0 {
		return fmt.Errorf("no hiring threads found")
	}
	for _, t := range threads {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := h.fetchThread(ctx, t, out); err != nil {
			log.Printf("[hackernews:%s] %v", t, err)
		}
	}
	return nil
}

func (h *HackerNews) findHiringThreads(ctx context.Context, n int) ([]string, error) {
	// search_by_date sorts newest-first so we always pick up the current
	// month's thread rather than whatever Algolia's relevance ranker decides.
	url := fmt.Sprintf("https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=%d", n*4)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	resp, err := h.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, fmt.Errorf("search status=%d: %s", resp.StatusCode, b)
	}
	var data hnSearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}
	out := make([]string, 0, n)
	for _, h := range data.Hits {
		// Defensive: only the canonical "Who is hiring?" threads, not
		// "Who wants to be hired?" / "Freelancer? Seeking freelancer?".
		t := strings.ToLower(h.Title)
		if !strings.Contains(t, "who is hiring") {
			continue
		}
		out = append(out, h.ObjectID)
		if len(out) >= n {
			break
		}
	}
	return out, nil
}

func (h *HackerNews) fetchThread(ctx context.Context, storyID string, out chan<- pipeline.JobJSON) error {
	url := fmt.Sprintf("https://hn.algolia.com/api/v1/items/%s", storyID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	resp, err := h.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("thread status=%d: %s", resp.StatusCode, b)
	}
	var thread hnItem
	if err := json.NewDecoder(resp.Body).Decode(&thread); err != nil {
		return err
	}

	count := 0
	for _, c := range thread.Children {
		// Top-level comments only. Replies are usually candidate questions.
		if c.Type != "comment" || strings.TrimSpace(c.Text) == "" {
			continue
		}
		job, ok := h.parseComment(c, thread.ID)
		if !ok {
			continue
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case out <- job:
			count++
		}
	}
	log.Printf("[hackernews:%d] %d jobs", thread.ID, count)
	return nil
}

// hnHeaderSep splits on "|" or " - " or " - " - common header delimiters
// used in HN job postings.
var hnHeaderSep = regexp.MustCompile(`\s*[\|-]\s*| - `)

// hnURLRe finds the first http(s) URL in a comment for the apply link.
var hnURLRe = regexp.MustCompile(`https?://[^\s<>"']+`)

func (h *HackerNews) parseComment(c hnItem, storyID int64) (pipeline.JobJSON, bool) {
	text := stripHTML(c.Text)
	if len(text) < 30 {
		return pipeline.JobJSON{}, false
	}

	// Header is everything up to the first paragraph break or first 200 chars.
	header, body := splitHNHeader(text)
	parts := hnHeaderSep.Split(header, -1)
	for i, p := range parts {
		parts[i] = strings.TrimSpace(p)
	}

	company := ""
	role := ""
	location := ""
	remoteHint := ""

	if len(parts) > 0 {
		company = parts[0]
	}
	// Walk remaining segments and classify by content.
	for _, p := range parts[1:] {
		lp := strings.ToLower(p)
		switch {
		case role == "" && looksLikeRole(p):
			role = p
		case isRemoteKeyword(lp):
			remoteHint = lp
		case location == "" && looksLikeLocation(p):
			location = p
		}
	}

	// Fallbacks: if role wasn't pipe-delimited, use the second-largest segment
	// or the first sentence of the body. If nothing parses, skip.
	if role == "" && len(parts) > 1 {
		role = parts[1]
	}
	if role == "" {
		role = firstSentence(body)
	}
	role = trimTo(role, 120)
	company = trimTo(company, 80)
	if company == "" || role == "" {
		return pipeline.JobJSON{}, false
	}

	url := ""
	if m := hnURLRe.FindString(text); m != "" {
		url = strings.TrimRight(m, ".,;)")
	}
	if url == "" {
		url = fmt.Sprintf("https://news.ycombinator.com/item?id=%d", c.ID)
	}

	remote := classifyRemoteFromKeyword(canonRemote(remoteHint))
	if remote == "unknown" {
		remote = classifyRemote(location, body)
	}

	posted := c.CreatedAtI * 1000
	if posted == 0 {
		posted = parseRFC3339Millis(c.CreatedAt)
	}

	meta := pipeline.JobMetadata{
		Title:           role,
		Company:         company,
		Location:        location,
		Country:         classifyCountry(location),
		RemoteStatus:    remote,
		ExperienceLevel: classifyLevel(role),
		Source:          "hackernews",
		SourceURL:       url,
		ScrapedAt:       time.Now().UnixMilli(),
		PostedAt:        posted,
		Description:     body,
	}
	ApplySalary(&meta.SalaryMin, &meta.SalaryMax, &meta.SalaryCurrency, &meta.SalaryPeriod, &meta.SalaryRange, text)

	return pipeline.JobJSON{
		ID:       fmt.Sprintf("hackernews:%d:%d", storyID, c.ID),
		Metadata: meta,
	}, true
}

// splitHNHeader returns (firstLine, rest). First line is the part above the
// first paragraph break; if the post is a single block, the first 240 chars.
func splitHNHeader(text string) (string, string) {
	if i := strings.Index(text, "\n\n"); i > 0 {
		return strings.TrimSpace(text[:i]), strings.TrimSpace(text[i+2:])
	}
	if len(text) > 240 {
		return strings.TrimSpace(text[:240]), strings.TrimSpace(text[240:])
	}
	return strings.TrimSpace(text), ""
}

func looksLikeRole(s string) bool {
	l := strings.ToLower(s)
	for _, k := range []string{
		"engineer", "developer", "scientist", "architect", "designer",
		"manager", "lead", "head", "director", "intern", "founding",
		"researcher", "analyst", "ops", "sre", "devops", "product",
		"frontend", "backend", "full stack", "fullstack", "full-stack",
		"infrastructure", "platform", "data", "ml", "ai ", "marketing",
		"sales", "support", "writer", "recruiter",
	} {
		if strings.Contains(l, k) {
			return true
		}
	}
	return false
}

func looksLikeLocation(s string) bool {
	if classifyCountry(s) != "" {
		return true
	}
	// Common location markers without country names.
	l := strings.ToLower(s)
	for _, k := range []string{"remote", "hybrid", "onsite", "on-site", "anywhere", "worldwide"} {
		if strings.Contains(l, k) {
			return true
		}
	}
	return false
}

func isRemoteKeyword(l string) bool {
	switch {
	case strings.Contains(l, "remote") && !strings.Contains(l, "no remote"):
		return true
	case strings.Contains(l, "hybrid"):
		return true
	case strings.Contains(l, "onsite") || strings.Contains(l, "on-site") || strings.Contains(l, "in office"):
		return true
	}
	return false
}

func canonRemote(l string) string {
	switch {
	case strings.Contains(l, "remote"):
		return "remote"
	case strings.Contains(l, "hybrid"):
		return "hybrid"
	case strings.Contains(l, "onsite") || strings.Contains(l, "on-site") || strings.Contains(l, "in office"):
		return "onsite"
	}
	return ""
}

func firstSentence(s string) string {
	s = strings.TrimSpace(s)
	for _, sep := range []string{". ", "! ", "? ", "\n"} {
		if i := strings.Index(s, sep); i > 0 && i < 200 {
			return s[:i]
		}
	}
	if len(s) > 200 {
		return s[:200]
	}
	return s
}

func trimTo(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) <= n {
		return s
	}
	return s[:n]
}
