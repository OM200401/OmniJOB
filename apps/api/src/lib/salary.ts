// Currency / period normalization for salary filtering. Rates are static
// and approximate - fine for "is this $120k+" filtering, not for accounting.
// Refresh annually if the product depends on tighter precision.

const FX_TO_USD: Record<string, number> = {
  USD: 1.0,
  CAD: 0.74,
  AUD: 0.66,
  NZD: 0.62,
  SGD: 0.74,
  EUR: 1.08,
  GBP: 1.26,
  CHF: 1.1,
  SEK: 0.094,
  NOK: 0.094,
  DKK: 0.145,
  PLN: 0.25,
  INR: 0.012,
  JPY: 0.0066,
  CNY: 0.14,
  HKD: 0.128,
  ILS: 0.27,
  AED: 0.272,
  ZAR: 0.054,
  BRL: 0.20,
  MXN: 0.058,
};

// Adapter-emitted aliases all map to the same multiplier so we don't need
// to normalize at the call site.
const PERIOD_TO_ANNUAL: Record<string, number> = {
  annual: 1,
  year: 1,
  yearly: 1,
  monthly: 12,
  month: 12,
  weekly: 52,
  week: 52,
  biweek: 26,
  biweekly: 26,
  daily: 260,
  day: 260,
  hourly: 2080,
  hour: 2080,
};

export type Salary = {
  min: number;
  max: number;
  currency: string;
  period: string;
};

export function toUSDAnnual(
  amount: number,
  currency: string | undefined,
  period: string | undefined,
): number {
  const fx = FX_TO_USD[(currency ?? "USD").toUpperCase()] ?? 1;
  const p = PERIOD_TO_ANNUAL[period ?? "annual"] ?? 1;
  return Math.round(amount * p * fx);
}

// Range overlap test: does this job's salary range intersect [min, max]?
// Either bound on the filter may be undefined (open-ended).
export function salaryOverlapsUSD(
  jobMin: number | undefined,
  jobMax: number | undefined,
  jobCurrency: string | undefined,
  jobPeriod: string | undefined,
  filterMinUSD: number | undefined,
  filterMaxUSD: number | undefined,
): boolean {
  if (filterMinUSD === undefined && filterMaxUSD === undefined) return true;
  if (!jobMax) return false; // job has no salary; can't overlap any constraint
  const jMin = toUSDAnnual(jobMin ?? jobMax, jobCurrency, jobPeriod);
  const jMax = toUSDAnnual(jobMax, jobCurrency, jobPeriod);
  if (filterMinUSD !== undefined && jMax < filterMinUSD) return false;
  if (filterMaxUSD !== undefined && jMin > filterMaxUSD) return false;
  return true;
}
