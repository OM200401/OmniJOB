package sources

import "strings"

// classifyCountry maps a free-text ATS location string to an ISO-3166-1
// alpha-2 country code (e.g. "US", "GB", "DE"). Returns "" for unparseable
// or worldwide-remote locations. The same heuristic is mirrored in
// apps/api/src/lib/location.ts so the API can compute it on read for
// pre-existing points without `country` in payload.

// Direct country-name → ISO-2 (longest first, lowercased match).
var countryNames = map[string]string{
	"united states":  "US",
	"united states of america": "US",
	"u.s.a.":         "US",
	"u.s.":           "US",
	"usa":            "US",
	"america":        "US",
	"united kingdom": "GB",
	"u.k.":           "GB",
	"great britain":  "GB",
	"britain":        "GB",
	"england":        "GB",
	"scotland":       "GB",
	"wales":          "GB",
	"northern ireland": "GB",
	"canada":         "CA",
	"germany":        "DE",
	"deutschland":    "DE",
	"france":         "FR",
	"netherlands":    "NL",
	"the netherlands": "NL",
	"holland":        "NL",
	"ireland":        "IE",
	"spain":          "ES",
	"españa":         "ES",
	"italy":          "IT",
	"italia":         "IT",
	"portugal":       "PT",
	"poland":         "PL",
	"sweden":         "SE",
	"finland":        "FI",
	"denmark":        "DK",
	"norway":         "NO",
	"switzerland":    "CH",
	"austria":        "AT",
	"belgium":        "BE",
	"czech republic": "CZ",
	"czechia":        "CZ",
	"romania":        "RO",
	"greece":         "GR",
	"turkey":         "TR",
	"india":          "IN",
	"singapore":      "SG",
	"japan":          "JP",
	"south korea":    "KR",
	"korea":          "KR",
	"taiwan":         "TW",
	"hong kong":      "HK",
	"china":          "CN",
	"indonesia":      "ID",
	"malaysia":       "MY",
	"philippines":    "PH",
	"thailand":       "TH",
	"vietnam":        "VN",
	"australia":      "AU",
	"new zealand":    "NZ",
	"brazil":         "BR",
	"brasil":         "BR",
	"mexico":         "MX",
	"argentina":      "AR",
	"chile":          "CL",
	"colombia":       "CO",
	"peru":           "PE",
	"israel":         "IL",
	"united arab emirates": "AE",
	"uae":            "AE",
	"saudi arabia":   "SA",
	"south africa":   "ZA",
	"nigeria":        "NG",
	"egypt":          "EG",
	"kenya":          "KE",
}

// City → country fallback for major hubs. Lowercased.
var cityCountry = map[string]string{
	// US
	"san francisco": "US", "new york": "US", "seattle": "US",
	"austin": "US", "los angeles": "US", "boston": "US",
	"chicago": "US", "denver": "US", "atlanta": "US",
	"washington": "US", "san diego": "US", "san jose": "US",
	"palo alto": "US", "mountain view": "US", "menlo park": "US",
	"cupertino": "US", "sunnyvale": "US", "redwood city": "US",
	"oakland": "US", "portland": "US", "miami": "US",
	"dallas": "US", "houston": "US", "philadelphia": "US",
	"minneapolis": "US", "salt lake city": "US",
	"sf bay area": "US", "bay area": "US", "nyc": "US",
	"brooklyn": "US", "manhattan": "US",
	// Canada
	"toronto": "CA", "vancouver": "CA", "montreal": "CA",
	"ottawa": "CA", "calgary": "CA", "waterloo": "CA",
	// UK
	"london": "GB", "manchester": "GB", "edinburgh": "GB",
	"glasgow": "GB", "cambridge": "GB", "oxford": "GB",
	"bristol": "GB", "dublin": "IE",
	// EU
	"berlin": "DE", "munich": "DE", "münchen": "DE",
	"hamburg": "DE", "frankfurt": "DE", "köln": "DE",
	"cologne": "DE",
	"paris": "FR", "lyon": "FR",
	"amsterdam": "NL", "rotterdam": "NL", "utrecht": "NL",
	"madrid": "ES", "barcelona": "ES",
	"milan": "IT", "rome": "IT",
	"stockholm": "SE", "gothenburg": "SE",
	"copenhagen": "DK", "oslo": "NO", "helsinki": "FI",
	"zurich": "CH", "zürich": "CH", "geneva": "CH",
	"vienna": "AT", "warsaw": "PL", "krakow": "PL",
	"prague": "CZ", "brussels": "BE",
	// APAC
	"bangalore": "IN", "bengaluru": "IN", "mumbai": "IN",
	"delhi": "IN", "hyderabad": "IN", "pune": "IN",
	"chennai": "IN", "noida": "IN", "gurgaon": "IN",
	"tokyo": "JP", "osaka": "JP",
	"sydney": "AU", "melbourne": "AU",
	"seoul": "KR", "taipei": "TW",
	"shanghai": "CN", "beijing": "CN",
	"hong kong": "HK",
	// LATAM / other
	"são paulo": "BR", "sao paulo": "BR", "rio de janeiro": "BR",
	"mexico city": "MX", "ciudad de méxico": "MX",
	"buenos aires": "AR", "santiago": "CL",
	"tel aviv": "IL", "dubai": "AE",
	"cape town": "ZA", "johannesburg": "ZA",
}

// Comma-separated trailing tokens we recognize as US state codes.
var usStates = map[string]bool{
	"al": true, "ak": true, "az": true, "ar": true, "ca": true, "co": true,
	"ct": true, "de": true, "fl": true, "ga": true, "hi": true, "id": true,
	"il": true, "in": true, "ia": true, "ks": true, "ky": true, "la": true,
	"me": true, "md": true, "ma": true, "mi": true, "mn": true, "ms": true,
	"mo": true, "mt": true, "ne": true, "nv": true, "nh": true, "nj": true,
	"nm": true, "ny": true, "nc": true, "nd": true, "oh": true, "ok": true,
	"or": true, "pa": true, "ri": true, "sc": true, "sd": true, "tn": true,
	"tx": true, "ut": true, "vt": true, "va": true, "wa": true, "wv": true,
	"wi": true, "wy": true, "dc": true,
}

// Canadian provinces (2-letter postal codes).
var caProvinces = map[string]bool{
	"on": true, "qc": true, "bc": true, "ab": true, "mb": true, "sk": true,
	"ns": true, "nb": true, "nl": true, "pe": true, "yt": true, "nt": true,
	"nu": true,
}

// Two-letter ISO codes we accept after a comma ("Berlin, DE").
var iso2Trail = map[string]bool{
	"us": true, "uk": true, "gb": true, "ca": true, "de": true, "fr": true,
	"nl": true, "ie": true, "es": true, "it": true, "pt": true, "pl": true,
	"se": true, "fi": true, "dk": true, "no": true, "ch": true, "at": true,
	"be": true, "in": true, "sg": true, "jp": true, "kr": true, "tw": true,
	"hk": true, "cn": true, "id": true, "my": true, "ph": true, "th": true,
	"vn": true, "au": true, "nz": true, "br": true, "mx": true, "ar": true,
	"cl": true, "co": true, "il": true, "ae": true, "za": true, "ng": true,
}

// 2-letter codes that are simultaneously US state postal codes AND ISO-2
// country codes. For these we need disambiguation via context (city in the
// leading token, or fallback ordering).
var ambiguousStateIso2 = map[string]string{
	"ca": "CA", // California vs Canada
	"co": "CO", // Colorado vs Colombia
	"de": "DE", // Delaware vs Germany
	"in": "IN", // Indiana vs India
}

func classifyCountry(loc string) string {
	if loc == "" {
		return ""
	}
	l := strings.ToLower(loc)

	// 1. Direct country-name word-boundary match (longest-first). Handle the
	// few overlaps explicitly because Go map iteration is unordered.
	if containsWord(l, "united states of america") {
		return "US"
	}
	if containsWord(l, "united kingdom") {
		return "GB"
	}
	if containsWord(l, "northern ireland") {
		return "GB"
	}
	for name, code := range countryNames {
		if containsWord(l, name) {
			return code
		}
	}

	// 2. Trailing comma / pipe / dash / slash tokens. Walk back-to-front.
	// Resolution priority is: US states → CA provinces → ISO-2 trail.
	// Real-world ATS strings overwhelmingly use "City, ST" for US/CA states,
	// so when an ambiguous 2-letter token like "CA" appears we prefer the
	// state interpretation (California → US) over the country code (Canada).
	//
	// For tokens that are BOTH a US state AND an ISO-2 code (CA/CO/DE/IN),
	// disambiguate using leading tokens: if any of them looks like a city of
	// a non-US country, the trailing token is the country code, not the
	// state. Example: "Berlin, DE" → DE (Berlin is a German city);
	// "San Francisco, CA" → US (SF is a US city, so CA is California).
	parts := splitClean(l)
	for i := len(parts) - 1; i >= 0; i-- {
		p := parts[i]
		if _, isAmbiguous := ambiguousStateIso2[p]; isAmbiguous {
			// Disambiguate via city context in the leading tokens.
			leading := strings.Join(parts[:i], " ")
			if leading != "" {
				if c := cityLookup(leading); c != "" && c != "US" {
					return c
				}
			}
			// Default for ambiguous codes: treat as US state. The
			// country-name pass above already caught explicit
			// "Berlin, Germany" / "Mumbai, India" forms.
			return "US"
		}
		if usStates[p] {
			return "US"
		}
		if caProvinces[p] {
			return "CA"
		}
		if iso2Trail[p] {
			if p == "uk" {
				return "GB"
			}
			return strings.ToUpper(p)
		}
	}

	// 3. City lookup. Walk longest-first so multi-word cities beat single.
	if c := cityLookup(l); c != "" {
		return c
	}

	return ""
}

func splitClean(s string) []string {
	// Normalize the " - " separator first so "WA - Vancouver" splits into
	// ["wa", "vancouver"] — many ATS strings use a hyphen as a top-level
	// region delimiter (e.g. "United States - Remote", "WA - Seattle").
	s = strings.ReplaceAll(s, " - ", ",")
	raw := strings.FieldsFunc(s, func(r rune) bool {
		return r == ',' || r == '·' || r == '|' || r == '/'
	})
	out := make([]string, 0, len(raw))
	for _, p := range raw {
		t := strings.TrimSpace(p)
		if t != "" {
			out = append(out, t)
		}
	}
	return out
}

func cityLookup(l string) string {
	// Longer keys first so "san francisco" beats "san".
	keys := make([]string, 0, len(cityCountry))
	for k := range cityCountry {
		keys = append(keys, k)
	}
	// Insertion sort by length desc — small map, fine.
	for i := 1; i < len(keys); i++ {
		for j := i; j > 0 && len(keys[j]) > len(keys[j-1]); j-- {
			keys[j], keys[j-1] = keys[j-1], keys[j]
		}
	}
	for _, k := range keys {
		if containsWord(l, k) {
			return cityCountry[k]
		}
	}
	return ""
}

// containsWord checks if needle occurs in haystack flanked by non-letter,
// non-digit characters or at string boundaries. Avoids matching "india"
// inside "indianapolis", "usa" inside "Sausalito", etc.
func containsWord(haystack, needle string) bool {
	from := 0
	for {
		idx := strings.Index(haystack[from:], needle)
		if idx < 0 {
			return false
		}
		idx += from
		var before byte
		if idx > 0 {
			before = haystack[idx-1]
		}
		var after byte
		end := idx + len(needle)
		if end < len(haystack) {
			after = haystack[end]
		}
		isLetter := func(c byte) bool {
			return (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')
		}
		if !isLetter(before) && !isLetter(after) {
			return true
		}
		from = idx + 1
	}
}
