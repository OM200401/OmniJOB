# OmniJob

Privacy-first semantic job search. Live postings from Greenhouse, Lever and Ashby
boards, ranked by cosine similarity against an end-to-end-encrypted résumé.
See [`PROJECT.md`](./PROJECT.md) for the full spec.

## Repo layout

```
apps/
  api/       Bun + Elysia.js — vector search, embed proxy, encrypted user blobs
  crawler/   Go — Greenhouse / Lever / Ashby ATS API adapters
  web/       Vite + React — full UI (E2EE auth, résumé upload, feed, saved, settings)
  mobile/    React Native + Expo client (not yet scaffolded)
infra/
  docker-compose.yml   Local Qdrant + Redis
  .env.example         Environment variable reference
```

## Prerequisites

- **Docker** (for Qdrant + Redis)
- **Bun** ≥ 1.3 (API + web)
- **Go** ≥ 1.22 (crawler)
- **Ollama** running locally with the embedding model pulled:
  ```sh
  ollama pull nomic-embed-text
  ```
  Default endpoint is `http://localhost:11434`. The embedding model is **768-dim**.

## End-to-end quickstart

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

### 3. Seed real jobs (crawler)

```sh
cd apps/crawler
go mod tidy
go run ./cmd/crawler
```

The crawler walks curated company lists for Greenhouse, Lever and Ashby. Each job
is embedded via `nomic-embed-text` (through the API's `/embed` proxy) and ingested
into Qdrant. First run ingests a few hundred postings; expect 5–10 minutes since
each job needs an embedding pass.

To narrow down for faster iteration:

```sh
GREENHOUSE_COMPANIES=stripe,airbnb go run ./cmd/crawler -sources=greenhouse
```

### 4. Web app

```sh
cd apps/web
bun install
cp .env.example .env     # adjust VITE_API_URL if API is elsewhere
bun run dev              # http://localhost:5173
```

### 5. Try the full flow

1. Open http://localhost:5173 → click **Get started**.
2. Enter email + password → Argon2id derives a 256-bit key locally (~1–2 s).
3. Paste résumé text **or** drop a PDF (parsed via pdf.js, bytes never leave the browser).
4. The text is embedded via `/embed` → vector encrypted into your profile blob → matches load.
5. Bookmark roles you like (saved IDs live inside your encrypted blob), open **Saved**, hit **Apply** to jump to the company's career page.

## Architecture (one screen)

```
                 ┌───────────────────── apps/web (browser) ─────────────────┐
                 │  Argon2id (hash-wasm)  →  AES-GCM (Web Crypto)            │
                 │  pdf.js extracts résumé text → POST /embed                │
                 │  Encrypted profile blob (résumé + skill vector + saves)   │
                 └───────────────┬─────────────────────────────────────────┘
                                 │ HTTPS
                 ┌───────────────▼─────────────── apps/api (Bun) ────────────┐
                 │  /health  /embed  /users/*  /jobs/{search,ingest,:id}     │
                 │   ┌──────────────┐ ┌────────────┐ ┌───────────────┐       │
                 │   │ Bun SQLite   │ │ Qdrant     │ │ Ollama proxy  │       │
                 │   │ encrypted    │ │ 768-dim    │ │ nomic-embed   │       │
                 │   │ user blobs   │ │ cosine     │ │ -text         │       │
                 │   └──────────────┘ └────────────┘ └───────────────┘       │
                 └───────────────▲────────────────────────▲──────────────────┘
                  POST /embed     │                        │ HTTP
                 + POST /jobs/ingest                       │
                                 │                         │
                 ┌───────────────┴── apps/crawler (Go) ────┴──────────────────┐
                 │  Source adapters: Greenhouse · Lever · Ashby (public APIs) │
                 │  Worker pool: embed → ingest                               │
                 └────────────────────────────────────────────────────────────┘
```

## Privacy properties

- **Server has no PII.** `uid = SHA-256(lowercased_email)`. The email itself never reaches the server.
- **Server has no plaintext résumé.** Résumé text + saved jobs live inside an AES-GCM-encrypted blob keyed by your Argon2id-derived master key. The server stores ciphertext only.
- **Skill vector is unlinked.** When stored in Qdrant, the user's skill vector lives under a random point id — the uid → point id mapping is held only inside the encrypted blob.
- **Wrong password = AES-GCM auth-tag failure.** The server can't tell a wrong password from a right one; only the client knows.

See [`PROJECT.md`](./PROJECT.md) §6 for the full security model and §9 for known open questions.

## Status

v1 product cut. Mobile app (React Native / Expo) not yet scaffolded.
