package sources

import "regexp"

// Heuristic title → seniority classifier. Mirrors the logic in
// apps/api/src/lib/seniority.ts so the level lands on the Qdrant payload at
// ingest time and is filterable without a fallback classification.

// Rules are tried in order; first match wins. Order matters because many
// real-world titles combine multiple keywords (e.g. "Senior Associate" —
// senior beats junior; "Director of X" — director beats senior). Mirrors
// apps/api/src/lib/seniority.ts — keep in sync.
//
// Note: Go's regexp package (RE2) does not support lookaround. We emulate
// the negative-lookahead `\bengineer i\b(?!i)` from the TS classifier with a
// trailing `[^i]|$` group that asserts the next character is not 'i'.
var levelRules = []struct {
	level   string
	matches []*regexp.Regexp
}{
	{"executive", compileAll(
		`(?i)\bchief\b`,
		`(?i)\bvp\b`,
		`(?i)\bv\.p\.\b`,
		`(?i)\bsvp\b`,
		`(?i)\bevp\b`,
		`(?i)\bvice\s+president\b`,
		`(?i)\bhead\s+of\b`,
		`(?i)\bpresident\b`,
		`(?i)\bcto\b`, `(?i)\bceo\b`, `(?i)\bcfo\b`, `(?i)\bcoo\b`,
		`(?i)\bcio\b`, `(?i)\bciso\b`, `(?i)\bcpo\b`,
	)},
	{"director", compileAll(`(?i)\bdirector\b`)},
	{"manager", compileAll(`(?i)\bmanager\b`, `(?i)\bmgr\b`, `(?i)\bpeople\s+lead\b`)},
	{"intern", compileAll(`(?i)\bintern(s|ship)?\b`, `(?i)\bsummer\s+\d{4}\b`, `(?i)\bco-?op\b`)},

	// IC ladder: principal → staff → senior must precede junior so that
	// "Senior Associate", "Staff Associate", "Principal Engineer II" all
	// resolve to the higher rung instead of latching onto the junior keyword.
	{"principal", compileAll(`(?i)\bprincipal\b`, `(?i)\bdistinguished\b`, `(?i)\bfellow\b`)},
	{"staff", compileAll(
		`(?i)\bstaff\b`,
		// Roman-numeral IV / V at end of role → staff.
		`(?i)\bengineer\s+(?:iv|v)\b`,
		`(?i)\b(?:developer|scientist|architect)\s+(?:iv|v)\b`,
	)},
	{"senior", compileAll(
		`(?i)\bsenior\b`,
		`(?i)\bsnr\b`,
		`(?i)\bsr\.?\b`,
		`(?i)\blead\b`,
		`(?i)\btech(?:nical)?\s+lead\b`,
		// Roman-numeral III at end of role → senior.
		`(?i)\bengineer\s+iii\b`,
		`(?i)\b(?:developer|scientist|architect)\s+iii\b`,
		// "Founding Engineer" — early-stage startups treat this as senior IC.
		`(?i)\bfounding\b`,
	)},
	{"junior", compileAll(
		`(?i)\bjunior\b`,
		`(?i)\bjr\.?\b`,
		`(?i)\bassociate\b`,
		`(?i)\bentry[\s-]?level\b`,
		`(?i)\bnew[\s-]?grad`,
		`(?i)\bnewgrad\b`,
		`(?i)\bgraduate\s+(?:engineer|developer|analyst|scientist|programmer|trainee|software|hire|role|program|rotation)`,
		`(?i)\b(?:university|college)\s+graduate`,
		`(?i)\b(?:university|college)\s+hire`,
		`(?i)\bearly[\s-]?career\b`,
		`(?i)\bapprentice`,
		`(?i)\btrainee\b`,
		// Roman-numeral I (but not II/III) at end of role. RE2 lacks
		// lookahead, so we require either a non-letter follow-char or
		// end-of-string after the "i".
		`(?i)\bengineer\s+i(?:[^a-z]|$)`,
		`(?i)\b(?:developer|scientist|architect|analyst)\s+i(?:[^a-z]|$)`,
		// Arabic numeral 1 — limit to 1 only; Engineer 4/5 at MSFT/Google
		// are senior-level and we don't want to over-correct.
		`(?i)\bengineer\s+1\b`,
	)},
}

func compileAll(patterns ...string) []*regexp.Regexp {
	out := make([]*regexp.Regexp, len(patterns))
	for i, p := range patterns {
		out[i] = regexp.MustCompile(p)
	}
	return out
}

func classifyLevel(title string) string {
	for _, r := range levelRules {
		for _, p := range r.matches {
			if p.MatchString(title) {
				return r.level
			}
		}
	}
	return "mid"
}
