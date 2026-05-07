import type { JobMetadata } from "../qdrant/client";

// Per-job quality is computed at read time (not persisted) — cheap and lets
// us tune the formula without re-ingesting. Total ∈ [0, 1].
//
// The components are deliberately interpretable so the JobDetail page can
// show "Why this score": salary disclosure, freshness, description depth,
// source reliability.

const SOURCE_RELIABILITY: Record<string, number> = {
  // Direct ATS APIs we hit unauthenticated; data quality is high.
  greenhouse: 1.0,
  lever: 1.0,
  ashby: 1.0,
  // Aggregators or partial APIs — slightly lower trust.
  smartrecruiters: 0.85,
  recruitee: 0.85,
  workable: 0.8,
};

const WEIGHTS = {
  salary_disclosed: 0.30,
  freshness: 0.30,
  description_length: 0.25,
  source_reliability: 0.15,
} as const;

export type QualityBreakdown = {
  total: number;
  components: {
    salary_disclosed: number;
    freshness: number;
    description_length: number;
    source_reliability: number;
  };
  weights: typeof WEIGHTS;
};

export function qualityBreakdown(meta: JobMetadata): QualityBreakdown {
  // 1. Salary disclosed — a literal yes/no signal.
  const salary_disclosed = meta.salary_max && meta.salary_max > 0 ? 1.0 : 0.0;

  // 2. Freshness — linear ramp from 1 at 0 days old to 0 at 60+ days,
  //    based on scraped_at (last-verified-live in source).
  const ts = meta.scraped_at ?? meta.posted_at;
  const days = ts ? (Date.now() - ts) / 86_400_000 : 999;
  const freshness = clamp01(1 - days / 60);

  // 3. Description length — sigmoid; ~0.5 at 400 chars, ~0.9 at 1200 chars.
  const len = meta.description?.length ?? 0;
  const description_length = sigmoid((len - 400) / 400);

  // 4. Source reliability — table lookup with a conservative fallback.
  const source_reliability = SOURCE_RELIABILITY[meta.source ?? ""] ?? 0.7;

  const total =
    WEIGHTS.salary_disclosed * salary_disclosed +
    WEIGHTS.freshness * freshness +
    WEIGHTS.description_length * description_length +
    WEIGHTS.source_reliability * source_reliability;

  return {
    total: round2(total),
    components: {
      salary_disclosed: round2(salary_disclosed),
      freshness: round2(freshness),
      description_length: round2(description_length),
      source_reliability: round2(source_reliability),
    },
    weights: WEIGHTS,
  };
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}
