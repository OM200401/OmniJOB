import { Elysia } from "elysia";
import { existsSync, statSync } from "node:fs";
import { open, readFile } from "node:fs/promises";
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

    const crawler = await crawlerProgress();

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
      crawler,
    };
  });

// Parse the tail of /var/log/omnijob-crawler.log to surface the in-flight
// or last-completed run's stats. We tail the last ~256KB to avoid loading
// the whole log on every poll. Resilient to missing file / read failure -
// returns null so the caller can still serve the rest of the stats.
const CRAWLER_LOG_TAIL_BYTES = 256 * 1024;
const CRAWLER_LOG_PATH = process.env["CRAWLER_LOG_PATH"] ?? "/var/log/omnijob-crawler.log";

async function crawlerProgress(): Promise<{
  log_path: string;
  current_run: {
    started_at: string;
    elapsed_minutes: number;
    sources: string[];
    concurrency: number | null;
    ok: number;
    skipped_or_done: number;
    embed_failures: number;
    latest_log_line: string;
  } | null;
  previous_run_summary: string | null;
} | null> {
  if (!existsSync(CRAWLER_LOG_PATH)) return null;
  try {
    const stat = statSync(CRAWLER_LOG_PATH);
    const start = Math.max(0, stat.size - CRAWLER_LOG_TAIL_BYTES);
    const fh = await open(CRAWLER_LOG_PATH, "r");
    let text: string;
    try {
      const buf = Buffer.alloc(stat.size - start);
      await fh.read(buf, 0, buf.length, start);
      text = buf.toString("utf8");
    } finally {
      await fh.close();
    }

    const lines = text.split("\n").filter(Boolean);
    if (lines.length === 0) return { log_path: CRAWLER_LOG_PATH, current_run: null, previous_run_summary: null };

    // Find the most recent "starting crawler" line - that's the head of the
    // current run. Anything before it is the prior run.
    let startIdx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i]!.includes("starting crawler")) {
        startIdx = i;
        break;
      }
    }

    let previousRunSummary: string | null = null;
    if (startIdx > 0) {
      // The line immediately before the current "starting crawler" is the
      // previous run's "done - ingested=..." summary (or close to it).
      for (let i = startIdx - 1; i >= Math.max(0, startIdx - 10); i--) {
        if (lines[i]!.includes("done - ingested=")) {
          previousRunSummary = lines[i] ?? null;
          break;
        }
      }
    }

    if (startIdx < 0) {
      return { log_path: CRAWLER_LOG_PATH, current_run: null, previous_run_summary: previousRunSummary };
    }

    const startLine = lines[startIdx]!;
    const tsMatch = startLine.match(/^(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2})/);
    const startedRaw = tsMatch ? tsMatch[1]! : "";
    const startedIso = startedRaw
      ? new Date(startedRaw.replace(/\//g, "-").replace(" ", "T") + "Z").toISOString()
      : "";
    const elapsedMinutes = startedIso
      ? Math.round((Date.now() - Date.parse(startedIso)) / 60_000)
      : 0;

    const sourcesMatch = startLine.match(/sources=\[([^\]]+)\]/);
    const sources = sourcesMatch ? sourcesMatch[1]!.split(/\s+/).filter(Boolean) : [];
    const concurrencyMatch = startLine.match(/concurrency=(\d+)/);
    const concurrency = concurrencyMatch ? Number(concurrencyMatch[1]) : null;

    let ok = 0;
    let embedFailures = 0;
    let skippedOrDone = 0;
    let latestLog = startLine;
    for (let i = startIdx + 1; i < lines.length; i++) {
      const ln = lines[i]!;
      latestLog = ln;
      if (/\[w\d+\] ok /.test(ln)) ok++;
      else if (/context deadline exceeded/.test(ln)) embedFailures++;
      else if (/\bjobs$/.test(ln)) skippedOrDone++;
    }

    return {
      log_path: CRAWLER_LOG_PATH,
      current_run: {
        started_at: startedIso,
        elapsed_minutes: elapsedMinutes,
        sources,
        concurrency,
        ok,
        skipped_or_done: skippedOrDone,
        embed_failures: embedFailures,
        latest_log_line: latestLog,
      },
      previous_run_summary: previousRunSummary,
    };
  } catch {
    return null;
  }
}

// Silence the unused-import warning for readFile - referenced for future use.
void readFile;
