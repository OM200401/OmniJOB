// In-memory fixed-window rate limiter. Single-instance only; for the beta
// the API runs as one Bun process behind Caddy on a single VM, so this is
// sufficient. Switch to Redis (already in compose) when we scale horizontally.

type WindowState = { count: number; resetAt: number };

export type RateLimitRule = {
  // Bucket name; surfaced to clients in the X-RateLimit-Limit header so the
  // SPA can show a useful message when rejected.
  name: string;
  // Maximum requests per window per key.
  limit: number;
  // Window length in milliseconds.
  windowMs: number;
};

const store = new Map<string, WindowState>();

// Periodic cleanup so abandoned IPs (one-shot abusers) don't pin memory.
// 1k entries ≈ ~80 KB; the sweep keeps this well-bounded under steady load.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.resetAt <= now) store.delete(k);
  }
}, 60_000).unref?.();

export type RateLimitResult =
  | { ok: true; remaining: number; resetAt: number; limit: number }
  | { ok: false; retryAfterSec: number; resetAt: number; limit: number };

export function check(rule: RateLimitRule, key: string): RateLimitResult {
  const fullKey = `${rule.name}:${key}`;
  const now = Date.now();
  const existing = store.get(fullKey);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + rule.windowMs;
    store.set(fullKey, { count: 1, resetAt });
    return { ok: true, remaining: rule.limit - 1, resetAt, limit: rule.limit };
  }
  if (existing.count >= rule.limit) {
    const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return { ok: false, retryAfterSec, resetAt: existing.resetAt, limit: rule.limit };
  }
  existing.count += 1;
  return {
    ok: true,
    remaining: rule.limit - existing.count,
    resetAt: existing.resetAt,
    limit: rule.limit,
  };
}

export function clientKeyFromHeaders(headers: Headers): string {
  // Caddy forwards the client IP as X-Forwarded-For; the first entry is the
  // origin. Fall back to X-Real-IP and then "unknown" so the limiter still
  // applies (one bucket for everyone behind a misconfigured proxy is safer
  // than no limit at all).
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

// Bucket definitions tuned for the B2s VM. Search is the hot path; embed and
// match-explain hit Ollama and are heavy. Auth-write paths are throttled hard
// to defang signup-flood attacks.
export const RULES = {
  search: { name: "search", limit: 60, windowMs: 60_000 },
  embed: { name: "embed", limit: 10, windowMs: 60_000 },
  matchExplain: { name: "match-explain", limit: 10, windowMs: 60_000 },
  authRead: { name: "auth-read", limit: 30, windowMs: 60_000 },
  authWrite: { name: "auth-write", limit: 5, windowMs: 60 * 60_000 },
  profileWrite: { name: "profile-write", limit: 30, windowMs: 60_000 },
} as const satisfies Record<string, RateLimitRule>;
