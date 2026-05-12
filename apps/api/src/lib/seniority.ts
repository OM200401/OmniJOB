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
