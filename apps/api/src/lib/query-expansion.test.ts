import { describe, expect, test } from "bun:test";
import { expandQuery, expansionFor } from "./query-expansion";

describe("query-expansion", () => {
  test("returns null for unknown queries", () => {
    expect(expandQuery("xyz quantum widgets")).toBeNull();
    expect(expandQuery("")).toBeNull();
  });

  test("expands the canonical new-grad family", () => {
    for (const q of ["new grad", "New Grad", "newgrad", "graduate", "entry level", "entry-level"]) {
      const e = expandQuery(q);
      expect(e).not.toBeNull();
      // Every expansion in this family should pull in junior/grad signals
      // so the embedder lands near both buckets.
      expect(e!.embedText.toLowerCase()).toMatch(/(junior|entry level|new grad|graduate)/);
      expect(e!.keywords.length).toBeGreaterThan(0);
    }
  });

  test("expands software/dev/eng terms", () => {
    expect(expandQuery("software")?.embedText.toLowerCase()).toContain("engineer");
    expect(expandQuery("backend")?.embedText.toLowerCase()).toContain("server");
    expect(expandQuery("ml")?.embedText.toLowerCase()).toContain("machine learning");
  });

  test("matches substrings inside longer queries", () => {
    // User types "find new grad jobs" - we still want the new-grad expansion.
    const e = expandQuery("find new grad jobs");
    expect(e).not.toBeNull();
    expect(e!.embedText.toLowerCase()).toContain("graduate");
  });

  test("prefers the longest matching key", () => {
    // "machine learning" should win over a bare "ml" substring.
    const a = expandQuery("machine learning");
    const b = expandQuery("ml");
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    // Both expand, but the canonical text for the long key mentions
    // machine learning explicitly first.
    expect(a!.embedText.toLowerCase().startsWith("machine learning")).toBe(true);
  });

  test("expansionFor falls through for unknown queries", () => {
    const r = expansionFor("xyz quantum widgets");
    expect(r.embedText).toBe("xyz quantum widgets");
    expect(r.keywords).toEqual(["xyz quantum widgets"]);
  });

  test("expansionFor returns dictionary entry for known queries", () => {
    const r = expansionFor("new grad");
    expect(r.embedText).not.toBe("new grad");
    expect(r.keywords).toContain("new grad");
  });
});

describe("query-expansion - industry-aware (Phase 1B)", () => {
  test("'new grad nurse' resolves to healthcare bank, not tech", () => {
    // The Phase-1A industry classifier sees "nurse" in the query and flips
    // the bank to healthcare. The healthcare 'new grad' expansion mentions
    // nursing keywords, not software engineering.
    const r = expandQuery("new grad nurse");
    expect(r).not.toBeNull();
    expect(r!.embedText.toLowerCase()).toContain("nurse");
    expect(r!.embedText.toLowerCase()).not.toContain("software engineer");
  });

  test("'new grad' alone defaults to tech (legacy behaviour preserved)", () => {
    // No industry hint in the query, classifyIndustry returns "tech" because
    // 'new grad' alone doesn't trigger any non-tech industry rule. Old
    // behaviour stays intact for legacy callers.
    const r = expandQuery("new grad");
    expect(r).not.toBeNull();
    expect(r!.embedText.toLowerCase()).toContain("software engineer");
  });

  test("explicit industry hint overrides query-content inference", () => {
    const r = expandQuery("new grad", "healthcare");
    expect(r).not.toBeNull();
    expect(r!.embedText.toLowerCase()).toContain("nurse");
  });

  test("common-bank fallback: 'senior' alone returns a generic level expansion", () => {
    // The COMMON bank carries level-only terms that apply across industries.
    const r = expandQuery("senior");
    expect(r).not.toBeNull();
    expect(r!.embedText.toLowerCase()).toMatch(/senior|staff|principal/);
  });

  test("retail terms surface retail-context expansion", () => {
    const r = expandQuery("cashier");
    expect(r).not.toBeNull();
    expect(r!.embedText.toLowerCase()).toContain("retail");
  });

  test("government terms surface government-context expansion", () => {
    const r = expandQuery("police officer");
    expect(r).not.toBeNull();
    expect(r!.embedText.toLowerCase()).toMatch(/law\s+enforcement|patrol/);
  });
});
