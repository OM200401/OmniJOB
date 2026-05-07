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

const RULES: Array<{ level: Level; patterns: RegExp[] }> = [
  {
    level: "executive",
    patterns: [/\bchief\b/i, /\bvp\b/i, /\bvice\s+president\b/i, /\bhead\s+of\b/i],
  },
  { level: "director", patterns: [/\bdirector\b/i] },
  { level: "manager", patterns: [/\bmanager\b/i, /\bem\b/i] },
  {
    level: "intern",
    patterns: [/\bintern(ship)?\b/i, /\bsummer\s+\d{4}\b/i],
  },
  {
    level: "junior",
    patterns: [
      /\bjunior\b/i,
      /\bjr\.?\b/i,
      /\bassociate\b/i,
      /\bentry[\s-]?level\b/i,
      /\bnew\s+grad/i,
      /\bgraduate\b/i,
      /\bapprentice/i,
    ],
  },
  { level: "principal", patterns: [/\bprincipal\b/i, /\bdistinguished\b/i] },
  { level: "staff", patterns: [/\bstaff\b/i] },
  {
    level: "senior",
    patterns: [/\bsenior\b/i, /\bsr\.?\b/i, /\blead\b/i],
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
