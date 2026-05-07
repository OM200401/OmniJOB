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

// classifyRemote inspects a free-text location and description and produces
// one of remote / hybrid / onsite / unknown. Heuristic-only; ATS adapters
// that have a structured remote flag should set it directly.
func classifyRemote(location, description string) string {
	loc := strings.ToLower(location)
	desc := strings.ToLower(description)
	switch {
	case strings.Contains(loc, "remote") || strings.Contains(desc, "fully remote") || strings.Contains(desc, "100% remote"):
		return "remote"
	case strings.Contains(loc, "hybrid") || strings.Contains(desc, "hybrid"):
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
