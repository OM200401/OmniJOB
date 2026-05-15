package sources

import "testing"

// Regression cases for classifyCountry. Mirrors the cases in
// apps/api/src/lib/location.ts (TS classifier) so the two implementations
// stay in lockstep. If you add a country/city to one, add it to both AND
// extend this table.
func TestClassifyCountry(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		// Eastern Europe additions (the bug report - Ukraine jobs were
		// inheriting CA from stored country because classifier returned "").
		{"Kyiv, Ukraine", "UA"},
		{"Lviv, Ukraine", "UA"},
		{"Budapest, Hungary", "HU"},
		{"Moscow, Russian Federation", "RU"},
		{"Belgrade, Serbia", "RS"},
		{"Reykjavik, Iceland", "IS"},
		{"Tallinn, Estonia", "EE"},
		{"Riga, Latvia", "LV"},

		// US/CA ambiguity sanity (regressions on these would be very visible
		// on /feed because they're 90%+ of our corpus).
		{"Seattle, WA", "US"},
		{"Graham, Texas, United States of America", "US"},
		{"Wildwood, New Jersey, United States of America", "US"},
		{"Toronto, ON", "CA"},
		{"Vancouver, BC, Canada", "CA"},
		{"Vancouver, WA", "US"}, // common gotcha: Vancouver, Washington
		{"London, ON", "CA"},    // London, Ontario - common gotcha
		{"London, UK", "GB"},

		// Empty / unparseable: must return "".
		{"", ""},
		{"Remote", ""},
		{"Worldwide", ""},
	}
	for _, c := range cases {
		got := classifyCountry(c.in)
		if got != c.want {
			t.Errorf("classifyCountry(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}
