package main

import (
	"context"
	"flag"
	"log"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"

	"github.com/omnijob/crawler/internal/embed"
	"github.com/omnijob/crawler/internal/pipeline"
	"github.com/omnijob/crawler/internal/sources"
)

func main() {
	apiURL := flag.String("api", env("API_URL", "http://localhost:3000"), "OmniJob API base URL")
	concurrency := flag.Int("concurrency", envInt("EMBED_CONCURRENCY", 3), "concurrent embed/ingest workers")
	// Workable's public API is auth-gated; their adapter exists but isn't in
	// the default rotation until we have a path to it. Pass `-sources` or
	// SOURCES env var to override.
	// Personio and Teamtailor adapters exist but are gated on operator-curated
	// tenant lists (PERSONIO_COMPANIES / TEAMTAILOR_COMPANIES env vars) since
	// their public endpoints are opt-in per tenant. USAJobs / Adzuna / Reed /
	// Jooble / Careerjet are gated on free API keys (USAJOBS_API_KEY,
	// ADZUNA_APP_ID+ADZUNA_APP_KEY, REED_API_KEY, JOOBLE_API_KEY,
	// CAREERJET_AFFID). The Muse works with or without MUSE_API_KEY (key
	// raises the rate limit). Pass `-sources` or SOURCES to opt in.
	includeStr := flag.String("sources", env("SOURCES", "greenhouse,lever,ashby,smartrecruiters,recruitee,workday,hackernews,remoteok,weworkremotely,bamboohr,breezy,pinpoint,workatastartup,themuse"), "comma-separated subset of sources to run")
	flag.Parse()

	include := splitCSV(*includeStr)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go func() {
		sig := make(chan os.Signal, 1)
		signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
		<-sig
		log.Print("shutdown requested")
		cancel()
	}()

	srcs := buildSources(include)
	if len(srcs) == 0 {
		log.Fatalf("no sources selected (got %q)", *includeStr)
	}
	log.Printf("starting crawler — sources=%v concurrency=%d api=%s", names(srcs), *concurrency, *apiURL)

	jobs := make(chan pipeline.JobJSON, 64)

	// Producers: each source streams jobs into the channel.
	var producers sync.WaitGroup
	for _, s := range srcs {
		s := s
		producers.Add(1)
		go func() {
			defer producers.Done()
			if err := s.Fetch(ctx, jobs); err != nil && ctx.Err() == nil {
				log.Printf("[%s] fatal: %v", s.Name(), err)
			}
		}()
	}
	go func() {
		producers.Wait()
		close(jobs)
	}()

	// Consumers: embed + POST /jobs/ingest concurrently.
	embedClient := embed.NewClient(*apiURL)
	sink := pipeline.NewSink(*apiURL)

	var consumers sync.WaitGroup
	stats := &counters{}
	for i := 0; i < *concurrency; i++ {
		consumers.Add(1)
		go func(id int) {
			defer consumers.Done()
			worker(ctx, id, jobs, embedClient, sink, stats)
		}(i)
	}
	consumers.Wait()

	log.Printf("done — ingested=%d skipped=%d failed=%d", stats.ingested, stats.skipped, stats.failed)
}

type counters struct {
	mu       sync.Mutex
	ingested int
	skipped  int
	failed   int
}

func (c *counters) inc(field *int) {
	c.mu.Lock()
	*field++
	c.mu.Unlock()
}

func worker(
	ctx context.Context,
	id int,
	in <-chan pipeline.JobJSON,
	emb *embed.Client,
	sink *pipeline.Sink,
	stats *counters,
) {
	for job := range in {
		if ctx.Err() != nil {
			return
		}

		text := embedText(job)
		if text == "" {
			log.Printf("[w%d] skip %s (no text)", id, job.ID)
			stats.inc(&stats.skipped)
			continue
		}

		vec, err := emb.Embed(ctx, text)
		if err != nil {
			log.Printf("[w%d] embed %s: %v", id, job.ID, err)
			stats.inc(&stats.failed)
			continue
		}
		job.Vector = vec

		if err := sink.Ingest(ctx, job); err != nil {
			log.Printf("[w%d] ingest %s: %v", id, job.ID, err)
			stats.inc(&stats.failed)
			continue
		}

		log.Printf("[w%d] ✓ %s — %s @ %s", id, job.ID, job.Metadata.Title, job.Metadata.Company)
		stats.inc(&stats.ingested)
	}
}

// embedText is the string we embed for a job. Title + company + truncated
// description gives the model a coherent semantic summary while staying
// under nomic-embed-text's token budget.
func embedText(j pipeline.JobJSON) string {
	parts := []string{j.Metadata.Title, j.Metadata.Company}
	if j.Metadata.Location != "" {
		parts = append(parts, j.Metadata.Location)
	}
	if j.Metadata.Description != "" {
		parts = append(parts, j.Metadata.Description)
	}
	return strings.Join(parts, "\n")
}

func buildSources(include []string) []sources.Source {
	want := map[string]bool{}
	for _, n := range include {
		want[strings.ToLower(strings.TrimSpace(n))] = true
	}
	var out []sources.Source
	if want["greenhouse"] {
		out = append(out, sources.NewGreenhouse(envCSV("GREENHOUSE_COMPANIES", sources.DefaultGreenhouse)))
	}
	if want["lever"] {
		out = append(out, sources.NewLever(envCSV("LEVER_COMPANIES", sources.DefaultLever)))
	}
	if want["ashby"] {
		out = append(out, sources.NewAshby(envCSV("ASHBY_COMPANIES", sources.DefaultAshby)))
	}
	if want["smartrecruiters"] {
		out = append(out, sources.NewSmartRecruiters(envCSV("SMARTRECRUITERS_COMPANIES", sources.DefaultSmartRecruiters)))
	}
	if want["workable"] {
		out = append(out, sources.NewWorkable(envCSV("WORKABLE_COMPANIES", sources.DefaultWorkable)))
	}
	if want["recruitee"] {
		out = append(out, sources.NewRecruitee(envCSV("RECRUITEE_COMPANIES", sources.DefaultRecruitee)))
	}
	if want["workday"] {
		out = append(out, sources.NewWorkday(sources.DefaultWorkday))
	}
	if want["personio"] {
		out = append(out, sources.NewPersonio(envCSV("PERSONIO_COMPANIES", sources.DefaultPersonio)))
	}
	if want["teamtailor"] {
		out = append(out, sources.NewTeamtailor(envCSV("TEAMTAILOR_COMPANIES", sources.DefaultTeamtailor)))
	}
	if want["hackernews"] {
		out = append(out, sources.NewHackerNews(envInt("HN_MONTHS", 1)))
	}
	if want["remoteok"] {
		out = append(out, sources.NewRemoteOK())
	}
	if want["weworkremotely"] {
		out = append(out, sources.NewWeWorkRemotely(envCSV("WWR_CATEGORIES", sources.DefaultWWRCategories)))
	}
	if want["usajobs"] {
		out = append(out, sources.NewUSAJobs(env("USAJOBS_API_KEY", ""), env("USAJOBS_USER_AGENT", "")))
	}
	if want["bamboohr"] {
		out = append(out, sources.NewBambooHR(envCSV("BAMBOOHR_COMPANIES", sources.DefaultBambooHR)))
	}
	if want["breezy"] {
		out = append(out, sources.NewBreezy(envCSV("BREEZY_COMPANIES", sources.DefaultBreezy)))
	}
	if want["pinpoint"] {
		out = append(out, sources.NewPinpoint(envCSV("PINPOINT_COMPANIES", sources.DefaultPinpoint)))
	}
	if want["workatastartup"] {
		out = append(out, sources.NewWorkAtAStartup(envCSV("WORKATASTARTUP_ROLES", sources.DefaultWorkAtAStartupRoles)))
	}
	if want["themuse"] {
		out = append(out, sources.NewTheMuse(env("MUSE_API_KEY", ""), envInt("MUSE_MAX_PAGES", 50)))
	}
	if want["adzuna"] {
		out = append(out, sources.NewAdzuna(
			env("ADZUNA_APP_ID", ""),
			env("ADZUNA_APP_KEY", ""),
			envCSV("ADZUNA_COUNTRIES", sources.DefaultAdzunaCountries),
			envInt("ADZUNA_MAX_PAGES", 5),
		))
	}
	if want["jooble"] {
		out = append(out, sources.NewJooble(env("JOOBLE_API_KEY", ""), nil, envInt("JOOBLE_PAGES", 3)))
	}
	if want["reed"] {
		out = append(out, sources.NewReed(env("REED_API_KEY", ""), envCSV("REED_QUERIES", sources.DefaultReedQueries), envInt("REED_MAX_PAGES", 3)))
	}
	if want["careerjet"] {
		out = append(out, sources.NewCareerjet(
			env("CAREERJET_AFFID", ""),
			env("CAREERJET_USER_AGENT", ""),
			envCSV("CAREERJET_LOCALES", sources.DefaultCareerjetLocales),
			envInt("CAREERJET_PAGES", 5),
		))
	}
	return out
}

func names(s []sources.Source) []string {
	out := make([]string, 0, len(s))
	for _, x := range s {
		out = append(out, x.Name())
	}
	return out
}

func splitCSV(s string) []string {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envCSV(key string, fallback []string) []string {
	if v := os.Getenv(key); v != "" {
		return splitCSV(v)
	}
	return fallback
}

func envInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n := 0
	for _, c := range v {
		if c < '0' || c > '9' {
			return fallback
		}
		n = n*10 + int(c-'0')
	}
	if n == 0 {
		return fallback
	}
	return n
}
