package sources

import (
	"regexp"
	"strconv"
	"strings"
)

// Heuristic title → seniority classifier. Mirrors the logic in
// apps/api/src/lib/seniority.ts so the level lands on the Qdrant payload at
// ingest time and is filterable without a fallback classification.

// Rules are tried in order; first match wins. Order matters because many
// real-world titles combine multiple keywords (e.g. "Senior Associate" -
// senior beats junior; "Director of X" - director beats senior). Mirrors
// apps/api/src/lib/seniority.ts - keep in sync.
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
		// "Founding Engineer" - early-stage startups treat this as senior IC.
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
		// Arabic numeral 1 - limit to 1 only; Engineer 4/5 at MSFT/Google
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

// classifyLevel returns the seniority signal derived purely from the title.
// Empty string when no rule matches (was "mid" pre-2026-05-15, but defaulting
// to mid polluted the index with bogus seniorities for non-tech industries).
// Adapters should call classifyLevelFromBody instead so the body's
// experience/qualifications section is consulted first.
func classifyLevel(title string) string {
	for _, r := range levelRules {
		for _, p := range r.matches {
			if p.MatchString(title) {
				return r.level
			}
		}
	}
	return ""
}

// Section anchors and YOE patterns used by classifyBody. Mirrors the TS
// implementation at apps/api/src/lib/seniority.ts - keep in sync.
var (
	sectionAnchors = []*regexp.Regexp{
		regexp.MustCompile(`(?i)\bminimum\s+(?:qualifications?|requirements?)\b`),
		regexp.MustCompile(`(?i)\bbasic\s+(?:qualifications?|requirements?)\b`),
		regexp.MustCompile(`(?i)\bpreferred\s+(?:qualifications?|requirements?)\b`),
		regexp.MustCompile(`(?i)\brequired\s+(?:experience|qualifications?|requirements?)\b`),
		regexp.MustCompile(`(?i)\b(?:must|should)\s+have\b`),
		// Apostrophe variants (typographic + ASCII + bare).
		regexp.MustCompile("(?i)\\bwhat\\s+you(?:’|')?ll?\\s+(?:bring|need|have)\\b"),
		regexp.MustCompile(`(?i)\bwhat\s+you\s+(?:bring|need|have)\b`),
		regexp.MustCompile("(?i)\\bwhat\\s+we(?:’|')?re\\s+looking\\s+for\\b"),
		regexp.MustCompile(`(?i)\babout\s+you\b`),
		regexp.MustCompile(`(?i)\byour\s+experience\b`),
		regexp.MustCompile("(?i)\\bqualifications?\\s*[:—–\\-\\n]"),
		regexp.MustCompile("(?i)\\brequirements?\\s*[:—–\\-\\n]"),
		regexp.MustCompile("(?i)\\bexperience\\s*[:—–\\-\\n]"),
	}

	inSectionYoePatterns = []*regexp.Regexp{
		regexp.MustCompile(`(?i)\b(\d{1,2})\s*\+?\s*years?\b[^.]{0,80}?\bexperience\b`),
		regexp.MustCompile(`(?i)\bexperience\b[^.]{0,40}?\b(\d{1,2})\s*\+?\s*years?\b`),
		regexp.MustCompile(`(?i)\b(?:minimum|at\s+least|over)\s+(?:of\s+)?(\d{1,2})\s*\+?\s*years?\b`),
		regexp.MustCompile(`(?i)\b(\d{1,2})\s*\+?\s*years?\s+(?:minimum|or\s+more|or\s+greater)\b`),
	}

	inSectionRangePattern = regexp.MustCompile("(?i)\\b(\\d{1,2})\\s*(?:-|–|to)\\s*(\\d{1,2})\\s+years?\\b[^.]{0,80}?\\bexperience\\b")

	yoeKeywords = "(?:professional|relevant|industry|software|engineering|product|work|paid|hands-on|dev|development|technical|coding|leadership|nursing|teaching|legal|design|sales|marketing|operations|customer|clinical|business|enterprise|outbound)"

	keywordJunior = []*regexp.Regexp{
		regexp.MustCompile(`(?i)\bnew[\s-]?grad(uate)?s?\b`),
		regexp.MustCompile(`(?i)\brecent\s+grad(uate)?s?\b`),
		regexp.MustCompile(`(?i)\bentry[\s-]?level\b`),
		regexp.MustCompile(`(?i)\bearly[\s-]?career\b`),
		regexp.MustCompile(`(?i)\bclass\s+of\s+20\d{2}\b`),
		regexp.MustCompile(`(?i)\bminimum\s+(?:of\s+)?(?:0|1|2)\+?\s*years?\b`),
		regexp.MustCompile(`(?i)\bno\s+(?:prior\s+|professional\s+|previous\s+|formal\s+)?experience\s+(?:required|necessary|needed|expected)\b`),
		regexp.MustCompile(`(?i)\b(?:0|1|2)\+?\s*years?\s+(?:of\s+)?` + yoeKeywords + `(?:\s+[a-z-]+){0,3}\s+experience\b`),
		regexp.MustCompile(`(?i)\b(?:0|1|2)\s*[-` + "–" + `]\s*[123]\s*years?\s+(?:of\s+)?` + yoeKeywords + `(?:\s+[a-z-]+){0,3}\s+experience\b`),
	}
	keywordSenior = []*regexp.Regexp{
		regexp.MustCompile(`(?i)\b(?:7|8|9|10|12|15|20)\s*\+?\s*years?\s+(?:of\s+)?` + yoeKeywords + `(?:\s+[a-z-]+){0,3}\s+experience\b`),
		regexp.MustCompile(`(?i)\b(?:7|8|9|10|12|15|20)\s*\+?\s*years?\s+experience\s+(?:required|preferred|in)\b`),
		regexp.MustCompile(`(?i)\bminimum\s+(?:of\s+)?(?:7|8|9|10|12|15|20)\s*\+?\s*years?\b`),
	}
	keywordMid = []*regexp.Regexp{
		regexp.MustCompile(`(?i)\b(?:3|4|5|6)\s*\+?\s*years?\s+(?:of\s+)?` + yoeKeywords + `(?:\s+[a-z-]+){0,3}\s+experience\b`),
		regexp.MustCompile(`(?i)\b(?:3|4|5)\s*[-` + "–" + `]\s*[567]\s*years?\s+(?:of\s+)?` + yoeKeywords + `(?:\s+[a-z-]+){0,3}\s+experience\b`),
		regexp.MustCompile(`(?i)\b(?:3|4|5|6)\s*\+?\s*years?\s+experience\s+(?:required|preferred|in)\b`),
		regexp.MustCompile(`(?i)\bminimum\s+(?:of\s+)?(?:3|4|5|6)\s*\+?\s*years?\b`),
	}
	htmlTag = regexp.MustCompile(`<[^>]+>`)
)

const (
	bodyScanChars = 5000
	anchorWindow  = 600
)

func yoeBucket(years int) string {
	if years < 0 {
		return ""
	}
	if years <= 2 {
		return "junior"
	}
	if years <= 6 {
		return "mid"
	}
	return "senior"
}

func stripHtmlForScan(text string) string {
	return strings.ReplaceAll(htmlTag.ReplaceAllString(text, " "), "&nbsp;", " ")
}

// classifyBody mirrors the TS classifier: section-aware first, keyword-
// anchored fallback. Returns "" when no signal is found. Mirrors logic at
// apps/api/src/lib/seniority.ts.
func classifyBody(description string) string {
	if description == "" {
		return ""
	}
	stripped := stripHtmlForScan(description)
	if len(stripped) > bodyScanChars {
		stripped = stripped[:bodyScanChars]
	}
	level, pos := classifyBodyBySection(stripped)
	keywordLevel, keywordPos := classifyBodyByKeyword(stripped)
	if level != "" && keywordLevel != "" {
		if pos <= keywordPos {
			return level
		}
		return keywordLevel
	}
	if level != "" {
		return level
	}
	return keywordLevel
}

func classifyBodyBySection(text string) (string, int) {
	anchors := []int{}
	for _, re := range sectionAnchors {
		if loc := re.FindStringIndex(text); loc != nil {
			anchors = append(anchors, loc[0])
		}
	}
	if len(anchors) == 0 {
		return "", -1
	}
	// Sort ascending so earliest anchor wins ties.
	for i := 1; i < len(anchors); i++ {
		for j := i; j > 0 && anchors[j] < anchors[j-1]; j-- {
			anchors[j], anchors[j-1] = anchors[j-1], anchors[j]
		}
	}
	bestLevel := ""
	bestPos := -1
	for _, pos := range anchors {
		end := pos + anchorWindow
		if end > len(text) {
			end = len(text)
		}
		window := text[pos:end]
		var bestInWindow int = -1
		var bestInWindowRel int = -1
		// Range first; "5-7 years" returns the lower bound (conservative).
		if m := inSectionRangePattern.FindStringSubmatchIndex(window); m != nil {
			lo, err := strconv.Atoi(window[m[2]:m[3]])
			if err == nil {
				bestInWindow = lo
				bestInWindowRel = m[0]
			}
		}
		for _, re := range inSectionYoePatterns {
			m := re.FindStringSubmatchIndex(window)
			if m == nil {
				continue
			}
			years, err := strconv.Atoi(window[m[2]:m[3]])
			if err != nil {
				continue
			}
			if bestInWindowRel == -1 || m[0] < bestInWindowRel {
				bestInWindow = years
				bestInWindowRel = m[0]
			}
		}
		if bestInWindow >= 0 {
			lvl := yoeBucket(bestInWindow)
			if lvl != "" && (bestPos == -1 || pos < bestPos) {
				bestLevel = lvl
				bestPos = pos
			}
		}
	}
	return bestLevel, bestPos
}

func classifyBodyByKeyword(text string) (string, int) {
	bestLevel := ""
	bestPos := -1
	check := func(level string, patterns []*regexp.Regexp) {
		for _, re := range patterns {
			if loc := re.FindStringIndex(text); loc != nil {
				if bestPos == -1 || loc[0] < bestPos {
					bestPos = loc[0]
					bestLevel = level
				}
			}
		}
	}
	check("junior", keywordJunior)
	check("senior", keywordSenior)
	check("mid", keywordMid)
	return bestLevel, bestPos
}

// classifyLevelFromBody is the canonical entry point for adapters. Body-first
// (the experience/qualifications section of the description is more
// authoritative than the title regex). Title classifier runs as fallback.
// Off-IC titles (manager / director / executive) override the body so
// "Director of Engineering" with "5+ years" body stays director (the YOE is
// the prerequisite for the director role, not the role's own level).
func classifyLevelFromBody(title, description string) string {
	titleLevel := classifyLevel(title)
	if titleLevel == "manager" || titleLevel == "director" || titleLevel == "executive" {
		return titleLevel
	}
	body := classifyBody(description)
	if body != "" {
		return body
	}
	return titleLevel
}
