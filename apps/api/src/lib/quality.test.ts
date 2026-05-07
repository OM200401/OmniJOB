import { describe, expect, test } from "bun:test";
import { qualityBreakdown } from "./quality";
import type { JobMetadata } from "../qdrant/client";

const baseJob: JobMetadata = {
  title: "Software Engineer",
  company: "Acme",
  location: "Remote",
  source: "greenhouse",
  source_url: "https://example.com/job",
  scraped_at: Date.now(),
  description: "x".repeat(800),
  salary_min: 100_000,
  salary_max: 150_000,
};

describe("qualityBreakdown - components", () => {
  test("total is in [0, 1]", () => {
    const q = qualityBreakdown(baseJob);
    expect(q.total).toBeGreaterThanOrEqual(0);
    expect(q.total).toBeLessThanOrEqual(1);
  });

  test("salary_disclosed is 1 when salary_max present", () => {
    expect(qualityBreakdown(baseJob).components.salary_disclosed).toBe(1);
  });

  test("salary_disclosed is 0 when salary_max missing", () => {
    const { salary_max: _omit, ...j } = baseJob;
    expect(qualityBreakdown(j).components.salary_disclosed).toBe(0);
  });

  test("freshness ~1 for just-scraped jobs", () => {
    const q = qualityBreakdown({ ...baseJob, scraped_at: Date.now() });
    expect(q.components.freshness).toBeGreaterThanOrEqual(0.99);
  });

  test("freshness ~0 for 60+ day old jobs", () => {
    const old = Date.now() - 70 * 86_400_000;
    expect(qualityBreakdown({ ...baseJob, scraped_at: old }).components.freshness).toBe(0);
  });

  test("freshness ramps linearly between 0 and 60 days", () => {
    const half = Date.now() - 30 * 86_400_000;
    const f = qualityBreakdown({ ...baseJob, scraped_at: half }).components.freshness;
    expect(f).toBeGreaterThan(0.4);
    expect(f).toBeLessThan(0.6);
  });

  test("description_length sigmoid: 0 chars → ~0.27 (sigmoid(-1))", () => {
    const q = qualityBreakdown({ ...baseJob, description: "" });
    expect(q.components.description_length).toBeGreaterThan(0.2);
    expect(q.components.description_length).toBeLessThan(0.35);
  });

  test("description_length sigmoid: 1500 chars → ~0.94 (sigmoid(2.75))", () => {
    const q = qualityBreakdown({ ...baseJob, description: "x".repeat(1500) });
    expect(q.components.description_length).toBeGreaterThan(0.9);
  });

  test("known sources get 1.0 reliability", () => {
    for (const s of ["greenhouse", "lever", "ashby"]) {
      const q = qualityBreakdown({ ...baseJob, source: s });
      expect(q.components.source_reliability).toBe(1);
    }
  });

  test("aggregator sources get 0.85", () => {
    for (const s of ["smartrecruiters", "recruitee"]) {
      const q = qualityBreakdown({ ...baseJob, source: s });
      expect(q.components.source_reliability).toBe(0.85);
    }
  });

  test("unknown source falls back to 0.7", () => {
    const q = qualityBreakdown({ ...baseJob, source: "linkedin-scraped" });
    expect(q.components.source_reliability).toBe(0.7);
  });
});

describe("qualityBreakdown - totals", () => {
  test("perfect job (recent, salaried, long description, top source) approaches 1", () => {
    const q = qualityBreakdown({
      ...baseJob,
      scraped_at: Date.now(),
      description: "x".repeat(2000),
      source: "greenhouse",
    });
    expect(q.total).toBeGreaterThan(0.85);
  });

  test("worst-case job (no salary, stale, no description, sketchy source) is low", () => {
    const { salary_max: _omit, ...rest } = baseJob;
    const q = qualityBreakdown({
      ...rest,
      scraped_at: Date.now() - 90 * 86_400_000,
      description: "",
      source: "scraped-site",
    });
    expect(q.total).toBeLessThan(0.3);
  });

  test("weights sum to 1.0", () => {
    const q = qualityBreakdown(baseJob);
    const w = q.weights;
    const sum = w.salary_disclosed + w.freshness + w.description_length + w.source_reliability;
    expect(sum).toBeCloseTo(1.0, 5);
  });
});
