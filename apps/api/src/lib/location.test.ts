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
  test('"Berlin, DE" → DE', () => expect(classifyCountry("Berlin, DE")).toBe("DE"));
});

describe("classifyCountry — by US state / Canadian province", () => {
  test('"Austin, TX" → US', () => expect(classifyCountry("Austin, TX")).toBe("US"));
  test('"NY" → US', () => expect(classifyCountry("NY")).toBe("US"));
  test('"Vancouver, BC" → CA', () => expect(classifyCountry("Vancouver, BC")).toBe("CA"));
  test('"Toronto, ON" → CA', () => expect(classifyCountry("Toronto, ON")).toBe("CA"));
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
