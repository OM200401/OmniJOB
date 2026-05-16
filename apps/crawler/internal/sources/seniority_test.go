package sources

import "testing"

// Mirrors the TS regression table in apps/api/src/lib/seniority.test.ts.
// If you add a case to one, add it to the other. The two classifiers run on
// different sides of the pipeline (Go at ingest, TS on read) and stored
// experience_level is correct only when they agree.

func TestClassifyBody(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		// Section-aware mode: real production miss cases captured 2026-05-15.
		{"Basic Qualifications: At least 5 years of experience in business analysis.", "mid"},
		{"WHAT YOU NEED — 3 years minimum experience in Partner Sales", "mid"},
		{"Requirements: 7+ years of enterprise sales experience in the federal civilian space.", "senior"},
		{"Required Experience: 10+ years of experience working within the out-of-order CPU domain.", "senior"},
		{"Minimum requirements: 10+ years of relevant B2B marketing experience.", "senior"},
		{"REQUIRED EXPERIENCE: 7+ years of experience in a technical, hands-on customer role.", "senior"},
		{"Qualifications: 3+ years of outbound experience in software or technology sales.", "mid"},
		{"What you'll bring: 5+ years of experience of Software Engineering.", "mid"},
		// Range: lower bound rules ("5-7 years" = 5 = mid)
		{"Requirements: 5-7 years of engineering experience.", "mid"},
		{"Minimum Qualifications: 1-3 years of relevant experience.", "junior"},

		// Keyword-anchored fallback - no section header, classic YOE phrasing.
		{"You'll have 0-2 years of professional experience.", "junior"},
		{"Looking for someone with 7+ years of software engineering experience.", "senior"},
		{"We're hiring new grads for our summer cohort.", "junior"},
		{"This is an entry-level role on the platform team.", "junior"},

		// HTML-wrapped content (no pre-strip from caller)
		{"<h4>Minimum requirements</h4><ul><li>10+ years of relevant B2B marketing experience</li></ul>", "senior"},

		// False-positive guards: prose with year-count phrases must NOT
		// classify. The section anchor is absent and the keyword guard
		// rejects the structure.
		{"Amazon has 25 years of experience serving customers worldwide.", ""},
		{"We've been in business for 15 years.", ""},
		{"Our team of 10 engineers is growing.", ""},

		// Empty / null
		{"", ""},
	}
	for _, c := range cases {
		got := classifyBody(c.in)
		if got != c.want {
			t.Errorf("classifyBody(%q) = %q, want %q", trim(c.in), got, c.want)
		}
	}
}

func TestClassifyLevelFromBody(t *testing.T) {
	cases := []struct {
		title, body, want string
	}{
		// Body wins over generic title.
		{"Software Engineer", "Minimum Qualifications: 7+ years of experience in distributed systems.", "senior"},
		// Body and title agree.
		{"Senior Software Engineer", "Requirements: 8+ years of software engineering experience.", "senior"},
		// Title falls through when body has no signal.
		{"Senior Software Engineer", "Build great products.", "senior"},
		// Off-IC titles OVERRIDE body.
		{"Engineering Manager", "Requirements: 5+ years of experience leading teams.", "manager"},
		{"Director of Engineering", "You'll bring 10+ years of engineering experience.", "director"},
		{"VP of Engineering", "Required: 15+ years of experience leading platform teams.", "executive"},
		// Empty both → empty
		{"Software Engineer", "Build great products.", ""},
		// Recent-graduate body signal beats generic title
		{"Software Engineer", "We're hiring recent graduates with 0-2 years of professional software experience.", "junior"},
	}
	for _, c := range cases {
		got := classifyLevelFromBody(c.title, c.body)
		if got != c.want {
			t.Errorf("classifyLevelFromBody(%q, %q) = %q, want %q", c.title, trim(c.body), got, c.want)
		}
	}
}

func trim(s string) string {
	if len(s) > 60 {
		return s[:60] + "…"
	}
	return s
}
