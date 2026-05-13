import { QdrantClient } from "@qdrant/js-client-rest";
import { config } from "../config";
import { classifyTitle, type Level } from "../lib/seniority";
import { classifyCountry } from "../lib/location";
import { classifyIndustry, type Industry } from "../lib/industry";
import { salaryOverlapsUSD } from "../lib/salary";
import { qualityBreakdown, type QualityBreakdown } from "../lib/quality";

export const qdrant = new QdrantClient({
  url: config.qdrant.url,
  ...(config.qdrant.apiKey ? { apiKey: config.qdrant.apiKey } : {}),
});

export type RemoteStatus = "remote" | "hybrid" | "onsite" | "unknown";
// Mirrors apps/api/src/schemas/job.ts SalaryPeriod. Adapter-emitted period
// strings vary ("annual" vs "year" vs "yearly"); the salary library maps every
// accepted alias to the same annual multiplier, so widening the type here is
// safe and keeps the schema and storage shapes in sync.
export type SalaryPeriod =
  | "annual"
  | "year"
  | "yearly"
  | "monthly"
  | "month"
  | "weekly"
  | "week"
  | "biweek"
  | "biweekly"
  | "daily"
  | "day"
  | "hourly"
  | "hour";

export type JobMetadata = {
  title: string;
  company: string;
  location: string;
  country?: string;
  salary_range?: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  salary_period?: SalaryPeriod;
  remote_status?: RemoteStatus;
  experience_level?: Level;
  // Industry / job_family are populated by classifyIndustry() during ingest
  // when not pre-supplied. Stored on the payload + filterable via Qdrant
  // payload indexes (see ensureIndustryIndexes below).
  industry?: Industry;
  job_family?: string;
  source?: string;
  source_url: string;
  scraped_at: number;
  posted_at?: number;
  description?: string;
  // Cross-source dedup outputs. Set by scripts/dedupe.ts when this point is
  // judged a duplicate of another (cosine ≥ 0.98 within the same normalized
  // company × title bucket). The canonical (kept) point references the
  // duplicates by listing them here at apply-time; the duplicate references
  // back to its canonical. Default omitted = treated as active.
  is_active?: boolean;
  canonical_id?: string;
  // Computed at read time, not persisted.
  quality?: number;
  quality_breakdown?: QualityBreakdown["components"];
};

type StoredJobPayload = JobMetadata & { external_id: string };

export type JobSearchFilter = {
  remote_status?: RemoteStatus[];
  experience_level?: Level[];
  industry?: Industry[];
  job_family?: string[];
  source?: string[];
  country?: string[];
  location?: string;
  company?: string;
  salary_min_usd?: number;
  salary_max_usd?: number;
  require_salary?: boolean;
  max_age_days?: number;
};

async function pointIdFor(externalId: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(externalId),
  );
  const b = new Uint8Array(hash, 0, 16);
  const hex = Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export async function upsertJob(
  id: string,
  vector: number[],
  metadata: JobMetadata,
): Promise<void> {
  const pointId = await pointIdFor(id);
  const country = metadata.country ?? classifyCountry(metadata.location) ?? undefined;
  // Server-side industry classification. Crawlers MAY pre-fill industry /
  // job_family (preferable when the source carries the signal natively - e.g.
  // USAJobs always = government), but for the bulk of the index the classifier
  // runs here on the title + first 300 chars of description.
  const inferred =
    metadata.industry && metadata.job_family
      ? { industry: metadata.industry, jobFamily: metadata.job_family }
      : classifyIndustry(metadata.title, metadata.description);
  const industry = metadata.industry ?? inferred.industry;
  // Seniority is now industry-aware and may return null when no pattern matches
  // any bank. Omit the field rather than storing null so existing filters that
  // gate on `experience_level` continue to behave as "unknown is hidden".
  const inferredLevel = metadata.experience_level ?? classifyTitle(metadata.title, industry);
  const payload: StoredJobPayload = {
    ...metadata,
    ...(inferredLevel ? { experience_level: inferredLevel } : {}),
    industry,
    ...(metadata.job_family
      ? { job_family: metadata.job_family }
      : inferred.jobFamily
        ? { job_family: inferred.jobFamily }
        : {}),
    ...(country ? { country } : {}),
    external_id: id,
  };
  await qdrant.upsert(config.qdrant.jobsCollection, {
    wait: true,
    points: [{ id: pointId, vector, payload }],
  });
}

export type JobHit = {
  id: string;
  // Optional: omitted when there is no semantic ranking signal (browse mode,
  // i.e. a vectorless /jobs/search call). UI renders the % match only when
  // present.
  score?: number;
  payload: JobMetadata & { quality?: number; quality_breakdown?: QualityBreakdown["components"] };
};

export type JobSearchResult = {
  hits: JobHit[];
  // Size of the post-filter candidate pool. Useful for the UI to show
  // "Showing 20 of N matches". Bounded above by fetchK so a returned `total`
  // equal to fetchK means "at least this many" rather than an exact count.
  total: number;
};

// Reciprocal Rank Fusion constant. 60 is the value from the original
// Cormack/Clarke/Buettcher paper and what most production hybrid-search
// references (incl. Qdrant's own docs) use as a default. Larger k flattens
// the contribution of top ranks; smaller k makes the top ranks dominate.
const RRF_K = 60;

type KeywordHit = { id: string | number; payload: StoredJobPayload };

// Issue a Qdrant scroll for each keyword token against the title's
// full-text payload index, then dedupe by point id. Each token returns
// at most `limit` hits; total returned is bounded by `limit`. The first
// time we observe a "no full-text index" error we cache the result and
// short-circuit subsequent calls until the process restarts - the API
// startup hook tries to create the index, so this is just a guard against
// running before the migration has landed.
let keywordIndexAvailable: boolean | undefined;

async function keywordSearch(
  keywords: string[],
  limit: number,
  baseFilter: Record<string, unknown>,
): Promise<KeywordHit[]> {
  if (keywordIndexAvailable === false) return [];
  // Dedup tokens, drop any too-short to be useful, cap fan-out at 5 to
  // bound the wall-clock cost when an expansion produces a long synonym
  // list. Keywords are sorted long-first so the most specific match wins
  // any ties in the RRF rank assignment below.
  const tokens = Array.from(new Set(keywords.map((k) => k.trim().toLowerCase())))
    .filter((k) => k.length >= 2)
    .sort((a, b) => b.length - a.length)
    .slice(0, 5);
  if (tokens.length === 0) return [];

  const perToken = Math.max(20, Math.ceil(limit / tokens.length));
  // Run each token's scroll in parallel. Qdrant's match_text matches the
  // entire phrase as one query, so a multi-word keyword like "new grad"
  // requires that exact ordering to fire - the dictionary already keeps
  // each ATS phrasing as its own entry, so this is the desired behavior.
  const merged = new Map<string, KeywordHit>();
  await Promise.all(
    tokens.map(async (tok) => {
      try {
        const res = await qdrant.scroll(config.qdrant.jobsCollection, {
          limit: perToken,
          with_payload: true,
          with_vector: false,
          filter: {
            ...baseFilter,
            must: [
              ...((baseFilter as { must?: Array<Record<string, unknown>> }).must ?? []),
              { key: "title", match: { text: tok } },
            ],
          },
        });
        for (const p of res.points) {
          const key = String(p.id);
          if (!merged.has(key)) {
            merged.set(key, { id: p.id, payload: p.payload as StoredJobPayload });
          }
        }
      } catch (e) {
        // Most likely: payload index for "title" doesn't exist on this
        // Qdrant deployment yet. Disable the keyword pass for the rest of
        // this process so we don't pay the round-trip on every search.
        const msg = e instanceof Error ? e.message : String(e);
        if (/index|text|field/i.test(msg)) {
          if (keywordIndexAvailable !== false) {
            console.warn(`[hybrid] keyword pass disabled: ${msg}`);
            keywordIndexAvailable = false;
          }
        } else {
          // Anything else: log but stay quiet to the caller. Vector-only
          // results are still valid; we just lose the hybrid boost.
          console.warn(`[hybrid] keyword scroll failed for "${tok}": ${msg}`);
        }
      }
    }),
  );
  if (keywordIndexAvailable === undefined && merged.size >= 0) {
    keywordIndexAvailable = true;
  }
  return Array.from(merged.values()).slice(0, limit);
}

// Idempotent migration: create the full-text payload index on "title" if
// it doesn't already exist. Safe to call repeatedly. Used by both the
// init-qdrant.ts script and the API process at startup.
export async function ensureTitleFullTextIndex(): Promise<void> {
  try {
    await qdrant.createPayloadIndex(config.qdrant.jobsCollection, {
      field_name: "title",
      field_schema: {
        type: "text",
        tokenizer: "word",
        min_token_len: 2,
        max_token_len: 32,
        lowercase: true,
      },
      wait: true,
    });
  } catch (e) {
    // "already exists" is the happy path on every restart after the first.
    // Don't surface it.
    const msg = e instanceof Error ? e.message : String(e);
    if (!/exist|already/i.test(msg)) {
      throw e;
    }
  }
}

// Idempotent migration: create keyword payload indexes for industry and
// job_family. Without these, filtering on industry would force a full
// collection scan instead of using Qdrant's payload-index hash lookup.
// Same swallow-on-already-exists shape as ensureTitleFullTextIndex.
export async function ensureIndustryIndexes(): Promise<void> {
  for (const field of ["industry", "job_family"] as const) {
    try {
      await qdrant.createPayloadIndex(config.qdrant.jobsCollection, {
        field_name: field,
        field_schema: "keyword",
        wait: true,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/exist|already/i.test(msg)) throw e;
    }
  }
}

// Idempotent migration: create an integer payload index on scraped_at so the
// browse path (vectorless /jobs/search) can scroll points ordered by recency
// using Qdrant's order_by. Without this index, order_by on scraped_at falls
// back to an unordered scan.
export async function ensureScrapedAtIndex(): Promise<void> {
  try {
    await qdrant.createPayloadIndex(config.qdrant.jobsCollection, {
      field_name: "scraped_at",
      field_schema: "integer",
      wait: true,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/exist|already/i.test(msg)) throw e;
  }
}

export type HybridOptions = {
  // Lowercased keyword tokens to OR-match against the title payload. When
  // present and at least one yields a Qdrant full-text hit, the keyword
  // ranking is fused with the vector ranking via RRF before post-filtering.
  // Empty array or undefined disables the keyword pass.
  keywords?: string[];
  // Page offset into the post-filter result pool. The caller asks for `k`
  // hits starting at this offset; `total` always reflects the FULL filtered
  // set so the UI can compute total pages. Defaults to 0 (first page).
  offset?: number;
};

export async function searchJobs(
  vector: number[] | undefined,
  k = 20,
  filter?: JobSearchFilter,
  opts?: HybridOptions,
): Promise<JobSearchResult> {
  const must = [] as Array<Record<string, unknown>>;
  // Hide cross-source duplicates marked by scripts/dedupe.ts. Points without
  // is_active set are treated as active (default).
  const must_not: Array<Record<string, unknown>> = [
    { key: "is_active", match: { value: false } },
  ];
  if (filter?.remote_status?.length) {
    must.push({ key: "remote_status", match: { any: filter.remote_status } });
  }
  if (filter?.source?.length) {
    must.push({ key: "source", match: { any: filter.source } });
  }
  // Industry / job_family are payload-indexed (see ensureIndustryIndexes) so
  // filtering happens server-side in Qdrant rather than in the post-filter
  // loop below. This keeps the candidate pool tight on industry-narrowed
  // searches (e.g. "show me only healthcare RN postings").
  if (filter?.industry?.length) {
    must.push({ key: "industry", match: { any: filter.industry } });
  }
  if (filter?.job_family?.length) {
    must.push({ key: "job_family", match: { any: filter.job_family } });
  }

  const needsPostFilter =
    Boolean(filter?.experience_level?.length) ||
    Boolean(filter?.country?.length) ||
    Boolean(filter?.location) ||
    Boolean(filter?.company) ||
    filter?.salary_min_usd !== undefined ||
    filter?.salary_max_usd !== undefined ||
    filter?.require_salary === true ||
    filter?.max_age_days !== undefined;

  const minTimestamp =
    filter?.max_age_days !== undefined
      ? Date.now() - filter.max_age_days * 24 * 3600 * 1000
      : undefined;
  // Pull a deeper candidate pool than the client asked for so that generic
  // queries ("software", "graduate") have room to surface relevant matches
  // beyond the tightest cosine-cluster, and so post-filters have a healthy
  // pre-image to whittle down. The Qdrant cost of a single 200-limit ANN
  // search is dominated by HNSW traversal, which is roughly constant in k
  // up to a few hundred, so this is essentially free.
  const fetchK = needsPostFilter ? Math.min(300, Math.max(k * 5, 200)) : Math.min(200, Math.max(k * 2, 100));

  const baseFilter = { must_not, ...(must.length ? { must } : {}) };

  // Browse mode is taken when the caller doesn't supply a query vector
  // (no résumé and no typed query). Instead of ANN ranking we scroll the
  // collection ordered by scraped_at descending so the user sees the most
  // recent postings first. Filters still apply. Browse pulls a deeper batch
  // since there's no ranking signal to truncate by.
  const browseMode = !vector || vector.length === 0;

  type Fused = {
    id: string | number;
    fused: number;
    // Cosine score from the vector pass, or undefined if the point only
    // appeared in the keyword pass / browse mode. The route surfaces this
    // to the client.
    cosine: number | undefined;
    payload: StoredJobPayload;
  };
  let res: Fused[];

  if (browseMode) {
    const scrollK = needsPostFilter ? 600 : 400;
    const scrollRes = await qdrant.scroll(config.qdrant.jobsCollection, {
      limit: scrollK,
      with_payload: true,
      with_vector: false,
      filter: baseFilter,
      order_by: { key: "scraped_at", direction: "desc" },
    });
    res = scrollRes.points.map((p) => ({
      id: p.id,
      fused: 0,
      cosine: undefined,
      payload: p.payload as StoredJobPayload,
    }));
  } else {
    // Vector and keyword passes run in parallel. The keyword pass scrolls
    // for points whose title matches any expanded query token via Qdrant's
    // full-text payload index. If the index isn't ready yet (fresh install
    // or in-flight migration) the helper returns an empty array and we
    // fall back to pure vector search - no error surfaces to the user.
    const [vecRes, kwRes] = await Promise.all([
      qdrant.search(config.qdrant.jobsCollection, {
        vector,
        limit: fetchK,
        with_payload: true,
        filter: baseFilter,
      }),
      opts?.keywords && opts.keywords.length > 0
        ? keywordSearch(opts.keywords, fetchK, baseFilter)
        : Promise.resolve([] as KeywordHit[]),
    ]);

    // RRF fusion. Each ranking contributes 1/(RRF_K + rank) to a point's
    // fused score. Points that appear in both rankings sum the two; points
    // that appear in only one are still represented.
    const fusedMap = new Map<string, Fused>();
    vecRes.forEach((p, rank) => {
      const key = String(p.id);
      fusedMap.set(key, {
        id: p.id,
        fused: 1 / (RRF_K + rank + 1),
        cosine: p.score,
        payload: p.payload as StoredJobPayload,
      });
    });
    kwRes.forEach((p, rank) => {
      const key = String(p.id);
      const rrf = 1 / (RRF_K + rank + 1);
      const existing = fusedMap.get(key);
      if (existing) {
        existing.fused += rrf;
      } else {
        // Keyword-only hit. Cosine is unknown; synthesize a reasonable
        // score so the UI doesn't show 0%. We use a flat 0.55 (just under
        // the "strong match" threshold at 0.6) - good enough to render as
        // "55% match" without overclaiming relevance.
        fusedMap.set(key, { id: p.id, fused: rrf, cosine: 0.55, payload: p.payload });
      }
    });
    res = Array.from(fusedMap.values()).sort((a, b) => b.fused - a.fused);
  }

  const wantLevels = new Set<Level>(filter?.experience_level ?? []);
  const wantCountries = new Set<string>(filter?.country ?? []);
  const wantLocation = filter?.location?.toLowerCase().trim() ?? "";
  const wantCompany = filter?.company?.toLowerCase().trim() ?? "";

  // Collect the FULL post-filter set (in fused-rank order), then slice the
  // requested page off the end. `total` is the size of this full set so the
  // UI can compute `Math.ceil(total / k)` pages correctly. Building the page
  // payload (quality breakdown etc.) only for the sliced window keeps the
  // per-request cost roughly equal to the pre-pagination implementation.
  const filtered: Array<{ p: typeof res[number]; level: Level | null; country: string | undefined; payload: StoredJobPayload }> = [];
  for (const p of res) {
    const payload = p.payload as StoredJobPayload;
    // Re-classify on read. The stored payload was written by whatever
    // classifier was current at ingest time, which for the bulk of the index
    // pre-dates the location/seniority audit fixes (e.g. it tagged
    // "San Francisco, CA" as country=CA / Canada). Trust the live classifier;
    // fall back to stored country only when the classifier can't resolve it.
    // The seniority classifier is industry-aware now - pass the stored
    // industry so e.g. "Charge Nurse" doesn't fall through tech rules.
    const level: Level | null = classifyTitle(payload.title, payload.industry);
    const country = classifyCountry(payload.location) ?? payload.country ?? undefined;

    // Unknown level (null) is treated as "doesn't match" when a level filter
    // is in effect. This is deliberate: the level filter expresses
    // "show me roles we've confidently ranked at this seniority"; unranked
    // titles shouldn't sneak through.
    if (wantLevels.size > 0 && (level === null || !wantLevels.has(level))) continue;
    if (wantCountries.size > 0 && (!country || !wantCountries.has(country))) continue;
    if (wantLocation && !payload.location.toLowerCase().includes(wantLocation)) continue;
    if (wantCompany && !payload.company.toLowerCase().includes(wantCompany)) continue;

    if (minTimestamp !== undefined) {
      // Use scraped_at (= "last verified live in source") for staleness;
      // posted_at can be far older but still actively listed. If scraped_at
      // is missing we fall back to posted_at.
      const ts = payload.scraped_at ?? payload.posted_at;
      if (!ts || ts < minTimestamp) continue;
    }
    if (filter?.require_salary && !payload.salary_max) continue;
    if (
      !salaryOverlapsUSD(
        payload.salary_min,
        payload.salary_max,
        payload.salary_currency,
        payload.salary_period,
        filter?.salary_min_usd,
        filter?.salary_max_usd,
      )
    ) {
      // salaryOverlapsUSD returns false for jobs without salary info when a
      // numeric filter is set; that's the desired behavior - if the user
      // asked for $X+, we shouldn't show jobs of unknown pay.
      continue;
    }

    filtered.push({ p, level, country, payload });
  }

  const total = filtered.length;
  const offset = Math.max(0, opts?.offset ?? 0);
  // Out-of-range offset (e.g. user landed on a stale deep-link to page 10
  // after filters narrowed the pool): return an empty page but keep `total`
  // so the client can show "Page X of Y" / fall back to page 1.
  if (offset >= total) {
    return { hits: [], total };
  }
  const window = filtered.slice(offset, offset + k);
  const out: JobHit[] = window.map(({ p, level, country, payload }) => {
    const enriched: JobMetadata = {
      ...payload,
      ...(level !== null ? { experience_level: level } : {}),
      ...(country ? { country } : {}),
    };
    const quality = qualityBreakdown(enriched);
    return {
      id: payload.external_id ?? String(p.id),
      // Surface the cosine score, not the RRF fused score - the UI renders
      // this as a "% match" and the fused value (0.01-0.03 range) would
      // collapse every match to 1-3%. In browse mode cosine is undefined
      // (no semantic ranking signal) so we omit the field entirely.
      ...(p.cosine !== undefined ? { score: p.cosine } : {}),
      payload: { ...enriched, quality: quality.total, quality_breakdown: quality.components },
    };
  });
  return { hits: out, total };
}

// Lightweight existence check used by the crawler to skip jobs we've
// already embedded. Calling retrieve with no payload/vector is much
// cheaper than fetching+decoding the full record.
export async function jobExists(externalId: string): Promise<boolean> {
  const pointId = await pointIdFor(externalId);
  const res = await qdrant.retrieve(config.qdrant.jobsCollection, {
    ids: [pointId],
    with_payload: false,
    with_vector: false,
  });
  return res.length > 0;
}

export async function getJob(externalId: string): Promise<(JobMetadata & { quality?: number; quality_breakdown?: QualityBreakdown["components"] }) | null> {
  const pointId = await pointIdFor(externalId);
  const res = await qdrant.retrieve(config.qdrant.jobsCollection, {
    ids: [pointId],
    with_payload: true,
    with_vector: false,
  });
  const p = res[0];
  if (!p) return null;
  const payload = p.payload as StoredJobPayload;
  // Re-classify on read (see search()). Stored payload pre-dates the audit.
  const country = classifyCountry(payload.location) ?? payload.country ?? undefined;
  const level = classifyTitle(payload.title, payload.industry);
  const enriched: JobMetadata = {
    ...payload,
    ...(level !== null ? { experience_level: level } : {}),
    ...(country ? { country } : {}),
  };
  const quality = qualityBreakdown(enriched);
  return { ...enriched, quality: quality.total, quality_breakdown: quality.components };
}

// Source disclosure: for a canonical job, return its own source plus every
// duplicate that scripts/dedupe.ts collapsed into it. Used by the
// "Verified across N sources" panel - the duplicates carry canonical_id
// pointing at this canonical's external_id.
export type JobSource = {
  source: string;
  source_url: string;
  scraped_at: number;
};

export async function getJobSources(
  externalId: string,
): Promise<{
  canonical: JobSource;
  duplicates: JobSource[];
} | null> {
  const canonicalMeta = await getJob(externalId);
  if (!canonicalMeta) return null;

  // Single filter scroll over points whose canonical_id pointer matches us.
  // Cap aggressively - a single canonical with >50 duplicates would be
  // pathological; in practice clusters are 2-5 points.
  const res = await qdrant.scroll(config.qdrant.jobsCollection, {
    limit: 50,
    with_payload: true,
    with_vector: false,
    filter: {
      must: [{ key: "canonical_id", match: { value: externalId } }],
    },
  });

  const duplicates: JobSource[] = [];
  for (const p of res.points) {
    const payload = (p.payload ?? {}) as Record<string, unknown>;
    const source = typeof payload.source === "string" ? payload.source : "unknown";
    const source_url = typeof payload.source_url === "string" ? payload.source_url : "";
    const scraped_at = typeof payload.scraped_at === "number" ? payload.scraped_at : 0;
    if (!source_url) continue;
    duplicates.push({ source, source_url, scraped_at });
  }

  return {
    canonical: {
      source: canonicalMeta.source ?? "unknown",
      source_url: canonicalMeta.source_url,
      scraped_at: canonicalMeta.scraped_at,
    },
    duplicates,
  };
}

export async function isReachable(): Promise<boolean> {
  try {
    await qdrant.getCollections();
    return true;
  } catch {
    return false;
  }
}
