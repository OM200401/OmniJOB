# @omnijob/crawler

Go crawler for OmniJob. **v1 sources structured job data from public ATS APIs**
(Greenhouse, Lever, Ashby) — no HTML scraping, no anti-bot fights, clean data
straight from each company's career-site backend.

## Setup

```sh
go mod tidy
go run ./cmd/crawler
```

Requires:
- API up at `http://localhost:3000` (`apps/api`)
- Qdrant up (see `infra/`)
- Ollama up with `nomic-embed-text` pulled (`ollama pull nomic-embed-text`)

## Pipeline

```
sources.{Greenhouse,Lever,Ashby}.Fetch ──► chan JobJSON
                                              │
                                              ▼
                       ┌──────────────────────────────┐
                       │ N concurrent workers         │
                       │  • POST /embed   (Ollama)    │
                       │  • POST /jobs/ingest         │
                       └──────────────────────────────┘
```

Each adapter:
1. Walks a curated company list (`internal/sources/companies.go`).
2. Hits the provider's public per-company endpoint.
3. Normalizes each posting to the shared `pipeline.JobJSON` shape (matches
   the API's `JobIngest` body).
4. Streams jobs into the shared channel.

The worker pool then computes embeddings via the API's `/embed` proxy
(which itself talks to local Ollama) and ingests via `/jobs/ingest`.
Per-company 404s are logged and skipped — slugs drift over time.

## Configuration

Flags / env vars:

| Flag            | Env                  | Default                       | Notes                                  |
| --------------- | -------------------- | ----------------------------- | -------------------------------------- |
| `-api`          | `API_URL`            | `http://localhost:3000`       | OmniJob API base URL                   |
| `-concurrency`  | `EMBED_CONCURRENCY`  | `3`                           | Parallel embed/ingest workers          |
| `-sources`      | `SOURCES`            | `greenhouse,lever,ashby`      | Comma-separated subset                 |
|                 | `GREENHOUSE_COMPANIES` | (curated default in code)   | Override per-source company list       |
|                 | `LEVER_COMPANIES`    | (curated default in code)     | "                                      |
|                 | `ASHBY_COMPANIES`    | (curated default in code)     | "                                      |

Examples:

```sh
go run ./cmd/crawler -sources=greenhouse                            # one source
GREENHOUSE_COMPANIES=stripe,airbnb go run ./cmd/crawler -sources=greenhouse  # narrow
go run ./cmd/crawler -concurrency=8                                 # turn it up
```

## Layout

```
cmd/crawler/main.go             entry: producer/consumer wiring + signal handling
internal/sources/
  source.go                     Source interface
  companies.go                  curated default slug lists
  greenhouse.go                 boards-api.greenhouse.io
  lever.go                      api.lever.co/v0/postings
  ashby.go                      api.ashbyhq.com/posting-api/job-board
  util.go                       HTML strip + remote-status classifier
internal/embed/client.go        POST /embed (truncates to ~6k chars)
internal/pipeline/
  extract.go                    JobJSON / JobMetadata shared types
  sink.go                       POST /jobs/ingest
  normalize.go                  HTML → markdown (kept for future use)
internal/fetcher/               Colly-based fetcher (unused by v1; preserved
                                for future generic-crawl + SLM extraction
                                per PROJECT.md §2.1)
internal/queue/                 Redis URL queue (unused by v1; same reason)
```

## What's not in v1

- Generic web crawl + SLM-based extraction (PROJECT.md §2.1) — deferred while
  v1 sources structured data from ATS APIs. The `internal/fetcher` and
  `internal/queue` packages remain in tree as the foundation for that.
- Playwright-go fallback for sites behind Cloudflare/DataDome — not needed
  while we only hit public ATS APIs.
- Proxy rotation — public ATS APIs don't require it.
