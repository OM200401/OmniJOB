package sources

import "time"

// parseRFC3339Millis parses an RFC3339-ish timestamp (the format Greenhouse
// and Ashby emit for `updated_at` / `publishedAt`). Returns 0 if unparseable
// — callers treat 0 as "unknown" rather than the unix epoch.
func parseRFC3339Millis(s string) int64 {
	if s == "" {
		return 0
	}
	for _, layout := range []string{
		time.RFC3339,
		time.RFC3339Nano,
		"2006-01-02T15:04:05",
		"2006-01-02",
	} {
		if t, err := time.Parse(layout, s); err == nil {
			return t.UnixMilli()
		}
	}
	return 0
}
