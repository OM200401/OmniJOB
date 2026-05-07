import { describe, expect, test } from "bun:test";
import { classifyCountry } from "./location";

describe("classifyCountry — by country name", () => {
  const cases: Array<[string, string]> = [
    ["San Francisco, United States", "US"],
    ["London, United Kingdom", "GB"],
    ["Berlin, Germany", "DE"],
    ["Toronto, Canada", "CA"],
    ["Paris, France", "FR"],
    ["Tokyo, Japan", "JP"],
    ["Sydney, Australia", "AU"],
    ["Mumbai, India", "IN"],
    ["São Paulo, Brazil", "BR"],
    ["Tel Aviv, Israel", "IL"],
    ["Dubai, UAE", "AE"],
  ];

  for (const [loc, expected] of cases) {
    test(`"${loc}" → ${expected}`, () => {
      expect(classifyCountry(loc)).toBe(expected);
    });
  }
});

describe("classifyCountry — by city only", () => {
  test("Bay Area → US", () => expect(classifyCountry("Bay Area")).toBe("US"));
  test("NYC → US", () => expect(classifyCountry("NYC")).toBe("US"));
  test("Bengaluru → IN", () => expect(classifyCountry("Bengaluru")).toBe("IN"));
  test("Bangalore → IN", () => expect(classifyCountry("Bangalore")).toBe("IN"));
  test("Amsterdam → NL", () => expect(classifyCountry("Amsterdam")).toBe("NL"));
  test("Stockholm → SE", () => expect(classifyCountry("Stockholm")).toBe("SE"));
  test("Dublin → IE", () => expect(classifyCountry("Dublin")).toBe("IE"));
});

describe("classifyCountry — by ISO trail token", () => {
  test('"Paris, FR" → FR', () => expect(classifyCountry("Paris, FR")).toBe("FR"));
  test('"London, UK" → GB (UK is mapped to GB)', () => expect(classifyCountry("London, UK")).toBe("GB"));
  test('"London, GB" → GB', () => expect(classifyCountry("London, GB")).toBe("GB"));
  test('"Berlin, DE" → DE (Berlin city context disambiguates DE → Germany not Delaware)', () =>
    expect(classifyCountry("Berlin, DE")).toBe("DE"));
  test('"Munich, DE" → DE', () => expect(classifyCountry("Munich, DE")).toBe("DE"));
});

describe("classifyCountry — by US state / Canadian province", () => {
  test('"Austin, TX" → US', () => expect(classifyCountry("Austin, TX")).toBe("US"));
  test('"NY" → US', () => expect(classifyCountry("NY")).toBe("US"));
  test('"Vancouver, BC" → CA', () => expect(classifyCountry("Vancouver, BC")).toBe("CA"));
  test('"Toronto, ON" → CA', () => expect(classifyCountry("Toronto, ON")).toBe("CA"));
});

describe("classifyCountry — ambiguous trailing 2-letter code (state vs ISO-2)", () => {
  // These are the cases that motivated the fix: the trail token is both a
  // US state postal code AND an ISO-2 country code. Resolution defaults to
  // the US-state interpretation (real-world ATS strings overwhelmingly use
  // "City, ST" form for US states), but flips to country if the leading
  // city is a known non-US hub.
  test('"San Francisco, CA" → US (California, not Canada)', () =>
    expect(classifyCountry("San Francisco, CA")).toBe("US"));
  test('"San Jose, CA" → US', () => expect(classifyCountry("San Jose, CA")).toBe("US"));
  test('"Hayward, CA" → US', () => expect(classifyCountry("Hayward, CA")).toBe("US"));
  test('"Menlo Park, CA" → US', () => expect(classifyCountry("Menlo Park, CA")).toBe("US"));
  test('"Los Angeles, CA" → US', () => expect(classifyCountry("Los Angeles, CA")).toBe("US"));
  test('"Denver, CO" → US (Colorado, not Colombia)', () =>
    expect(classifyCountry("Denver, CO")).toBe("US"));
  test('"Wilmington, DE" → US (Delaware, not Germany)', () =>
    expect(classifyCountry("Wilmington, DE")).toBe("US"));
  test('"Mumbai, IN" → IN (Mumbai disambiguates IN → India)', () =>
    expect(classifyCountry("Mumbai, IN")).toBe("IN"));
  test('"Indianapolis, IN" → US (default to state when no non-US city context)', () =>
    expect(classifyCountry("Indianapolis, IN")).toBe("US"));
  test('"US, CA, Santa Clara" → US (multi-token string with US prefix)', () =>
    expect(classifyCountry("US, CA, Santa Clara")).toBe("US"));
});

describe("classifyCountry — alternate separators", () => {
  test('"WA - Vancouver" → US (space-dash separator splits like comma)', () =>
    expect(classifyCountry("WA - Vancouver")).toBe("US"));
  test('"United States - Remote" → US', () =>
    expect(classifyCountry("United States - Remote")).toBe("US"));
});

describe("classifyCountry — country-name word boundary", () => {
  // Regression: previously the country-name pass used naïve substring match,
  // so "Indianapolis" was tagged IN (India), "Sausalito" was tagged US via
  // "usa" substring, etc. Word-boundary check prevents these.
  test('"Indianapolis" alone is not parseable (no India match)', () =>
    expect(classifyCountry("Indianapolis")).toBeNull());
  test('"Sausalito, CA" → US (not matched on "usa" substring)', () =>
    expect(classifyCountry("Sausalito, CA")).toBe("US"));
});

describe("classifyCountry — UK aliases", () => {
  test('"Britain" → GB', () => expect(classifyCountry("Britain")).toBe("GB"));
  test('"Great Britain" → GB', () => expect(classifyCountry("Great Britain")).toBe("GB"));
  test('"England" → GB', () => expect(classifyCountry("England")).toBe("GB"));
  test('"U.K." → GB', () => expect(classifyCountry("U.K.")).toBe("GB"));
  test('"UK" alone → GB', () => expect(classifyCountry("UK")).toBe("GB"));
});

describe("classifyCountry — null/empty", () => {
  test("undefined → null", () => expect(classifyCountry(undefined)).toBeNull());
  test("null → null", () => expect(classifyCountry(null)).toBeNull());
  test("empty string → null", () => expect(classifyCountry("")).toBeNull());
  test("Worldwide remote → null", () => expect(classifyCountry("Worldwide")).toBeNull());
  test('Unparseable text → null', () => expect(classifyCountry("Mars Colony")).toBeNull());
});

describe("classifyCountry — multi-word names match before substrings", () => {
  test("'United States of America' matches before 'America'", () => {
    expect(classifyCountry("United States of America")).toBe("US");
  });
  test("'Czech Republic' matches", () => {
    expect(classifyCountry("Prague, Czech Republic")).toBe("CZ");
  });
});
