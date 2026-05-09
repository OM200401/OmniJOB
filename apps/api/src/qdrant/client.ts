import { QdrantClient } from "@qdrant/js-client-rest";
import { config } from "../config";
import { classifyTitle, type Level } from "../lib/seniority";
import { classifyCountry } from "../lib/location";
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
  const payload: StoredJobPayload = {
    ...metadata,
    experience_level: metadata.experience_level ?? classifyTitle(metadata.title),
    ...(country ? { country } : {}),
    external_id: id,
  };
  await qdrant.upsert(config.qdrant.jobsCollection, {
    wait: true,
    points: [{ id: pointId, vector, payload }],
  });
}

export async function searchJobs(
  vector: number[],
  k = 20,
  filter?: JobSearchFilter,
): Promise<Array<{ id: string; score: number; payload: JobMetadata & { quality?: number; quality_breakdown?: QualityBreakdown["components"] } }>> {
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
  const fetchK = needsPostFilter ? Math.min(200, k * 5) : k;

  const res = await qdrant.search(config.qdrant.jobsCollection, {
    vector,
    limit: fetchK,
    with_payload: true,
    filter: { must_not, ...(must.length ? { must } : {}) },
  });

  const wantLevels = new Set<Level>(filter?.experience_level ?? []);
  const wantCountries = new Set<string>(filter?.country ?? []);
  const wantLocation = filter?.location?.toLowerCase().trim() ?? "";
  const wantCompany = filter?.company?.toLowerCase().trim() ?? "";

  const out: Array<{ id: string; score: number; payload: JobMetadata }> = [];
  for (const p of res) {
    const payload = p.payload as StoredJobPayload;
    // Re-classify on read. The stored payload was written by whatever
    // classifier was current at ingest time, which for the bulk of the index
    // pre-dates the location/seniority audit fixes (e.g. it tagged
    // "San Francisco, CA" as country=CA / Canada). Trust the live classifier;
    // fall back to stored country only when the classifier can't resolve it.
    const level: Level = classifyTitle(payload.title);
    const country = classifyCountry(payload.location) ?? payload.country ?? undefined;

    if (wantLevels.size > 0 && !wantLevels.has(level)) continue;
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

    const enriched: JobMetadata = {
      ...payload,
      experience_level: level,
      ...(country ? { country } : {}),
    };
    const quality = qualityBreakdown(enriched);
    out.push({
      id: payload.external_id ?? String(p.id),
      score: p.score,
      payload: { ...enriched, quality: quality.total, quality_breakdown: quality.components },
    });
    if (out.length >= k) break;
  }
  return out;
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
  const enriched: JobMetadata = {
    ...payload,
    experience_level: classifyTitle(payload.title),
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
