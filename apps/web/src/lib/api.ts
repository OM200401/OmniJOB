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
  score: number;
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
  remote_status?: RemoteStatus[];
  experience_level?: ExperienceLevel[];
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

  embed: (text: string) =>
    request<{ vector: number[]; dim: number }>("POST", "/embed", { text }),

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

  searchJobs: (vector: number[], opts: SearchOpts = {}) =>
    request<{ hits: JobHit[]; total?: number }>("POST", "/jobs/search", {
      vector,
      ...(opts.k ? { k: opts.k } : {}),
      ...(opts.remote_status?.length ? { remote_status: opts.remote_status } : {}),
      ...(opts.experience_level?.length ? { experience_level: opts.experience_level } : {}),
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
};
