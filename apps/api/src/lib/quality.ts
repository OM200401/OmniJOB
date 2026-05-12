import type { JobMetadata } from "../qdrant/client";
import type { Industry } from "./industry";

// Per-job quality is computed at read time (not persisted) - cheap and lets
// us tune the formula without re-ingesting. Total ∈ [0, 1].
//
// The components are deliberately interpretable so the JobDetail page can
// show "Why this score": salary disclosure, freshness, description depth,
// source reliability.
//
// Phase 1B change: weights are now per-industry. Tech weights match the
// pre-1B values so existing rankings are unchanged. Retail / food service /
// trades de-emphasize `salary_disclosed` because salary disclosure is rare
// even on legitimate postings in those verticals - penalizing them on this
// axis would unfairly downrank the whole vertical against tech baselines.

const SOURCE_RELIABILITY: Record<string, number> = {
  // Direct ATS APIs we hit unauthenticated; data quality is high.
  greenhouse: 1.0,
  lever: 1.0,
  ashby: 1.0,
  workday: 0.95,
  // Aggregators or partial APIs - slightly lower trust.
  smartrecruiters: 0.85,
  recruitee: 0.85,
  workable: 0.8,
  // Government and public-sector feeds. Schema is clean but the postings
  // sometimes lag the canonical board by 24-48 hours.
  usajobs: 0.95,
  jobbank_canada: 0.95,
};

export type QualityWeights = {
  salary_disclosed: number;
  freshness: number;
  description_length: number;
  source_reliability: number;
};

// Per-industry weights. Each row sums to 1.0. The tech defaults preserve the
// pre-1B values so existing tests/expectations keep working. The retail /
// food_service / trades rows shift weight away from salary_disclosed because
// hourly postings in those verticals rarely include a salary range even when
// the rest of the listing is high-quality.
const WEIGHTS_BY_INDUSTRY: Record<Industry, QualityWeights> = {
  tech:         { salary_disclosed: 0.30, freshness: 0.30, description_length: 0.25, source_reliability: 0.15 },
  healthcare:   { salary_disclosed: 0.20, freshness: 0.30, description_length: 0.30, source_reliability: 0.20 },
  retail:       { salary_disclosed: 0.05, freshness: 0.35, description_length: 0.40, source_reliability: 0.20 },
  food_service: { salary_disclosed: 0.05, freshness: 0.35, description_length: 0.40, source_reliability: 0.20 },
  trades:       { salary_disclosed: 0.10, freshness: 0.30, description_length: 0.35, source_reliability: 0.25 },
  government:   { salary_disclosed: 0.25, freshness: 0.25, description_length: 0.25, source_reliability: 0.25 },
  education:    { salary_disclosed: 0.20, freshness: 0.30, description_length: 0.30, source_reliability: 0.20 },
  finance:      { salary_disclosed: 0.30, freshness: 0.30, description_length: 0.25, source_reliability: 0.15 },
  manufacturing:{ salary_disclosed: 0.15, freshness: 0.30, description_length: 0.35, source_reliability: 0.20 },
  logistics:    { salary_disclosed: 0.15, freshness: 0.35, description_length: 0.30, source_reliability: 0.20 },
  legal:        { salary_disclosed: 0.30, freshness: 0.30, description_length: 0.25, source_reliability: 0.15 },
  nonprofit:    { salary_disclosed: 0.10, freshness: 0.30, description_length: 0.40, source_reliability: 0.20 },
  media:        { salary_disclosed: 0.15, freshness: 0.35, description_length: 0.30, source_reliability: 0.20 },
  science:      { salary_disclosed: 0.20, freshness: 0.30, description_length: 0.30, source_reliability: 0.20 },
  other:        { salary_disclosed: 0.15, freshness: 0.30, description_length: 0.35, source_reliability: 0.20 },
};

const DEFAULT_WEIGHTS = WEIGHTS_BY_INDUSTRY.tech;

function weightsFor(industry: Industry | undefined): QualityWeights {
  if (!industry) return DEFAULT_WEIGHTS;
  return WEIGHTS_BY_INDUSTRY[industry] ?? DEFAULT_WEIGHTS;
}

export type QualityBreakdown = {
  total: number;
  components: {
    salary_disclosed: number;
    freshness: number;
    description_length: number;
    source_reliability: number;
  };
  weights: QualityWeights;
};

export function qualityBreakdown(meta: JobMetadata): QualityBreakdown {
  // 1. Salary disclosed - a literal yes/no signal.
  const salary_disclosed = meta.salary_max && meta.salary_max > 0 ? 1.0 : 0.0;

  // 2. Freshness - linear ramp from 1 at 0 days old to 0 at 60+ days,
  //    based on scraped_at (last-verified-live in source).
  const ts = meta.scraped_at ?? meta.posted_at;
  const days = ts ? (Date.now() - ts) / 86_400_000 : 999;
  const freshness = clamp01(1 - days / 60);

  // 3. Description length - sigmoid; ~0.5 at 400 chars, ~0.9 at 1200 chars.
  const len = meta.description?.length ?? 0;
  const description_length = sigmoid((len - 400) / 400);

  // 4. Source reliability - table lookup with a conservative fallback.
  const source_reliability = SOURCE_RELIABILITY[meta.source ?? ""] ?? 0.7;

  const weights = weightsFor(meta.industry);
  const total =
    weights.salary_disclosed * salary_disclosed +
    weights.freshness * freshness +
    weights.description_length * description_length +
    weights.source_reliability * source_reliability;

  return {
    total: round2(total),
    components: {
      salary_disclosed: round2(salary_disclosed),
      freshness: round2(freshness),
      description_length: round2(description_length),
      source_reliability: round2(source_reliability),
    },
    weights,
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
