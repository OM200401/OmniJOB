# OmniJob

> Decentralized career search engine for the North American tech sector.
> Connects students with roles via **Semantic Proximity** rather than keyword matching.
> Resumes never leave the client unencrypted.

---

## 1. Overview

OmniJob is a decentralized career search engine focused on the North American tech sector. It utilizes Semantic Proximity rather than keyword matching to connect students with roles.

**Guiding principles**

- **Privacy-first** - no plain-text resumes or contact information ever exist on OmniJob servers; matching runs against an anonymous "Skill Vector".
- **Free for students** - infrastructure choices are driven by cost efficiency (spot instances, serverless edge).
- **Performance** - sub-50ms vector search, 60 FPS mobile UI.

---

## 2. System Architecture

### 2.1 Phantom Crawler Layer (Go)

To scrape the entire internet without being blocked by anti-bot measures (like Cloudflare or Akamai), the crawler requires a sophisticated orchestration layer.

- **Concurrency model** - worker pool using Go channels and goroutines to manage thousands of simultaneous outbound requests while maintaining a strict rate-limiting protocol per domain.
- **Anti-detection** - `playwright-go` with stealth plugins to emulate human behavior, rotating through a pool of high-reputation residential proxies and varying User-Agent headers.
- **Normalization pipeline** - raw HTML is stripped into clean markdown, then a Small Language Model (SLM) such as Phi-3 or Llama 3 (8B) parses the markdown to extract structured JSON data.

### 2.2 API & Edge Layer (Bun + Elysia.js)

The backend must handle high-velocity data ingestion and user queries simultaneously.

- **Bun's native power** - zero-copy file I/O and built-in SQLite driver for lightning-fast metadata caching.
- **Elysia.js middleware** - TypeBox for end-to-end type safety between the Bun backend and the React Native frontend, ensuring `Resume` objects are validated at the edge.
- **Vector retrieval** - Hierarchical Navigable Small World (HNSW) index in the vector DB (Qdrant or Milvus) so Nearest Neighbor searches for skills complete in **< 50 ms**.

### 2.3 Frontend (React Native / Expo)

- **FlashList** for memory-efficient rendering of long job-result lists at 60 FPS.
- **Web Crypto API** for client-side E2EE - the resume is encrypted in the browser/app before it ever reaches the server.

---

## 3. Functional Requirements

| ID   | Module              | Technical Specification                                                                                                                                                                              |
| ---- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR.1 | Resume Profiler     | Parse PDF files in-browser using `pdfjs-dist` (text-only, bytes never leave the client). Convert extracted text into a 768-dimensional vector via the local Ollama `nomic-embed-text` model.        |
| FR.2 | Skill Match Engine  | Calculate the cosine similarity between the user vector ($A$) and the job vector ($B$): $\text{similarity} = \dfrac{A \cdot B}{\lVert A \rVert \, \lVert B \rVert}$.                                  |
| FR.3 | E2EE Vault          | User profiles are encrypted client-side using AES-GCM (256-bit). The master key is derived from the user's password using Argon2id.                                                                  |
| FR.4 | Real-Time Indexer   | A WebSocket stream via Elysia.js that pushes "New Match" notifications to the React Native app the moment the crawler finds a relevant role.                                                         |

---

## 4. Data Schema (Simplified)

### 4.1 Job Object - Elastic / Vector Store

```
id:          UUID
vector:      float[768]            // Skill-based embedding
metadata:    { title, company, location, salary_range, remote_status, source_url }
scraped_at:  Timestamp
```

### 4.2 User Object - E2EE Encrypted

```
uid:                      UUID
encrypted_profile_blob:   Base64 string   // Contains name, contact, resume text
skill_vector:             float[768]     // Stored plain-text in vector store for matching,
                                          // but unlinked from PII
```

---

## 5. Non-Functional Requirements

- **Privacy** - no plain-text resumes or contact information shall ever exist on OmniJob servers. All matching is performed against an anonymous Skill Vector.
- **Performance** - the React Native / Expo app must maintain 60 FPS while rendering long lists of job results using FlashList.
- **Cost efficiency** - since the product is 100% free for students, infrastructure uses spot instances for the crawler and serverless edge functions for the API to minimize burn.

---

## 6. Security Model

- **Client-side encryption** - AES-GCM, 256-bit key length.
- **Key derivation** - master key is derived from the user's password via Argon2id.
- **PII isolation** - the `skill_vector` lives in the plain-text vector store for matching but is **unlinked** from the user's PII (which lives only inside the `encrypted_profile_blob`).
- **In transit** - resumes are encrypted in the browser via the Web Crypto API before any network transmission.

---

## 7. Implementation Roadmap

| Phase           | Window      | Focus                                                                                              |
| --------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| Ingestion       | Weeks 1–4   | Scaffold the Go crawler with a distributed Redis queue for URL management.                         |
| Intelligence    | Weeks 5–8   | Implement the embedding pipeline. On resume upload, pass through `text-embedding-3-small` (or OSS equivalent) to generate the vector. |
| Security        | Weeks 9–12  | Deploy the E2EE protocol using the Web Crypto API on the frontend to encrypt the resume before it reaches the server. |

---

## 8. Tech Stack at a Glance

| Layer        | Technology                                                                  |
| ------------ | --------------------------------------------------------------------------- |
| Crawler      | Go, goroutines + channels, `playwright-go` (stealth), residential proxies   |
| Queue        | Redis (distributed URL queue)                                               |
| Parsing SLM  | Phi-3 or Llama 3 (8B)                                                       |
| Backend      | Bun runtime, Elysia.js, TypeBox                                             |
| Storage      | Qdrant or Milvus (HNSW index), SQLite (metadata cache via Bun)              |
| Embeddings   | Ollama-hosted `nomic-embed-text` - 768 dims, cosine                         |
| Frontend     | React Native, Expo, FlashList                                               |
| Realtime     | Elysia.js WebSocket stream                                                  |
| Security     | Web Crypto API, AES-GCM (256-bit), Argon2id                                 |
| Doc parsing  | PDF.js, Mammoth                                                             |
| Infra        | Spot instances (crawler), serverless edge (API)                             |

---

## 9. Open Questions / Decisions Pending

_Populate as questions arise._

- [x] **Vector DB choice - Qdrant** (resolved 2026-05-04, locked in by boilerplate via `@qdrant/js-client-rest`). Milvus deferred unless we hit a Qdrant-specific blocker.
- [x] **Embedding provider - Ollama `nomic-embed-text`** (768 dim, cosine), resolved 2026-05-04. Server-side embedding via `/embed` proxy; web client and crawler both call it.
- [x] **Job source strategy - Greenhouse + Lever + Ashby public ATS APIs** (resolved 2026-05-04). No HTML scraping needed for v1; clean structured data straight from each company's career site backend. Generic web-crawl + LLM extraction deferred indefinitely.
- [ ] Hosting target for the Bun/Elysia API - which serverless edge platform.
- [x] **Sustainability fallback** - direction set 2026-05-05: **pay-per-qualified-hire** charged to employers, zero cost to seekers. Pricing principles: transparent flat fee per hire (no auctions, no ranking buy-up), tied to a hire-confirmed event the employer self-attests via the same anonymous skill-vector matching surface introduced for reverse-apply (Phase 4). Premium for-seeker tier rejected on principle - would compromise the trust-first product positioning. Specific dollar figure to be set after we have the first 10k weekly searches as a denominator. Open: how to validate hire confirmations without identifying the seeker (likely: ZK proof or trusted third-party attestation).
- [ ] **Crawler upgrade path to `playwright-go`** for sites behind Cloudflare Turnstile / DataDome / Akamai. Boilerplate uses Colly v2 only (fast lane); the `Fetcher` interface in `apps/crawler/internal/fetcher` is designed so a `PlaywrightFetcher` can be slotted in per-domain without changing queue or pipeline code.
- [ ] **RN crypto path** - §2.3 currently says "Web Crypto API". `react-native-quick-crypto` only ships partial Web Crypto (issue #569: `subtle.generateKey('AES-GCM')` unimplemented). Plan for the mobile boilerplate is to use RNQC's Node-style `createCipheriv('aes-256-gcm', ...)` API, which is fully shipped. Decision: amend §2.3 once the mobile app lands, or wait for upstream.
- [ ] **Argon2id parameters per device tier** - initial baseline `t=3, m=64MiB, p=1`. Mid-tier Android may need `m=32MiB`; needs measurement before launch.
- [ ] Mobile dev workflow - Expo Dev Client + prebuild (required by both crypto native modules) vs Expo Go (would force pure-JS Argon2, unusable on phones).
- [ ] Master-key persistence on mobile - re-derive on every app open (current default) vs Keychain/Keystore for biometric "remember this device" UX.
- [ ] Proxy-pool strategy for the crawler - boilerplate uses a single static UA. Need provider selection (residential pool vendor) and rotation policy before scaling out.
- [ ] **Long-term role of `apps/web`** - was scaffolded as a quick testing surface (full Web Crypto API works in browsers in a way it doesn't in React Native). Decide whether to keep it as a first-class product surface alongside mobile, or retire it once the React Native app reaches parity.
- [ ] **Email-as-PII tradeoff** - v1 derives `uid = SHA-256(lowercased_email)` client-side, so the server stores only the hash and never the email itself. This preserves §5's "no contact info ever" property at the cost of a one-way mapping (lost email = lost account). Revisit if account-recovery UX is needed.
- [ ] **Generative SLM for HTML extraction** - currently unused now that v1 sources structured data from ATS APIs. Reactivate if/when expanding to non-ATS sources.

---

## 10. Changelog

- **2026-05-03** - Initial draft consolidated from the strategic roadmap and Technical PRD v1.2.
- **2026-05-04** - v0 boilerplate scaffolded: monorepo with `apps/api` (Bun + Elysia 1.4 + Qdrant via `@qdrant/js-client-rest` + Bun SQLite), `apps/crawler` (Go + Colly v2 + Redis-backed queue, robots.txt-respecting, `Fetcher` interface for future `playwright-go` impl), and `infra/docker-compose.yml` (Qdrant + Redis). Mobile app intentionally deferred. Vector DB choice locked in as Qdrant. Several new entries added to §9 covering RN crypto path, Argon2 params, proxy strategy, mobile dev workflow, and the Colly→Playwright upgrade path.
- **2026-05-04** - `apps/web` added: Vite + React + React Router. Implements the full E2EE flow per §6 using the **native Web Crypto API** for AES-256-GCM and `hash-wasm` for Argon2id (browsers ship full Web Crypto, unlike RNQC). Pages: register, login, dashboard with `/health` and `/jobs/search` test buttons. Master key + DEK held in memory only; refresh logs out. Long-term role of the web client (testing harness vs first-class product surface) tracked as a new §9 open question.
- **2026-05-04** - v1 product cut: embedding dim changed 1536 → 768 to match Ollama `nomic-embed-text`. API gains `/embed` (Ollama proxy), `/jobs/:id`, `/users/profile/saved` (saved-jobs list lives inside the encrypted blob). Auth switches from raw-UUID-as-username to `uid = SHA-256(lowercased_email)` client-side derivation - user types email + password, server still sees neither plaintext. Crawler replaced with Greenhouse + Lever + Ashby ATS-API source adapters; generic Colly path retained in `internal/fetcher` for future reactivation. Web app fully redesigned to a Stripe/Notion light aesthetic (Inter, warm neutrals, soft shadows) with Landing, SignIn, SignUp, Onboarding (paste + PDF.js upload), Feed (resume-ranked), JobDetail, Saved, Settings.
- **2026-05-04** - Trust First (Phase 1 of the market-research-driven roadmap):
  - **Salary transparency.** Crawler regex-extracts `salary_min/max/currency/period` from description text (`apps/crawler/internal/sources/salary.go`); JobCard renders a salary chip or "salary undisclosed"; JobDetail header shows the range; Feed sidebar adds a salary preset dropdown ($60k+ … $250k+) and "Only with disclosed salary" checkbox. API filter normalizes to USD-equivalent annual via `apps/api/src/lib/salary.ts`.
  - **Freshness signaling.** "Fresh" / "Stale" pills on JobCard based on `scraped_at`. New `max_age_days` filter on `/jobs/search`; sidebar "Hide postings 45+ days old" defaulted ON.
  - **Stale-job decay.** Filter prefers `scraped_at` (last verified live) over `posted_at` so postings the source has dropped age out automatically without needing an explicit purge pipeline.
  - **Posting quality score.** `apps/api/src/lib/quality.ts` computes a 0-1 composite (salary disclosed 30%, freshness 30%, description depth 25%, source reliability 15%). Shown as a colored dot on JobCard and as a per-component breakdown panel on JobDetail.
  - **Match explanation.** `POST /jobs/:id/match-explain` chunks both résumé and job description, batch-embeds via Ollama, and returns top-K résumé↔job phrase pairs by cosine. Lazy-loaded panel on JobDetail with side-by-side phrases. Algorithmic transparency without exposing the embedding model.
- **2026-05-04** - Two more ATS adapters added: SmartRecruiters (with pagination - Visa/ServiceNow/Accor/DeliveryHero each contribute 100s of jobs) and Recruitee. Workable adapter kept in tree but dropped from default sources after confirming their public job-board API is auth-gated. Slug lists for Greenhouse/Lever/Ashby substantially expanded (~150 / 85 / 85 candidates).
- **2026-05-05** - Trust First (Phase 2 - "After the Click"):
  - **Application tracker.** `ProfileBlob` extended with `applications: { jobId, status, appliedAt, lastTouchedAt, notes }[]` (encrypted, server sees ciphertext only). New `/applications` route with status buckets (applied/interviewing/offer/rejected/ghosted/withdrawn), inline status dropdown, notes editor, and auto-flag "Likely ghosted" after 14 days of no movement. JobDetail wires markApplied / updateStatus.
  - **Source-aware apply hand-off.** Per-ATS pre-flight card on JobDetail (`ApplyHandoff`): "single-page" vs "multi-step portal", expected minutes, "no account / account may be required / account required". Plus a "Copy résumé text" button that puts plaintext on the clipboard before redirect.
  - **Saved searches.** `Preferences.savedSearches: { id, name, query, filters, lastCheckedAt, lastResultIds }[]`. Sidebar lists each saved search with a "+N new" badge computed by re-running the query in the background and diffing against the last snapshot. Click applies filters; the next search result silently becomes the new snapshot.
  - **"What we never see" page.** New `/privacy` route. Field-level disclosure table (12 entries × encrypted/derived/plaintext/never-leaves-browser columns), three-key explainer (master / recovery / DEK), structural-impossibilities list, honest "things we still need you to trust us about" list. Linked from the top bar.
- **2026-05-05** - Trust First (Phase 3 - "Honest AI"):
  - **Skills lexicon.** `apps/web/src/lib/skills.ts` - 200-entry hand-curated lexicon across 10 categories (language / framework / runtime / database / cloud / devops / ml-ai / data / tooling / concept) with alias support (e.g. `js → JavaScript`, `k8s → Kubernetes`). `extractSkills(text)` does word-boundary matching with proper handling of punctuated names like `C++` / `C#` / `Next.js`. Pure client-side - no server round-trip.
  - **Counterfactual fit hint.** `SkillsPanel` on JobDetail runs `extractSkills` over both résumé and job description, then `diffSkills` to surface "Matched on" (green) and "Job mentions, your résumé doesn't" (amber) chip rows.
  - **Skill gap aggregation.** `SkillGapCard` on Settings runs the user's vector through `/jobs/search?k=50`, extracts skills from each hit, and aggregates frequency-ranked "highest-leverage gaps" + "confirmed strengths" into horizontal bars.
- **2026-05-05** - Phase 4 (partial - more sources): **Workday CXS adapter** added (`apps/crawler/internal/sources/workday.go`). Per-tenant (tenant, region, site) tuple required because Workday provisions customers across `wd1/wd2/wd3/wd5/wd12/wd103` regions; mapping must be hand-curated. 80 tenants seeded in `companies.go DefaultWorkday`: Fortune 500 incumbents (Salesforce, NVIDIA, Walmart, JPMC, Disney, AT&T, Boeing, GM/Ford, ServiceNow, Adobe, etc.) + Wall Street (Goldman, Morgan Stanley, BlackRock) + telcos + pharma + European banks. Adapter does parallel detail fetching (4 workers per tenant) to pull full job descriptions; falls back to label-based posted-date parsing ("Posted Today", "Posted N Days Ago"). Single NVIDIA tenant alone exposes 2000 active postings.
- **2026-05-05** - **Test infrastructure landed.** Added `bun test` suites for the pure-function libraries: `apps/api/src/lib/{salary,seniority,location,quality}.test.ts` (93 tests) and `apps/web/src/lib/skills.test.ts` (17 tests). Covers currency conversion, period normalization, range overlap, title classification, country resolution by name/city/ISO-trail/state, quality score components + total bounds, and the skill extractor's edge cases (`C++`, `JavaScripty` non-match, alias dedup). All pass; `bun test` wired into both package.json scripts.
- **2026-05-05** - **Workflow tooling.** Ruflo MCP server registered at OmniJOB project scope (`cmd /c npx -y ruflo@latest mcp start`). Auto-memory bridged into Ruflo's AgentDB (42 chunks across 7 projects + 7 OmniJOB-specific gotchas seeded in the `omnijob` namespace: Workday tenant pattern, Qdrant UUID-format IDs, SmartRecruiters offset pagination, Workable auth gate, E2EE vault layout, embedding stack, Trust First phase status). Statusline rewritten in pure Node (no jq dep) - shows `[Model] · folder · branch · context-bar · cost · elapsed`. Trust First plan documented at `~/.claude/plans/take-the-following-information-immutable-pancake.md`; Phase 5 of that plan covers selective Ruflo adoption.

---

## 11. Product Principles (Trust First)

The four commitments OmniJOB makes that distinguish it from incumbent job boards. Each one is reinforced by an architectural choice; this list is what we evaluate every product decision against.

### 11.1 Verified Freshness

Every posting is graded by `scraped_at` (last verified live in the source ATS). Postings older than 45 days are hidden by default. The "Stale" pill is a UI commitment, not a marketing copy.

**Why:** ~50% of postings on incumbent boards are ghost jobs. The default-hidden stale filter says "we'd rather show you fewer jobs than waste your time on dead ones."

### 11.2 No Hidden Salary

Salary is extracted from every posting where the ATS / employer disclosed it. When undisclosed, we say so explicitly with a muted chip - never quietly omit.

**Why:** 67% of seekers don't trust employer transparency. Making the "no salary" state visible converts hidden compensation from a trick into a signal.

### 11.3 Algorithmic Accountability

Every match shows *why*. The "Why this matched" panel surfaces top-K résumé↔job phrase pairs. The "Skill fit" panel surfaces matched + missing canonical skills. The Quality panel breaks the score into named components with weights.

**Why:** AI binning is the single most-cited frustration in 2026 jobseeker surveys. The product takes the position that opaque ranking is unacceptable, and pays the engineering cost to keep ranking interpretable.

### 11.4 Privacy by Default

Email is never stored - `uid = SHA-256(email)`. The profile blob (résumé text, skill vector, saved jobs, applications, saved searches) is AES-256-GCM encrypted client-side; the server only ever holds ciphertext. Password reset is structurally impossible without the recovery key - there is no support backdoor, the math forbids it.

**Why:** 74% of seekers say they would withdraw an application if they knew their data was offshored. The privacy posture is not a marketing claim; it's enforced by the cryptography. The "What we never see" page (`/privacy`) is the operationalised promise.


# UPDATES v1.0.1 - Volume Phase

## 1. Mission

Index every job a tech worker would consider - in one place. The product loses the moment a candidate has to maintain a tab graveyard across LinkedIn, Indeed, Workday portals, and twenty branded career sites. **Highest possible volume** is the operating principle; everything else (filters, freshness, salary transparency, E2EE) makes that volume usable rather than overwhelming.

## 2. Volume - current state (2026-05-07)

### 2.1 What's indexed

- **~16,000 active postings** after the last full crawl (ingested=16016, skipped=0, failed=267 / 1.6%).
- **24 source adapters live across five categories:**
  - **Direct ATS:** Greenhouse, Lever, Ashby, SmartRecruiters, Recruitee, Workable (gated), Workday, BambooHR, Breezy, Pinpoint, Personio (opt-in), Teamtailor (opt-in).
  - **Curated employer programs:** Hacker News "Who is hiring?", Y Combinator Work-at-a-Startup.
  - **Aggregator public APIs:** The Muse (default rotation), Adzuna, Jooble, Reed, Careerjet (opt-in via env keys).
  - **Remote-first:** RemoteOK, We Work Remotely.
  - **Public sector:** USAJobs.gov (opt-in via free API key).
- **8 stub-documented inaccessible boards** committed as institutional knowledge: LinkedIn, Indeed, Glassdoor, ZipRecruiter, Monster, SimplyHired, Dice, CareerBuilder. Each file's top-of-file comment captures the exact deprecation event or partner-program gate so future-us doesn't re-investigate the same dead ends.

### 2.2 Volume gaps and how we close them

| Cohort | Status | Path |
|---|---|---|
| LinkedIn / Indeed / Glassdoor (≈70% of public listing volume) | Stubbed as inaccessible | Paid: SerpApi Google Jobs (~$75–$250/mo, captures 60–80% of these via Google's index) or Bright Data / Coresignal datasets ($300–$3000/mo). Defer until commercial revenue justifies the spend. |
| Taleo (Oracle) - ~40% of Fortune 500 | Not started | Per-tenant session-cookie scraping. Large effort, fragile to tenant-side changes. |
| iCIMS - ~12% of Fortune 500 | Not started | HTML / structured-data scrape per tenant. |
| SuccessFactors (SAP) - DACH and European corporates | Not started | Reverse-engineered XHR endpoints per tenant. |
| EU public sector (EURES) | Not started | Documented public API. Low effort. |

Principle: exhaust the legitimate-API surface area before crossing into the scraping gray zone, and keep paid-aggregator coverage on the table for the day revenue exists.

## 3. Phase 1 - High-Volume Ingestion (Go) - DONE

- Adapter-per-source architecture: each ATS / aggregator is one Go file in `apps/crawler/internal/sources/` implementing the `Source` interface (`Name()`, `Fetch(ctx, out)`).
- Producer-consumer pipeline: source goroutines stream `JobJSON` into a channel; embed + ingest workers fan out to Ollama and the API.
- ID format `{adapter}:{tenant}:{job_id}` enables idempotent re-ingest (Qdrant upsert by ID).
- Shared heuristics - `classifyCountry`, `classifyRemote`, `classifyLevel`, `ApplySalary` - give every source identical downstream metadata regardless of input schema.

The `playwright-go` + sitemap + Common Crawl URL discovery path from the original v1.0.1 draft is **not** the chosen architecture. ADR-0006 codifies "public APIs only" - no LinkedIn / Indeed scraping. `apps/crawler/internal/fetcher` retains a Colly + interface seam in case a non-API source becomes worth the legal and maintenance cost later.

## 4. Phase 2 - Intelligence & Deduplication - PARTIAL

- ✅ Qdrant 768-dim HNSW cosine, sub-50ms vector search (`apps/api/src/qdrant/client.ts`).
- ✅ Embedding via local Ollama `nomic-embed-text`. Note: the original v1.0.1 draft referenced 1536-dim - superseded by the choice in §9 of the main doc.
- ✅ Within-source dedup at insert time via deterministic point IDs.
- ❌ **Cross-source deduplication is the open Phase 2 task.** The same role posted by the same company through two adapters (e.g., a Workday tenant + The Muse syndication) will currently appear twice. Target: cosine ≥0.98 over a `(company, title-normalized)` key, with canonical-link preference (direct ATS over aggregator).
- ✅ Quality score (`apps/api/src/lib/quality.ts`) ranks near-duplicates by salary disclosure × freshness × description depth × source reliability - partial mitigation until cross-source dedup ships.

## 5. Phase 3 - E2EE Security Vault - DONE (web)

- ✅ Argon2id client-side master-key derivation (`apps/web/src/lib/crypto/argon2.ts`, hash-wasm, t=3 / m=64MiB / p=1).
- ✅ AES-256-GCM profile-blob encryption (`apps/web/src/lib/crypto/aes-gcm.ts`), 96-bit IV per encryption.
- ✅ DEK + 32-byte recovery key dual-wrap; recovery key shown once at signup.
- ✅ `uid = SHA-256(lowercased_email)` - server stores neither plaintext email nor any PII.
- ✅ Skill vector lives in Qdrant unlinked from identity (random point IDs, no email or hash association).
- ❌ **React Native parity deferred.** Web Crypto in RN is partial (RNQC issue #569: `subtle.generateKey('AES-GCM')` unimplemented). Web (`apps/web`) ships first; mobile crypto path tracked in §9 of the main doc.

## 6. Phase 4 - High-Performance API - DONE (local) / OPEN (deploy)

- ✅ Elysia 1.4 router on Bun, TypeBox-validated.
- ✅ `/jobs/search` over-fetches and post-filters; sub-50ms p50 at the current index size.
- ✅ `/jobs/:id/match-explain` for algorithmic accountability (Trust First §11.3).
- ❌ **Edge / cloud deployment still open.** Cost-analysis options sketched (Hetzner CX21 ~€6/mo, Cloudflare Tunnel + dev box €0/mo, Cloudflare Workers + Qdrant Cloud free tier ~$3/mo with privacy compromise via Voyage embeddings). Deferred until the index outgrows the dev box.

## 7. Volume backlog - priority order

1. **Cross-source deduplication.** Required before paid aggregators land, since aggregator data overlaps direct ATS data heavily.
2. **Taleo / iCIMS / SuccessFactors.** Biggest single-cohort uplift among legitimate paths.
3. **EURES (EU public sector).** Low-effort public API, complementary to USAJobs.
4. **Direct-apply for Greenhouse / Ashby.** The volume index is wasted if the apply step bounces the user out - completing the loop is the point. (Phase 3 of the Trust First roadmap.)
5. **Paid aggregator (SerpApi or Bright Data) for the LinkedIn/Indeed/Glassdoor cohort.** Gated on commercial revenue.
