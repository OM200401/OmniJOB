/**
 * Cross-source dedup pass.
 *
 * Why: the same role posted by the same company through two of our adapters
 * (e.g. a Workday tenant + The Muse syndication of that same posting + a
 * RemoteOK aggregator copy) currently appears N times in the index. Volume
 * is the operating principle, but apparent volume is wasted if a third of
 * results are duplicates of each other.
 *
 * Algorithm:
 *  1. Scroll all active jobs (is_active != false), bucket by
 *     (normalized_company, normalized_title).
 *  2. For each bucket of size > 1, fetch vectors and cluster pairwise where
 *     cosine ≥ COSINE_THRESHOLD (0.98).
 *  3. Within each cluster, keep the canonical entry (lowest source-priority
 *     number; ties broken by quality hint = salary disclosed + description
 *     length). Mark the rest is_active=false with canonical_id pointer.
 *
 * Run: bun run apps/api/scripts/dedupe.ts
 *      bun run apps/api/scripts/dedupe.ts --dry-run
 */

import { QdrantClient } from "@qdrant/js-client-rest";
import { config } from "../src/config";
import { classifyCountry } from "../src/lib/location";

const COSINE_THRESHOLD = 0.98;
const SCROLL_BATCH = 500;
const SET_PAYLOAD_BATCH = 100;

// Lower number = more canonical. Direct ATS beats curated beats aggregator
// beats remote-aggregator. When two listings collide, keep the lower number.
const SOURCE_PRIORITY: Record<string, number> = {
  // Tier 1 - direct ATS, employer-controlled
  greenhouse: 1,
  lever: 1,
  ashby: 1,
  workday: 1,
  smartrecruiters: 1,
  recruitee: 1,
  workable: 1,
  bamboohr: 1,
  breezy: 1,
  pinpoint: 1,
  personio: 1,
  teamtailor: 1,
  // Tier 2 - curated employer programs (founder-attested, vetted)
  hackernews: 2,
  workatastartup: 2,
  usajobs: 2,
  // Tier 3 - public-API aggregators
  themuse: 3,
  adzuna: 3,
  jooble: 3,
  reed: 3,
  careerjet: 3,
  // Tier 4 - remote-only aggregators (often syndicate from Tier 1-3)
  remoteok: 4,
  weworkremotely: 4,
};

function priorityFor(source: string | undefined): number {
  return SOURCE_PRIORITY[source ?? "unknown"] ?? 99;
}

const COMPANY_SUFFIX_RE =
  /\b(inc|incorporated|llc|ltd|limited|gmbh|s\.a\.|sa|ag|plc|co|corp|corporation|company|holdings|group|technologies|technology|tech|labs|studios|systems)\b\.?/g;

function normalizeCompany(s: string): string {
  return s
    .toLowerCase()
    .replace(/[,.()]/g, " ")
    .replace(COMPANY_SUFFIX_RE, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Strip level prefixes, parenthesized location hints, and trailing
// roman/arabic level numerals so "Senior Software Engineer II (Remote)"
// and "Software Engineer" bucket together for vector similarity comparison.
function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[,./|\\:_-]/g, " ")
    .replace(
      /\b(senior|sr|junior|jr|lead|principal|staff|associate|founding|head\s+of|vp|vice\s+president|cto|ceo|cfo|coo|director|manager|intern|mid|mid-level|new\s+grad|new-grad|entry\s+level|early\s+career)\b/g,
      " ",
    )
    .replace(/\s(?:[ivx]+|[1-9])\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

type Member = {
  id: string;
  source: string;
  quality_hint: number;
  external_id: string;
};

const dryRun = process.argv.includes("--dry-run");

const qdrant = new QdrantClient({
  url: config.qdrant.url,
  ...(config.qdrant.apiKey ? { apiKey: config.qdrant.apiKey } : {}),
});

async function main() {
  console.log(`dedupe - collection=${config.qdrant.jobsCollection} dry_run=${dryRun}`);

  const groups = new Map<string, Member[]>();
  let offset: string | number | undefined = undefined;
  let total = 0;
  let activeTotal = 0;

  // Pass 1: bucket all active jobs by (company, title).
  while (true) {
    const res: { points: Array<{ id: string | number; payload?: unknown }>; next_page_offset?: string | number | null } = await qdrant.scroll(
      config.qdrant.jobsCollection,
      {
        limit: SCROLL_BATCH,
        with_payload: true,
        with_vector: false,
        ...(offset !== undefined ? { offset } : {}),
      },
    );
    for (const p of res.points) {
      total++;
      const payload = (p.payload ?? {}) as Record<string, unknown>;
      if (payload.is_active === false) continue;
      activeTotal++;
      const company = normalizeCompany(String(payload.company ?? ""));
      const title = normalizeTitle(String(payload.title ?? ""));
      if (!company || !title) continue;
      const source = String(payload.source ?? "unknown");
      const description = typeof payload.description === "string" ? payload.description : "";
      // Country and remote-status guard the bucket so the same role posted
      // for two countries (Stripe SF vs Stripe Stockholm) doesn't collapse
      // into one. Country is re-classified via the live classifier (the
      // stored payload may be stale per the audit fix).
      const location = String(payload.location ?? "");
      const country = classifyCountry(location) ?? String(payload.country ?? "??");
      const remote = String(payload.remote_status ?? "?");
      const quality_hint =
        (typeof payload.salary_max === "number" && payload.salary_max > 0 ? 1 : 0) +
        Math.min(2, description.length / 1500);
      const external_id = String(payload.external_id ?? p.id);
      const key = `${company}|${title}|${country}|${remote}`;
      const arr = groups.get(key) ?? [];
      arr.push({ id: String(p.id), source, quality_hint, external_id });
      groups.set(key, arr);
    }
    if (!res.next_page_offset) break;
    offset = res.next_page_offset;
  }
  console.log(
    `scrolled total=${total} active=${activeTotal} buckets=${groups.size}`,
  );

  let candidateBuckets = 0;
  for (const arr of groups.values()) if (arr.length > 1) candidateBuckets++;
  console.log(`candidate buckets (size>1): ${candidateBuckets}`);

  // Pass 2: per-bucket pairwise cluster, mark non-canonical.
  const toMark: Array<{ id: string; canonical_id: string }> = [];
  let groupIdx = 0;
  for (const [, members] of groups) {
    if (members.length < 2) continue;
    groupIdx++;
    if (groupIdx % 50 === 0) {
      console.log(`  bucket ${groupIdx}/${candidateBuckets} (dups so far: ${toMark.length})`);
    }

    const ids = members.map((m) => m.id);
    const points: Array<{ id: string | number; vector?: unknown }> = await qdrant.retrieve(
      config.qdrant.jobsCollection,
      { ids, with_payload: false, with_vector: true },
    );
    const vectors = new Map<string, number[]>();
    for (const p of points) {
      const v = p.vector;
      if (Array.isArray(v) && v.every((x) => typeof x === "number")) {
        vectors.set(String(p.id), v as number[]);
      }
    }

    const visited = new Set<string>();
    for (let i = 0; i < members.length; i++) {
      const m = members[i]!;
      if (visited.has(m.id)) continue;
      const va = vectors.get(m.id);
      if (!va) {
        visited.add(m.id);
        continue;
      }
      const cluster: Member[] = [m];
      visited.add(m.id);
      for (let j = i + 1; j < members.length; j++) {
        const n = members[j]!;
        if (visited.has(n.id)) continue;
        const vb = vectors.get(n.id);
        if (!vb) continue;
        if (cosine(va, vb) >= COSINE_THRESHOLD) {
          cluster.push(n);
          visited.add(n.id);
        }
      }
      if (cluster.length > 1) {
        cluster.sort((a, b) => {
          const pa = priorityFor(a.source);
          const pb = priorityFor(b.source);
          if (pa !== pb) return pa - pb;
          return b.quality_hint - a.quality_hint;
        });
        const canonical = cluster[0]!;
        for (let k = 1; k < cluster.length; k++) {
          toMark.push({ id: cluster[k]!.id, canonical_id: canonical.external_id });
        }
      }
    }
  }
  console.log(`duplicates identified: ${toMark.length}`);
  console.log(`would keep canonical: ${activeTotal - toMark.length}`);

  if (dryRun) {
    console.log("--dry-run set - no points modified.");
    return;
  }

  // Pass 3: batch is_active=false on duplicates. setPayload doesn't support
  // per-point distinct payloads, so the canonical_id pointer goes one-by-one
  // (cheap; runs of typically <1k points).
  for (let i = 0; i < toMark.length; i += SET_PAYLOAD_BATCH) {
    const chunk = toMark.slice(i, i + SET_PAYLOAD_BATCH);
    await qdrant.setPayload(config.qdrant.jobsCollection, {
      wait: false,
      payload: { is_active: false },
      points: chunk.map((c) => c.id),
    });
  }
  for (const c of toMark) {
    await qdrant.setPayload(config.qdrant.jobsCollection, {
      wait: false,
      payload: { canonical_id: c.canonical_id },
      points: [c.id],
    });
  }
  console.log(`marked ${toMark.length} points is_active=false`);
}

main().catch((err) => {
  console.error("dedupe failed:", err);
  process.exit(1);
});
