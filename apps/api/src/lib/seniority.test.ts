import { describe, expect, test } from "bun:test";
import { ALL_LEVELS, classifyTitle, levelsAtOrBelow } from "./seniority";

describe("classifyTitle", () => {
  const cases: Array<[string, ReturnType<typeof classifyTitle>]> = [
    ["Software Engineer", "mid"],
    ["Senior Software Engineer", "senior"],
    ["Sr. Software Engineer", "senior"],
    ["Lead Backend Engineer", "senior"],
    ["Tech Lead", "senior"],
    ["Technical Lead, Backend", "senior"],
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
    ["Co-op, Software Engineering", "intern"],
    ["Engineering Manager", "manager"],
    ["Director of Engineering", "director"],
    ["VP of Engineering", "executive"],
    ["Vice President, Platform", "executive"],
    ["Head of Infrastructure", "executive"],
    ["Chief Technology Officer", "executive"],
    ["CTO", "executive"],
    ["CEO, Founder", "executive"],
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

describe("classifyTitle — new-grad / early-career patterns", () => {
  // Regression: previously titles with the new-grad signal *after* the
  // role keyword (e.g. "Software Engineer, New Grad") and other common
  // early-career markers were silently classified as mid.
  const cases: Array<[string, ReturnType<typeof classifyTitle>]> = [
    ["Software Engineer, New Grad", "junior"],
    ["Software Engineer - New Grad", "junior"],
    ["Newgrad Engineer", "junior"],
    ["New-Grad Software Engineer 2026", "junior"],
    ["Graduate Engineer", "junior"],
    ["Graduate Software Developer", "junior"],
    ["University Graduate, Engineering", "junior"],
    ["College Hire - Engineering", "junior"],
    ["University Hire, Software", "junior"],
    ["Early Career Engineer", "junior"],
    ["Early-Career Software Developer", "junior"],
    ["Trainee Engineer", "junior"],
    ["Apprentice Software Engineer", "junior"],
    ["Associate, Software Engineer, New Grad Card Expansion", "junior"],
  ];
  for (const [title, expected] of cases) {
    test(`"${title}" → ${expected}`, () => {
      expect(classifyTitle(title)).toBe(expected);
    });
  }
});

describe("classifyTitle — Engineer I / II / III / IV / V (roman + arabic)", () => {
  // "Engineer I" = junior; "II" = mid (default); "III" = senior; "IV"/"V" = staff.
  // For arabic numerals only "1" maps to junior — Engineer 4/5 at MSFT/Google
  // are senior+ so we deliberately leave them as the mid default.
  const cases: Array<[string, ReturnType<typeof classifyTitle>]> = [
    ["Software Engineer I", "junior"],
    ["Software Engineer 1", "junior"],
    ["Software Engineer II", "mid"],
    ["Software Engineer III", "senior"],
    ["Reliability Engineer III", "senior"],
    ["Engineer IV", "staff"],
    ["Engineer V", "staff"],
    ["Engineer 2, Data Engineering", "mid"],
    ["Engineer 4, Software Development", "mid"],
    ["Engineer 5, Platform", "mid"],
    ["Senior Software Engineer II, ML/AI Platform", "senior"],
    ["Principal Java Engineer II - ML", "principal"],
  ];
  for (const [title, expected] of cases) {
    test(`"${title}" → ${expected}`, () => {
      expect(classifyTitle(title)).toBe(expected);
    });
  }
});

describe("classifyTitle — Senior/Staff/Principal Associate disambiguation", () => {
  // Regression: previously "Senior Associate" classified as junior because
  // the junior rule fired before the senior rule.
  test('"Senior Associate, Payroll" → senior', () => {
    expect(classifyTitle("Senior Associate, Payroll")).toBe("senior");
  });
  test('"Sr. Associate, Account Management" → senior', () => {
    expect(classifyTitle("Sr. Associate, Account Management")).toBe("senior");
  });
  test('"Senior Associate, Brand Program Manager" → manager (manager wins over senior)', () => {
    expect(classifyTitle("Senior Associate, Brand Program Manager")).toBe("manager");
  });
  test('"Lead Associate, Risk" → senior (lead wins over associate)', () => {
    expect(classifyTitle("Lead Associate, Risk")).toBe("senior");
  });
  test('"Principal Associate, Cyber" → principal', () => {
    expect(classifyTitle("Principal Associate, Cyber")).toBe("principal");
  });
});

describe("classifyTitle — Founding roles", () => {
  test('"Founding Engineer" → senior', () => {
    expect(classifyTitle("Founding Engineer")).toBe("senior");
  });
  test('"Founding Backend Engineer" → senior', () => {
    expect(classifyTitle("Founding Backend Engineer")).toBe("senior");
  });
  test('"Founding Full Stack Engineer" → senior', () => {
    expect(classifyTitle("Founding Full Stack Engineer")).toBe("senior");
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
