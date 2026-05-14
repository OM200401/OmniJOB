import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Bell, BookmarkPlus, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { useAuth } from "../lib/auth";
import {
  api,
  INDUSTRY_OPTIONS,
  type ExperienceLevel,
  type Industry,
  type JobHit,
  type RemoteStatus,
  type SortMode,
  type SourceName,
} from "../lib/api";
import {
  type SavedSearch,
  type SavedSearchFilters,
} from "../lib/crypto/vault";
import { COMMON_COUNTRIES, flagEmoji } from "../lib/countries";
import { Alert } from "../components/Alert";
import { JobCard } from "../components/JobCard";
import { EmptyState } from "../components/EmptyState";

const REMOTES: { value: RemoteStatus; label: string }[] = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "Onsite" },
];

const LEVELS: { value: ExperienceLevel; label: string }[] = [
  { value: "intern", label: "Internship" },
  { value: "junior", label: "Junior / new grad" },
  { value: "mid", label: "Mid-level" },
  { value: "senior", label: "Senior" },
  { value: "staff", label: "Staff" },
  { value: "principal", label: "Principal" },
];

// Off-IC ladder, surfaced as its own filter group. Pre-1C these existed in
// the schema (apps/api/src/schemas/job.ts Level) but were excluded from the
// UI - a director job could be ingested but no filter could reach it.
const LEVELS_MANAGEMENT: { value: ExperienceLevel; label: string }[] = [
  { value: "manager", label: "Manager" },
  { value: "director", label: "Director" },
  { value: "executive", label: "Executive / VP" },
];

const SOURCES: { value: SourceName; label: string }[] = [
  { value: "greenhouse", label: "Greenhouse" },
  { value: "lever", label: "Lever" },
  { value: "ashby", label: "Ashby" },
  { value: "smartrecruiters", label: "SmartRecruiters" },
  { value: "workable", label: "Workable" },
  { value: "recruitee", label: "Recruitee" },
];

// Allowed values for URL-encoded enum filters. Anything outside these sets
// is dropped on parse so a crafted URL can't smuggle a bogus enum into the
// API request.
const EXP_VALUES = new Set<ExperienceLevel>([
  "intern",
  "junior",
  "mid",
  "senior",
  "staff",
  "principal",
  "manager",
  "director",
  "executive",
]);
const REMOTE_VALUES = new Set<RemoteStatus>(["remote", "hybrid", "onsite"]);
const SOURCE_VALUES = new Set<SourceName>([
  "greenhouse",
  "lever",
  "ashby",
  "smartrecruiters",
  "workable",
  "recruitee",
]);
const INDUSTRY_VALUES = new Set<Industry>(INDUSTRY_OPTIONS.map((o) => o.value));

// Order is the order the dropdown renders; "posted_desc" first because
// it's the default and what most visitors want.
const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: "posted_desc", label: "Newest posted" },
  { value: "posted_asc", label: "Oldest posted" },
  { value: "scraped_desc", label: "Recently added" },
];
const SORT_VALUES = new Set<SortMode>(SORT_OPTIONS.map((o) => o.value));

function parseCsv<T extends string>(
  raw: string | null,
  allowed: Set<T>,
): T[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => allowed.has(s as T)) as T[];
}

function parseInt0(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function Feed() {
  const { session, patchProfile, vaultSkipped } = useAuth();
  // URL-derived state. The initializer reads the params ONCE on mount so
  // that landing on /feed?q=foo&page=2 restores the user back to exactly
  // that view. After mount, the URL is treated as a write-only mirror of
  // local state via the syncing useEffect below.
  const [searchParams, setSearchParams] = useSearchParams();
  // Snapshot the initial params so the seeding logic below doesn't re-fire
  // on every URL write. We intentionally do NOT include `searchParams` in
  // any deps - the URL is downstream of state after mount.
  const initialParamsRef = useRef(searchParams);

  const initialLevels: ExperienceLevel[] = (() => {
    const fromUrl = parseCsv(initialParamsRef.current.get("exp"), EXP_VALUES);
    if (fromUrl.length > 0) return fromUrl;
    return session?.profile.preferences.level
      ? [session.profile.preferences.level]
      : [];
  })();
  const initialRemotes: RemoteStatus[] = (() => {
    const fromUrl = parseCsv(initialParamsRef.current.get("remote"), REMOTE_VALUES);
    if (fromUrl.length > 0) return fromUrl;
    return session?.profile.preferences.remotePref &&
      session.profile.preferences.remotePref !== "any"
      ? [session.profile.preferences.remotePref as RemoteStatus]
      : [];
  })();
  const initialQuery = initialParamsRef.current.get("q") ?? "";
  const initialLocation = initialParamsRef.current.get("loc") ?? "";
  const initialCompany = initialParamsRef.current.get("co") ?? "";
  const initialSources = parseCsv(initialParamsRef.current.get("source"), SOURCE_VALUES);
  const initialIndustries: Industry[] = (() => {
    const fromUrl = parseCsv(initialParamsRef.current.get("ind"), INDUSTRY_VALUES);
    if (fromUrl.length > 0) return fromUrl;
    // Seed from preferences (set during onboarding). Empty array = no
    // industry filter applied; the user is browsing across industries.
    return session?.profile.preferences.industry
      ? [session.profile.preferences.industry as Industry]
      : [];
  })();
  const initialCountries = (() => {
    const raw = initialParamsRef.current.get("country");
    if (!raw) return [];
    return raw
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => /^[A-Z]{2}$/.test(s));
  })();
  const initialSalaryMin = parseInt0(initialParamsRef.current.get("salmin"));
  const initialRequireSalary = initialParamsRef.current.get("reqsal") === "1";
  // hide_stale defaults to ON; only `0` flips it off.
  const initialHideStale = initialParamsRef.current.get("hide_stale") !== "0";
  const initialPage = Math.max(1, parseInt0(initialParamsRef.current.get("page")) ?? 1);
  const initialSort: SortMode = (() => {
    const raw = initialParamsRef.current.get("sort");
    return raw && SORT_VALUES.has(raw as SortMode) ? (raw as SortMode) : "posted_desc";
  })();

  const [query, setQuery] = useState(initialQuery);
  const [debouncedQuery, setDebouncedQuery] = useState(initialQuery);
  const [companyFilter, setCompanyFilter] = useState(initialCompany);
  const [locationFilter, setLocationFilter] = useState(initialLocation);
  const [debouncedLocation, setDebouncedLocation] = useState(initialLocation);
  const [debouncedCompany, setDebouncedCompany] = useState(initialCompany);
  const [levels, setLevels] = useState<ExperienceLevel[]>(initialLevels);
  const [remotes, setRemotes] = useState<RemoteStatus[]>(initialRemotes);
  const [sources, setSources] = useState<SourceName[]>(initialSources);
  const [industries, setIndustries] = useState<Industry[]>(initialIndustries);
  const [countries, setCountries] = useState<string[]>(initialCountries);
  const [salaryMin, setSalaryMin] = useState<number | null>(initialSalaryMin); // USD-annual floor
  const [requireSalary, setRequireSalary] = useState(initialRequireSalary);
  const [hideStale, setHideStale] = useState(initialHideStale); // hide postings 45d+ old
  const [sort, setSort] = useState<SortMode>(initialSort);

  const [hits, setHits] = useState<JobHit[] | null>(null);
  // Server-reported candidate pool size (post-filter survivors). Used to
  // render "Showing 20 of 137 matches" so users understand truncation.
  // Falls back to hits.length when the API didn't supply a total.
  const [totalMatches, setTotalMatches] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // 1-indexed page state. The server slices a `pageSize` window off the
  // post-filter pool starting at `(page - 1) * pageSize`. Stays in lockstep
  // with the API contract; resets to 1 whenever the underlying query /
  // filters / saved-search selection change so we never request a page
  // that no longer exists.
  const PAGE_SIZE = 25;
  const [page, setPage] = useState(initialPage);

  // Saved-searches state. The "+N new" badge for each is computed on mount
  // by re-running the search in the background and diffing against
  // `lastResultIds`. The active id is set when a saved search is loaded so
  // that the *next* result set updates that search's snapshot exactly once.
  const savedSearches = useMemo(
    () => session?.profile.preferences.savedSearches ?? [],
    [session?.profile.preferences.savedSearches],
  );
  const [savedNewCounts, setSavedNewCounts] = useState<Record<string, number>>({});
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState("");
  const pendingSavedSearchRef = useRef<string | null>(null);
  // ID of the currently-active saved search (set when the user clicks one
  // in the sidebar, or seeded from the `saved` URL param on mount). Used
  // purely to round-trip the URL; we don't gate any rendering on it.
  const initialSavedId = (() => {
    const raw = initialParamsRef.current.get("saved");
    if (!raw) return null;
    return savedSearches.some((s) => s.id === raw) ? raw : null;
  })();
  const [activeSavedId, setActiveSavedId] = useState<string | null>(initialSavedId);

  const skill = session?.profile.skillVector;
  // No-vault mode: user has no résumé embedding to rank by. Either they
  // skipped onboarding ("vaultSkipped"), or they signed in fresh and never
  // finished it. In that case the typed query IS the only ranking signal.
  const noVault = vaultSkipped || !skill || skill.length === 0;
  const savedSet = useMemo(
    () => new Set(session?.profile.savedJobIds ?? []),
    [session?.profile.savedJobIds],
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const saveInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedLocation(locationFilter.trim()), 250);
    return () => clearTimeout(t);
  }, [locationFilter]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedCompany(companyFilter.trim()), 250);
    return () => clearTimeout(t);
  }, [companyFilter]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Index of the keyboard-focused job card. -1 = no card focused. Mouse
  // hover does not set this; only j/k navigation does, so the outline
  // ring stays a true keyboard affordance.
  const [kbdFocusedIdx, setKbdFocusedIdx] = useState(-1);
  useEffect(() => {
    setKbdFocusedIdx(-1);
  }, [hits]);

  const search = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      // Pick the ranking signal:
      //   - typed query (>=2 chars): embed it, use that as the vector
      //   - else, vault user: rank by their résumé embedding
      //   - else (no-vault, no query): browse mode - omit vector entirely
      //     so the server returns recent jobs ordered by scraped_at desc.
      // Filters apply in every case.
      let vector: number[] | undefined;
      if (debouncedQuery.length >= 2) {
        const { vector: qv } = await api.embed(debouncedQuery, { expand: true });
        vector = qv;
      } else if (!noVault && skill && skill.length > 0) {
        vector = skill;
      } else {
        vector = undefined;
      }

      const offset = (page - 1) * PAGE_SIZE;
      const { hits, total } = await api.searchJobs(vector, {
        k: PAGE_SIZE,
        offset,
        ...(debouncedQuery ? { query: debouncedQuery } : {}),
        ...(remotes.length > 0 && remotes.length < 3 ? { remote_status: remotes } : {}),
        ...(levels.length > 0 ? { experience_level: levels } : {}),
        ...(industries.length > 0 ? { industry: industries } : {}),
        ...(sources.length > 0 && sources.length < SOURCES.length ? { source: sources } : {}),
        ...(countries.length > 0 ? { country: countries } : {}),
        ...(debouncedLocation ? { location: debouncedLocation } : {}),
        ...(debouncedCompany ? { company: debouncedCompany } : {}),
        ...(salaryMin !== null ? { salary_min_usd: salaryMin } : {}),
        ...(requireSalary ? { require_salary: true } : {}),
        ...(hideStale ? { max_age_days: 45 } : {}),
        ...(sort !== "posted_desc" ? { sort } : {}),
      });
      setHits(hits);
      setTotalMatches(total ?? hits.length);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [noVault, skill, debouncedQuery, remotes, levels, industries, sources, countries, debouncedLocation, debouncedCompany, salaryMin, requireSalary, hideStale, sort, page]);

  useEffect(() => {
    void search();
  }, [search]);

  // Reset to page 1 whenever the underlying query, any filter, or the
  // active saved-search selection changes. Without this a user on page 3
  // who types a new query would request offset=50 against a result set
  // that may have only 10 hits, landing them on an empty page. We deliberately
  // do NOT include `page` itself in the deps; the user clicking Prev/Next
  // is the one path that should NOT reset. The first run is skipped so the
  // URL-seeded `page` survives mount.
  const firstFilterChangeRef = useRef(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (firstFilterChangeRef.current) {
      firstFilterChangeRef.current = false;
      return;
    }
    setPage(1);
  }, [
    debouncedQuery,
    debouncedLocation,
    debouncedCompany,
    levels,
    remotes,
    industries,
    sources,
    countries,
    salaryMin,
    requireSalary,
    hideStale,
    sort,
  ]);

  // Mirror local Feed state into the URL so that navigating away and back
  // (e.g. clicking a JobCard then pressing the browser back button) restores
  // the user's query, filters, and page. Uses `replace: true` so each
  // keystroke or filter toggle does NOT push a new history entry - the
  // back button always returns to wherever the user came from before /feed.
  // Empty / default values are omitted to keep URLs short and shareable.
  useEffect(() => {
    const next = new URLSearchParams();
    if (debouncedQuery) next.set("q", debouncedQuery);
    if (page > 1) next.set("page", String(page));
    if (levels.length > 0) next.set("exp", levels.join(","));
    if (remotes.length > 0) next.set("remote", remotes.join(","));
    if (industries.length > 0) next.set("ind", industries.join(","));
    if (countries.length > 0) next.set("country", countries.join(","));
    if (sources.length > 0) next.set("source", sources.join(","));
    if (debouncedLocation) next.set("loc", debouncedLocation);
    if (debouncedCompany) next.set("co", debouncedCompany);
    if (salaryMin !== null) next.set("salmin", String(salaryMin));
    if (requireSalary) next.set("reqsal", "1");
    if (!hideStale) next.set("hide_stale", "0");
    if (sort !== "posted_desc") next.set("sort", sort);
    if (activeSavedId) next.set("saved", activeSavedId);
    setSearchParams(next, { replace: true });
  }, [
    debouncedQuery,
    page,
    levels,
    remotes,
    industries,
    countries,
    sources,
    debouncedLocation,
    debouncedCompany,
    salaryMin,
    requireSalary,
    hideStale,
    sort,
    activeSavedId,
    setSearchParams,
  ]);

  // Background-evaluate saved searches once skill is loaded, so the sidebar
  // can show "+N new" badges. Bails on cancellation; failures per-search are
  // swallowed so a single broken filter doesn't blank the panel.
  useEffect(() => {
    let cancelled = false;
    if (!skill || skill.length === 0 || savedSearches.length === 0) {
      setSavedNewCounts({});
      return;
    }
    (async () => {
      const counts: Record<string, number> = {};
      for (const ss of savedSearches) {
        try {
          let vector = skill;
          if (ss.query.length >= 2) {
            const { vector: qv } = await api.embed(ss.query, { expand: true });
            vector = qv;
          }
          const { hits: ssHits } = await api.searchJobs(vector, {
            k: 60,
            ...(ss.query ? { query: ss.query } : {}),
            ...(ss.filters.remotes?.length ? { remote_status: ss.filters.remotes as RemoteStatus[] } : {}),
            ...(ss.filters.levels?.length ? { experience_level: ss.filters.levels as ExperienceLevel[] } : {}),
            ...(ss.filters.industries?.length ? { industry: ss.filters.industries as Industry[] } : {}),
            ...(ss.filters.sources?.length ? { source: ss.filters.sources as SourceName[] } : {}),
            ...(ss.filters.countries?.length ? { country: ss.filters.countries } : {}),
            ...(ss.filters.location ? { location: ss.filters.location } : {}),
            ...(ss.filters.company ? { company: ss.filters.company } : {}),
            ...(ss.filters.salaryMin !== undefined ? { salary_min_usd: ss.filters.salaryMin } : {}),
            ...(ss.filters.requireSalary ? { require_salary: true } : {}),
            max_age_days: 45,
          });
          const lastIds = new Set(ss.lastResultIds);
          counts[ss.id] = ssHits.filter((h) => !lastIds.has(String(h.id))).length;
        } catch {
          counts[ss.id] = 0;
        }
        if (cancelled) return;
      }
      if (!cancelled) setSavedNewCounts(counts);
    })();
    return () => {
      cancelled = true;
    };
    // We intentionally only re-run when skill or saved-search count/IDs change,
    // not on every filter change in the foreground UI.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skill, savedSearches.map((s) => s.id + s.lastCheckedAt).join("|")]);

  // After applying a saved search, when the resulting hits arrive, snapshot
  // them as the new `lastResultIds` for that saved search and clear its
  // "+N new" badge. Runs at most once per `applySaved` call.
  useEffect(() => {
    const id = pendingSavedSearchRef.current;
    if (!id || !session || !hits) return;
    pendingSavedSearchRef.current = null;
    const updated = session.profile.preferences.savedSearches.map((s) =>
      s.id === id
        ? { ...s, lastResultIds: hits.map((h) => String(h.id)), lastCheckedAt: Date.now() }
        : s,
    );
    void patchProfile({
      preferences: { ...session.profile.preferences, savedSearches: updated },
    });
    setSavedNewCounts((c) => ({ ...c, [id]: 0 }));
  }, [hits, session, patchProfile]);

  const currentFilters: SavedSearchFilters = useMemo(
    () => ({
      ...(levels.length ? { levels } : {}),
      ...(remotes.length ? { remotes } : {}),
      ...(industries.length ? { industries } : {}),
      ...(sources.length ? { sources } : {}),
      ...(countries.length ? { countries } : {}),
      ...(debouncedLocation ? { location: debouncedLocation } : {}),
      ...(debouncedCompany ? { company: debouncedCompany } : {}),
      ...(salaryMin !== null ? { salaryMin } : {}),
      ...(requireSalary ? { requireSalary } : {}),
    }),
    [levels, remotes, industries, sources, countries, debouncedLocation, debouncedCompany, salaryMin, requireSalary],
  );

  const hasSavableState =
    debouncedQuery.trim().length > 0 ||
    Object.keys(currentFilters).length > 0;

  const saveCurrentSearch = (rawName: string) => {
    if (!session) return;
    const name = rawName.trim();
    if (!name) return;
    const ss: SavedSearch = {
      id: crypto.randomUUID(),
      name,
      query: debouncedQuery,
      filters: currentFilters,
      createdAt: Date.now(),
      lastCheckedAt: Date.now(),
      lastResultIds: (hits ?? []).map((h) => String(h.id)),
    };
    void patchProfile({
      preferences: {
        ...session.profile.preferences,
        savedSearches: [...session.profile.preferences.savedSearches, ss],
      },
    });
    setShowSaveDialog(false);
    setSaveName("");
  };

  const applySaved = (ss: SavedSearch) => {
    setQuery(ss.query);
    setLevels((ss.filters.levels ?? []) as ExperienceLevel[]);
    setRemotes((ss.filters.remotes ?? []) as RemoteStatus[]);
    setIndustries((ss.filters.industries ?? []) as Industry[]);
    setSources((ss.filters.sources ?? []) as SourceName[]);
    setCountries(ss.filters.countries ?? []);
    setLocationFilter(ss.filters.location ?? "");
    setCompanyFilter(ss.filters.company ?? "");
    setSalaryMin(ss.filters.salaryMin ?? null);
    setRequireSalary(Boolean(ss.filters.requireSalary));
    setPage(1);
    setActiveSavedId(ss.id);
    pendingSavedSearchRef.current = ss.id;
  };

  const removeSavedSearch = (id: string) => {
    if (!session) return;
    void patchProfile({
      preferences: {
        ...session.profile.preferences,
        savedSearches: session.profile.preferences.savedSearches.filter((s) => s.id !== id),
      },
    });
    setSavedNewCounts((c) => {
      const next = { ...c };
      delete next[id];
      return next;
    });
    if (activeSavedId === id) setActiveSavedId(null);
  };

  useEffect(() => {
    if (showSaveDialog) saveInputRef.current?.focus();
  }, [showSaveDialog]);

  const defaultSaveName = (() => {
    if (debouncedQuery) return debouncedQuery.slice(0, 60);
    const parts: string[] = [];
    if (levels.length) parts.push(levels.join("/"));
    if (remotes.length) parts.push(remotes.join("/"));
    if (countries.length) parts.push(countries.join("/"));
    if (debouncedCompany) parts.push(debouncedCompany);
    return parts.join(" · ") || "Untitled search";
  })();

  const onToggleSave = useCallback(
    (id: string, save: boolean) => {
      if (!session) return;
      const next = new Set(session.profile.savedJobIds);
      if (save) next.add(id);
      else next.delete(id);
      void patchProfile({ savedJobIds: Array.from(next) });
    },
    [session, patchProfile],
  );

  // Keyboard navigation across the job grid. j/k (vim) and ArrowDown/Up
  // walk through cards; Enter opens the focused one; "s" toggles save;
  // Escape clears focus. Skipped while the user is typing in any input
  // so the keys don't collide with normal text entry.
  useEffect(() => {
    const inField = (el: EventTarget | null) =>
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement ||
      (el instanceof HTMLElement && el.isContentEditable);

    const onKey = (e: KeyboardEvent) => {
      if (inField(e.target)) return;
      if (!hits || hits.length === 0) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setKbdFocusedIdx((i) => Math.min(hits.length - 1, i + 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setKbdFocusedIdx((i) => (i <= 0 ? 0 : i - 1));
      } else if (e.key === "Enter" && kbdFocusedIdx >= 0) {
        e.preventDefault();
        const node = document.querySelector('[data-kbd-focus="true"]') as HTMLAnchorElement | null;
        node?.click();
      } else if (e.key === "s" && kbdFocusedIdx >= 0) {
        e.preventDefault();
        const hit = hits[kbdFocusedIdx];
        if (hit) {
          const hid = String(hit.id);
          onToggleSave(hid, !savedSet.has(hid));
        }
      } else if (e.key === "Escape") {
        setKbdFocusedIdx(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hits, kbdFocusedIdx, savedSet, onToggleSave]);

  // Keep the keyboard-focused card visible as the user navigates.
  useEffect(() => {
    if (kbdFocusedIdx < 0) return;
    const node = document.querySelector('[data-kbd-focus="true"]') as HTMLElement | null;
    node?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [kbdFocusedIdx]);

  // Pagination math. `totalMatches` is the FULL post-filter pool size from
  // the API; we slice it into PAGE_SIZE pages and use the result to gate the
  // Prev/Next buttons and decide whether to render the control row at all.
  const totalPages = Math.max(
    1,
    Math.ceil((totalMatches ?? 0) / PAGE_SIZE),
  );
  const resultsTopRef = useRef<HTMLElement>(null);
  const goToPage = (next: number) => {
    const clamped = Math.min(Math.max(1, next), totalPages);
    if (clamped === page) return;
    setPage(clamped);
    // Scroll back to the top of the results list so the user doesn't land
    // mid-page after pressing Next. Fall back to window scroll if for some
    // reason the ref isn't mounted.
    requestAnimationFrame(() => {
      const node = resultsTopRef.current;
      if (node) {
        node.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  };

  const totalActive =
    (debouncedQuery ? 1 : 0) +
    (debouncedCompany ? 1 : 0) +
    (debouncedLocation ? 1 : 0) +
    levels.length +
    remotes.length +
    industries.length +
    sources.length +
    countries.length +
    (salaryMin !== null ? 1 : 0) +
    (requireSalary ? 1 : 0) +
    (hideStale ? 0 : 0); // hideStale is on by default; not counted as "active"

  const reset = () => {
    setQuery("");
    setCompanyFilter("");
    setLocationFilter("");
    setLevels([]);
    setRemotes([]);
    setIndustries([]);
    setSources([]);
    setSalaryMin(null);
    setRequireSalary(false);
    setHideStale(true);
    setCountries([]);
    setActiveSavedId(null);
  };

  return (
    <div className="container">
      <div className="feed-header">
        <div className="search-wrap">
          <Search size={15} className="search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="search-input"
            placeholder="Search roles, technologies, companies…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Hitting Enter bypasses the typing-debounce so the search
              // fires immediately. Useful in no-vault mode where the user
              // has explicitly typed a query and expects an instant result.
              if (e.key === "Enter") {
                e.preventDefault();
                setDebouncedQuery(query.trim());
              }
            }}
          />
          <kbd className="kbd">/</kbd>
          {query && (
            <button className="search-clear" onClick={() => setQuery("")} aria-label="Clear" type="button">
              <X size={14} />
            </button>
          )}
        </div>
        <div className="row gap-sm feed-actions" style={{ marginLeft: "auto" }}>
          {busy && (
            // Inline in-flight indicator next to the search controls so the
            // user sees instant feedback that their keystroke registered.
            // The results-meta line also flips to "Searching…" but this
            // one is positionally adjacent to the input where attention is.
            <span className="search-status" role="status" aria-live="polite">
              <span className="spinner-xs" aria-hidden="true" />
              <span>Searching...</span>
            </span>
          )}
          {/* Sort dropdown - browse mode only. With a typed query or a
              résumé vector the server ranks by relevance, so a user-picked
              sort would silently lose to the ranking signal; hiding the
              control keeps the UI honest. */}
          {debouncedQuery.length < 2 && noVault && (
            <label
              className="row gap-sm"
              style={{ gap: 6, alignItems: "center", fontSize: 13 }}
              title="How to order browse results"
            >
              <span className="muted text-xs">Sort by</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortMode)}
                className="btn btn-secondary btn-sm"
                style={{ padding: "4px 8px", cursor: "pointer" }}
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            className="btn btn-secondary btn-sm filters-toggle"
            onClick={() => setFiltersOpen((o) => !o)}
            aria-expanded={filtersOpen}
          >
            <SlidersHorizontal size={13} /> Filters{totalActive > 0 ? ` · ${totalActive}` : ""}
          </button>
          {totalActive > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={reset}>
              Clear filters · {totalActive}
            </button>
          )}
          {hasSavableState && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setSaveName(defaultSaveName);
                setShowSaveDialog((s) => !s);
              }}
              title="Save this search and get notified of new matches"
            >
              <BookmarkPlus size={13} /> Save search
            </button>
          )}
          {!noVault && (
            <Link to="/onboarding" className="btn btn-secondary btn-sm">
              <Sparkles size={13} /> Update preferences
            </Link>
          )}
        </div>
      </div>

      {noVault && (
        <div className="no-vault-banner">
          <span>
            Browsing without a résumé.{" "}
            <Link className="link" to="/onboarding">Add résumé</Link>{" "}
            for personalized matching.
          </span>
        </div>
      )}

      {/* Quick-preset chips - one-tap shortcuts for the most common filter
          combos. Toggle on/off; clicking a preset that's already active
          removes its filters. Keeps the filter drawer in reserve for
          finer-grained refinement. */}
      <QuickPresets
        remotes={remotes}
        setRemotes={setRemotes}
        levels={levels}
        setLevels={setLevels}
        industries={industries}
        setIndustries={setIndustries}
        countries={countries}
        setCountries={setCountries}
        salaryMin={salaryMin}
        setSalaryMin={setSalaryMin}
      />

      {/* Active-filter pills - shows every applied filter as a removable
          chip. Eliminates the "click 'Filters' to find out what's on"
          UX hole. Hidden when nothing is active. */}
      {totalActive > 0 && (
        <ActiveFilters
          query={debouncedQuery}
          clearQuery={() => setQuery("")}
          company={debouncedCompany}
          clearCompany={() => setCompanyFilter("")}
          location={debouncedLocation}
          clearLocation={() => setLocationFilter("")}
          levels={levels}
          removeLevel={(v) => setLevels((cur) => cur.filter((x) => x !== v))}
          remotes={remotes}
          removeRemote={(v) => setRemotes((cur) => cur.filter((x) => x !== v))}
          industries={industries}
          removeIndustry={(v) => setIndustries((cur) => cur.filter((x) => x !== v))}
          sources={sources}
          removeSource={(v) => setSources((cur) => cur.filter((x) => x !== v))}
          countries={countries}
          removeCountry={(v) => setCountries((cur) => cur.filter((x) => x !== v))}
          salaryMin={salaryMin}
          clearSalary={() => setSalaryMin(null)}
          requireSalary={requireSalary}
          clearRequireSalary={() => setRequireSalary(false)}
          clearAll={reset}
        />
      )}

      {showSaveDialog && (
        <div
          className="card"
          style={{
            marginBottom: 16,
            padding: 12,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Bell size={14} className="muted" />
          <input
            ref={saveInputRef}
            type="text"
            className="input"
            placeholder="Name this search…"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveCurrentSearch(saveName);
              if (e.key === "Escape") setShowSaveDialog(false);
            }}
            style={{ flex: 1, height: 30, fontSize: 13 }}
          />
          <button
            className="btn btn-primary btn-sm"
            onClick={() => saveCurrentSearch(saveName)}
            disabled={!saveName.trim()}
          >
            Save
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowSaveDialog(false)}
          >
            Cancel
          </button>
        </div>
      )}

      <div className="feed-grid" data-filters-open={filtersOpen ? "true" : "false"}>
        <aside className="sidebar">
          {savedSearches.length > 0 && (
            <FilterSection title="Saved searches">
              <div className="col" style={{ gap: 2 }}>
                {savedSearches.map((ss) => {
                  const newCount = savedNewCounts[ss.id] ?? 0;
                  return (
                    <div
                      key={ss.id}
                      className="filter-row"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        cursor: "pointer",
                        paddingRight: 4,
                      }}
                      onClick={() => applySaved(ss)}
                      role="button"
                    >
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {ss.name}
                      </span>
                      {newCount > 0 && (
                        <span className="chip chip-accent" style={{ fontSize: 10.5, padding: "1px 6px" }}>
                          +{newCount} new
                        </span>
                      )}
                      <button
                        className="icon-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeSavedSearch(ss.id);
                        }}
                        title="Remove saved search"
                        style={{ width: 22, height: 22, padding: 0 }}
                      >
                        <X size={11} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </FilterSection>
          )}

          <FilterSection title="Industry">
            {INDUSTRY_OPTIONS.map((i) => (
              <FilterCheck
                key={i.value}
                label={i.label}
                checked={industries.includes(i.value)}
                onChange={() =>
                  setIndustries((cur) =>
                    cur.includes(i.value) ? cur.filter((x) => x !== i.value) : [...cur, i.value],
                  )
                }
              />
            ))}
          </FilterSection>

          <FilterSection title="Experience">
            {LEVELS.map((l) => (
              <FilterCheck
                key={l.value}
                label={l.label}
                checked={levels.includes(l.value)}
                onChange={() =>
                  setLevels((cur) =>
                    cur.includes(l.value) ? cur.filter((x) => x !== l.value) : [...cur, l.value],
                  )
                }
              />
            ))}
          </FilterSection>

          <FilterSection title="Management">
            {LEVELS_MANAGEMENT.map((l) => (
              <FilterCheck
                key={l.value}
                label={l.label}
                checked={levels.includes(l.value)}
                onChange={() =>
                  setLevels((cur) =>
                    cur.includes(l.value) ? cur.filter((x) => x !== l.value) : [...cur, l.value],
                  )
                }
              />
            ))}
          </FilterSection>

          <FilterSection title="Work setup">
            {REMOTES.map((r) => (
              <FilterCheck
                key={r.value}
                label={r.label}
                checked={remotes.includes(r.value)}
                onChange={() =>
                  setRemotes((cur) =>
                    cur.includes(r.value) ? cur.filter((x) => x !== r.value) : [...cur, r.value],
                  )
                }
              />
            ))}
          </FilterSection>

          <FilterSection title="Posted">
            <label className="filter-row">
              <input
                type="checkbox"
                checked={hideStale}
                onChange={(e) => setHideStale(e.target.checked)}
              />
              <span>Hide postings 45+ days old</span>
            </label>
          </FilterSection>

          <FilterSection title="Compensation">
            <select
              className="input"
              value={salaryMin === null ? "" : String(salaryMin)}
              onChange={(e) =>
                setSalaryMin(e.target.value === "" ? null : Number(e.target.value))
              }
              style={{ height: 32, fontSize: 12.5, padding: "5px 9px" }}
            >
              <option value="">Any</option>
              <option value="60000">$60k+</option>
              <option value="80000">$80k+</option>
              <option value="100000">$100k+</option>
              <option value="125000">$125k+</option>
              <option value="150000">$150k+</option>
              <option value="200000">$200k+</option>
              <option value="250000">$250k+</option>
            </select>
            <label className="filter-row" style={{ marginTop: 4 }}>
              <input
                type="checkbox"
                checked={requireSalary}
                onChange={(e) => setRequireSalary(e.target.checked)}
              />
              <span>Only with disclosed salary</span>
            </label>
          </FilterSection>

          <FilterSection title="Country">
            {COMMON_COUNTRIES.map((c) => (
              <FilterCheck
                key={c.code}
                label={
                  <span className="row gap-sm" style={{ gap: 6 }}>
                    <span aria-hidden style={{ width: 18, textAlign: "center" }}>{flagEmoji(c.code)}</span>
                    <span>{c.name}</span>
                  </span>
                }
                checked={countries.includes(c.code)}
                onChange={() =>
                  setCountries((cur) =>
                    cur.includes(c.code) ? cur.filter((x) => x !== c.code) : [...cur, c.code],
                  )
                }
              />
            ))}
          </FilterSection>

          <FilterSection title="City / region">
            <input
              type="text"
              className="input"
              placeholder="e.g. Berlin, Bay Area"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              style={{ height: 30, fontSize: 12.5, padding: "5px 9px" }}
            />
          </FilterSection>

          <FilterSection title="Source">
            {SOURCES.map((s) => (
              <FilterCheck
                key={s.value}
                label={s.label}
                checked={sources.includes(s.value)}
                onChange={() =>
                  setSources((cur) =>
                    cur.includes(s.value) ? cur.filter((x) => x !== s.value) : [...cur, s.value],
                  )
                }
              />
            ))}
          </FilterSection>

          <FilterSection title="Company">
            <input
              type="text"
              className="input"
              placeholder="e.g. Stripe"
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              style={{ height: 30, fontSize: 12.5, padding: "5px 9px" }}
            />
          </FilterSection>
        </aside>

        <section className="results" ref={resultsTopRef}>
          {/* The "Showing X of Y matches" count is hidden while a search is
              in flight to avoid presenting a stale number alongside the
              in-flight indicator. A search-status spinner replaces it. */}
          <div className="results-meta">
            <span>
              {busy ? (
                <span className="search-status" role="status" aria-live="polite">
                  <span className="spinner-xs" aria-hidden="true" />
                  <span>Searching...</span>
                </span>
              ) : hits ? (
                totalMatches !== null && totalMatches > hits.length
                  ? `Showing ${hits.length} of ${totalMatches} matches`
                  : `${hits.length} ${hits.length === 1 ? "match" : "matches"}`
              ) : (
                "Loading…"
              )}
            </span>
            <span className="muted-2 text-xs">
              {debouncedQuery
                ? <>Searching for <strong style={{ color: "var(--fg-2)" }}>“{debouncedQuery}”</strong></>
                : noVault
                  ? "Browsing most recent jobs"
                  : "Ranked by your résumé embedding"}
            </span>
          </div>

          {err && <Alert variant="error">{err}</Alert>}

          {/* While a search is in flight AND the user has a query or filter
              active, render skeleton rows in place of (potentially stale)
              results so the page never looks frozen. Default landing -
              no query, default filters - keeps its existing render path. */}
          {!err && busy && totalActive > 0 && (
            <div className="job-grid" aria-busy="true" aria-label="Searching">
              <JobCardSkeleton />
              <JobCardSkeleton />
              <JobCardSkeleton />
              <JobCardSkeleton />
              <JobCardSkeleton />
            </div>
          )}

          {!err && !(busy && totalActive > 0) && hits && hits.length === 0 && (
            <EmptyState
              title={
                totalActive === 0
                  ? "No jobs in the index"
                  : debouncedQuery && totalActive - 1 > 0
                    ? `No matches for "${debouncedQuery}" with these filters`
                    : debouncedQuery
                      ? `No matches for "${debouncedQuery}"`
                      : "Nothing matches these filters"
              }
              description={
                totalActive === 0
                  ? "We're refreshing the index right now. Check back in a few minutes."
                  : debouncedQuery && totalActive - 1 > 0
                    ? "Try removing filters, broadening the search, or one of the suggestions below."
                    : debouncedQuery
                      ? "Try a broader term, a related role, or one of the suggestions below."
                      : "Try loosening filters."
              }
              action={
                totalActive === 0 ? undefined : (
                  <div className="row gap-sm" style={{ gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                    {debouncedQuery && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setQuery("")}
                        type="button"
                      >
                        Clear search
                      </button>
                    )}
                    {totalActive - (debouncedQuery ? 1 : 0) > 0 && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={reset}
                        type="button"
                      >
                        Reset filters
                      </button>
                    )}
                    {/* One-click suggestions when the query is short or
                        unknown. Surfaces broader synonyms a user might not
                        think to try. */}
                    {debouncedQuery && (
                      <>
                        {suggestRelated(debouncedQuery).map((s) => (
                          <button
                            key={s}
                            className="btn btn-ghost btn-sm"
                            onClick={() => setQuery(s)}
                            type="button"
                            title={`Search for "${s}" instead`}
                          >
                            Try “{s}”
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )
              }
            />
          )}

          {hits && hits.length > 0 && !(busy && totalActive > 0) && (
            <div className="job-grid">
              {hits.map((h, i) => (
                <JobCard
                  key={String(h.id)}
                  hit={h}
                  saved={savedSet.has(String(h.id))}
                  onToggleSave={onToggleSave}
                  kbdFocused={i === kbdFocusedIdx}
                />
              ))}
            </div>
          )}

          {hits && totalPages > 1 && !(busy && totalActive > 0) && (
            <nav className="pagination" aria-label="Result pages">
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => goToPage(page - 1)}
                disabled={page === 1 || busy}
                type="button"
              >
                ← Prev
              </button>
              <span className="muted-2 text-xs" aria-live="polite">
                Page {page} of {totalPages}
              </span>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => goToPage(page + 1)}
                disabled={page === totalPages || hits.length < PAGE_SIZE || busy}
                type="button"
              >
                Next →
              </button>
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}

// Small pivot suggestions surfaced from the empty state when a query
// returned zero matches. Mirrors the API-side query-expansion dictionary,
// but inverted: instead of expanding a token for the embedder, we give the
// user one-click pivots to broader / adjacent terms. Hand-curated for the
// failure modes the user actually reported.
function suggestRelated(query: string): string[] {
  const q = query.trim().toLowerCase();
  const buckets: Array<{ match: RegExp; suggest: string[] }> = [
    { match: /(new\s*grad|graduate|entry[\s-]?level)/, suggest: ["junior", "intern", "associate"] },
    { match: /^junior$/, suggest: ["new grad", "associate", "entry level"] },
    { match: /(intern|internship|co-?op)/, suggest: ["new grad", "junior", "early career"] },
    { match: /^software$/, suggest: ["software engineer", "developer", "engineer"] },
    { match: /^(developer|dev|engineer)$/, suggest: ["software engineer", "backend", "frontend"] },
    { match: /(back[\s-]?end)/, suggest: ["software engineer", "platform", "infrastructure"] },
    { match: /(front[\s-]?end)/, suggest: ["software engineer", "ui engineer", "web developer"] },
    { match: /(full[\s-]?stack)/, suggest: ["software engineer", "backend", "frontend"] },
    { match: /(machine\s*learning|^ml$|^ai$)/, suggest: ["data scientist", "research", "software engineer"] },
    { match: /(data\s*scien|data\s*eng)/, suggest: ["analytics", "machine learning", "engineer"] },
    { match: /(devops|sre)/, suggest: ["platform", "infrastructure", "cloud"] },
    { match: /(security|infosec)/, suggest: ["engineer", "platform"] },
    { match: /(mobile|ios|android)/, suggest: ["software engineer", "frontend"] },
    { match: /(product\s*manager|^pm$)/, suggest: ["product", "program manager"] },
    { match: /(designer|design)/, suggest: ["product designer", "ux", "ui"] },
  ];
  for (const b of buckets) {
    if (b.match.test(q)) return b.suggest.slice(0, 3);
  }
  // Generic fallback: a single broader pivot to "software engineer" if the
  // query is short and looks technical, otherwise no suggestions (we'd
  // rather show nothing than misleading pivots).
  if (q.length <= 16 && /[a-z]/.test(q)) return [];
  return [];
}

// Placeholder card rendered while a search is in flight. Mirrors the
// visual silhouette of a real JobCard (circle logo + title/sub bars +
// chips + meta/pill row) so the layout doesn't reflow when results
// arrive. The pulse animation lives in index.css (skeleton-pulse).
function JobCardSkeleton() {
  return (
    <div className="skeleton-card" aria-hidden="true">
      <div className="skeleton-card-header">
        <div className="skeleton-circle" />
        <div className="skeleton-block skeleton-pill" />
      </div>
      <div className="skeleton-card-body">
        <div className="skeleton-block skeleton-bar-title" />
        <div className="skeleton-block skeleton-bar-sub" />
      </div>
      <div className="skeleton-card-chips">
        <div className="skeleton-block skeleton-chip" />
        <div className="skeleton-block skeleton-chip" />
      </div>
      <div className="skeleton-card-footer">
        <div className="skeleton-block skeleton-bar-sub" style={{ width: "55%" }} />
        <div className="skeleton-block skeleton-chip-sm" />
      </div>
    </div>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="filter-section">
      <h4>{title}</h4>
      <div className="filter-group">{children}</div>
    </div>
  );
}

function FilterCheck({
  label,
  checked,
  onChange,
}: {
  label: React.ReactNode;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className={`filter-row ${checked ? "checked" : ""}`}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}

// Active-filters bar - one removable pill per applied filter, plus a
// trailing "Clear all" link. Hidden by the caller when nothing is on.
// Each pill's × button stops propagation so it can sit inside other
// click targets without conflict.
function ActiveFilters(props: {
  query: string;
  clearQuery: () => void;
  company: string;
  clearCompany: () => void;
  location: string;
  clearLocation: () => void;
  levels: ExperienceLevel[];
  removeLevel: (v: ExperienceLevel) => void;
  remotes: RemoteStatus[];
  removeRemote: (v: RemoteStatus) => void;
  industries: Industry[];
  removeIndustry: (v: Industry) => void;
  sources: SourceName[];
  removeSource: (v: SourceName) => void;
  countries: string[];
  removeCountry: (v: string) => void;
  salaryMin: number | null;
  clearSalary: () => void;
  requireSalary: boolean;
  clearRequireSalary: () => void;
  clearAll: () => void;
}) {
  const levelLabel: Record<string, string> = {
    intern: "Intern", junior: "Junior", mid: "Mid", senior: "Senior",
    staff: "Staff", principal: "Principal", manager: "Manager",
    director: "Director", executive: "Executive",
  };
  const remoteLabel: Record<string, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "Onsite" };
  const industryLabelMap = Object.fromEntries(INDUSTRY_OPTIONS.map((o) => [o.value, o.label]));
  return (
    <div className="active-filters" role="region" aria-label="Active filters">
      <span className="label">Filtered by:</span>
      {props.query && (
        <FilterPill label={`"${props.query}"`} onClear={props.clearQuery} />
      )}
      {props.company && (
        <FilterPill label={`Company: ${props.company}`} onClear={props.clearCompany} />
      )}
      {props.location && (
        <FilterPill label={`Location: ${props.location}`} onClear={props.clearLocation} />
      )}
      {props.levels.map((v) => (
        <FilterPill key={`lvl-${v}`} label={levelLabel[v] ?? v} onClear={() => props.removeLevel(v)} />
      ))}
      {props.remotes.map((v) => (
        <FilterPill key={`rem-${v}`} label={remoteLabel[v] ?? v} onClear={() => props.removeRemote(v)} />
      ))}
      {props.industries.map((v) => (
        <FilterPill key={`ind-${v}`} label={industryLabelMap[v] ?? v} onClear={() => props.removeIndustry(v)} />
      ))}
      {props.sources.map((v) => (
        <FilterPill key={`src-${v}`} label={v} onClear={() => props.removeSource(v)} />
      ))}
      {props.countries.map((v) => (
        <FilterPill key={`co-${v}`} label={`${flagEmoji(v)} ${v}`} onClear={() => props.removeCountry(v)} />
      ))}
      {props.salaryMin !== null && (
        <FilterPill label={`≥ $${(props.salaryMin / 1000).toFixed(0)}k`} onClear={props.clearSalary} />
      )}
      {props.requireSalary && (
        <FilterPill label="Has salary" onClear={props.clearRequireSalary} />
      )}
      <button className="clear-all" onClick={props.clearAll} type="button">
        Clear all
      </button>
    </div>
  );
}

function FilterPill({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="filter-pill">
      {label}
      <button
        type="button"
        className="filter-pill-x"
        onClick={onClear}
        aria-label={`Remove ${label}`}
      >
        <X size={11} />
      </button>
    </span>
  );
}

// Quick-preset shortcuts. Each toggles a curated filter combo. We define
// "active" as "the union of filters this preset would apply is currently
// a subset of state" - the simplest check that handles the partial-match
// case (e.g. user applied Junior via the drawer, then clicked "New grad"
// preset which adds Intern too).
function QuickPresets(props: {
  remotes: RemoteStatus[];
  setRemotes: (v: RemoteStatus[]) => void;
  levels: ExperienceLevel[];
  setLevels: (v: ExperienceLevel[]) => void;
  industries: Industry[];
  setIndustries: (v: Industry[]) => void;
  countries: string[];
  setCountries: (v: string[]) => void;
  salaryMin: number | null;
  setSalaryMin: (v: number | null) => void;
}) {
  type Preset = {
    key: string;
    label: string;
    active: boolean;
    toggle: () => void;
  };
  const has = <T,>(arr: T[], v: T) => arr.includes(v);
  const toggleArr = <T,>(arr: T[], v: T, setter: (next: T[]) => void) => {
    setter(has(arr, v) ? arr.filter((x) => x !== v) : [...arr, v]);
  };

  const presets: Preset[] = [
    {
      key: "remote",
      label: "🌎 Remote",
      active: has(props.remotes, "remote"),
      toggle: () => toggleArr(props.remotes, "remote" as RemoteStatus, props.setRemotes),
    },
    {
      key: "new-grad",
      label: "🎓 New grad",
      active: has(props.levels, "junior") && has(props.levels, "intern"),
      toggle: () => {
        const want: ExperienceLevel[] = ["intern", "junior"];
        const allOn = want.every((v) => has(props.levels, v));
        props.setLevels(
          allOn ? props.levels.filter((v) => !want.includes(v)) : Array.from(new Set([...props.levels, ...want])),
        );
      },
    },
    {
      key: "senior",
      label: "🚀 Senior+",
      active: ["senior", "staff", "principal"].every((v) => has(props.levels, v as ExperienceLevel)),
      toggle: () => {
        const want: ExperienceLevel[] = ["senior", "staff", "principal"];
        const allOn = want.every((v) => has(props.levels, v));
        props.setLevels(
          allOn ? props.levels.filter((v) => !want.includes(v)) : Array.from(new Set([...props.levels, ...want])),
        );
      },
    },
    {
      key: "tech",
      label: "💻 Tech",
      active: has(props.industries, "tech" as Industry),
      toggle: () => toggleArr(props.industries, "tech" as Industry, props.setIndustries),
    },
    {
      key: "ca",
      label: "🇨🇦 Canada",
      active: has(props.countries, "CA"),
      toggle: () => toggleArr(props.countries, "CA", props.setCountries),
    },
    {
      key: "us",
      label: "🇺🇸 USA",
      active: has(props.countries, "US"),
      toggle: () => toggleArr(props.countries, "US", props.setCountries),
    },
    {
      key: "100k",
      label: "💰 $100k+",
      active: props.salaryMin !== null && props.salaryMin >= 100000,
      toggle: () => props.setSalaryMin(props.salaryMin === 100000 ? null : 100000),
    },
  ];

  return (
    <div className="quick-presets" role="group" aria-label="Quick filter presets">
      <span className="quick-label">Quick filters</span>
      {presets.map((p) => (
        <button
          key={p.key}
          type="button"
          data-active={p.active}
          onClick={p.toggle}
          title={p.active ? "Remove this preset" : "Add this preset"}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
