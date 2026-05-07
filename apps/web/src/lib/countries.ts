// Common countries shown as checkboxes in the feed sidebar. Anything not on
// this list still passes through the API's country filter - the user can
// type a city/region into the location text input instead.

export type CountryEntry = { code: string; name: string };

export const COMMON_COUNTRIES: CountryEntry[] = [
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "GB", name: "United Kingdom" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "NL", name: "Netherlands" },
  { code: "IE", name: "Ireland" },
  { code: "ES", name: "Spain" },
  { code: "PL", name: "Poland" },
  { code: "IN", name: "India" },
  { code: "SG", name: "Singapore" },
  { code: "AU", name: "Australia" },
  { code: "JP", name: "Japan" },
  { code: "BR", name: "Brazil" },
  { code: "IL", name: "Israel" },
];

const COUNTRY_NAMES: Record<string, string> = Object.fromEntries(
  COMMON_COUNTRIES.map((c) => [c.code, c.name]),
);

export function countryName(code: string | undefined): string | undefined {
  if (!code) return undefined;
  return COUNTRY_NAMES[code];
}

// ISO-2 → regional indicator emoji (🇺🇸 etc.). Returns "" for invalid codes.
export function flagEmoji(code: string | undefined): string {
  if (!code || code.length !== 2) return "";
  const A = 0x41;
  const RI = 0x1f1e6; // regional indicator A
  const cu = code.toUpperCase();
  const c1 = cu.charCodeAt(0);
  const c2 = cu.charCodeAt(1);
  if (c1 < A || c1 > A + 25 || c2 < A || c2 > A + 25) return "";
  return String.fromCodePoint(RI + (c1 - A), RI + (c2 - A));
}
