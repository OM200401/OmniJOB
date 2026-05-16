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

// Body-derived seniority. Two-stage classifier:
//
//   1. SECTION-AWARE mode. Scan the description for explicit section headers
//      ("Experience", "Requirements", "Qualifications", "Minimum Qualifications",
//      "Basic Qualifications", "Preferred Qualifications", "What you bring",
//      "Required Experience", etc.) and apply a permissive YOE pattern inside
//      a 500-char window after each header. This captures the 75% of real job
//      postings that put YOE under a labelled section (audit 2026-05-15:
//      75% of sampled descriptions had an Experience header, 41% Requirements,
//      20% Qualifications).
//
//   2. KEYWORD-ANCHORED fallback. When no section header is found, scan the
//      first 3000 chars with the tighter YOE_KEYWORDS-anchored pattern that
//      shipped pre-2026-05-15. This keeps the false-positive guards in place
//      for free-form prose ("Amazon has 25 years of experience serving
//      customers worldwide" must NOT classify as senior).
//
// Bounded to BODY_SCAN_CHARS - requirements/qualifications sections live near
// the top of every well-formed posting and scanning a 100k-char body 600
// times per search would dominate the post-filter loop.
const BODY_SCAN_CHARS = 5000;

// Window we scan AFTER finding a section header. 500 chars covers a typical
// bullet list of 5-10 requirement lines; tight enough that a YOE phrase 800
// chars deep into the description (likely in a different section) doesn't
// pollute the result.
const ANCHOR_WINDOW = 600;

// Strip HTML so the regex doesn't have to thread tags. Real descriptions
// arrive as a mix of plain text and HTML depending on adapter - stripping
// uniformly is safer than per-adapter normalization.
function stripHtmlForScan(text: string): string {
  return text.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ");
}

// Section header anchors. Each matches the START of a qualifications/
// experience section in a real posting. Order doesn't matter; we find ALL
// positions and scan windows after each. Includes both the punctuated form
// ("Qualifications:") and the bare form ("Qualifications") for cases where
// HTML stripping has collapsed away `<h4>Qualifications</h4>` to just the
// word "Qualifications" followed by the list contents.
const SECTION_ANCHORS: RegExp[] = [
  // Compound headers (most specific, least likely to false-positive on
  // narrative prose).
  /\bminimum\s+(?:qualifications?|requirements?)\b/i,
  /\bbasic\s+(?:qualifications?|requirements?)\b/i,
  /\bpreferred\s+(?:qualifications?|requirements?)\b/i,
  /\brequired\s+(?:experience|qualifications?|requirements?)\b/i,
  /\b(?:must|should)\s+have\b/i,
  // "What you'll bring/need/have" and "What you bring/need/have" - both
  // apostrophe-elided and bare forms.
  /\bwhat\s+you(?:’|')?ll?\s+(?:bring|need|have)\b/i,
  /\bwhat\s+you\s+(?:bring|need|have)\b/i,
  /\bwhat\s+we(?:’|')?re\s+looking\s+for\b/i,
  /\babout\s+you\b/i,
  /\byour\s+experience\b/i,
  // Bare headers - works post-HTML-strip when `<h4>Requirements</h4>`
  // becomes "Requirements" followed by the bullet contents. Slightly
  // risks false-positives in narrative prose, but real prose rarely uses
  // these words AND then includes a YOE phrase within the 600-char window.
  /\bqualifications?\s*[:—–\-\n]/i,
  /\brequirements?\s*[:—–\-\n]/i,
  /\bexperience\s*[:—–\-\n]/i,
];

// In-section YOE patterns. Permissive because the section anchor + 600-char
// window already provides false-positive defense - a YOE phrase inside a
// qualifications section is almost certainly a requirement. Captures the
// LOWER bound when a range is given ("5-7 years" -> 5 = mid).
//
// The patterns return the integer years for downstream bucketing. We use a
// single combined extractor rather than separate junior/mid/senior regexes
// because the section-aware mode collapses the rules: any N near "experience"
// inside the window is a YOE statement, regardless of which bucket N falls in.
const IN_SECTION_YOE_PATTERNS: RegExp[] = [
  // "5+ years of experience", "10 years of experience", "5 years experience"
  /\b(\d{1,2})\s*\+?\s*years?\b[^.]{0,80}?\bexperience\b/i,
  // "experience: 5+ years", "Experience - 10 years"
  /\bexperience\b[^.]{0,40}?\b(\d{1,2})\s*\+?\s*years?\b/i,
  // "minimum 5 years", "at least 5 years", "5+ years minimum"
  /\b(?:minimum|at\s+least|over)\s+(?:of\s+)?(\d{1,2})\s*\+?\s*years?\b/i,
  /\b(\d{1,2})\s*\+?\s*years?\s+(?:minimum|or\s+more|or\s+greater)\b/i,
];

// Range pattern, captured separately so we use the LOWER bound (conservative;
// matches industry convention that the floor is the actual requirement).
const IN_SECTION_RANGE_PATTERN =
  /\b(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\s+years?\b[^.]{0,80}?\bexperience\b/i;

// Bucket an integer-YOE value into a Level.
function yoeBucket(years: number): Level | null {
  if (years < 0) return null;
  if (years <= 2) return "junior";
  if (years <= 6) return "mid";
  return "senior";
}

// SECTION-AWARE pass. Returns the FIRST level signal found inside any
// section window. Null if no section anchor is present OR no YOE phrase
// appears inside any window.
function classifyBodyBySection(text: string): { level: Level; pos: number } | null {
  let best: { level: Level; pos: number } | null = null;
  // Collect all anchor positions first; we walk in order so the EARLIEST
  // hit wins (which lines up with "Minimum Qualifications" landing before
  // "Preferred Qualifications" in real postings).
  const anchors: number[] = [];
  for (const re of SECTION_ANCHORS) {
    const m = re.exec(text);
    if (m) anchors.push(m.index);
  }
  if (anchors.length === 0) return null;
  anchors.sort((a, b) => a - b);

  for (const pos of anchors) {
    const window = text.slice(pos, pos + ANCHOR_WINDOW);
    // Try range pattern first - "5-7 years" should be recognized as a range,
    // not as two separate hits where "5 years" wins via earliest-match.
    let rangeYoe: number | null = null;
    const rm = IN_SECTION_RANGE_PATTERN.exec(window);
    if (rm) {
      const lo = parseInt(rm[1]!, 10);
      if (Number.isFinite(lo)) rangeYoe = lo;
    }
    let bestInWindow: { years: number; relPos: number } | null = null;
    if (rangeYoe !== null && rm) {
      bestInWindow = { years: rangeYoe, relPos: rm.index };
    }
    for (const re of IN_SECTION_YOE_PATTERNS) {
      const m = re.exec(window);
      if (!m) continue;
      const years = parseInt(m[1]!, 10);
      if (!Number.isFinite(years)) continue;
      if (!bestInWindow || m.index < bestInWindow.relPos) {
        bestInWindow = { years, relPos: m.index };
      }
    }
    if (bestInWindow) {
      const lvl = yoeBucket(bestInWindow.years);
      if (lvl && (!best || pos < best.pos)) {
        best = { level: lvl, pos };
      }
    }
  }
  return best;
}

// Keyword-anchored false-positive defense for prose passages that lack a
// section header. These patterns require either an explicit early-career
// phrase ("new grad", "entry-level", "class of 20XX") OR a year-count tied
// to a YOE keyword ("X years of <keyword> experience"), which together
// reject company-history phrasing like "25 years of experience serving
// customers" while still catching free-form YOE requirements.
const YOE_KEYWORDS =
  "(?:professional|relevant|industry|software|engineering|product|work|paid|hands-on|dev|development|technical|coding|leadership|nursing|teaching|legal|design|sales|marketing|operations|customer|clinical|business|enterprise|outbound)";

const KEYWORD_RULES: Rule[] = [
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
      new RegExp(
        `\\b(?:0|1|2)\\s*[-–]\\s*[123]\\s*years?\\s+(?:of\\s+)?${YOE_KEYWORDS}(?:\\s+[a-z-]+){0,3}\\s+experience\\b`,
        "i",
      ),
      new RegExp(
        `\\b(?:0|1|2)\\+?\\s*years?\\s+(?:of\\s+)?${YOE_KEYWORDS}(?:\\s+[a-z-]+){0,3}\\s+experience\\b`,
        "i",
      ),
      /\bminimum\s+(?:of\s+)?(?:0|1|2)\+?\s*years?\b/i,
      /\bno\s+(?:prior\s+|professional\s+|previous\s+|formal\s+)?experience\s+(?:required|necessary|needed|expected)\b/i,
      /\bfirst[\s-]?year\s+(?:role|developer|engineer|hire|analyst|nurse|teacher)\b/i,
    ],
  },
  {
    level: "senior",
    patterns: [
      new RegExp(
        `\\b(?:7|8|9|10|12|15|20)\\s*\\+?\\s*years?\\s+(?:of\\s+)?${YOE_KEYWORDS}(?:\\s+[a-z-]+){0,3}\\s+experience\\b`,
        "i",
      ),
      /\b(?:7|8|9|10|12|15|20)\s*\+?\s*years?\s+experience\s+(?:required|preferred|in)\b/i,
      /\bminimum\s+(?:of\s+)?(?:7|8|9|10|12|15|20)\s*\+?\s*years?\b/i,
    ],
  },
  {
    level: "mid",
    patterns: [
      new RegExp(
        `\\b(?:3|4|5)\\s*[-–]\\s*[567]\\s*years?\\s+(?:of\\s+)?${YOE_KEYWORDS}(?:\\s+[a-z-]+){0,3}\\s+experience\\b`,
        "i",
      ),
      new RegExp(
        `\\b(?:3|4|5|6)\\s*\\+?\\s*years?\\s+(?:of\\s+)?${YOE_KEYWORDS}(?:\\s+[a-z-]+){0,3}\\s+experience\\b`,
        "i",
      ),
      /\b(?:3|4|5|6)\s*\+?\s*years?\s+experience\s+(?:required|preferred|in)\b/i,
      /\bminimum\s+(?:of\s+)?(?:3|4|5|6)\s*\+?\s*years?\b/i,
    ],
  },
];

function classifyBodyByKeyword(text: string): { level: Level; pos: number } | null {
  let best: { level: Level; pos: number } | null = null;
  for (const r of KEYWORD_RULES) {
    for (const p of r.patterns) {
      const m = p.exec(text);
      if (m && (!best || m.index < best.pos)) {
        best = { level: r.level, pos: m.index };
      }
    }
  }
  return best;
}

// Returns the body-derived level, or null when no signal is found. Two-stage:
// (1) section-aware scan finds explicit YOE under labelled requirement
// sections (catches the 75% of postings that use them); (2) keyword-anchored
// fallback handles anchorless prose and the early-career bucket.
export function classifyBody(description: string | undefined): Level | null {
  if (!description) return null;
  const stripped = stripHtmlForScan(description).slice(0, BODY_SCAN_CHARS);
  const section = classifyBodyBySection(stripped);
  const keyword = classifyBodyByKeyword(stripped);
  // Earliest match across both modes wins. Each method already picks its own
  // earliest within itself; here we just take the smaller pos.
  if (section && keyword) {
    return section.pos <= keyword.pos ? section.level : keyword.level;
  }
  return (section ?? keyword)?.level ?? null;
}

// Convenience: body-first now (the experience/qualifications section of the
// description is more authoritative than the title regex - "Software Engineer"
// might be junior or senior depending on the requirements). Title classifier
// only runs as fallback.
//
// Off-IC titles (manager / director / executive) override the body. A
// "Director of Engineering" posting with body text "5+ years of experience"
// shouldn't classify as mid - the YOE there is the prerequisite for the
// director role, not the role's own level. Same logic for managers and
// executives.
//
// Used by both upsertJob (ingest time) and searchJobs (read time) so the
// two paths stay in sync.
export function classifyTitleOrBody(
  title: string,
  description: string | undefined,
  industry?: Industry,
): Level | null {
  const titleLevel = classifyTitle(title, industry);
  if (titleLevel === "manager" || titleLevel === "director" || titleLevel === "executive") {
    return titleLevel;
  }
  return classifyBody(description) ?? titleLevel;
}
