import { describe, expect, test } from "bun:test";
import { salaryOverlapsUSD, toUSDAnnual } from "./salary";

describe("toUSDAnnual", () => {
  test("USD annual is identity", () => {
    expect(toUSDAnnual(100_000, "USD", "annual")).toBe(100_000);
  });

  test("hourly USD scales by 2080", () => {
    expect(toUSDAnnual(50, "USD", "hourly")).toBe(104_000);
  });

  test("monthly USD scales by 12", () => {
    expect(toUSDAnnual(10_000, "USD", "monthly")).toBe(120_000);
  });

  test("EUR converts at 1.08", () => {
    expect(toUSDAnnual(100_000, "EUR", "annual")).toBe(108_000);
  });

  test("INR annual converts at 0.012", () => {
    expect(toUSDAnnual(8_000_000, "INR", "annual")).toBe(96_000);
  });

  test("missing currency defaults to USD identity", () => {
    expect(toUSDAnnual(100_000, undefined, "annual")).toBe(100_000);
  });

  test("missing period defaults to annual", () => {
    expect(toUSDAnnual(100_000, "USD", undefined)).toBe(100_000);
  });

  test("unknown currency falls back to 1x", () => {
    expect(toUSDAnnual(100_000, "ZZZ", "annual")).toBe(100_000);
  });

  test("case-insensitive currency lookup", () => {
    expect(toUSDAnnual(100_000, "eur", "annual")).toBe(108_000);
  });
});

describe("salaryOverlapsUSD", () => {
  test("returns true when no filters set", () => {
    expect(salaryOverlapsUSD(100_000, 150_000, "USD", "annual", undefined, undefined)).toBe(true);
  });

  test("returns false when job has no salary and a filter is set", () => {
    expect(salaryOverlapsUSD(undefined, undefined, undefined, undefined, 80_000, undefined)).toBe(false);
  });

  test("returns true when job range overlaps min filter", () => {
    expect(salaryOverlapsUSD(80_000, 120_000, "USD", "annual", 100_000, undefined)).toBe(true);
  });

  test("returns false when job max is below min filter", () => {
    expect(salaryOverlapsUSD(50_000, 70_000, "USD", "annual", 100_000, undefined)).toBe(false);
  });

  test("returns false when job min exceeds max filter", () => {
    expect(salaryOverlapsUSD(200_000, 250_000, "USD", "annual", undefined, 150_000)).toBe(false);
  });

  test("currency-converted ranges still overlap", () => {
    // €100k–€140k ≈ $108k–$151k; should overlap a $120k+ filter.
    expect(salaryOverlapsUSD(100_000, 140_000, "EUR", "annual", 120_000, undefined)).toBe(true);
  });

  test("hourly-period jobs annualised before compare", () => {
    // $80/hr ≈ $166k annual; should pass a $150k+ filter.
    expect(salaryOverlapsUSD(60, 80, "USD", "hourly", 150_000, undefined)).toBe(true);
  });

  test("uses jobMax as jobMin when jobMin missing", () => {
    expect(salaryOverlapsUSD(undefined, 100_000, "USD", "annual", 80_000, undefined)).toBe(true);
  });
});
