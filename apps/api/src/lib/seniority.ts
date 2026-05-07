// Heuristic title → seniority classifier. Same logic is mirrored in the Go
// crawler so we can store experience_level on the payload at ingest time;
// this version is kept for backfill on points that predate that change.

export type Level =
  | "intern"
  | "junior"
  | "mid"
  | "senior"
  | "staff"
  | "principal"
  | "manager"
  | "director"
  | "executive";

export const ALL_LEVELS: Level[] = [
  "intern",
  "junior",
  "mid",
  "senior",
  "staff",
  "principal",
  "manager",
  "director",
  "executive",
];

// Rules are tried in order; first match wins. Order matters because many
// real-world titles combine multiple keywords (e.g. "Senior Associate" —
// senior beats junior; "Director of X" — director beats senior).
const RULES: Array<{ level: Level; patterns: RegExp[] }> = [
  // Off-IC management ladder first — keeps "VP" beating "Lead"/"Senior" in
  // titles like "Lead, Vice President".
  {
    level: "executive",
    patterns: [
      /\bchief\b/i,
      /\bvp\b/i,
      /\bv\.p\.\b/i,
      /\bsvp\b/i,
      /\bevp\b/i,
      /\bvice\s+president\b/i,
      /\bhead\s+of\b/i,
      /\bpresident\b/i,
      /\bcto\b/i,
      /\bceo\b/i,
      /\bcfo\b/i,
      /\bcoo\b/i,
      /\bcio\b/i,
      /\bciso\b/i,
      /\bcpo\b/i,
    ],
  },
  { level: "director", patterns: [/\bdirector\b/i] },
  { level: "manager", patterns: [/\bmanager\b/i, /\bmgr\b/i, /\bpeople\s+lead\b/i] },
  {
    level: "intern",
    patterns: [/\bintern(s|ship)?\b/i, /\bsummer\s+\d{4}\b/i, /\bco-?op\b/i],
  },

  // IC ladder: principal → staff → senior must precede junior so that
  // "Senior Associate", "Staff Associate", "Principal Engineer II" all
  // resolve to the higher rung instead of latching onto the junior keyword.
  { level: "principal", patterns: [/\bprincipal\b/i, /\bdistinguished\b/i, /\bfellow\b/i] },
  {
    level: "staff",
    patterns: [
      /\bstaff\b/i,
      // Roman-numeral IV / V at end of role name → staff (e.g. "Engineer IV").
      /\bengineer\s+(?:iv|v)\b/i,
      /\b(?:developer|scientist|architect)\s+(?:iv|v)\b/i,
    ],
  },
  {
    level: "senior",
    patterns: [
      /\bsenior\b/i,
      /\bsnr\b/i,
      /\bsr\.?\b/i,
      /\blead\b/i,
      /\btech(?:nical)?\s+lead\b/i,
      // Roman-numeral III at end of role name → senior.
      /\bengineer\s+iii\b/i,
      /\b(?:developer|scientist|architect)\s+iii\b/i,
      // "Founding Engineer" / "Founding Backend Engineer" — at most
      // early-stage startups this is a senior IC role. Bias toward senior
      // over mid to surface them alongside other lead/staff roles when
      // filtering for senior+. The keyword "founding" alone is rare enough
      // outside this context that a bare match is safe.
      /\bfounding\b/i,
    ],
  },
  {
    level: "junior",
    patterns: [
      /\bjunior\b/i,
      /\bjr\.?\b/i,
      /\bassociate\b/i,
      /\bentry[\s-]?level\b/i,
      // Common new-grad / early-career markers seen in ATS titles.
      /\bnew[\s-]?grad/i,
      /\bnewgrad\b/i,
      /\bgraduate\s+(?:engineer|developer|analyst|scientist|programmer|trainee|software|hire|role|program|rotation)/i,
      /\b(?:university|college)\s+graduate/i,
      /\b(?:university|college)\s+hire/i,
      /\bearly[\s-]?career\b/i,
      /\bapprentice/i,
      /\btrainee\b/i,
      // Roman-numeral I (but not II/III) at end of role name → junior.
      // The negative lookahead prevents matching "Engineer II" / "III".
      /\bengineer\s+i\b(?!i)/i,
      /\b(?:developer|scientist|architect|analyst)\s+i\b(?!i)/i,
      // Arabic numeral 1 — much rarer than roman I, but we see "Engineer 1"
      // at some sources. Limit to 1 only; 2/3/4/5 are too source-dependent
      // (Microsoft/Google "Engineer 4-5" are senior+, not junior).
      /\bengineer\s+1\b/i,
    ],
  },
];

export function classifyTitle(title: string): Level {
  const t = title.trim();
  for (const r of RULES) {
    if (r.patterns.some((p) => p.test(t))) return r.level;
  }
  return "mid";
}

// Ordering used for "include levels at or below mine" semantics. Higher index
// = more senior.
const ORDER: Level[] = ["intern", "junior", "mid", "senior", "staff", "principal"];

export function levelsAtOrBelow(level: Level): Level[] {
  const i = ORDER.indexOf(level);
  if (i < 0) return [level];
  return ORDER.slice(0, i + 1);
}
