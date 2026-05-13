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
	"time"

	"github.com/omnijob/crawler/internal/embed"
	"github.com/omnijob/crawler/internal/pipeline"
	"github.com/omnijob/crawler/internal/sources"
)

// Batching parameters for the consumer side. Each worker drains up to
// embedBatchSize jobs from the channel, or flushes a smaller batch after
// embedFlushTimeout so the worker never stalls when the channel slows.
//
// 16 is conservative for nomic-embed-text on a B2s VM: batched throughput
// is ~13x single-shot per published Ollama benchmarks, and a 16-batch fits
// comfortably under the 64-cap enforced server-side. 2s flush keeps tail
// latency low for slow-trickling sources (RemoteOK paginates one page at
// a time) without sacrificing batching wins for the bulky ones.
const (
	embedBatchSize    = 16
	embedFlushTimeout = 2 * time.Second
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
	// Careerjet are gated on free API keys (USAJOBS_API_KEY, ADZUNA_APP_ID+
	// ADZUNA_APP_KEY, REED_API_KEY, CAREERJET_AFFID) and stay out of the
	// default rotation until the operator provisions them. Jooble is in the
	// default list with a key-gated no-op: it logs "[jooble] skipped" without
	// JOOBLE_API_KEY and activates automatically when the env var lands, so
	// the operator only needs to set the key on the droplet to turn it on.
	// The Muse works with or without MUSE_API_KEY (key raises the rate limit).
	// Pass `-sources` or SOURCES to opt in to other gated sources.
	includeStr := flag.String("sources", env("SOURCES", "greenhouse,lever,ashby,smartrecruiters,recruitee,workday,hackernews,remoteok,weworkremotely,bamboohr,breezy,pinpoint,workatastartup,themuse,jooble,workable,rss"), "comma-separated subset of sources to run")
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
	log.Printf("starting crawler - sources=%v concurrency=%d api=%s", names(srcs), *concurrency, *apiURL)

	jobs := make(chan pipeline.JobJSON, 64)

	// Per-source soft cap. Defense-in-depth against a single hung adapter
	// (a Workday tenant that pages forever, an aggregator returning empty
	// responses but never EOF). Each source gets its own context that
	// derives from the parent and cancels after this duration; the adapter
	// observes ctx.Err() in its loops and bails cleanly. Bound chosen so
	// the slowest healthy source (Workday with ~100 tenants) finishes well
	// inside, but a pathological hang can't dominate. 120 min is generous;
	// concurrency=3 + cooperative cancellation should keep total wall-clock
	// well under the 8h unit cap.
	sourceTimeout := envDuration("SOURCE_TIMEOUT", 120*time.Minute)

	// Producers: each source streams jobs into the channel.
	var producers sync.WaitGroup
	for _, s := range srcs {
		s := s
		producers.Add(1)
		go func() {
			defer producers.Done()
			srcCtx, srcCancel := context.WithTimeout(ctx, sourceTimeout)
			defer srcCancel()
			err := s.Fetch(srcCtx, jobs)
			if srcCtx.Err() == context.DeadlineExceeded {
				log.Printf("[%s] per-source timeout (%s) reached, moving on", s.Name(), sourceTimeout)
				return
			}
			if err != nil && ctx.Err() == nil {
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

	log.Printf("done - ingested=%d skipped=%d failed=%d", stats.ingested, stats.skipped, stats.failed)
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
	for {
		if ctx.Err() != nil {
			return
		}
		batch, ok := drainBatch(ctx, in, embedBatchSize, embedFlushTimeout)
		if len(batch) == 0 {
			if !ok {
				return // channel closed and drained
			}
			continue
		}
		processBatch(ctx, id, batch, emb, sink, stats)
		if !ok {
			return
		}
	}
}

// drainBatch collects up to `max` jobs from `in` and returns them along
// with a flag indicating whether the channel is still open. It returns
// early once the first job arrives and either the batch is full or the
// flush deadline elapses, so a slow channel never strands jobs in limbo.
//
// Returns (batch, true) while the channel is open and (batch, false)
// after the channel has been closed and fully drained; callers use the
// flag to terminate.
func drainBatch(
	ctx context.Context,
	in <-chan pipeline.JobJSON,
	max int,
	flush time.Duration,
) ([]pipeline.JobJSON, bool) {
	batch := make([]pipeline.JobJSON, 0, max)
	// Block until the first job (or shutdown) so an idle worker doesn't
	// spin. After the first arrival, switch to a flush-bounded loop.
	select {
	case <-ctx.Done():
		return batch, false
	case job, ok := <-in:
		if !ok {
			return batch, false
		}
		batch = append(batch, job)
	}
	deadline := time.NewTimer(flush)
	defer deadline.Stop()
	for len(batch) < max {
		select {
		case <-ctx.Done():
			return batch, false
		case <-deadline.C:
			return batch, true
		case job, ok := <-in:
			if !ok {
				return batch, false
			}
			batch = append(batch, job)
		}
	}
	return batch, true
}

// processBatch runs the exists-check in parallel across the batch, then
// sends one batched embed request for the survivors, and ingests each
// resulting job one at a time. Failure handling:
//   - exists-check error: log and proceed to embed (preserves the "better a
//     redundant embed than a missed job" stance from the per-job worker).
//   - whole-batch embed failure: log once, count every survivor as failed.
//   - per-job ingest failure after a successful batch embed: count just
//     that job as failed.
func processBatch(
	ctx context.Context,
	id int,
	batch []pipeline.JobJSON,
	emb *embed.Client,
	sink *pipeline.Sink,
	stats *counters,
) {
	// Phase 1: parallel exists-check + text extraction. Texts are
	// computed up front so jobs with empty text get counted as skipped
	// without holding an HTTP slot for the exists call.
	type prep struct {
		job  pipeline.JobJSON
		text string
		skip bool
	}
	preps := make([]prep, len(batch))
	for i, j := range batch {
		preps[i].job = j
		preps[i].text = embedText(j)
		if preps[i].text == "" {
			preps[i].skip = true
			log.Printf("[w%d] skip %s (no text)", id, j.ID)
		}
	}

	var wg sync.WaitGroup
	for i := range preps {
		if preps[i].skip {
			continue
		}
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			existing, err := sink.Exists(ctx, preps[i].job.ID)
			if err != nil {
				// Match the per-job behavior: on exists-check error,
				// embed anyway rather than risk losing a new job.
				log.Printf("[w%d] exists-check %s: %v (will embed anyway)", id, preps[i].job.ID, err)
				return
			}
			if existing {
				preps[i].skip = true
			}
		}(i)
	}
	wg.Wait()

	// Count skips and collect the survivors that need embedding.
	survivors := make([]int, 0, len(preps))
	texts := make([]string, 0, len(preps))
	for i := range preps {
		if preps[i].skip {
			stats.inc(&stats.skipped)
			continue
		}
		survivors = append(survivors, i)
		texts = append(texts, preps[i].text)
	}
	if len(survivors) == 0 {
		return
	}

	// Phase 2: single batched embed call.
	vecs, err := emb.EmbedBatch(ctx, texts)
	if err != nil {
		log.Printf("[w%d] embed batch (n=%d): %v", id, len(survivors), err)
		for range survivors {
			stats.inc(&stats.failed)
		}
		return
	}
	// Defense in depth - EmbedBatch already enforces this, but a partial
	// response slipping through would mis-pair (job, vector). Treat as a
	// whole-batch failure.
	if len(vecs) != len(survivors) {
		log.Printf("[w%d] embed batch length mismatch: sent %d got %d", id, len(survivors), len(vecs))
		for range survivors {
			stats.inc(&stats.failed)
		}
		return
	}

	// Phase 3: per-job ingest. /jobs/ingest isn't batched server-side and
	// Qdrant wasn't the bottleneck - the wins are from collapsing the N
	// embed roundtrips into one.
	for vi, pi := range survivors {
		job := preps[pi].job
		job.Vector = vecs[vi]
		if err := sink.Ingest(ctx, job); err != nil {
			log.Printf("[w%d] ingest %s: %v", id, job.ID, err)
			stats.inc(&stats.failed)
			continue
		}
		log.Printf("[w%d] ok %s - %s @ %s", id, job.ID, job.Metadata.Title, job.Metadata.Company)
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
	if want["rss"] {
		feeds := sources.ParseRSSFeeds(env("RSS_FEEDS", ""))
		if len(feeds) == 0 {
			feeds = sources.DefaultRSSFeeds
		}
		out = append(out, sources.NewRSS(feeds))
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

// envDuration parses a Go-style duration string ("90m", "2h30m", "45s") and
// returns the fallback when the env var is missing or unparseable.
func envDuration(key string, fallback time.Duration) time.Duration {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	d, err := time.ParseDuration(v)
	if err != nil || d <= 0 {
		return fallback
	}
	return d
}
