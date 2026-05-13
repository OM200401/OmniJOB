const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export const EMBEDDING_DIM = Number(import.meta.env.VITE_EMBEDDING_DIM ?? 768);

export type RemoteStatus = "remote" | "hybrid" | "onsite" | "unknown";
export type ExperienceLevel =
  | "intern"
  | "junior"
  | "mid"
  | "senior"
  | "staff"
  | "principal"
  | "manager"
  | "director"
  | "executive";
export type Industry =
  | "tech"
  | "healthcare"
  | "retail"
  | "food_service"
  | "trades"
  | "government"
  | "education"
  | "finance"
  | "manufacturing"
  | "logistics"
  | "legal"
  | "nonprofit"
  | "media"
  | "science"
  | "other";

// Display labels + ordering for the industry filter UI. Kept in sync with
// the api-side Industry literal union (apps/api/src/lib/industry.ts).
export const INDUSTRY_OPTIONS: { value: Industry; label: string }[] = [
  { value: "tech", label: "Tech / Software" },
  { value: "healthcare", label: "Healthcare" },
  { value: "retail", label: "Retail" },
  { value: "food_service", label: "Food service" },
  { value: "trades", label: "Trades" },
  { value: "government", label: "Government" },
  { value: "education", label: "Education" },
  { value: "finance", label: "Finance" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "logistics", label: "Logistics" },
  { value: "legal", label: "Legal" },
  { value: "nonprofit", label: "Nonprofit" },
  { value: "media", label: "Media" },
  { value: "science", label: "Science" },
  { value: "other", label: "Other" },
];

export type SourceName =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "smartrecruiters"
  | "workable"
  | "recruitee";

export type SalaryPeriod = "annual" | "monthly" | "weekly" | "daily" | "hourly";

export type QualityComponents = {
  salary_disclosed: number;
  freshness: number;
  description_length: number;
  source_reliability: number;
};

export type JobMetadata = {
  title: string;
  company: string;
  location: string;
  country?: string; // ISO-3166-1 alpha-2
  salary_range?: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  salary_period?: SalaryPeriod;
  remote_status?: RemoteStatus;
  experience_level?: ExperienceLevel;
  industry?: Industry;
  job_family?: string;
  source?: string;
  source_url: string;
  scraped_at: number;
  posted_at?: number;
  description?: string;
  // Computed by the API at read time.
  quality?: number;
  quality_breakdown?: QualityComponents;
};

export type JobHit = {
  id: string | number;
  // Optional: the server omits this in browse mode (vectorless /jobs/search)
  // where there's no semantic ranking signal. The UI hides the % match pill
  // when this is absent.
  score?: number;
  payload: JobMetadata;
};

export type JobSource = {
  source: string;
  source_url: string;
  scraped_at: number;
};

export type JobSources = {
  canonical: JobSource;
  duplicates: JobSource[];
};

export type Health = {
  status: string;
  qdrant: boolean;
  sqlite: boolean;
  ollama: boolean;
};

export type SearchOpts = {
  k?: number;
  // Page offset into the post-filter result pool. Used together with `k`
  // for page-based pagination - the server returns `hits.slice(offset, offset+k)`
  // and reports `total` as the full filtered pool size so the UI can render
  // "Page X of Y". Default 0.
  offset?: number;
  // Raw user query text. Forwarded to the API so it can run a hybrid
  // keyword + vector pass (RRF-fused). Optional - omit to use the
  // existing pure-cosine ranking.
  query?: string;
  remote_status?: RemoteStatus[];
  experience_level?: ExperienceLevel[];
  industry?: Industry[];
  job_family?: string[];
  source?: SourceName[];
  country?: string[]; // ISO-2 codes
  location?: string;  // free-text city/region match
  company?: string;
  salary_min_usd?: number;
  salary_max_usd?: number;
  require_salary?: boolean;
  max_age_days?: number;
};

async function request<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

export const api = {
  health: () => request<Health>("GET", "/health"),

  embed: (text: string, opts: { expand?: boolean } = {}) =>
    request<{ vector: number[]; dim: number; expanded?: boolean }>("POST", "/embed", {
      text,
      ...(opts.expand ? { expand: true } : {}),
    }),

  registerUser: (
    uid: string,
    salt: string,
    encrypted_dek: string,
    encrypted_dek_recovery: string,
  ) =>
    request<{ uid: string; status: string }>("POST", "/users/register", {
      uid,
      salt,
      encrypted_dek,
      encrypted_dek_recovery,
    }),

  loginUser: (uid: string) =>
    request<{ uid: string; salt: string; encrypted_dek: string }>(
      "POST",
      "/users/login",
      { uid },
    ),

  getRecovery: (uid: string) =>
    request<{ uid: string; salt: string; encrypted_dek_recovery: string }>(
      "GET",
      `/users/${uid}/recovery`,
    ),

  resetPassword: (uid: string, salt: string, encrypted_dek: string) =>
    request<{ uid: string; status: string }>("POST", "/users/reset-password", {
      uid,
      salt,
      encrypted_dek,
    }),

  getProfileBlob: (uid: string) =>
    request<{ uid: string; encrypted_profile_blob: string | null }>(
      "GET",
      `/users/${uid}/profile`,
    ),

  saveProfile: (
    uid: string,
    encrypted_profile_blob: string,
    skill_vector: number[],
  ) =>
    request<{ uid: string; status: string }>("POST", "/users/profile", {
      uid,
      encrypted_profile_blob,
      skill_vector,
    }),

  saveProfileBlob: (uid: string, encrypted_profile_blob: string) =>
    request<{ uid: string; status: string }>("POST", "/users/profile/blob", {
      uid,
      encrypted_profile_blob,
    }),

  searchJobs: (vector: number[] | undefined, opts: SearchOpts = {}) =>
    request<{ hits: JobHit[]; total?: number }>("POST", "/jobs/search", {
      // Omit the vector entirely when the caller has neither a résumé
      // embedding nor a typed query. The server treats that as browse mode
      // and returns recent jobs ordered by scraped_at desc with the same
      // filter contract.
      ...(vector && vector.length > 0 ? { vector } : {}),
      ...(opts.k ? { k: opts.k } : {}),
      ...(opts.offset ? { offset: opts.offset } : {}),
      ...(opts.query ? { query: opts.query } : {}),
      ...(opts.remote_status?.length ? { remote_status: opts.remote_status } : {}),
      ...(opts.experience_level?.length ? { experience_level: opts.experience_level } : {}),
      ...(opts.industry?.length ? { industry: opts.industry } : {}),
      ...(opts.job_family?.length ? { job_family: opts.job_family } : {}),
      ...(opts.source?.length ? { source: opts.source } : {}),
      ...(opts.country?.length ? { country: opts.country } : {}),
      ...(opts.location ? { location: opts.location } : {}),
      ...(opts.company ? { company: opts.company } : {}),
      ...(opts.salary_min_usd !== undefined ? { salary_min_usd: opts.salary_min_usd } : {}),
      ...(opts.salary_max_usd !== undefined ? { salary_max_usd: opts.salary_max_usd } : {}),
      ...(opts.require_salary !== undefined ? { require_salary: opts.require_salary } : {}),
      ...(opts.max_age_days !== undefined ? { max_age_days: opts.max_age_days } : {}),
    }),

  getJob: (id: string) =>
    request<{ id: string; payload: JobMetadata }>("GET", `/jobs/${encodeURIComponent(id)}`),

  matchExplain: (id: string, resume_text: string) =>
    request<{ id: string; pairs: Array<{ resume: string; job: string; score: number }> }>(
      "POST",
      `/jobs/${encodeURIComponent(id)}/match-explain`,
      { resume_text },
    ),

  fetchJobSources: (id: string) =>
    request<JobSources>("GET", `/jobs/${encodeURIComponent(id)}/sources`),

  contact: (body: {
    name?: string;
    email?: string;
    subject: string;
    message: string;
    website?: string;
  }) =>
    request<{ status: string }>("POST", "/contact", body),
};
