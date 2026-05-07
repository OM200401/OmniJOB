// Heuristic location → ISO-3166-1 alpha-2 country code. Mirrors the Go
// crawler's classifier in apps/crawler/internal/sources/location.go so that
// payload.country lines up whether it was computed at ingest time or here on
// read. Returns null for unparseable / worldwide-remote locations.

const COUNTRY_NAMES: Record<string, string> = {
  "united states of america": "US",
  "united states": "US",
  "u.s.a.": "US",
  "u.s.": "US",
  "usa": "US",
  "america": "US",
  "united kingdom": "GB",
  "u.k.": "GB",
  "great britain": "GB",
  "britain": "GB",
  "england": "GB",
  "scotland": "GB",
  "wales": "GB",
  "northern ireland": "GB",
  "canada": "CA",
  "germany": "DE",
  "deutschland": "DE",
  "france": "FR",
  "netherlands": "NL",
  "the netherlands": "NL",
  "holland": "NL",
  "ireland": "IE",
  "spain": "ES",
  "españa": "ES",
  "italy": "IT",
  "italia": "IT",
  "portugal": "PT",
  "poland": "PL",
  "sweden": "SE",
  "finland": "FI",
  "denmark": "DK",
  "norway": "NO",
  "switzerland": "CH",
  "austria": "AT",
  "belgium": "BE",
  "czech republic": "CZ",
  "czechia": "CZ",
  "romania": "RO",
  "greece": "GR",
  "turkey": "TR",
  "india": "IN",
  "singapore": "SG",
  "japan": "JP",
  "south korea": "KR",
  "korea": "KR",
  "taiwan": "TW",
  "hong kong": "HK",
  "china": "CN",
  "indonesia": "ID",
  "malaysia": "MY",
  "philippines": "PH",
  "thailand": "TH",
  "vietnam": "VN",
  "australia": "AU",
  "new zealand": "NZ",
  "brazil": "BR",
  "brasil": "BR",
  "mexico": "MX",
  "argentina": "AR",
  "chile": "CL",
  "colombia": "CO",
  "peru": "PE",
  "israel": "IL",
  "united arab emirates": "AE",
  "uae": "AE",
  "saudi arabia": "SA",
  "south africa": "ZA",
  "nigeria": "NG",
  "egypt": "EG",
  "kenya": "KE",
};

const CITY_COUNTRY: Record<string, string> = {
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
  "toronto": "CA", "vancouver": "CA", "montreal": "CA",
  "ottawa": "CA", "calgary": "CA", "waterloo": "CA",
  "london": "GB", "manchester": "GB", "edinburgh": "GB",
  "glasgow": "GB", "cambridge": "GB", "oxford": "GB",
  "bristol": "GB",
  "dublin": "IE",
  "berlin": "DE", "munich": "DE", "münchen": "DE",
  "hamburg": "DE", "frankfurt": "DE", "köln": "DE", "cologne": "DE",
  "paris": "FR", "lyon": "FR",
  "amsterdam": "NL", "rotterdam": "NL", "utrecht": "NL",
  "madrid": "ES", "barcelona": "ES",
  "milan": "IT", "rome": "IT",
  "stockholm": "SE", "gothenburg": "SE",
  "copenhagen": "DK", "oslo": "NO", "helsinki": "FI",
  "zurich": "CH", "zürich": "CH", "geneva": "CH",
  "vienna": "AT", "warsaw": "PL", "krakow": "PL",
  "prague": "CZ", "brussels": "BE",
  "bangalore": "IN", "bengaluru": "IN", "mumbai": "IN",
  "delhi": "IN", "hyderabad": "IN", "pune": "IN",
  "chennai": "IN", "noida": "IN", "gurgaon": "IN",
  "tokyo": "JP", "osaka": "JP",
  "sydney": "AU", "melbourne": "AU",
  "seoul": "KR", "taipei": "TW",
  "shanghai": "CN", "beijing": "CN",
  "hong kong": "HK",
  "são paulo": "BR", "sao paulo": "BR", "rio de janeiro": "BR",
  "mexico city": "MX", "ciudad de méxico": "MX",
  "buenos aires": "AR", "santiago": "CL",
  "tel aviv": "IL", "dubai": "AE",
  "cape town": "ZA", "johannesburg": "ZA",
};

const US_STATES = new Set([
  "al","ak","az","ar","ca","co","ct","de","fl","ga","hi","id",
  "il","in","ia","ks","ky","la","me","md","ma","mi","mn","ms",
  "mo","mt","ne","nv","nh","nj","nm","ny","nc","nd","oh","ok",
  "or","pa","ri","sc","sd","tn","tx","ut","vt","va","wa","wv",
  "wi","wy","dc",
]);
const CA_PROVINCES = new Set([
  "on","qc","bc","ab","mb","sk","ns","nb","nl","pe","yt","nt","nu",
]);
const ISO2_TRAIL = new Set([
  "us","uk","gb","ca","de","fr","nl","ie","es","it","pt","pl",
  "se","fi","dk","no","ch","at","be","in","sg","jp","kr","tw",
  "hk","cn","id","my","ph","th","vn","au","nz","br","mx","ar",
  "cl","co","il","ae","za","ng",
]);

// Country names sorted by length desc, so multi-word names match before
// shorter overlapping subsequences.
const SORTED_COUNTRY_KEYS = Object.keys(COUNTRY_NAMES).sort(
  (a, b) => b.length - a.length,
);
const SORTED_CITY_KEYS = Object.keys(CITY_COUNTRY).sort(
  (a, b) => b.length - a.length,
);

// Word-boundary substring test that avoids matching country names embedded
// in longer words (e.g. "india" inside "indianapolis", "usa" inside
// "Sausalito"). Matches if the needle appears as a sequence flanked by
// non-letter characters or string boundaries.
function containsWord(haystack: string, needle: string): boolean {
  let from = 0;
  while (true) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) return false;
    const before = idx > 0 ? haystack.charCodeAt(idx - 1) : 0;
    const afterIdx = idx + needle.length;
    const after = afterIdx < haystack.length ? haystack.charCodeAt(afterIdx) : 0;
    const isLetter = (c: number) =>
      (c >= 0x61 && c <= 0x7a) || (c >= 0x30 && c <= 0x39);
    if (!isLetter(before) && !isLetter(after)) return true;
    from = idx + 1;
  }
}

// 2-letter codes that are simultaneously US state postal codes AND ISO-2
// country codes. For these we need disambiguation via context (city in the
// leading token, or fallback ordering).
const AMBIGUOUS_STATE_ISO2: Record<string, string> = {
  ca: "CA", // California vs Canada
  co: "CO", // Colorado vs Colombia
  de: "DE", // Delaware vs Germany
  in: "IN", // Indiana vs India
};

function lookupCity(text: string): string | null {
  for (const city of SORTED_CITY_KEYS) {
    if (containsWord(text, city)) return CITY_COUNTRY[city]!;
  }
  return null;
}

export function classifyCountry(loc: string | undefined | null): string | null {
  if (!loc) return null;
  const l = loc.toLowerCase();

  for (const name of SORTED_COUNTRY_KEYS) {
    if (containsWord(l, name)) return COUNTRY_NAMES[name]!;
  }

  // Trailing comma / pipe / dash / slash tokens. Walk back-to-front.
  // Resolution priority is: US states → CA provinces → ISO-2 trail.
  // Real-world ATS strings overwhelmingly use "City, ST" for US/CA states,
  // so when an ambiguous 2-letter token like "CA" appears we prefer the
  // state interpretation (California → US) over the country code (Canada).
  //
  // For tokens that are BOTH a US state AND an ISO-2 code (CA/CO/DE/IN), we
  // disambiguate using the leading tokens: if any of them resolves to a
  // known city of a non-US country, the trailing token is the country code,
  // not the state. Example: "Berlin, DE" → DE (Berlin is a German city, so
  // DE is Germany not Delaware); "San Francisco, CA" → US (SF is a US city,
  // so CA is California not Canada).
  const parts = l
    .split(/[,·|/]|\s-\s/)
    .map((p) => p.trim())
    .filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]!;
    if (AMBIGUOUS_STATE_ISO2[p] !== undefined) {
      // Disambiguate via city context in the *leading* tokens (everything
      // to the left of this position).
      const leading = parts.slice(0, i).join(" ");
      const cityCountry = leading ? lookupCity(leading) : null;
      if (cityCountry && cityCountry !== "US") return cityCountry;
      // Default for ambiguous code: treat as US state. Real-world ATS
      // strings overwhelmingly use "City, ST" form for US states, and the
      // country-name pass above already caught explicit "Berlin, Germany".
      return "US";
    }
    if (US_STATES.has(p)) return "US";
    if (CA_PROVINCES.has(p)) return "CA";
    if (ISO2_TRAIL.has(p)) return p === "uk" ? "GB" : p.toUpperCase();
  }

  return lookupCity(l);
}
