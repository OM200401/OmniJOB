package sources

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// Salary is the canonical compensation extraction. All fields populated when
// parsing succeeds; nil result means "no parseable salary in source text".
type Salary struct {
	Min      int    // canonical units in the local currency, NOT k-shortened
	Max      int
	Currency string // ISO-4217: USD, EUR, GBP, CAD, AUD, INR, SGD, JPY, CHF, NZD
	Period   string // "annual" | "monthly" | "hourly" | "weekly" | "daily"
}

// FormatSalary returns a compact, display-ready string like
// "$125k – $160k USD" or "€55,000 – €75,000 EUR" or "$45 – $65 USD/hr".
func (s Salary) Format() string {
	if s.Max == 0 || s.Currency == "" {
		return ""
	}
	sym := currencySymbol(s.Currency)
	suffix := ""
	switch s.Period {
	case "hourly":
		suffix = " " + s.Currency + "/hr"
	case "monthly":
		suffix = " " + s.Currency + "/mo"
	case "weekly":
		suffix = " " + s.Currency + "/wk"
	case "daily":
		suffix = " " + s.Currency + "/day"
	default:
		suffix = " " + s.Currency
	}
	return fmt.Sprintf("%s%s – %s%s%s", sym, formatThousands(s.Min), sym, formatThousands(s.Max), suffix)
}

// salaryPatterns are tried in order. Each captures (min, min-k-flag, max,
// max-k-flag) for a specific currency symbol.
var salaryPatterns = []struct {
	currency string
	re       *regexp.Regexp
}{
	{"USD", regexp.MustCompile(`(?i)\$\s*(\d[\d,]*)\s*(k)?\s*(?:[-–-]+|\bto\b)\s*\$?\s*(\d[\d,]*)\s*(k)?`)},
	{"GBP", regexp.MustCompile(`(?i)£\s*(\d[\d,]*)\s*(k)?\s*(?:[-–-]+|\bto\b)\s*£?\s*(\d[\d,]*)\s*(k)?`)},
	{"EUR", regexp.MustCompile(`(?i)€\s*(\d[\d,]*)\s*(k)?\s*(?:[-–-]+|\bto\b)\s*€?\s*(\d[\d,]*)\s*(k)?`)},
	{"INR", regexp.MustCompile(`(?i)₹\s*(\d[\d,]*)\s*(k)?\s*(?:[-–-]+|\bto\b)\s*₹?\s*(\d[\d,]*)\s*(k)?`)},
}

// codePrefixedPattern matches "USD 120,000 – 160,000" / "EUR 55k - 75k".
var codePrefixedPattern = regexp.MustCompile(
	`(?i)\b(USD|EUR|GBP|CAD|AUD|INR|SGD|JPY|CHF|NZD)\s*(\d[\d,]*)\s*(k)?\s*(?:[-–-]+|\bto\b)\s*(\d[\d,]*)\s*(k)?`,
)

// codeSuffixedPattern matches "120,000 – 160,000 USD" / "$120 - $160 USD/hr".
var codeSuffixedPattern = regexp.MustCompile(
	`(?i)\$?\s*(\d[\d,]*)\s*(k)?\s*(?:[-–-]+|\bto\b)\s*\$?\s*(\d[\d,]*)\s*(k)?\s*(USD|EUR|GBP|CAD|AUD|INR|SGD|JPY|CHF|NZD)\b`,
)

// ParseSalary tries to extract a salary range from free-form text (typically
// a job description or salary blurb).
func ParseSalary(text string) *Salary {
	if text == "" {
		return nil
	}

	// 1) Currency-symbol patterns (most common in US/EU postings).
	for _, p := range salaryPatterns {
		m := p.re.FindStringSubmatch(text)
		if m == nil {
			continue
		}
		min := parseSalaryNum(m[1], m[2])
		max := parseSalaryNum(m[3], m[4])
		if !validRange(min, max) {
			continue
		}
		return &Salary{Min: min, Max: max, Currency: p.currency, Period: classifySalaryPeriod(text)}
	}

	// 2) "USD 120k – 160k" form.
	if m := codePrefixedPattern.FindStringSubmatch(text); m != nil {
		currency := strings.ToUpper(m[1])
		min := parseSalaryNum(m[2], m[3])
		max := parseSalaryNum(m[4], m[5])
		if validRange(min, max) {
			return &Salary{Min: min, Max: max, Currency: currency, Period: classifySalaryPeriod(text)}
		}
	}

	// 3) "120,000 – 160,000 USD" form.
	if m := codeSuffixedPattern.FindStringSubmatch(text); m != nil {
		min := parseSalaryNum(m[1], m[2])
		max := parseSalaryNum(m[3], m[4])
		currency := strings.ToUpper(m[5])
		if validRange(min, max) {
			return &Salary{Min: min, Max: max, Currency: currency, Period: classifySalaryPeriod(text)}
		}
	}

	return nil
}

func parseSalaryNum(num, kSuffix string) int {
	cleaned := strings.ReplaceAll(num, ",", "")
	n, err := strconv.Atoi(cleaned)
	if err != nil {
		return 0
	}
	if strings.EqualFold(kSuffix, "k") {
		n *= 1000
	}
	return n
}

// validRange enforces sanity: positive, ordered, and within plausible bounds.
// We reject "$1 - $5" (probably matched a stock price) and "$10000000 - $20000000"
// (matched a market-cap blurb).
func validRange(min, max int) bool {
	if min <= 0 || max <= 0 || min > max {
		return false
	}
	if min < 1000 && max < 1000 {
		// Could be hourly - accept if both at least $5/hr.
		return min >= 5 && max >= 5 && max <= 2000
	}
	if max > 10_000_000 {
		return false
	}
	return true
}

func classifySalaryPeriod(text string) string {
	low := strings.ToLower(text)
	switch {
	case strings.Contains(low, "/hour"), strings.Contains(low, "per hour"),
		strings.Contains(low, "hourly"), strings.Contains(low, "/hr"):
		return "hourly"
	case strings.Contains(low, "/month"), strings.Contains(low, "per month"),
		strings.Contains(low, "monthly"), strings.Contains(low, "/mo"):
		return "monthly"
	case strings.Contains(low, "/week"), strings.Contains(low, "per week"),
		strings.Contains(low, "weekly"):
		return "weekly"
	case strings.Contains(low, "/day"), strings.Contains(low, "per day"),
		strings.Contains(low, "daily"):
		return "daily"
	default:
		return "annual"
	}
}

func currencySymbol(code string) string {
	switch strings.ToUpper(code) {
	case "USD", "CAD", "AUD", "NZD", "SGD":
		return "$"
	case "EUR":
		return "€"
	case "GBP":
		return "£"
	case "INR":
		return "₹"
	case "JPY":
		return "¥"
	case "CHF":
		return "CHF "
	default:
		return ""
	}
}

func formatThousands(n int) string {
	if n >= 10_000 {
		// Show as "120k" / "1,200k" - k-shorthand for any 5+ digit value.
		k := n / 1000
		// Only apply k-shorthand for clean multiples (multiples of 1k).
		if n%1000 == 0 {
			if k >= 1000 {
				return fmt.Sprintf("%d,%03dk", k/1000, k%1000)
			}
			return fmt.Sprintf("%dk", k)
		}
		// Otherwise show with commas.
	}
	return commaSep(n)
}

// ApplySalary parses salary from any of the provided text candidates (in
// order; first hit wins) and writes min/max/currency/period + a formatted
// SalaryRange display string back onto the metadata. No-op if nothing
// parseable was found in any candidate.
func ApplySalary(min, max *int, currency, period, displayRange *string, candidates ...string) {
	for _, c := range candidates {
		s := ParseSalary(c)
		if s == nil {
			continue
		}
		*min = s.Min
		*max = s.Max
		*currency = s.Currency
		*period = s.Period
		*displayRange = s.Format()
		return
	}
}

func commaSep(n int) string {
	s := strconv.Itoa(n)
	if len(s) <= 3 {
		return s
	}
	var out strings.Builder
	rem := len(s) % 3
	if rem > 0 {
		out.WriteString(s[:rem])
		if len(s) > rem {
			out.WriteString(",")
		}
	}
	for i := rem; i < len(s); i += 3 {
		out.WriteString(s[i : i+3])
		if i+3 < len(s) {
			out.WriteString(",")
		}
	}
	return out.String()
}
