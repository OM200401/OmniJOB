import { Elysia } from "elysia";
import { existsSync, statSync } from "node:fs";
import { open } from "node:fs/promises";
import { config } from "../config";
import { qdrant } from "../qdrant/client";
import { db } from "../db/sqlite";

// Operator-only endpoints. Protected by a shared secret in the
// X-Admin-Token header. Endpoints return 401 when the secret is unset
// server-side OR when the header is missing / wrong, never a "no token
// configured" 200, so an unprovisioned server doesn't expose stats.

function authorized(headers: Headers): boolean {
  const expected = config.security.adminToken;
  if (!expected) return false;
  const got = headers.get("x-admin-token");
  if (!got) return false;
  // Constant-time compare: avoid timing-side-channel signal on the secret.
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  }
  return diff === 0;
}

type AuditLine = {
  ts: string;
  event: string;
  uid: string | null;
};

// Parse the audit JSONL once per request. The log is ~1 line per auth
// event, append-only, and the prod file is bounded by user activity, so
// a full scan is cheap until we have meaningful traffic. When the file
// grows past ~10MB we should switch to a tail-bounded read.
async function readAudit(): Promise<AuditLine[]> {
  const path = config.security.auditLogPath;
  if (!existsSync(path)) return [];
  const size = statSync(path).size;
  if (size === 0) return [];
  const fh = await open(path, "r");
  try {
    const buf = Buffer.alloc(size);
    await fh.read(buf, 0, size, 0);
    const text = buf.toString("utf8");
    const out: AuditLine[] = [];
    for (const line of text.split("\n")) {
      if (!line) continue;
      try {
        const parsed = JSON.parse(line) as AuditLine;
        if (parsed.ts && parsed.event) out.push(parsed);
      } catch {
        // Tolerate the rare partial line at the tail (writer was mid-flush
        // during the read). Skip and keep going.
      }
    }
    return out;
  } finally {
    await fh.close();
  }
}

// "Active" here means: distinct uids that produced a successful login or
// register event inside the window. We deliberately don't count failed
// login attempts (login_miss) - that's a security signal, not engagement.
const ACTIVE_EVENTS = new Set([
  "login",
  "register",
  "profile_save",
  "profile_blob_save",
]);

function activeUidsSince(events: AuditLine[], cutoffMs: number): Set<string> {
  const now = Date.now();
  const set = new Set<string>();
  for (const e of events) {
    if (!e.uid) continue;
    if (!ACTIVE_EVENTS.has(e.event)) continue;
    const ts = Date.parse(e.ts);
    if (!Number.isFinite(ts)) continue;
    if (now - ts > cutoffMs) continue;
    set.add(e.uid);
  }
  return set;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export const admin = new Elysia({ prefix: "/admin" })
  .onBeforeHandle(({ request, set }) => {
    if (!authorized(request.headers)) {
      set.status = 401;
      return { error: "unauthorized" };
    }
    return;
  })
  .get("/stats", async () => {
    const events = await readAudit();
    const active24h = activeUidsSince(events, DAY_MS);
    const active7d = activeUidsSince(events, 7 * DAY_MS);
    const active30d = activeUidsSince(events, 30 * DAY_MS);

    // Total registered accounts. Cheap query against the users table.
    const totalUsers = (() => {
      try {
        const row = db.query("SELECT COUNT(*) AS n FROM users").get() as
          | { n: number }
          | undefined;
        return row?.n ?? 0;
      } catch {
        return 0;
      }
    })();

    // Counts per event type over the last 7d, useful for spotting signup
    // bursts or login-miss spikes without exposing raw uids.
    const eventCounts7d: Record<string, number> = {};
    const cutoff7d = Date.now() - 7 * DAY_MS;
    for (const e of events) {
      const ts = Date.parse(e.ts);
      if (!Number.isFinite(ts) || ts < cutoff7d) continue;
      eventCounts7d[e.event] = (eventCounts7d[e.event] ?? 0) + 1;
    }

    // Job index size - one read against Qdrant.
    let jobCount = 0;
    try {
      const info = await qdrant.getCollection(config.qdrant.jobsCollection);
      jobCount = info.points_count ?? 0;
    } catch {
      // Qdrant unreachable: leave at 0 rather than 500 the whole endpoint.
    }

    return {
      generated_at: new Date().toISOString(),
      users: {
        total: totalUsers,
        active_24h: active24h.size,
        active_7d: active7d.size,
        active_30d: active30d.size,
      },
      events_last_7d: eventCounts7d,
      index: {
        jobs: jobCount,
      },
    };
  });
