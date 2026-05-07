import { describe, expect, test } from "bun:test";
import { ALL_LEVELS, classifyTitle, levelsAtOrBelow } from "./seniority";

describe("classifyTitle", () => {
  const cases: Array<[string, ReturnType<typeof classifyTitle>]> = [
    ["Software Engineer", "mid"],
    ["Senior Software Engineer", "senior"],
    ["Sr. Software Engineer", "senior"],
    ["Lead Backend Engineer", "senior"],
    ["Staff Software Engineer", "staff"],
    ["Principal Engineer", "principal"],
    ["Distinguished Engineer", "principal"],
    ["Junior Developer", "junior"],
    ["Jr Backend Developer", "junior"],
    ["Associate Software Engineer", "junior"],
    ["Entry-level QA Analyst", "junior"],
    ["New Grad Software Engineer", "junior"],
    ["Software Engineering Intern", "intern"],
    ["Summer 2026 Intern, Backend", "intern"],
    ["Engineering Manager", "manager"],
    ["Director of Engineering", "director"],
    ["VP of Engineering", "executive"],
    ["Vice President, Platform", "executive"],
    ["Head of Infrastructure", "executive"],
    ["Chief Technology Officer", "executive"],
  ];

  for (const [title, expected] of cases) {
    test(`"${title}" → ${expected}`, () => {
      expect(classifyTitle(title)).toBe(expected);
    });
  }

  test("unrecognised title defaults to mid", () => {
    expect(classifyTitle("Backend Engineer")).toBe("mid");
  });

  test("empty title defaults to mid", () => {
    expect(classifyTitle("")).toBe("mid");
  });

  test("director takes precedence over senior keyword", () => {
    expect(classifyTitle("Senior Director, Platform")).toBe("director");
  });

  test("manager takes precedence over senior keyword", () => {
    expect(classifyTitle("Senior Engineering Manager")).toBe("manager");
  });
});

describe("levelsAtOrBelow", () => {
  test("senior includes mid + junior + intern", () => {
    expect(levelsAtOrBelow("senior")).toEqual(["intern", "junior", "mid", "senior"]);
  });

  test("intern includes only intern", () => {
    expect(levelsAtOrBelow("intern")).toEqual(["intern"]);
  });

  test("staff includes through staff", () => {
    expect(levelsAtOrBelow("staff")).toEqual(["intern", "junior", "mid", "senior", "staff"]);
  });

  test("manager (off-IC-track) returns just itself", () => {
    expect(levelsAtOrBelow("manager")).toEqual(["manager"]);
  });
});

describe("ALL_LEVELS", () => {
  test("contains all 9 known levels", () => {
    expect(ALL_LEVELS).toHaveLength(9);
    expect(new Set(ALL_LEVELS).size).toBe(9); // no dupes
  });
});
