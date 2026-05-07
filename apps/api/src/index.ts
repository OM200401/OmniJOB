import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { config } from "./config";
import { check, clientKeyFromHeaders, RULES, type RateLimitRule } from "./lib/ratelimit";
import { health } from "./routes/health";
import { jobs } from "./routes/jobs";
import { users } from "./routes/users";
import { match } from "./routes/match";
import { embed } from "./routes/embed";

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
  .onRequest(({ request, set }) => {
    const url = new URL(request.url);
    const rule = ruleFor(request.method, url.pathname);
    if (!rule) return;
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

export type App = typeof app;
