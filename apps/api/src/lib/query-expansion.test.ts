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
