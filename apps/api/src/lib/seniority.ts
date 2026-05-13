// Heuristic title → seniority classifier.
//
// Phase 1B change: classifier is now industry-aware and returns `null` when no
// pattern matches, instead of defaulting to `mid`. The previous default forced
// every uncategorisable title into the mid bucket, which (a) inflated mid
// across non-tech industries we hadn't audited (a "Charge Nurse" silently
// became "mid"), and (b) made the level filter useless for "show me everything
// we can confidently rank" because every unknown title qualified.
//
// Rule ordering still matters within a bank - the COMMON bank (exec / director
// / manager / intern) runs first because those tokens are universal and almost
// always unambiguous. Industry-specific banks then add ladder rules tuned to
// that vertical's title conventions.

import type { Industry } from "./industry";

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

type Rule = { level: Level; patterns: RegExp[] };

// Universal patterns - exec / director / manager / intern apply across every
// industry. Tried first in classifyTitle so that "Senior Engineering Manager"
// resolves to manager regardless of whether tech or healthcare is in effect.
const COMMON_RULES: Rule[] = [
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
      /\bcno\b/i,
      /\bcmo\b/i,
    ],
  },
  { level: "director", patterns: [/\bdirector\b/i, /\bsuperintendent\b/i] },
  { level: "manager", patterns: [/\bmanager\b/i, /\bmgr\b/i, /\bpeople\s+lead\b/i, /\bsupervisor\b/i] },
  {
    level: "intern",
    patterns: [/\bintern(s|ship)?\b/i, /\bsummer\s+\d{4}\b/i, /\bco-?op\b/i],
  },
];

// Tech IC ladder. Same set as the pre-Phase-1B classifier; lives here so the
// fallback (when industry is unknown) preserves the old behaviour for tech
// titles - the index is still ~99% tech.
const TECH_RULES: Rule[] = [
  { level: "principal", patterns: [/\bprincipal\b/i, /\bdistinguished\b/i, /\bfellow\b/i] },
  {
    level: "staff",
    patterns: [
      /\bstaff\b/i,
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
      /\bengineer\s+iii\b/i,
      /\b(?:developer|scientist|architect)\s+iii\b/i,
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
      /\bnew[\s-]?grad/i,
      /\bnewgrad\b/i,
      /\bgraduate\s+(?:engineer|developer|analyst|scientist|programmer|trainee|software|hire|role|program|rotation)/i,
      /\b(?:university|college)\s+graduate/i,
      /\b(?:university|college)\s+hire/i,
      /\bearly[\s-]?career\b/i,
      /\bapprentice/i,
      /\btrainee\b/i,
      /\bengineer\s+i\b(?!i)/i,
      /\b(?:developer|scientist|architect|analyst)\s+i\b(?!i)/i,
      /\bengineer\s+1\b/i,
    ],
  },
];

// Healthcare ladder. CNA / LPN / RN are role families rather than levels, so
// patterns tie them to junior unless prefixed with senior/lead. "Charge Nurse"
// is a working-supervisor role analogous to staff IC.
const HEALTHCARE_RULES: Rule[] = [
  { level: "principal", patterns: [/\bchief\s+(nursing|medical)\s+officer\b/i, /\bmedical\s+director\b/i, /\battending\s+physician\b/i] },
  {
    level: "staff",
    patterns: [
      /\bcharge\s+nurse\b/i,
      /\bnurse\s+(manager|lead)\b/i,
      /\b(senior|sr)\s+(physician|hospitalist)\b/i,
      /\blead\s+(rn|nurse|tech|technician|pharmacist)\b/i,
    ],
  },
  {
    level: "senior",
    patterns: [
      /\b(senior|sr)\s+(nurse|rn|lpn|therapist|pharmacist|technician|technologist)\b/i,
      /\b(senior|sr)\.?\s+/i,
    ],
  },
  {
    level: "junior",
    patterns: [
      /\bnew[\s-]?grad\s+(rn|nurse|nurse\s+practitioner|np)\b/i,
      /\bgraduate\s+nurse\b/i,
      /\bjunior\s+(rn|nurse|therapist|pharmacist|technician)\b/i,
      /\bnursing\s+student\b/i,
      /\b(cna|certified\s+nursing\s+assistant)\b/i,
    ],
  },
  // Residents and medical students are technically training, but they're paid
  // and counted as intern-equivalent on the seniority filter.
  { level: "intern", patterns: [/\b(medical\s+)?resident(\s+physician)?\b/i, /\bmedical\s+student\b/i, /\bfellow\s+physician\b/i] },
];

// Retail / hospitality / food service ladder. Most retail titles cap out at
// store manager (already handled by COMMON_RULES manager rule).
const RETAIL_RULES: Rule[] = [
  {
    level: "senior",
    patterns: [
      /\bshift\s+(lead|supervisor)\b/i,
      /\b(senior|sr)\s+(associate|cashier|barista|server|cook)\b/i,
      /\blead\s+(associate|cashier|barista|server|line\s+cook)\b/i,
      /\bassistant\s+store\s+manager\b/i,
      /\bkey[\s-]?holder\b/i,
    ],
  },
  {
    level: "junior",
    patterns: [
      /\b(cashier|stocker|sales\s+associate|store\s+associate|sales\s+clerk)\b/i,
      /\b(barista|server|line\s+cook|host(ess)?|busser|dishwasher)\b/i,
      /\bcrew\s+member\b/i,
    ],
  },
];

// Trades ladder. Apprentice -> Journeyman -> Master is the standard
// progression in most union and licensing regimes.
const TRADES_RULES: Rule[] = [
  { level: "principal", patterns: [/\bmaster\s+(electrician|plumber|carpenter|welder|tradesman|mechanic)\b/i] },
  { level: "senior", patterns: [/\bjourneyman\b/i, /\b(senior|sr)\s+(electrician|plumber|carpenter|welder|mechanic|technician)\b/i] },
  { level: "junior", patterns: [/\bapprentice\b/i, /\btrainee\b/i, /\bhelper\b/i] },
];

// Government ladder. Federal GS-grade ranges roughly map to:
// GS-3 to GS-7 -> junior; GS-9 to GS-12 -> mid; GS-13/14 -> senior;
// GS-15 -> staff/principal. Below we capture the broad strokes.
const GOVERNMENT_RULES: Rule[] = [
  { level: "principal", patterns: [/\bgs[-\s]?15\b/i, /\bses\s+executive\b/i] },
  { level: "senior", patterns: [/\bgs[-\s]?1[34]\b/i, /\b(senior|sr)\s+(analyst|specialist|investigator|officer)\b/i, /\blieutenant\b/i, /\bsergeant\b/i] },
  { level: "mid", patterns: [/\bgs[-\s]?(9|1[012])\b/i] },
  { level: "junior", patterns: [/\bgs[-\s]?[3-7]\b/i, /\b(trainee|recruit|cadet|deputy\s+i)\b/i] },
];

// Education ladder. K-12 has lead/department-head as quasi-senior; university
// runs assistant -> associate -> full professor.
//
// Bare "Professor" is intentionally left unranked (null) because it's
// ambiguous - some institutions use it as shorthand for any of the three
// ranks. Requiring "Full Professor" / "Associate Professor" / "Assistant
// Professor" forces a confident classification and avoids the regex
// precedence bug where bare "professor" matched the principal rule before
// "Associate Professor" reached the senior rule.
const EDUCATION_RULES: Rule[] = [
  { level: "principal", patterns: [/\bfull\s+professor\b/i, /\bdistinguished\s+(professor|fellow)\b/i, /\bdean\b/i, /\bendowed\s+(chair|professor)\b/i] },
  { level: "senior", patterns: [/\bassociate\s+professor\b/i, /\bdepartment\s+(head|chair)\b/i, /\blead\s+(teacher|instructor)\b/i] },
  { level: "junior", patterns: [/\bassistant\s+professor\b/i, /\b(new|first[\s-]?year)\s+teacher\b/i, /\bsubstitute\s+teacher\b/i, /\bteaching\s+(assistant|fellow)\b/i] },
];

const INDUSTRY_RULES: Partial<Record<Industry, Rule[]>> = {
  tech: TECH_RULES,
  healthcare: HEALTHCARE_RULES,
  retail: RETAIL_RULES,
  food_service: RETAIL_RULES, // shares the retail ladder shape
  trades: TRADES_RULES,
  government: GOVERNMENT_RULES,
  education: EDUCATION_RULES,
};

// Returns the classified level, or null when no pattern matches in any bank.
// `industry` (when known) narrows the second-pass bank; common rules
// (exec/director/manager/intern) are tried first regardless.
export function classifyTitle(title: string, industry?: Industry): Level | null {
  const t = title.trim();
  if (!t) return null;

  for (const r of COMMON_RULES) {
    if (r.patterns.some((p) => p.test(t))) return r.level;
  }

  const bank = (industry && INDUSTRY_RULES[industry]) || TECH_RULES;
  for (const r of bank) {
    if (r.patterns.some((p) => p.test(t))) return r.level;
  }
  // If the industry-specific bank produced nothing and we weren't already on
  // tech, try the tech bank as a fallback. "Senior" and "Lead" tokens are
  // common across industries; tech's senior rule catches them.
  if (industry && industry !== "tech" && bank !== TECH_RULES) {
    for (const r of TECH_RULES) {
      if (r.patterns.some((p) => p.test(t))) return r.level;
    }
  }
  return null;
}

// Ordering used for "include levels at or below mine" semantics. Higher index
// = more senior. The IC ladder; off-IC (manager/director/exec) handled
// separately by callers.
const ORDER: Level[] = ["intern", "junior", "mid", "senior", "staff", "principal"];

export function levelsAtOrBelow(level: Level): Level[] {
  const i = ORDER.indexOf(level);
  if (i < 0) return [level];
  return ORDER.slice(0, i + 1);
}

// Body-derived seniority. Used as a fallback when classifyTitle returns null
// so titles like "Software Engineer" can still pick up a level from "0-2
// years of experience" or "new grads encouraged" inside the description.
// Bounded to the first BODY_SCAN_CHARS chars - requirements / qualifications
// sections live near the top of every well-formed posting and scanning a
// 100k-char body 600 times per search would dominate the post-filter loop.
const BODY_SCAN_CHARS = 3000;

// Phrase patterns must be specific enough to avoid the common false-positive:
// passages like "Amazon has 25 years of experience" or "Our team has 5+
// engineers". The disambiguator is requiring "experience" with a qualifier
// ("required", "preferred", "minimum") or attaching the year-count to
// experience/professional/relevant/industry/work modifiers. Bare "X years"
// without those is too noisy and is deliberately not matched.
// Keywords that anchor a year-count phrase to a YOE *requirement* (rather
// than e.g. "Amazon has 25 years of experience serving customers", which is
// company history). The numeric pattern fires only when one of these
// keywords appears between the year-count and "experience".
const YOE_KEYWORDS =
  "(?:professional|relevant|industry|software|engineering|product|work|paid|hands-on|dev|development|technical|coding|leadership|nursing|teaching|legal|design|sales|marketing|operations|customer|clinical)";

const BODY_RULES: Rule[] = [
  {
    level: "junior",
    patterns: [
      /\bnew[\s-]?grad(uate)?s?\b/i,
      /\brecent\s+grad(uate)?s?\b/i,
      /\bentry[\s-]?level\b/i,
      /\bearly[\s-]?career\b/i,
      /\bearly\s+in\s+(?:your|their)\s+career\b/i,
      /\bjust\s+(?:starting|started)\s+(?:your|their)\s+career\b/i,
      /\bgraduating\s+(?:in|by|with)\b/i,
      /\bclass\s+of\s+20\d{2}\b/i,
      // "0-2 years of <keyword[s]> experience"
      new RegExp(
        `\\b(?:0|1|2)\\s*[-–]\\s*[123]\\s*years?\\s+(?:of\\s+)?${YOE_KEYWORDS}(?:\\s+[a-z-]+){0,3}\\s+experience\\b`,
        "i",
      ),
      // "0+ years of <keyword> experience" / "1+ years professional experience"
      new RegExp(
        `\\b(?:0|1|2)\\+?\\s*years?\\s+(?:of\\s+)?${YOE_KEYWORDS}(?:\\s+[a-z-]+){0,3}\\s+experience\\b`,
        "i",
      ),
      // "minimum of 0-2 years" / "minimum 1 year"
      /\bminimum\s+(?:of\s+)?(?:0|1|2)\+?\s*years?\b/i,
      /\bno\s+(?:prior\s+|professional\s+|previous\s+|formal\s+)?experience\s+(?:required|necessary|needed|expected)\b/i,
      /\bfirst[\s-]?year\s+(?:role|developer|engineer|hire|analyst|nurse|teacher)\b/i,
    ],
  },
  {
    level: "senior",
    patterns: [
      // "7+ years of <keyword[s]> experience" (with up to 3 intervening
      // adjective tokens, e.g. "software engineering experience").
      new RegExp(
        `\\b(?:7|8|9|10|12|15|20)\\s*\\+?\\s*years?\\s+(?:of\\s+)?${YOE_KEYWORDS}(?:\\s+[a-z-]+){0,3}\\s+experience\\b`,
        "i",
      ),
      // "10+ years experience required"
      /\b(?:7|8|9|10|12|15|20)\s*\+?\s*years?\s+experience\s+(?:required|preferred|in)\b/i,
      /\bminimum\s+(?:of\s+)?(?:7|8|9|10|12|15|20)\s*\+?\s*years?\b/i,
    ],
  },
  {
    level: "mid",
    patterns: [
      // "3-5 / 4-6 years of <keyword[s]> experience"
      new RegExp(
        `\\b(?:3|4|5)\\s*[-–]\\s*[567]\\s*years?\\s+(?:of\\s+)?${YOE_KEYWORDS}(?:\\s+[a-z-]+){0,3}\\s+experience\\b`,
        "i",
      ),
      // "5+ years of <keyword[s]> experience"
      new RegExp(
        `\\b(?:3|4|5|6)\\s*\\+?\\s*years?\\s+(?:of\\s+)?${YOE_KEYWORDS}(?:\\s+[a-z-]+){0,3}\\s+experience\\b`,
        "i",
      ),
      /\b(?:3|4|5|6)\s*\+?\s*years?\s+experience\s+(?:required|preferred|in)\b/i,
      /\bminimum\s+(?:of\s+)?(?:3|4|5|6)\s*\+?\s*years?\b/i,
    ],
  },
];

// Returns the body-derived level, or null when no pattern matches in the
// first BODY_SCAN_CHARS of the description. Picks the earliest match across
// all level buckets so the FIRST signal in the description wins - this
// correctly handles a "Senior" posting whose body says "you'll mentor
// engineers with 1-2 years of experience" by reading the "7+ years" line
// (which appears first under Requirements) instead of the mentee mention.
export function classifyBody(description: string | undefined): Level | null {
  if (!description) return null;
  const text = description.slice(0, BODY_SCAN_CHARS);
  let bestLevel: Level | null = null;
  let bestPos = Infinity;
  for (const r of BODY_RULES) {
    for (const p of r.patterns) {
      const m = p.exec(text);
      if (m && m.index < bestPos) {
        bestPos = m.index;
        bestLevel = r.level;
      }
    }
  }
  return bestLevel;
}

// Convenience: title-first, body-as-fallback. Used by both upsertJob (ingest
// time) and searchJobs (read time) so the two paths stay in sync.
export function classifyTitleOrBody(
  title: string,
  description: string | undefined,
  industry?: Industry,
): Level | null {
  return classifyTitle(title, industry) ?? classifyBody(description);
}
