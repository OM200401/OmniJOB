# OmniJOB

Privacy-first semantic job search. The mission is **highest possible volume** —
every job a tech worker would consider, in one place, so the candidate never
has to maintain a tab graveyard across LinkedIn, Indeed, Workday portals, and
twenty branded career sites. Everything else (filters, freshness, salary
transparency, E2EE) makes that volume *usable* instead of overwhelming.

See [`PROJECT.md`](./PROJECT.md) for the full spec and [`PROJECT.md` §11](./PROJECT.md#11-product-principles-trust-first) for product principles.

## At a glance

- **24 source adapters** across direct ATS, curated employer programs,
  public-API aggregators, remote-first feeds, and government — covering
  ~657 hand-curated + auto-discovered tenants
- **15,000+ unique postings** (post-dedup, ≥0.98 cosine cross-source merge
  with canonical-link priority — direct ATS beats aggregator beats
  remote-syndication)
- **8 inaccessible boards** stub-documented (LinkedIn, Indeed, Glassdoor,
  ZipRecruiter, Monster, SimplyHired, Dice, CareerBuilder) — partner-gated
  or ToS-prohibited; institutional knowledge committed so they're not
  re-investigated
- **Sub-50ms p50** vector search (Qdrant 768-dim HNSW cosine, local Ollama
  `nomic-embed-text`)
- **Server has no PII** — `uid = SHA-256(email)`, profile blob AES-256-GCM
  encrypted client-side, password reset structurally impossible without the
  recovery key (see [`/privacy`](http://localhost:5173/privacy))

## Trust First product principles

Each one is reinforced by an architectural choice — not just a marketing
claim. Source: [`PROJECT.md` §11](./PROJECT.md#11-product-principles-trust-first).

- **Verified Freshness** — every posting graded by `scraped_at` (last
  verified live in the source ATS); 45+ days old hidden by default. Stale
  pill is a UI commitment, not copy.
- **No Hidden Salary** — extracted from every posting where the employer
  disclosed it; muted "salary undisclosed" chip when not. Never silently
  omitted.
- **Algorithmic Accountability** — every match shows *why*. Phrase-pair
  panel surfaces top-K résumé↔job similarities; skill panel shows matched
  + missing canonical skills; quality breaks down into named components
  with weights.
- **Privacy by Default** — email never stored, profile blob AES-256-GCM
  encrypted client-side, recovery via 32-byte key shown once at signup.

## Repo layout

```
apps/
  api/       Bun + Elysia.js — vector search, embed proxy, encrypted user blobs
    scripts/dedupe.ts        Cross-source dedup (cosine ≥ 0.98 + canonical priority)
    src/lib/{quality,salary,seniority,location,explain,skills}.ts   Heuristic libs (152 tests)
  crawler/   Go — 24 source adapters
    cmd/crawler/             Default rotation
    cmd/discover/            Tenant slug-probe discovery (cmd + diff.ts + merge.ts)
    seeds/companies.txt      Seed list for discovery (extensible)
  web/       Vite + React — full UI
    src/lib/crypto/          Argon2id + AES-256-GCM + recovery-key vault
    src/routes/              Landing, Onboarding, Feed, JobDetail, Applications,
                             Saved, Settings, Privacy
  mobile/    React Native + Expo (deferred — RNQC partial Web Crypto, see PROJECT.md §9)
infra/
  docker-compose.yml         Local Qdrant + Redis
  .env.example               Environment variable reference
```

## Prerequisites

- **Docker** — Qdrant + Redis
- **Bun** ≥ 1.3 — API + web
- **Go** ≥ 1.22 — crawler
- **Ollama** with the 768-dim embedding model pulled:
  ```sh
  ollama pull nomic-embed-text
  ```
  Default endpoint `http://localhost:11434`.

## Quickstart

### 1. Infra

```sh
cd infra
docker compose up -d
```
Qdrant on `:6333`, Redis on `:6379`.

### 2. API

```sh
cd apps/api
bun install
bun run init:qdrant      # creates `jobs` + `users` collections (768-dim, cosine)
bun run init:sqlite      # creates the user-blob SQLite database
bun run dev              # http://localhost:3000
```

```sh
curl http://localhost:3000/health
# → {"status":"ok","qdrant":true,"sqlite":true,"ollama":true}
```

### 3. Seed jobs (crawler)

```sh
cd apps/crawler
go mod tidy
go run ./cmd/crawler
```

Default rotation pulls from 13 active sources (greenhouse, lever, ashby,
smartrecruiters, recruitee, workday, hackernews, remoteok, weworkremotely,
bamboohr, breezy, pinpoint, workatastartup, themuse). Expect 30–90 minutes
depending on tenant count and Ollama throughput.

Narrow for faster iteration:

```sh
GREENHOUSE_COMPANIES=stripe,airbnb go run ./cmd/crawler -sources=greenhouse
```

Opt-in adapters (require env keys, off by default):

```sh
ADZUNA_APP_ID=… ADZUNA_APP_KEY=… go run ./cmd/crawler -sources=adzuna
JOOBLE_API_KEY=…                   go run ./cmd/crawler -sources=jooble
REED_API_KEY=…                     go run ./cmd/crawler -sources=reed
USAJOBS_API_KEY=… USAJOBS_USER_AGENT=you@example.com go run ./cmd/crawler -sources=usajobs
```

### 4. Cross-source dedup

After the crawler finishes, collapse duplicates:

```sh
cd apps/api
bun run scripts/dedupe.ts            # full run
bun run scripts/dedupe.ts --dry-run  # report-only
```

Bucket key is `(normalized_company, normalized_title, country, remote_status)`;
within a bucket, vectors with cosine ≥ 0.98 are clustered and only the
canonical (highest-priority source) is kept active. First run on a fresh
~19k-job index typically collapses ~20% as duplicates.

### 5. Web app

```sh
cd apps/web
bun install
cp .env.example .env     # adjust VITE_API_URL if API is elsewhere
bun run dev              # http://localhost:5173
```

### 6. Try the full flow

1. Open http://localhost:5173 → **Get started**.
2. Enter email + password — Argon2id derives a 256-bit key locally (t=3, m=64MiB).
3. Save the recovery key (32 bytes, shown ONCE — needed to recover if you forget your password).
4. Paste résumé text or drop a PDF (parsed via pdf.js; bytes never leave the browser).
5. The text is embedded via `/embed` → vector encrypted into your profile blob → matches load.
6. Open a posting to see **why this matched** (phrase pairs), the **quality breakdown** (4 weighted components), and **skill fit** (matched + missing canonical skills).
7. Bookmark, mark applied, track status (applied → interviewing → offer / rejected / ghosted).
8. Save searches; the sidebar surfaces "+N new since last visit" badges.

## Sources

The crawler ships adapters for five categories. Each is one Go file under
`apps/crawler/internal/sources/` implementing the `Source` interface.

| Tier | Sources | Notes |
|---|---|---|
| 1 — Direct ATS | Greenhouse, Lever, Ashby, Workday, SmartRecruiters, Recruitee, Workable, BambooHR, Breezy, Pinpoint, Personio, Teamtailor | Employer-controlled. Highest canonical priority in dedup. Workable / Personio / Teamtailor are opt-in. |
| 2 — Curated employer programs | HN "Who is hiring?", Y Combinator Work-at-a-Startup, USAJobs.gov | Founder-attested or government-verified. USAJobs is opt-in (free API key). |
| 3 — Public-API aggregators | The Muse, Adzuna, Jooble, Reed, Careerjet | The Muse is in default rotation; the rest are opt-in via free API keys. |
| 4 — Remote-first | RemoteOK, We Work Remotely | Often syndicate from Tier 1; deduped accordingly. |
| Stub-documented as inaccessible | LinkedIn, Indeed, Glassdoor, ZipRecruiter, Monster, SimplyHired, Dice, CareerBuilder | Each file's top-of-file comment captures the deprecation event or partner-program gate. |

### Tenant auto-discovery

`companies.go` is now ~657 ATS tenant slugs. Most were added by automated
slug-probing rather than hand-curation:

```sh
cd apps/crawler
go run ./cmd/discover -seeds=seeds/companies.txt -out=discovered.jsonl
bun run cmd/discover/merge.ts discovered.jsonl internal/sources/companies.go
```

The probe HEADs every adapter's public list endpoint (`boards-api.greenhouse.io/v1/boards/<slug>/jobs`,
`api.lever.co/v0/postings/<slug>`, etc.) for slug variants of each seed
company. A 200 with the expected JSON shape is a hit; the merge tool
de-dupes against existing entries and appends new slugs in-place. First
run grew companies.go from ~300 to ~657 tenants (357 net-new).

Extend `seeds/companies.txt` and re-run to keep growing — the merge is
idempotent.

## Architecture (one screen)

```
                 ┌───────────────────── apps/web (browser) ─────────────────┐
                 │  Argon2id (hash-wasm)  →  AES-GCM (Web Crypto)            │
                 │  pdf.js extracts résumé text → POST /embed                │
                 │  Encrypted profile blob (résumé + skill vector + saves    │
                 │     + applications + saved searches)                      │
                 └───────────────┬─────────────────────────────────────────┘
                                 │ HTTPS
                 ┌───────────────▼─────────────── apps/api (Bun) ────────────┐
                 │  /health  /embed  /users/*  /jobs/{search,ingest,:id}     │
                 │  /jobs/:id/match-explain  /jobs/mark-inactive             │
                 │  /users/:uid/{recovery,recover}                           │
                 │   ┌──────────────┐ ┌────────────┐ ┌───────────────┐       │
                 │   │ Bun SQLite   │ │ Qdrant     │ │ Ollama proxy  │       │
                 │   │ encrypted    │ │ 768-dim    │ │ nomic-embed   │       │
                 │   │ user blobs   │ │ cosine     │ │ -text         │       │
                 │   │ (ciphertext  │ │ HNSW       │ │               │       │
                 │   │  only)       │ │ is_active  │ │               │       │
                 │   └──────────────┘ └────────────┘ └───────────────┘       │
                 └───────────────▲────────────────────────▲──────────────────┘
                  POST /embed     │                        │ HTTP
                 + POST /jobs/ingest                       │
                                 │                         │
                 ┌───────────────┴── apps/crawler (Go) ────┴──────────────────┐
                 │  24 Source adapters (Tier 1-4 + stub-documented)           │
                 │  Worker pool: source → embed → ingest                      │
                 │  cmd/discover: tenant slug-probe (Greenhouse, Lever, ...)  │
                 └────────────────────────────────────────────────────────────┘
```

## Privacy properties

- **Server has no PII.** `uid = SHA-256(lowercased_email)`. The email itself never reaches the server.
- **Server has no plaintext résumé.** Résumé text + saved jobs + applications + saved searches live inside an AES-256-GCM-encrypted blob keyed by your Argon2id-derived master key. The server stores ciphertext only.
- **Skill vector is unlinked.** When stored in Qdrant, the user's skill vector lives under a random point id — the uid → point id mapping is held only inside the encrypted blob.
- **Wrong password = AES-GCM auth-tag failure.** The server can't tell a wrong password from a right one; only the client knows.
- **Password reset is structurally impossible without the recovery key.** The recovery key independently wraps the same DEK as the master key. Lose both → vault is unrecoverable. The math forbids a support backdoor.

See [`PROJECT.md` §6](./PROJECT.md#6-security-model) for the full security model
and [`/privacy`](http://localhost:5173/privacy) for the field-level disclosure
table.

## Operational tooling

| Command | Purpose |
|---|---|
| `bun test src/lib/` (in apps/api) | 152 unit tests across quality / salary / seniority / location / explain |
| `bun run scripts/dedupe.ts` (in apps/api) | Cross-source dedup pass; `--dry-run` reports without modifying |
| `go run ./cmd/discover` (in apps/crawler) | Probe ATSes for new tenant slugs |
| `bun run cmd/discover/diff.ts` (in apps/crawler) | List new slugs not yet in companies.go |
| `bun run cmd/discover/merge.ts` (in apps/crawler) | Append new slugs to companies.go |

## Status

| Area | State |
|---|---|
| Crawler — direct ATS adapters | ✅ 12 live (Tier 1) |
| Crawler — curated programs | ✅ HN, YC WaaS, USAJobs |
| Crawler — public-API aggregators | ✅ The Muse default; Adzuna / Jooble / Reed / Careerjet opt-in |
| Crawler — remote-first | ✅ RemoteOK, We Work Remotely |
| Crawler — tenant auto-discovery | ✅ Slug-probe, 357 net-new tenants on first run |
| API — vector search + filters | ✅ Sub-50ms p50, post-filter on level/country/salary/age |
| API — cross-source dedup | ✅ Cosine ≥ 0.98 with canonical priority |
| API — match-explain | ✅ Phrase-pair top-K |
| Web — E2EE vault | ✅ Argon2id + AES-256-GCM + recovery key |
| Web — feed, saved, JobDetail, applications, settings, privacy | ✅ Shipped |
| Mobile (React Native) | ⏳ Deferred — RNQC partial Web Crypto |
| Cloud / edge deploy | ⏳ Open — Hetzner CX21 / Cloudflare Tunnel options sketched |
| Enterprise ATSes (Taleo, iCIMS, SuccessFactors) | ⏳ Backlog — biggest remaining volume cohort |
| Paid aggregator (SerpApi for LinkedIn / Indeed / Glassdoor coverage) | ⏳ Gated on commercial revenue |

See [`PROJECT.md` §UPDATES v1.0.1](./PROJECT.md#updates-v101--volume-phase) for the
full Volume Phase status and backlog priority order.
