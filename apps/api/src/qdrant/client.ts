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
export type SalaryPeriod = "annual" | "monthly" | "weekly" | "daily" | "hourly";

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
    ...(must.length ? { filter: { must } } : {}),
  });

  const wantLevels = new Set<Level>(filter?.experience_level ?? []);
  const wantCountries = new Set<string>(filter?.country ?? []);
  const wantLocation = filter?.location?.toLowerCase().trim() ?? "";
  const wantCompany = filter?.company?.toLowerCase().trim() ?? "";

  const out: Array<{ id: string; score: number; payload: JobMetadata }> = [];
  for (const p of res) {
    const payload = p.payload as StoredJobPayload;
    const level: Level = payload.experience_level ?? classifyTitle(payload.title);
    const country = payload.country ?? classifyCountry(payload.location) ?? undefined;

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
      // numeric filter is set; that's the desired behavior — if the user
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
  const country = payload.country ?? classifyCountry(payload.location) ?? undefined;
  const enriched: JobMetadata = {
    ...payload,
    experience_level: payload.experience_level ?? classifyTitle(payload.title),
    ...(country ? { country } : {}),
  };
  const quality = qualityBreakdown(enriched);
  return { ...enriched, quality: quality.total, quality_breakdown: quality.components };
}

export async function isReachable(): Promise<boolean> {
  try {
    await qdrant.getCollections();
    return true;
  } catch {
    return false;
  }
}
