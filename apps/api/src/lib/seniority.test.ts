import { describe, expect, test } from "bun:test";
import {
  ALL_LEVELS,
  classifyBody,
  classifyTitle,
  classifyTitleOrBody,
  levelsAtOrBelow,
} from "./seniority";

describe("classifyTitle", () => {
  const cases: Array<[string, ReturnType<typeof classifyTitle>]> = [
    // Bare "Software Engineer" matches no rule in any bank - now returns null
    // (Phase 1B). The pre-1B classifier defaulted to mid; that masked the
    // "we don't know" case behind a false-positive mid bucket.
    ["Software Engineer", null],
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

  // Phase 1B: classifier returns null instead of defaulting to mid. The
  // pre-1B default forced every unrecognized title into the mid bucket,
  // which inflated mid across non-tech industries and made level-filter
  // results meaningless for confidently-ranked queries.
  test("unrecognised title returns null", () => {
    expect(classifyTitle("Backend Engineer")).toBeNull();
  });

  test("empty title returns null", () => {
    expect(classifyTitle("")).toBeNull();
  });

  test("director takes precedence over senior keyword", () => {
    expect(classifyTitle("Senior Director, Platform")).toBe("director");
  });

  test("manager takes precedence over senior keyword", () => {
    expect(classifyTitle("Senior Engineering Manager")).toBe("manager");
  });
});

describe("classifyTitle - new-grad / early-career patterns", () => {
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

describe("classifyTitle - Engineer I / II / III / IV / V (roman + arabic)", () => {
  // "Engineer I" = junior; "II" = unranked (null); "III" = senior; "IV"/"V" = staff.
  // Phase 1B: II and arabic 2/4/5 now return null because no rule matches them
  // explicitly. The pre-1B behavior fell through to a mid default; the new
  // contract is "unranked means we don't know, hide from level filters".
  const cases: Array<[string, ReturnType<typeof classifyTitle>]> = [
    ["Software Engineer I", "junior"],
    ["Software Engineer 1", "junior"],
    ["Software Engineer II", null],
    ["Software Engineer III", "senior"],
    ["Reliability Engineer III", "senior"],
    ["Engineer IV", "staff"],
    ["Engineer V", "staff"],
    ["Engineer 2, Data Engineering", null],
    ["Engineer 4, Software Development", null],
    ["Engineer 5, Platform", null],
    ["Senior Software Engineer II, ML/AI Platform", "senior"],
    ["Principal Java Engineer II - ML", "principal"],
  ];
  for (const [title, expected] of cases) {
    test(`"${title}" → ${expected}`, () => {
      expect(classifyTitle(title)).toBe(expected);
    });
  }
});

describe("classifyTitle - industry-aware (Phase 1B)", () => {
  test("'Charge Nurse' classifies as staff under healthcare bank", () => {
    expect(classifyTitle("Charge Nurse", "healthcare")).toBe("staff");
  });
  test("'New Grad RN' classifies as junior under healthcare bank", () => {
    expect(classifyTitle("New Grad RN", "healthcare")).toBe("junior");
  });
  test("'Attending Physician' classifies as principal under healthcare bank", () => {
    expect(classifyTitle("Attending Physician", "healthcare")).toBe("principal");
  });
  test("'Master Electrician' classifies as principal under trades bank", () => {
    expect(classifyTitle("Master Electrician", "trades")).toBe("principal");
  });
  test("'Apprentice Plumber' classifies as junior under trades bank", () => {
    expect(classifyTitle("Apprentice Plumber", "trades")).toBe("junior");
  });
  test("'Shift Supervisor' classifies as manager (common rules) regardless of industry", () => {
    // Supervisor is in COMMON so it wins before any industry bank.
    expect(classifyTitle("Shift Supervisor", "retail")).toBe("manager");
  });
  test("'Sales Associate' classifies as junior under retail bank", () => {
    expect(classifyTitle("Sales Associate", "retail")).toBe("junior");
  });
  test("'GS-13 Analyst' classifies as senior under government bank", () => {
    expect(classifyTitle("GS-13 Analyst", "government")).toBe("senior");
  });
  test("'Associate Professor' classifies as senior under education bank", () => {
    expect(classifyTitle("Associate Professor", "education")).toBe("senior");
  });
  test("known industry falls back to tech for ambiguous titles", () => {
    // "Senior Engineer" is not in HEALTHCARE_RULES but matches TECH senior.
    expect(classifyTitle("Senior Engineer", "healthcare")).toBe("senior");
  });
});

describe("classifyTitle - Senior/Staff/Principal Associate disambiguation", () => {
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

describe("classifyTitle - Founding roles", () => {
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

describe("classifyBody - junior signals", () => {
  const cases: Array<[string, ReturnType<typeof classifyBody>]> = [
    ["We're hiring new grads for our summer cohort.", "junior"],
    ["This is an entry-level role on the platform team.", "junior"],
    ["Looking for someone early in their career.", "junior"],
    ["Recent graduates are encouraged to apply.", "junior"],
    ["You'll have 0-2 years of professional experience.", "junior"],
    ["Requirements: 1-3 years of software experience.", "junior"],
    ["Minimum 1 year of relevant experience required.", "junior"],
    ["No prior experience required for this role.", "junior"],
    ["Graduating in 2026? Apply now.", "junior"],
    ["Class of 2026 cohort", "junior"],
  ];
  for (const [text, expected] of cases) {
    test(`"${text.slice(0, 40)}…" → ${expected}`, () => {
      expect(classifyBody(text)).toBe(expected);
    });
  }
});

describe("classifyBody - senior signals", () => {
  const cases: Array<[string, ReturnType<typeof classifyBody>]> = [
    ["You'll have 7+ years of software engineering experience.", "senior"],
    ["Minimum 10 years of professional experience.", "senior"],
    ["Requires 8+ years of relevant experience.", "senior"],
    ["10+ years of industry experience preferred.", "senior"],
  ];
  for (const [text, expected] of cases) {
    test(`"${text.slice(0, 40)}…" → ${expected}`, () => {
      expect(classifyBody(text)).toBe(expected);
    });
  }
});

describe("classifyBody - mid signals", () => {
  const cases: Array<[string, ReturnType<typeof classifyBody>]> = [
    ["3-5 years of software engineering experience.", "mid"],
    ["Minimum of 4 years professional experience.", "mid"],
    ["5+ years of relevant experience required.", "mid"],
    ["4-6 years of industry experience.", "mid"],
  ];
  for (const [text, expected] of cases) {
    test(`"${text.slice(0, 40)}…" → ${expected}`, () => {
      expect(classifyBody(text)).toBe(expected);
    });
  }
});

describe("classifyBody - false-positive guards", () => {
  // Critical: these passages contain year-count phrases but they describe
  // company history / team size / arbitrary numbers, NOT a YOE requirement.
  // The classifier must NOT pick a level for these.
  const negatives = [
    "Amazon has 25 years of experience serving customers worldwide.",
    "Our team of 10 engineers is growing.",
    "We've been in business for 15 years.",
    "The product was launched 3 years ago.",
    "Headquartered in Seattle since 1994 (over 30 years).",
    "We've shipped 5 major releases this year.",
    "The CEO has 25 years in the industry.",
    "Marketing budget grew 7+ years running.",
  ];
  for (const text of negatives) {
    test(`"${text.slice(0, 40)}…" → null`, () => {
      expect(classifyBody(text)).toBeNull();
    });
  }
});

describe("classifyBody - empty / null inputs", () => {
  test("undefined description → null", () => {
    expect(classifyBody(undefined)).toBeNull();
  });
  test("empty description → null", () => {
    expect(classifyBody("")).toBeNull();
  });
});

describe("classifyBody - first signal in body wins", () => {
  // A "Senior" posting commonly mentions both the senior YOE requirement
  // (Requirements section, near top) AND mentees / juniors (later, in the
  // "what you'll do" section). Earliest-match wins is the correct policy.
  test("senior YOE before mentee mention → senior", () => {
    const body = `
      Requirements: 8+ years of software engineering experience.
      You'll mentor engineers with 1-2 years of experience.
    `;
    expect(classifyBody(body)).toBe("senior");
  });
  test("new-grad signal before senior buzzword → junior", () => {
    const body = `
      New grad role - join our 2026 cohort.
      You'll work with senior engineers on production systems.
    `;
    expect(classifyBody(body)).toBe("junior");
  });
});

describe("classifyTitleOrBody - title-first, body-fallback", () => {
  test("explicit title beats body signal", () => {
    // "Senior" title wins over "0-2 years" body mention (mentee section).
    expect(
      classifyTitleOrBody(
        "Senior Software Engineer",
        "You'll mentor engineers with 0-2 years of professional experience.",
      ),
    ).toBe("senior");
  });

  test("null title falls through to body classifier", () => {
    expect(
      classifyTitleOrBody(
        "Software Engineer",
        "Looking for new grads. 0-2 years of software experience preferred.",
      ),
    ).toBe("junior");
  });

  test("null title + null body → null", () => {
    expect(classifyTitleOrBody("Software Engineer", "Build great products.")).toBeNull();
  });

  test("Amazon-style 'Software Engineer' with new-grad body → junior", () => {
    // The user's motivating example: a generic Amazon-style "Software
    // Engineer" title with new-grad language in the body should now
    // classify as junior so the level filter surfaces it.
    expect(
      classifyTitleOrBody(
        "Software Engineer",
        "Software Engineer, Amazon. We're hiring recent graduates with 0-2 years of professional software experience.",
      ),
    ).toBe("junior");
  });
});
