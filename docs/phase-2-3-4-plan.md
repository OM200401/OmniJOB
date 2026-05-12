# OmniJob — Phase 2/3/4 detailed plan (post-Phase-1)

Written overnight 2026-05-11/12 after Phase 1 shipped. Status of every item
below reflects what got done while you slept versus what's queued for your
review.

---

## Where we are after Phase 1

- **Schema**: `industry` + `job_family` fields on `JobMetadata`, payload-indexed
  in Qdrant. Classifier in `apps/api/src/lib/industry.ts` (Tier 1 regex,
  15 industries, ~30 job families).
- **Per-industry heuristics**: seniority (`classifyTitle(title, industry?)`),
  quality scoring (`WEIGHTS_BY_INDUSTRY`), query expansion (TECH /
  HEALTHCARE / RETAIL / GOVERNMENT / TRADES / EDUCATION / LOGISTICS banks).
- **UX**: industry filter in Feed, industry step in Onboarding, industry
  shown in Settings, Landing previews rotate across industries,
  Management level filter exposed.
- **Skills**: per-industry lexicons (tech / healthcare / retail / trades /
  government / food_service). `extractSkills(text, industry?)` routes.
- **Adapters seeded for Phase 2**: USAJobs (env-gated), 9 hospital-network
  Workday tenants, 2 retail chains added.
- **Index**: 15,086 jobs, all backfilled with industry tags. Distribution:
  tech 2899 / healthcare 1050 / logistics 422 / food_service 199 / finance
  181 / legal 128 / retail 127 / manufacturing 126 / science 117 /
  government 87 / media 44 / education 17 / nonprofit 15 / trades 10 /
  other 9664.

---

## Phase 2 — Vertical launch (1-3 months, partly started)

### 2A. Government

| Status | Item |
|---|---|
| ✅ | USAJobs adapter exists, industry pre-fills to `government`, env-gated |
| **DECIDE** | Register for free USAJobs developer key at https://developer.usajobs.gov/APIRequest — 2 min |
| ⛔ | Job Bank Canada — partner-program signup needed, no public free API |
| **TODO** | Generic state/provincial RSS adapter — many open feeds (CA / TX / NY / BC / ON publish RSS) |
| **TODO** | UK Civil Service Jobs API (free, English-speaking expansion) |
| **TODO** | NHS Jobs RSS (UK healthcare public-sector) |

### 2B. Healthcare

| Status | Item |
|---|---|
| ✅ | 9 hospital-network Workday seeds added (HCA, Kaiser, Mass General Brigham, AdventHealth, Tenet, Northwell, Mayo, Providence, McLaren) |
| **VERIFY** | Watch the first crawler run journal for these tenants — 404s mean the slug guess was wrong; replace with verified ones |
| **TODO** | Add Canadian Workday tenants for healthcare (Sunnybrook, UHN, Alberta Health Services, Vancouver Coastal Health) — slugs not yet researched |
| **TODO** | Health Match BC — open API, BC-specific healthcare jobs |
| **TODO** | Hospital RSS feeds — many large networks publish careers RSS independently of Workday |

### 2C. Retail / hospitality / food service

| Status | Item |
|---|---|
| ✅ | Macy's, McDonald's added to Workday seeds |
| **TODO** | More chains via existing ATSes — research Workday slugs for Lowe's, Kroger, Walgreens, Petco, etc. (initial probes returned 404 for `lowes`, `tjx`, `kohls` — they may use iCIMS, BambooHR, or proprietary HRIS) |
| **TODO** | Big-box chain restaurant corporate boards (Starbucks already in; add Chipotle, Panera, Domino's) |
| ⛔ | Long-tail retail (small chains, single-location) blocked on $0 budget — requires Adzuna (~$50/mo) |

### 2D. Classifier + lexicon refinement

| Status | Item |
|---|---|
| **TODO** | **Tier 2 centroid classifier** — train per-industry centroids from confidently-classified examples, use to disambiguate "other" bucket. Could reclassify ~3-5k of the 9664 "other" jobs into the right industries. |
| **TODO** | **Fix known false positives** — the Walmart "Meat Cutter and Wrapper" job currently tags as healthcare (the description likely contains `\bmd\b` or similar substring overlap). Audit healthcare regex word-boundaries. |
| **TODO** | **Education lexicon** — currently no per-industry skill bank for education |
| **TODO** | **Finance lexicon** — currently no per-industry skill bank for finance |
| **TODO** | **Manufacturing/Logistics/Legal lexicons** — same |
| **TODO** | **Per-industry quality scoring fine-tuning** — current weights are first-pass estimates; revisit after Phase 2 verticals have real data flowing |

### 2E. UX polish

| Status | Item |
|---|---|
| **TODO** | Mobile-responsive check on the new "Industry" + "Management" filter sections in the Feed sidebar |
| **TODO** | Empty-state copy when filtering to an industry with zero results — currently shows generic "Nothing matches these filters" |
| **TODO** | Saved-search default industry seeding — when a user creates a saved search, default `industries` to `[preferences.industry]` |
| **TODO** | Industry chip badges on JobCard so users see at-a-glance which industry each result is |
| **TODO** | Industry switcher in Settings (currently shown but read-only) — let users update their preferred industry post-onboarding |

---

## Phase 3 — Source explosion (3-6 months)

### 3A. General-web crawler activation

| Status | Item |
|---|---|
| **TODO** | Wire up the Colly fetcher (`apps/crawler/internal/fetcher/colly.go`) — already built and tested, currently unused |
| **TODO** | LLM-assisted schema extraction — feed careers-page HTML to Haiku 4.5 or a local Llama, get back structured `JobJSON`. Aggressive URL-hash caching + monthly cost cap. |
| **TODO** | Auto-discovery extension to `cmd/discover/main.go` — parse company homepages for "/careers" / "/jobs" links, queue for adapter or LLM extraction |

### 3B. Distributed crawler

| Status | Item |
|---|---|
| **TODO** | Move from single-VM Go binary to a job-queue architecture (Redis Streams or NATS — Redis already in compose) |
| **TODO** | Multiple worker droplets pulling work units |
| **TODO** | Per-source throttling enforced at queue level |
| **TODO** | Failure isolation: a stuck adapter doesn't block the others |

### 3C. Paid aggregator integrations (budget-gated)

| Status | Item |
|---|---|
| ⛔ | Adzuna ($50-200/mo) — long-tail retail + global coverage |
| ⛔ | Indeed Publisher (paid tier) |
| ⛔ | Lightcast / Burning Glass (enterprise) |

### 3D. Search quality

| Status | Item |
|---|---|
| **TODO** | Cross-encoder reranker for top 50 hits — improves relevance on borderline matches |
| **TODO** | Sparse vector hybrid (proper BM25 + dense fusion, not the current title-only keyword pass) |
| **TODO** | Per-industry seniority-aware ranking (boost "Senior RN" when user is filtering healthcare + senior) |

---

## Phase 4 — Infrastructure scale + internationalization (6+ months)

### 4A. Infrastructure

| Status | Item |
|---|---|
| **TODO** | Embedder migration — GPU box (RunPod ~$200/mo for an A4000) or commercial API (OpenAI text-embedding-3-small ~$0.02/1M tokens, Voyage AI, Cohere). Privacy story shifts; deliberate trade. |
| **TODO** | Qdrant Cloud or self-managed cluster — at 10M+ points the single-VM Docker setup is the bottleneck |
| **TODO** | Redis-backed rate limiter replacing the in-process map (already in compose, just needs wiring) |
| **TODO** | Horizontal API scaling via Caddy + multiple Bun instances |

### 4B. Internationalization

| Status | Item |
|---|---|
| **TODO** | Multilingual embeddings (multilingual-e5 or commercial) — nomic-embed-text is English-tuned |
| **TODO** | Multi-currency salary parsing rewrite (`apps/api/src/lib/salary.ts`) |
| **TODO** | Country-specific adapters: StepStone (DE), Naukri (IN), 51job (CN), SEEK (AU/NZ) |
| **TODO** | Geo-aware ranking signal — postings local to user surface higher |

---

## Decisions queued for you

These will unblock further progress. Prioritised by impact:

1. **USAJobs activation** — register (2 min, free) + add `USAJOBS_API_KEY` and `USAJOBS_USER_AGENT` to the crawler systemd override. Unlocks ~50k federal postings immediately.
2. **Resend domain verification** for `omnijob.tech` — 30 min DNS work in Namify, fixes Gmail spam-folder problem, lets you eventually email any address (not just yourself).
3. **Sentry DSN** — confirm whether it's set in prod. If not, errors are invisible.
4. **Phase 2/3 budget threshold** — the cheapest paid step is Adzuna at $50/mo. Worth it once free sources hit a ceiling. Confirm budget cap.
5. **Phase 3 LLM extraction monthly cap** — Haiku 4.5 at ~$1/1M tokens; per-page cost is small but at 100k pages/month it adds up. Define a hard ceiling.
6. **Embedder migration trigger** — what counts as "outgrowing Ollama"? Numeric: when single-pass crawler runs exceed 6h on >50k new postings? When OOM kills happen?
7. **Function dimension** — should we introduce a separate `function` field (engineering / marketing / sales / ops / hr) on top of industry? Would unblock the "Marketing at Stripe" use case where industry=tech but function=marketing. Currently those 9664 "other" jobs are mostly tech-company corporate roles — a function filter would surface them properly.
8. **"Other" default behaviour** — should `industry=other` jobs appear when filtering by Tech (since most are tech-company roles)? Currently they're excluded. Defendable either way.

---

## Open questions (lower priority, raised during overnight work)

- Some healthcare false positives surfaced (e.g. Walmart "Meat Cutter" tagged as healthcare). Worth a regex audit pass on `apps/api/src/lib/industry.ts` healthcare patterns — likely a `\b(rn|md|do)\b` word-boundary fluke matching common English words.
- 9 hospital-network Workday seeds added are unverified; the first crawler run will surface which tenants 404 (look for `[workday:<tenant>]` lines in `sudo journalctl -u omnijob-crawler --since "1 hour ago"`). Replace bad ones.
- The 64% "other" bucket suggests the classifier is too conservative for tech-company corporate roles. Tier 2 centroid classification + a function dimension would together fix this.
- Saved-search filters now persist industry, but pre-Phase-1C saved searches don't have it set. They'll just filter on whatever was set at save time — backfill not needed but worth noting.

---

## Recommended next-session priorities

Rank-ordered by user-visible impact per hour of work:

1. Activate USAJobs (5 min of yours, then crawler pulls 50k federal postings)
2. Verify Resend domain (30 min DNS) — fixes spam folder
3. Audit healthcare regex false positives in `industry.ts` (30 min)
4. Add finance + manufacturing + logistics + legal lexicons (90 min)
5. Tier 2 centroid classifier prototype (3-4 hours)
6. State/provincial RSS adapter (4 hours, generic enough to cover ~20 feeds)
7. Mobile-responsive sweep of the new filter UI (1 hour with chrome-devtools)
