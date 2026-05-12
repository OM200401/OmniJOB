# Security audit — OmniJob production

Audit performed 2026-05-12 covering the production API at
`https://api.omnijob.tech`, the Vercel-hosted web app at
`https://omnijob.tech`, the DigitalOcean droplet runtime, and the
codebase under `apps/`. Fixes applied inline are marked ✅; open items
needing operator action are marked ⚠.

---

## Summary

| Area | Finding | Action |
|---|---|---|
| Response headers (API) | Missing X-Frame-Options, CSP, COOP/CORP, Permissions-Policy; Referrer-Policy not emitting due to Caddyfile syntax bug | ✅ Caddyfile rewritten, reloaded, headers verified live |
| Response headers (web) | Missing CSP, HSTS, COOP/CORP | ✅ vercel.json extended; production rebuild on Vercel |
| Unauthenticated write endpoint | POST /jobs/ingest had no auth and no rate-limit rule | ✅ Caddy now 404s external requests; crawler uses loopback unaffected |
| Dependency vulns (API) | None | ✅ `bun audit` clean |
| Dependency vulns (web) | 2 moderate in Vite/esbuild — dev-server-only | ⚠ Vite bumped within compat; full fix needs Vite 6 (breaking) |
| Open-redirect-adjacent | 3 sites used `rel="noreferrer"` without `noopener` | ✅ Updated to `rel="noopener noreferrer"`; window.open features string fixed too |
| HTTP→HTTPS | Auto-redirect 308 working | ✅ |
| Body size cap | 1 MB at Bun-level | ✅ |
| Rate limiting | In-memory bucket store; loopback bypass for crawler | ✅ |
| CORS allowlist | Set via ALLOWED_ORIGINS env; production reflects omnijob.tech + www | ✅ |
| Audit logging | Append-only JSONL for auth events | ✅ |
| Honeypot for contact form | Hidden `website` input drops bots silently | ✅ |
| Secrets in git history | One match — `infra/.env.example` placeholder, not a real key | ✅ |
| Error response shape | API onError handler returns JSON; Qdrant-error path returns plain text 400 | ⚠ low priority; doesn't leak internals |
| SQLite injection | Prepared statements only | ✅ |
| XSS surface | No `dangerouslySetInnerHTML` / `innerHTML` / `eval` / `document.write` in web source | ✅ |
| TLS | Caddy + Let's Encrypt auto-renewal | ✅ |

---

## Findings detail

### F1. ✅ Hardening headers (FIXED, deployed)

**Before**: Caddy was supposed to emit HSTS + X-Content-Type-Options + Referrer-Policy on `api.omnijob.tech`, but the `header { ... }` block had a malformed closing brace (on the same line as the last directive). Caddy silently parsed only the first two headers and dropped Referrer-Policy. Five hardening headers (X-Frame-Options, CSP, COOP/CORP, Permissions-Policy) were never set.

The web app on Vercel was missing CSP and HSTS.

**After**: Both surfaces now emit a full hardening set. Verified live via `curl -sI`:

API response now carries:
```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: DENY
Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'
Cross-Origin-Resource-Policy: same-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
```

Web responses now carry the same set plus a more permissive CSP that allows React/Vite inline styles, Google Fonts, the API origin, and Sentry ingest.

### F2. ✅ Unauthenticated write endpoint (FIXED, deployed)

**Before**: `POST /jobs/ingest` accepted a job payload and called `upsertJob` directly. No auth, and `ruleFor()` in `apps/api/src/index.ts` had no entry — so no rate-limit either. The endpoint was publicly reachable via `https://api.omnijob.tech/jobs/ingest`. An attacker could write arbitrary jobs to the production Qdrant index.

**After**: The legitimate caller is the crawler, which talks to the API on `127.0.0.1:3000` directly, bypassing Caddy. Caddy now 404s external traffic to `/jobs/ingest`. Verified:
- External: `POST https://api.omnijob.tech/jobs/ingest` → 404 Not Found
- Crawler (loopback): still ingesting; points_count grew 15086 → 15412 across the audit window.

**Defence in depth (queued)**: Add an `X-Crawler-Token` header that the API verifies against an env-var shared secret. Network-layer block is sufficient for now; this header check would let us re-open external ingest later if we ever want partner write access.

### F3. ✅ Open-redirect-adjacent (FIXED)

**Before**: Three sites used `<a target="_blank" rel="noreferrer">` to open job-source URLs (`Applications.tsx`, `Saved.tsx`, `JobDetail.tsx`). One `window.open(url, "_blank", "noreferrer")` call. Modern browsers imply `noopener` from `noreferrer`, but older browsers and Safari quirks don't always honour it.

**After**: All four sites upgraded to `rel="noopener noreferrer"` (and the window features string to `"noopener,noreferrer"`).

### F4. ⚠ Vite/esbuild dev-server CVEs (moderate, dev-only)

`bun audit` for web reports:
- **GHSA-4w7w-66w2-5vf9** — Vite path traversal in optimized deps `.map` handling. Affects ≤ 6.4.1. Vite 5.4.21 is on this advisory; the fix is Vite 6.4.2+, which is a major version bump with breaking changes.
- **GHSA-67mh-4wv8-2f99** — esbuild dev server lets any website send requests and read the response. Affects ≤ 0.24.2.

**Impact**: Both affect the development server (`bun run dev` on localhost). Production is unaffected because Vercel serves the pre-built `dist/` static files, not a Vite dev server.

**Mitigation in place**:
- Never run `bun run dev` on a public network. Dev server binds to localhost.
- Bumped Vite to 5.4.21 (latest within `^5.4.0` semver compat).

**Open item**: Bump to Vite 6 (`bun update vite --latest`). Schedule for a development cycle since it's a breaking change.

### F5. ✅ No leaked secrets in git history

Scanned full git history for common API-key shapes (Resend `re_`, Stripe `sk-`, DigitalOcean `dop_v1_`, Google `AIza`, GitHub `ghp_`). One match found: the `# RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` placeholder in `infra/.env.example`, which is documentation, not a real key.

The Resend key and DigitalOcean tokens the operator pasted in chat earlier were revoked + replaced; neither was ever committed.

### F6. ⚠ Validation error response leaks request body shape (low)

Elysia's built-in body-validation error response is `{"type":"validation","on":"body","found":<request-body>}`. The `found` field echoes back the submitted body. For currently-protected endpoints this is benign because their inputs aren't sensitive (search vectors, query strings, public job IDs). But the contact form and recovery endpoints could echo user-typed text on validation failure.

**Mitigation in place**: Custom `onError` handler in `apps/api/src/index.ts` returns `{ error: "validation", detail: ... }` for `code === "VALIDATION"`. However, this only fires for some validation failures — Bun's body parser fires the built-in shape sometimes before reaching the handler.

**Open item**: Investigate when Elysia routes through onError vs the default; consider patching to always strip `found` from validation errors.

### F7. ✅ No XSS sinks in client code

Scanned `apps/web/src` for `dangerouslySetInnerHTML`, `innerHTML`, `eval(`, `document.write`. Zero matches. React's default JSX escaping is the sole rendering path. Job descriptions are rendered as plain text, not HTML.

### F8. ✅ SQL injection — prepared statements only

`apps/api/src/db/sqlite.ts` uses `db.prepare<...>(SQL)` exclusively. No string-concatenation queries.

### F9. ✅ Body size limit

`Bun.serve({ maxRequestBodySize: 1MB })`. Requests beyond 1MB are rejected before the handler runs.

### F10. ✅ TLS

Caddy + Let's Encrypt. HSTS with 2-year max-age, `includeSubDomains`, `preload`. Auto-renewal via Caddy. HTTP→HTTPS 308 redirect confirmed.

---

## What's queued for you to action

### High value, low effort

1. **Verify the `omnijob.tech` domain in Resend** (30 min DNS work in Namify). Currently using the sandbox sender `onboarding@resend.dev`, which means (a) emails go to spam by default, (b) you can only send to your own verified address. Domain verification unlocks both.

2. **Decide whether the Vite 6 upgrade is in-scope this week**. Local-dev-only impact, but cleaner audit posture going forward.

3. **Add `X-Crawler-Token` header** as Phase 3 defence-in-depth for `/jobs/ingest`. Crawler env gets the token; API verifies it.

### Medium value, medium effort

4. **Subresource Integrity (SRI)** on the Google Fonts links in `apps/web/index.html`. Currently the fonts CSS is loaded without `integrity=` so a compromise of Google Fonts CDN could inject CSS-based exfil. The risk is low (Google Fonts is hardened) but SRI is the standard defence.

5. **Patch validation error echo**: prevent `found` from being echoed in 422 responses (see F6).

6. **Audit the cookie / localStorage surface** for the auth flow. The DEK + master key live in memory only, but `omnijob:vault:skipped` is in localStorage. Confirm no other auth-relevant state slipped in.

### Lower priority

7. **Sentry DSN status**: confirm whether SENTRY_DSN is set in the production systemd override for the API. If not, server-side errors are invisible.

8. **Lighthouse / Mozilla Observatory scan** of `https://omnijob.tech` from your end. The headers are in place; an external scan would surface anything I missed.

9. **Run `bun audit` weekly** as part of your dev cycle. Drift on dependencies is the most common foothold.

10. **Penetration test plan**: at next budget cycle, consider a one-time pentest from a reputable firm. For a privacy-first product targeting consumer trust, an attestation is worth real money in marketing.

---

## Posture snapshot

| Area | Status |
|---|---|
| Transport | A+ — HSTS preloaded, HTTP→HTTPS redirect, TLS auto-renew |
| Headers | A — All major hardening headers landing on both API and web |
| Endpoint surface | B+ — Public ingest closed off, rate-limited search/embed, contact form honeypot |
| Dependencies | A on API (0 vulns), B on web (2 dev-only moderates) |
| Code patterns | A — No XSS sinks, prepared statements, no eval |
| Secret management | A — systemd drop-in overrides, nothing committed |
| Logging / audit | A- — Audit log for auth events; journal persistence enabled |
| Privacy model | A — Client-side crypto, encrypted profile blob, recovery key model |

**Overall: solid foundation for a beta. The fixes applied today close the two real findings (header gaps + open ingest). Remaining items are hardening on top of an already-defensible posture.**
