package sources

import "regexp"

// Heuristic title → seniority classifier. Mirrors the logic in
// apps/api/src/lib/seniority.ts so the level lands on the Qdrant payload at
// ingest time and is filterable without a fallback classification.

var levelRules = []struct {
	level   string
	matches []*regexp.Regexp
}{
	{"executive", compileAll(`(?i)\bchief\b`, `(?i)\bvp\b`, `(?i)\bvice\s+president\b`, `(?i)\bhead\s+of\b`)},
	{"director", compileAll(`(?i)\bdirector\b`)},
	{"manager", compileAll(`(?i)\bmanager\b`, `(?i)\bem\b`)},
	{"intern", compileAll(`(?i)\bintern(ship)?\b`)},
	{"junior", compileAll(
		`(?i)\bjunior\b`, `(?i)\bjr\.?\b`, `(?i)\bassociate\b`,
		`(?i)\bentry[\s-]?level\b`, `(?i)\bnew\s+grad`,
		`(?i)\bgraduate\b`, `(?i)\bapprentice`,
	)},
	{"principal", compileAll(`(?i)\bprincipal\b`, `(?i)\bdistinguished\b`)},
	{"staff", compileAll(`(?i)\bstaff\b`)},
	{"senior", compileAll(`(?i)\bsenior\b`, `(?i)\bsr\.?\b`, `(?i)\blead\b`)},
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
