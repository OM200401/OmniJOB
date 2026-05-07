package sources

import (
	"html"
	"regexp"
	"strings"
)

var tagRe = regexp.MustCompile(`<[^>]+>`)
var spaceRe = regexp.MustCompile(`\s+`)

// stripHTML removes tags and decodes entities. Good enough for embedding
// inputs and short descriptions; we are not trying to preserve formatting.
func stripHTML(s string) string {
	if s == "" {
		return ""
	}
	noTags := tagRe.ReplaceAllString(s, " ")
	decoded := html.UnescapeString(noTags)
	return strings.TrimSpace(spaceRe.ReplaceAllString(decoded, " "))
}

// prettyCompany turns a board slug like "anthropic" or "speakeasyapi" into a
// reasonable display name. Best-effort — adapters can override per-row.
func prettyCompany(slug string) string {
	if slug == "" {
		return ""
	}
	// Replace common separators, then title-case the first letter.
	s := strings.ReplaceAll(slug, "-", " ")
	s = strings.ReplaceAll(s, "_", " ")
	if s == "" {
		return slug
	}
	r := []rune(s)
	r[0] = []rune(strings.ToUpper(string(r[0])))[0]
	return string(r)
}

// remoteFalsePositive matches phrases that contain the word "remote" but are
// NOT a remote-work signal: "remote office" (a physical office in a far-flung
// region), "remote location" (a hard-to-reach physical site), "controls
// remote ..." (job description prose), "remote sensing" (technical domain).
// Tested before classifyRemote's positive match so these fall through to
// hybrid / onsite / unknown.
var remoteFalsePositiveRe = regexp.MustCompile(`(?i)remote\s+(office|location|site|monitoring|sensing|control|access|server|host|team\s+management)`)

// remotePositiveRe matches the most reliable remote-work signals: a bare
// "remote" word in the location, or "fully remote" / "100% remote" /
// "work from home" / "wfh" / "work from anywhere" anywhere.
var remotePositiveLocRe = regexp.MustCompile(`(?i)\bremote\b`)
var remotePositiveDescRe = regexp.MustCompile(`(?i)(fully\s+remote|100%\s+remote|work\s+from\s+home|\bwfh\b|work\s+from\s+anywhere|remote[\s-]+first|remote[\s-]+only)`)
var hybridLocRe = regexp.MustCompile(`(?i)\bhybrid\b`)
var hybridDescRe = regexp.MustCompile(`(?i)\bhybrid\b`)

// classifyRemote inspects a free-text location and description and produces
// one of remote / hybrid / onsite / unknown. Heuristic-only; ATS adapters
// that have a structured remote flag should set it directly.
func classifyRemote(location, description string) string {
	loc := strings.ToLower(location)
	desc := strings.ToLower(description)

	// Strip false-positive phrases first so the bare-word check doesn't
	// fire on "remote office" / "remote location" etc.
	locRedacted := remoteFalsePositiveRe.ReplaceAllString(loc, "")

	switch {
	case remotePositiveLocRe.MatchString(locRedacted) || remotePositiveDescRe.MatchString(desc):
		return "remote"
	case hybridLocRe.MatchString(loc) || hybridDescRe.MatchString(desc):
		return "hybrid"
	case loc != "":
		return "onsite"
	default:
		return "unknown"
	}
}

// classifyRemoteFromKeyword maps a structured ATS keyword
// ("remote" / "hybrid" / "on-site" / etc.) to the canonical set.
func classifyRemoteFromKeyword(k string) string {
	switch strings.ToLower(strings.TrimSpace(k)) {
	case "remote":
		return "remote"
	case "hybrid":
		return "hybrid"
	case "on-site", "onsite", "office":
		return "onsite"
	default:
		return "unknown"
	}
}
