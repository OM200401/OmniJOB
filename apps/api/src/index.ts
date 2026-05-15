import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import * as Sentry from "@sentry/bun";
import { config } from "./config";

if (process.env["SENTRY_DSN"]) {
  Sentry.init({
    dsn: process.env["SENTRY_DSN"],
    tracesSampleRate: 0.1,
    environment: process.env["NODE_ENV"],
  });
}
import {
  check,
  clientKeyFromHeaders,
  RULES,
  shouldBypassRateLimit,
  type RateLimitRule,
} from "./lib/ratelimit";
import { health } from "./routes/health";
import { jobs } from "./routes/jobs";
import { users } from "./routes/users";
import { match } from "./routes/match";
import { embed, prewarmEmbed } from "./routes/embed";
import { contact } from "./routes/contact";
import { admin } from "./routes/admin";
import {
  backfillPostedAt,
  ensureCountryIndex,
  ensureFilterKeywordIndexes,
  ensureIndustryIndexes,
  ensurePostedAtIndex,
  ensureQuantization,
  ensureScrapedAtIndex,
  ensureTitleFullTextIndex,
} from "./qdrant/client";

// Map URL paths to rate-limit buckets. Order matters - more specific patterns
// must come first. Match-explain is /jobs/:id/match-explain, so we test that
// before the broader /jobs/* patterns.
function ruleFor(method: string, path: string): RateLimitRule | null {
  if (method === "POST" && path === "/embed") return RULES.embed;
  if (method === "POST" && path === "/jobs/search") return RULES.search;
  if (method === "POST" && /^\/jobs\/[^/]+\/match-explain$/.test(path)) return RULES.matchExplain;
  if (method === "POST" && path === "/users/register") return RULES.authWrite;
  if (method === "POST" && path === "/users/reset-password") return RULES.authWrite;
  if (method === "POST" && path === "/users/login") return RULES.authRead;
  if (method === "GET" && /^\/users\/[a-f0-9]{64}\/recovery$/.test(path)) return RULES.authRead;
  if (method === "POST" && (path === "/users/profile" || path === "/users/profile/blob")) {
    return RULES.profileWrite;
  }
  if (method === "POST" && path === "/contact") return RULES.contact;
  return null;
}

const corsOrigin = config.isProd
  ? config.security.allowedOrigins.length > 0
    ? config.security.allowedOrigins
    : false
  : true;

if (config.isProd && config.security.allowedOrigins.length === 0) {
  console.error(
    "[fatal] NODE_ENV=production but ALLOWED_ORIGINS is unset. Refusing to start with permissive CORS.",
  );
  process.exit(1);
}

const app = new Elysia()
  .use(
    cors({
      origin: corsOrigin,
      credentials: true,
      methods: ["GET", "POST", "DELETE", "OPTIONS"],
    }),
  )
  .onRequest(({ request, set, server }) => {
    const url = new URL(request.url);
    const rule = ruleFor(request.method, url.pathname);
    if (!rule) return;
    // Loopback bypass: in-process callers (e.g. the crawler running on the
    // same VM and hitting http://localhost:3000 without going through Caddy)
    // don't have X-Forwarded-For set and present as 127.0.0.1/::1 to Bun.
    // Skipping the limiter for that exact shape stops us from rate-limiting
    // ourselves while leaving real users (who all enter via Caddy and thus
    // always carry X-Forwarded-For) fully governed.
    const peer = server?.requestIP(request)?.address ?? null;
    if (shouldBypassRateLimit(request.headers, peer)) return;
    const key = clientKeyFromHeaders(request.headers);
    const result = check(rule, key);
    set.headers["X-RateLimit-Limit"] = String(result.limit);
    set.headers["X-RateLimit-Reset"] = String(Math.ceil(result.resetAt / 1000));
    if (result.ok) {
      set.headers["X-RateLimit-Remaining"] = String(result.remaining);
      return;
    }
    set.headers["Retry-After"] = String(result.retryAfterSec);
    set.status = 429;
    return { error: "rate_limited", retry_after_sec: result.retryAfterSec };
  })
  .use(health)
  .use(embed)
  .use(jobs)
  .use(users)
  .use(match)
  .use(contact)
  .use(admin)
  .onError(({ error, code, set, path }) => {
    if (code === "VALIDATION") {
      const e = error as { all?: unknown[]; message?: string };
      const detail = e.all ?? e.message ?? String(error);
      console.error(`[VALIDATION ${path}]`, JSON.stringify(detail, null, 2));
      set.status = 400;
      return { error: "validation", detail };
    }
    if (code === "PARSE") {
      // Body-too-large surfaces here. Don't echo body content into logs.
      set.status = 413;
      return { error: "payload_too_large_or_invalid" };
    }
    console.error(`[${code} ${path}]`, error instanceof Error ? error.stack ?? error.message : error);
    set.status = code === "NOT_FOUND" ? 404 : 500;
    return { error: code, message: error instanceof Error ? error.message : String(error) };
  })
  .listen({
    port: config.port,
    // Bun-level cap. Requests larger than this are rejected before the
    // handler runs - protects the B2s VM from naive-or-malicious bloat.
    maxRequestBodySize: config.security.maxBodyBytes,
  });

console.log(`OmniJob API listening on http://localhost:${config.port}`);
console.log(`  Qdrant: ${config.qdrant.url}`);
console.log(`  Ollama: ${config.ollama.url} (model=${config.ollama.embedModel})`);
console.log(`  SQLite: ${config.sqlite.path}`);
console.log(`  CORS:   ${config.isProd ? config.security.allowedOrigins.join(",") : "dev:reflect-origin"}`);
console.log(`  Body cap: ${config.security.maxBodyBytes} bytes`);
console.log(
  `  Contact: log=${config.security.contactLogPath} email=${
    config.contact.resendApiKey && config.contact.toEmail
      ? `resend->${config.contact.toEmail}`
      : "disabled (set RESEND_API_KEY + CONTACT_TO_EMAIL)"
  }`,
);
console.log(
  `  Admin: ${config.security.adminToken ? "enabled (set ADMIN_TOKEN header)" : "disabled (set ADMIN_TOKEN env var)"}`,
);

// Best-effort background migration. The hybrid keyword pass in
// /jobs/search needs a full-text payload index on title; if it doesn't
// exist yet (fresh dev box, in-flight prod deploy) we try to create it
// here. Failures are logged but don't block the server - searchJobs has
// a guard that disables the keyword pass cleanly when the index is
// unavailable.
void ensureTitleFullTextIndex()
  .then(() => console.log(`  Hybrid: full-text index on title ready`))
  .catch((e) => console.warn(`  Hybrid: index ensure failed: ${e instanceof Error ? e.message : e}`));
// Industry / job_family keyword indexes so Phase 1 industry filtering hits
// Qdrant's hash lookup instead of full-scan. Idempotent.
void ensureIndustryIndexes()
  .then(() => console.log(`  Industry: keyword indexes on industry/job_family ready`))
  .catch((e) => console.warn(`  Industry: index ensure failed: ${e instanceof Error ? e.message : e}`));
// Integer index on scraped_at so vectorless browse-mode /jobs/search can
// scroll points ordered by recency via Qdrant's order_by. Idempotent.
void ensureScrapedAtIndex()
  .then(() => console.log(`  Browse: integer index on scraped_at ready`))
  .catch((e) => console.warn(`  Browse: index ensure failed: ${e instanceof Error ? e.message : e}`));
// Keyword index on country so the country filter uses Qdrant's hash lookup
// instead of relying entirely on the in-memory post-filter pass. Critical
// for sparse-country queries (~2-3% Canadian inventory) where the recent
// slice didn't contain enough matches. Idempotent.
void ensureCountryIndex()
  .then(() => console.log(`  Country: keyword index on country ready`))
  .catch((e) => console.warn(`  Country: index ensure failed: ${e instanceof Error ? e.message : e}`));
// Integer index on posted_at so browse-mode can offer "sort by posted
// date" alongside "recently added". The follow-on backfill sets
// posted_at = scraped_at on every point that has no datePosted (the
// majority of the existing index pre-dates this fallback at ingest),
// so order_by:posted_at doesn't silently exclude most of the collection.
// Backfill runs in the background; first-of-process call may touch every
// point, subsequent restarts find zero candidates and exit quickly.
void ensurePostedAtIndex()
  .then(() => console.log(`  Sort: integer index on posted_at ready`))
  .then(() => backfillPostedAt())
  .catch((e) => console.warn(`  Sort: posted_at setup failed: ${e instanceof Error ? e.message : e}`));

// Keyword indexes on remote_status + source so server-side equality
// filters (must clauses in searchJobs) become hash lookups instead of full
// scans. ~10-50x speedup on filtered queries per Qdrant's ACORN docs.
void ensureFilterKeywordIndexes()
  .then(() => console.log(`  Filter: keyword indexes on remote_status/source ready`))
  .catch((e) => console.warn(`  Filter: index ensure failed: ${e instanceof Error ? e.message : e}`));
// Scalar int8 quantization. ~2x search speed, ~4x RAM cut, <1pp recall hit
// when paired with rescore at query time (HYBRID_SEARCH_PARAMS in qdrant
// client). Idempotent; a no-op on the second boot.
void ensureQuantization()
  .then(() => console.log(`  Vectors: int8 quantization enabled`))
  .catch((e) => console.warn(`  Vectors: quantization setup failed: ${e instanceof Error ? e.message : e}`));

// Ollama pre-warm. Issue one throwaway embed so the model file is mmapped
// before the first real user query. Without this, the first /embed call
// after process start pays a 2-10s model-load tax that hits the client's
// 20s timeout and gets reported as a generic rate-limit / slow-search
// failure even though nothing is actually overloaded.
void prewarmEmbed()
  .then(() => console.log(`  Embed: Ollama prewarm ok`))
  .catch((e) => console.warn(`  Embed: prewarm failed: ${e instanceof Error ? e.message : e}`));

export type App = typeof app;
