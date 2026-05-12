# OmniJob — Handoff Document

> **For a new conversation / contractor / future operator coming in cold.**
> Read this first. After ~10 minutes you should have enough context to make
> a meaningful change without breaking anything. Last updated 2026-05-12
> after Phase 1 was deployed.

---

## 0. Read this first

OmniJob is **a privacy-first semantic job-search platform** with the goal of becoming "every job, one search — across every industry." It's in **public beta** at https://omnijob.tech. The owner is `emon.sarker@perle.ai` (Resend account is on `ommistry012004@gmail.com`).

**Phase 1 of the multi-industry expansion is fully deployed.** The system has gone from tech-only (`tech` jobs from ~22 ATS adapters) to industry-aware (`tech`, `healthcare`, `retail`, `food_service`, `trades`, `government`, `education`, `finance`, `manufacturing`, `logistics`, `legal`, `nonprofit`, `media`, `science`, `other` — 15 verticals with per-industry classifier / seniority / quality / query-expansion / skill-lexicon banks).

Current index: **~17.3k jobs** and growing on a 12h crawler cadence. **Phase 2 starter adapters seeded** (USAJobs gated, hospital + retail Workday seeds added), Phase 2 vertical content work is the next major track.

The two most important reference docs in this repo are:
- `docs/phase-2-3-4-plan.md` — the strategic roadmap with all open work items + 10 operator decisions queued.
- `docs/security-audit.md` — current security posture (A/A- across most areas), what was fixed, what's open.

---

## 1. The vision (one paragraph)

OmniJob aims to be the centralised job platform — every legitimately public job posting on the internet, ranked semantically against a candidate's résumé, with the résumé and all profile data **encrypted client-side** (Argon2id-derived master key, AES-GCM, recovery-key model, zero-knowledge server). The product is currently working software for tech, healthcare-adjacent, and government roles; the long-term arc is multi-industry coverage worldwide via Phases 2/3/4 in `docs/phase-2-3-4-plan.md`.

---

## 2. The stack

### Runtime topology

```
[ Vercel CDN ]        [ DigitalOcean droplet 138.197.54.221 (s-2vcpu-4gb, NYC3) ]
                       │
   omnijob.tech ◀────── │  Caddy (:80/:443, Let's Encrypt auto-TLS)
   www.omnijob.tech    │   ├── api.omnijob.tech → 127.0.0.1:3000
   /assets/* (static)  │   │     reverse proxy + 7 hardening headers
                       │   │     /jobs/ingest blocked externally (404)
                       │   │
                       │   ├── omnijob-api.service (Bun + Elysia, systemd)
                       │   │     SQLite at /var/lib/omnijob/users.db
                       │   │     Reads QDRANT_URL=http://localhost:6333
                       │   │     Reads OLLAMA_URL=http://localhost:11434
                       │   │     Reads RESEND_API_KEY (Resend email forward)
                       │   │
                       │   ├── docker-compose stack (127.0.0.1-bound):
                       │   │     qdrant (jobs collection, 768-dim cosine + payload indexes)
                       │   │     ollama (nomic-embed-text)
                       │   │     redis (configured, not actively used as queue)
                       │   │
                       │   └── omnijob-crawler.service (Go, systemd oneshot)
                       │         omnijob-crawler.timer fires 02:00 + 14:00 UTC daily
                       │         TimeoutStartSec=8h; logs to /var/log/omnijob-crawler.log
                       │         POSTs ingests to http://localhost:3000/jobs/ingest
```

### Languages + frameworks

- **API**: Bun runtime + Elysia framework + TypeScript. `@elysiajs/cors`, `@sinclair/typebox` for schemas, `@qdrant/js-client-rest`, `@sentry/bun`.
- **Web**: React 18 + Vite + TypeScript. `react-router-dom@6`, `lucide-react` icons, `pdfjs-dist`, `hash-wasm` (Argon2), `@sentry/react`. Vercel-hosted, SPA-rewrite via `apps/web/vercel.json`.
- **Crawler**: Go 1.24, single binary built per run via `go run`, 22 source adapters under `apps/crawler/internal/sources/`.

### Production credentials (where they live, NOT what they are)

- **Droplet SSH**: `ssh om@138.197.54.221` (key at `~/.ssh/id_ed25519`).
- **API env vars**: `/etc/systemd/system/omnijob-api.service.d/override.conf` (drop-in over `deploy/systemd/omnijob-api.service`). Contains `RESEND_API_KEY`, `CONTACT_TO_EMAIL`, `ALLOWED_ORIGINS`, `NODE_ENV=production`, etc. Sentry DSN status uncertain.
- **Crawler env vars**: drop-in at `/etc/systemd/system/omnijob-crawler.service.d/` (queued: needs `USAJOBS_API_KEY` + `USAJOBS_USER_AGENT` to activate USAJobs source).
- **Caddyfile**: live at `/etc/caddy/Caddyfile` on the droplet; mirror tracked in `deploy/Caddyfile`.
- **Git**: `https://github.com/OM200401/OmniJOB` (public). User `OM200401`.

---

## 3. Where everything lives (repository structure)

```
apps/
  api/                              Bun + Elysia API
    src/
      index.ts                      App entry, rate-limit wiring, error handler
      config.ts                     Env-var validated config
      schemas/job.ts                JobMetadataSchema, JobSearchSchema (TypeBox)
      schemas/user.ts               Register/login/profile schemas
      qdrant/client.ts              upsertJob, searchJobs, getJob,
                                    ensureTitleFullTextIndex, ensureIndustryIndexes
      db/sqlite.ts                  User store (prepared statements only)
      embed/ollama.ts               Single + batched embed client
      lib/
        industry.ts                 Phase 1A: 15-industry keyword classifier
        seniority.ts                Industry-aware ladder classifier
        quality.ts                  Per-industry weight tuning
        query-expansion.ts          Per-industry expansion banks
        ratelimit.ts                Fixed-window in-memory limiter
        audit.ts                    Append-only JSONL of auth events
        salary.ts, location.ts, seniority.ts, explain.ts
      routes/
        health.ts, embed.ts, jobs.ts, users.ts, match.ts, contact.ts
    scripts/
      init-qdrant.ts                Create collections + indexes
      init-sqlite.ts                Create users table
      backfill-industry.ts          One-shot re-classify all points
      dedupe.ts                     Cross-source dedup pass
      backup.ts                     Snapshot Qdrant + SQLite (cron'd)
  web/
    public/                         Static assets (favicon, og-image, sitemap, robots)
    vercel.json                     SPA rewrite + hardening headers + CSP
    src/
      App.tsx, main.tsx
      routes/
        Layout.tsx, Landing.tsx, SignIn.tsx, SignUp.tsx, Recover.tsx,
        Onboarding.tsx, Feed.tsx, JobDetail.tsx, Saved.tsx,
        Applications.tsx, Settings.tsx, Privacy.tsx, Terms.tsx,
        Contact.tsx, ProtectedRoute.tsx
      lib/
        api.ts                      Client wrapper for the API (incl. industry types)
        auth.tsx                    AuthProvider, useAuth, session mgmt
        validation.ts, useFieldValidation.ts
        skills.ts                   Skill lexicon router (Phase 1C)
        skills/                     Per-industry banks
          tech.ts (default), healthcare.ts, retail.ts,
          trades.ts, government.ts, food_service.ts
        crypto/                     Argon2id + AES-GCM client-side primitives
          vault.ts                  Profile blob schema + migrate
          argon2.ts, aes-gcm.ts, util.ts
        pdf.ts                      Client-side PDF text extraction
        countries.ts, sources.ts
      components/
        Alert.tsx, Button.tsx, Input.tsx, JobCard.tsx,
        EmptyState.tsx, PasswordStrengthMeter.tsx, MatchBar.tsx, CompanyLogo.tsx
  crawler/
    cmd/
      crawler/main.go               Entry point, buildSources()
      discover/main.go              ATS slug-probe discoverer
    internal/
      pipeline/extract.go           JobJSON struct definition
      pipeline/sink.go              POST to API /jobs/ingest, exists-check
      pipeline/normalize.go         HTML → markdown helper
      embed/client.go               Batched Ollama client
      fetcher/colly.go              Built but unused (Phase 3 HTML crawler)
      sources/                      22 adapter files (greenhouse, lever, ashby,
                                    smartrecruiters, workable, recruitee,
                                    workday, bamboohr, breezy, pinpoint,
                                    teamtailor, personio, themuse, adzuna,
                                    reed, careerjet, jooble, usajobs,
                                    hackernews, remoteok, weworkremotely,
                                    workatastartup, ...); plus glassdoor, indeed,
                                    linkedin stubs deliberately not implemented
      sources/companies.go          DefaultWorkday, DefaultGreenhouse,
                                    DefaultLever, DefaultAshby, ... seed lists
deploy/
  Caddyfile                         Mirror of /etc/caddy/Caddyfile on droplet
  systemd/
    omnijob-api.service
    omnijob-crawler.service         (Type=oneshot, TimeoutStartSec=8h)
    omnijob-crawler.timer           (OnCalendar=02:00,14:00 UTC daily)
    omnijob-dedupe.service          (OnSuccess=run after crawler)
  digitalocean/
    cloud-init.yaml                 First-boot droplet provisioning
    setup.sh                        doctl-based provisioning script
  azure/                            Legacy from before the DO pivot; ignore
infra/
  docker-compose.yml                Base (Qdrant + Redis + Ollama, 127.0.0.1-bound)
  docker-compose.prod.yml           Prod overlay (memory caps, bind mounts)
  .env.example                      Documented env-var list
docs/
  deployment.md                     End-to-end deploy runbook
  phase-2-3-4-plan.md               Strategic roadmap + 10 queued decisions
  security-audit.md                 Audit findings + open items + posture grades
  handoff.md                        THIS FILE
PROJECT.md                          Top-level architecture and decisions
README.md                           Brief intro + dev quickstart
```

---

## 4. Production state (snapshot from 2026-05-12)

| Surface | Status |
|---|---|
| Web app `https://omnijob.tech` | Live on Vercel. SPA routing fixed. Industry filter active. Per-industry skill panels rendering. |
| API `https://api.omnijob.tech` | Live on droplet. 7 hardening headers verified live. `/jobs/ingest` 404 from outside. |
| Index size | **17,341 jobs** (was 13,498 at start of 2026-05-11). Distribution: tech 3,593 / other 11,456 / logistics 627 / healthcare 430 / food_service 246 / finance 199 / retail 163 / manufacturing 150 / legal 149 / science 134 / government 102 / media 48 / education 17 / nonprofit 16 / trades 11. |
| Crawler | 12h cadence. Currently in flight (run started 14:02 UTC, 8h cap). 1,603 jobs ingested in last overnight run. |
| Contact form | Live. JSONL persisted at `/var/lib/omnijob/contact.log`. Resend forwards to `ommistry012004@gmail.com`. |
| Sentry | SDKs imported in both API and web. DSN env-var status uncertain — needs confirmation. |
| Tests | API: 192 passing. Web: 17 passing. Vite production build green. |

The `other` bucket (11,456 jobs, ~66%) is mostly tech-company corporate roles (Marketing/Sales/Ops/HR at Stripe, Anthropic, etc.) — the classifier is deliberately conservative. This is the #1 candidate for product-level action: introduce a separate `function` dimension OR adjust the Tech filter to include `other`.

---

## 5. Current phase status

| Phase | Status | Detail |
|---|---|---|
| Phase 1 — industry-aware taxonomy | **DONE** | Schema, classifier, per-industry seniority/quality/expansion, UX (Onboarding industry step + Feed industry filter + Landing rotation), skill lexicons for 5 verticals |
| Phase 2 — vertical launch | **STARTED** | USAJobs adapter ready, env-gated. 9 hospital Workday seeds + 2 retail Workday seeds added (unverified). Per-industry lexicons exist for 5 verticals; education/finance/manufacturing/logistics/legal lexicons not yet built |
| Phase 3 — source explosion + distributed crawler | **PLANNED** | `docs/phase-2-3-4-plan.md` §3. Activate Colly fetcher, LLM-assisted HTML extraction, Redis-Stream job queue, paid aggregator integration |
| Phase 4 — infra scale + i18n | **PLANNED** | GPU embedder, Qdrant cluster, multilingual embeddings, multi-currency parsing, country-specific adapters |

---

## 6. Open decisions queued for operator (ranked by leverage)

| # | Decision | Estimated impact |
|---|---|---|
| 1 | **Activate USAJobs** (register at developer.usajobs.gov + add 2 env vars) | +50k federal postings on next crawler tick. 2 min of your time |
| 2 | **Verify omnijob.tech domain in Resend** (DNS records in Namify) | Kills Gmail-spam-folder problem; unlocks sending to any address. 30 min |
| 3 | **Confirm Sentry DSN** is set on prod | If not, server-side errors are invisible. 1 min check |
| 4 | **`function` dimension** decision — split `industry=other` into engineering/marketing/sales/ops/HR/etc. for the 11k currently-in-other jobs | High UX impact: makes the Tech filter useful for non-engineering tech-company roles |
| 5 | **`other` filter behaviour** — include `other` under Tech by default? | Tradeoff: surface vs. accuracy |
| 6 | **Phase 2/3 paid-source budget** (Adzuna ~$50/mo would unblock long-tail retail) | Volume ceiling on free-only is ~150-300k jobs end-of-Phase-2 |
| 7 | **Phase 3 LLM extraction monthly cap** for general-web crawler | Hard ceiling to set before activating |
| 8 | **Vite 6 upgrade** (breaking change; fixes the dev-server-only moderate vulns) | Schedule a dev-cycle for the breaking-change work |
| 9 | **Add `X-Crawler-Token`** for `/jobs/ingest` defence-in-depth (on top of the Caddy network block) | One round-trip change in both crawler + API |
| 10 | **Embedder migration trigger** numeric criterion (when does Ollama need to be replaced?) | Affects privacy story; commits us to GPU box / commercial API |

Full discussion of each in `docs/phase-2-3-4-plan.md`.

---

## 7. Operational runbook

### Quick health check (one command)

```
ssh om@138.197.54.221 'curl -s http://localhost:6333/collections/jobs | grep -oP "points_count\":\d+" && sudo systemctl status omnijob-api omnijob-crawler --no-pager | head -10 && sudo tail -5 /var/log/omnijob-crawler.log'
```

### Deploy

Push to `main` → Vercel auto-builds the web. For the API:

```
ssh om@138.197.54.221 'cd /home/om/omnijob && git pull && sudo systemctl restart omnijob-api'
```

Check startup: `sudo journalctl -u omnijob-api -n 25 --no-pager`. Look for `Industry: keyword indexes on industry/job_family ready` and `Contact: log=... email=resend->...`.

### Trigger a crawler run (foreground)

```
ssh om@138.197.54.221 'sudo systemctl start omnijob-crawler.service'
```

⚠ This is a `Type=oneshot` with `TimeoutStartSec=8h`. The SSH command BLOCKS for up to 8 hours until the unit finishes. Use `--no-block` if you don't want to wait, or just let the 12h timer fire on its own.

### Tail crawler logs

```
ssh om@138.197.54.221 'sudo tail -f /var/log/omnijob-crawler.log'
```

(Crawler stdout goes to `/var/log/omnijob-crawler.log`, NOT systemd journal. The unit file has `StandardOutput=append:/var/log/omnijob-crawler.log`.)

### Re-run industry backfill

```
# Tag-missing-only (idempotent):
ssh om@138.197.54.221 'cd /home/om/omnijob/apps/api && /home/om/.bun/bin/bun run scripts/backfill-industry.ts'
# Re-classify everything (after classifier changes):
ssh om@138.197.54.221 'cd /home/om/omnijob/apps/api && /home/om/.bun/bin/bun run scripts/backfill-industry.ts --force'
# Just see distribution without writing:
ssh om@138.197.54.221 'cd /home/om/omnijob/apps/api && /home/om/.bun/bin/bun run scripts/backfill-industry.ts --dry-run'
```

### Edit Caddyfile

```
# On droplet:
sudo nano /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
# Mirror back to repo:
scp om@138.197.54.221:/etc/caddy/Caddyfile ./deploy/Caddyfile
```

### Add env var to API or crawler

```
# Use systemctl edit so the file lives outside the repo (secret-safe):
ssh om@138.197.54.221 'sudo systemctl edit omnijob-api'
# Add lines under [Service]:
#   Environment=NEW_KEY=value
sudo systemctl daemon-reload
sudo systemctl restart omnijob-api
# Verify the env loaded:
sudo systemctl show omnijob-api -p Environment | tr ' ' '\n' | grep NEW_KEY
```

### Verify hardening headers

```
curl -sI https://api.omnijob.tech/health | grep -iE "frame|policy|security|origin"
```

Should see HSTS, X-Content-Type-Options, X-Frame-Options DENY, CSP, Cross-Origin-Resource-Policy same-origin, Permissions-Policy, Referrer-Policy.

### Tests + typecheck (local)

```
cd apps/api && bun test && bun run typecheck
cd apps/web && bun test && bun run typecheck && bun run build
cd apps/crawler && go build ./...
```

---

## 8. Conventions, patterns, and gotchas

### Conventions established by past commits

- **Commit format**: `scope: short title` first line, then body explaining WHY not WHAT (the diff shows what). Examples: `api(contact): forward submissions to operator via Resend`, `web: per-industry skill lexicons`. Co-authored-by line for Claude-generated commits.
- **Comments**: lean toward fewer. When present, explain non-obvious "why" — past incidents, hidden constraints, surprising invariants. Never restate the code.
- **Schemas as source of truth**: `apps/api/src/schemas/*.ts` is the contract. Both client (`apps/web/src/lib/api.ts` types) and server validation key off it. Update both when changing.
- **Server-side classification**: Crawlers may pre-fill `industry`/`job_family`/`experience_level` if the source carries the signal natively (USAJobs always = government). Otherwise `upsertJob` infers from title+description via `classifyIndustry()` and `classifyTitle()`.
- **Idempotent migrations**: `ensureTitleFullTextIndex` and `ensureIndustryIndexes` swallow "already exists" errors. Both `init-qdrant.ts` and the API startup hook call them.
- **Drop-in overrides for secrets**: never commit env vars containing secrets. Use `systemctl edit omnijob-api` to create `/etc/systemd/system/omnijob-api.service.d/override.conf` on the droplet.

### Gotchas to remember

- **Bun on Windows** has an IPv6 localhost ECONNRESET issue. Dev uses explicit `127.0.0.1` instead of `localhost` in dev `.env`.
- **`bun: command not found` over SSH** — non-login shells don't have Bun in PATH. Use the absolute path `/home/om/.bun/bin/bun`.
- **Crawler logs are NOT in journalctl** — they go to `/var/log/omnijob-crawler.log` via `StandardOutput=append:`. systemd journal only has the start/stop lines.
- **systemctl start on a oneshot blocks** — `omnijob-crawler.service` has `Type=oneshot` + `TimeoutStartSec=8h`. Foreground SSH calls to `systemctl start` will hang for up to 8h. Use `--no-block` to fire-and-return.
- **The `_redirects` file in `apps/web/public/`** is Netlify syntax; Vercel ignores it. The actual SPA routing lives in `apps/web/vercel.json`.
- **Resend test sender constraint**: while using `onboarding@resend.dev` as the from-address, Resend only delivers to the email that owns the Resend account. Sending to anyone else returns 403 until the omnijob.tech domain is verified.
- **Industry filter on the Feed** seeds from `preferences.industry` (set during onboarding). Users who completed onboarding before Phase 1C have `industry: null` and see no default industry filter — that's intentional.
- **Workday tenant slugs** are guessed when public docs don't expose them. The crawler logs 404 + skips, so wrong slugs are wasteful but not breaking. The 9 hospital + 2 retail tenants added 2026-05-12 are unverified; the next crawler pass will surface which are wrong via the log.
- **The `other` industry bucket** (~66% of the index) is not bug — it's mostly tech-company corporate roles the classifier conservatively didn't bucket. See Decision #4.
- **Healthcare classifier**: bare 2-letter credentials like `\bdo\b`, `\bmd\b` were removed because they matched the English word "do" and the state code "MD". Replaced with periodised (`M.D.`) or suffix (`, MD`) patterns. Don't reintroduce bare-credential matching without re-running the false-positive regression suite.
- **`/jobs/ingest` is externally blocked at Caddy** with a 404. The crawler hits `http://localhost:3000/jobs/ingest` directly via loopback so works fine. If you ever need partner write access, add an `X-Crawler-Token` header to both sides instead of unblocking Caddy.
- **Vite 5.4.21 still has dev-server-only moderate CVEs** (path traversal). Only affects local dev. Production Vercel build is unaffected. Fix is Vite 6 (breaking change, scheduled).

---

## 9. Privacy + security posture (one paragraph)

OmniJob is **zero-knowledge by design** for user data: the master key is Argon2id-derived from the user's password client-side, the DEK encrypts the profile blob with AES-GCM, the server stores only ciphertext + a SHA-256 uid + a recovery-key-wrapped DEK. Search vectors for the user are stored in Qdrant under a random point ID with no link to the uid. Server-side has 7 hardening headers, HSTS preloaded, rate-limiting per IP, audit log of auth events, prepared SQL statements, no XSS sinks, 0 API dependency vulns. `/jobs/ingest` is externally blocked. Full audit: `docs/security-audit.md`.

---

## 10. Recent commit reference (last 20 commits)

```
1845597  docs: security audit report
5df325e  security(caddy): block external access to /jobs/ingest
1e5d8b6  security: harden response headers + fix open-redirect-adjacent links
6cd1af0  api(industry): fix healthcare false positives on common-word credentials
eb38a38  docs: Phase 2/3/4 detailed plan for morning review
51a10b6  crawler: seed Workday with hospital networks + retail chains
dc3b741  web: per-industry skill lexicons
2f82ec5  crawler: pass industry/job_family through ingest pipeline
46116b2  web: persist industry in saved searches + surface in Settings
429b595  web: industry-aware UX (Phase 1C)
15cd62b  api: industry-aware seniority + quality + query expansion (Phase 1B)
a6e509f  web: add vercel.json for SPA routing + security headers
b740e51  api: add industry-aware taxonomy (Phase 1A foundation)
faed760  api(contact): make resend forward path observable
435b4e3  docs(env): document RESEND_API_KEY + CONTACT_TO_EMAIL
85c3655  api(contact): forward submissions to operator via Resend
6af5615  web+api: add /contact public form for user concerns
263314d  web: scrub dev-environment leaks from production UI
1e5065b  web(brand): add SVG favicon
2b85e3d  api(embed): bump Ollama request timeout 30s -> 90s for batched calls
```

`git log --oneline` for the full history. The last 20 are essentially everything from "Phase 1 readiness" through "Phase 1 complete + security pass."

---

## 11. Permission / access notes for a new Claude session

If you (Claude) are reading this in a fresh session, these are the access constraints established by the operator:

- **SSH to `om@138.197.54.221`** is permitted (the user has a Bash permission rule allowing `ssh om@138.197.54.221*`). Used for deploy, backfill, log tail, status checks.
- **Git push to `main`** is permitted. Use it after committing.
- **Production write operations**: `git pull` + `sudo systemctl restart omnijob-api` + `sudo systemctl reload caddy` are routine and permitted. Re-running the backfill (which writes to Qdrant) is permitted.
- **Triggering the crawler** (`sudo systemctl start omnijob-crawler.service`) is permitted.
- **NOT permitted without explicit fresh authorization**: paid services activation, infrastructure changes (e.g. droplet resize, Qdrant Cloud migration), `git push --force`, anything that touches the privacy model (e.g. switching the embedder from Ollama to a commercial API).
- **Sentry DSN**, **Resend API key**, **DigitalOcean token**: never paste these into chat. They live in systemd drop-ins and the user's account dashboards.

---

## 12. First-day suggested actions for a new operator/session

If you're picking this up cold and want to make immediate progress:

1. **Read `docs/phase-2-3-4-plan.md`** — it's the strategic punch list.
2. **Run the health check command** from §7 to confirm everything is alive.
3. **Pick decision #1** (USAJobs activation) — it's the highest-impact single thing that's free, fast, and unblocks ~50k federal jobs.
4. **Or pick decision #4** (function dimension) — it's a code change but addresses the 66%-in-other UX issue that affects every user.
5. **Watch the next crawler run** (`/var/log/omnijob-crawler.log`) to verify the 9 hospital + 2 retail Workday seeds added on 2026-05-12. Replace any that 404.

---

## 13. Memory / persistent context

A separate memory system lives at `C:\Users\OM\.claude\projects\C--Users-OM-OmniJOB\memory\` with these entries (loaded automatically by Claude Code on session start):

- **OmniJob project overview** — points to `PROJECT.md` for canonical docs
- **Deploy status** — Azure-to-DigitalOcean pivot history, signup-blocked-by-no-CC story, CC-free paths queued

The user's email (`emon.sarker@perle.ai`) and today's date are auto-injected into every session via the `auto memory` system.

---

## 14. The vibe

The user (operator) prefers:
- **Concise responses** that get to the point. They read diffs, so don't restate them.
- **Honest scoping**. Don't pretend you can do all four phases in one night when only Phase 2 starters are actually achievable.
- **Decisions surfaced**, not assumed. They want to see options + tradeoffs and pick.
- **Action over planning** when in auto mode. Plan mode is for strategic alignment; auto mode is for execution.
- **Hard lines**: $0 budget unless explicitly approved; no LinkedIn/Indeed scraping ever; privacy model is sacred (no commercial embedder without explicit consent).

When in doubt: **commit small, push frequently, document decisions in commit bodies, and write up the state in `docs/` so the next session inherits it.**

---

**End of handoff. Welcome to OmniJob.**
