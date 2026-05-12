import { deriveMasterKey } from "./argon2";
import { decrypt, encrypt } from "./aes-gcm";
import { fromUtf8, randomBytes, utf8 } from "./util";

export type RegisterResult = {
  salt: Uint8Array;
  encryptedDek: Uint8Array;          // DEK encrypted with password-derived master key
  encryptedDekRecovery: Uint8Array;  // DEK encrypted with the recovery key
  recoveryKey: Uint8Array;           // shown to user once, never sent to server
  masterKey: Uint8Array;
  dek: Uint8Array;
};

export async function register(password: string): Promise<RegisterResult> {
  const salt = randomBytes(16);
  const masterKey = await deriveMasterKey(password, salt);
  const dek = randomBytes(32);
  const recoveryKey = randomBytes(32);
  const encryptedDek = await encrypt(masterKey, dek);
  const encryptedDekRecovery = await encrypt(recoveryKey, dek);
  return { salt, encryptedDek, encryptedDekRecovery, recoveryKey, masterKey, dek };
}

export async function unlock(
  password: string,
  salt: Uint8Array,
  encryptedDek: Uint8Array,
): Promise<{ masterKey: Uint8Array; dek: Uint8Array }> {
  const masterKey = await deriveMasterKey(password, salt);
  // If the password is wrong, AES-GCM auth-tag verification throws.
  const dek = await decrypt(masterKey, encryptedDek);
  return { masterKey, dek };
}

// Decrypt the recovery-encrypted DEK using the user's saved recovery key.
// Throws on auth-tag failure (wrong recovery key).
export async function unlockWithRecovery(
  recoveryKey: Uint8Array,
  encryptedDekRecovery: Uint8Array,
): Promise<Uint8Array> {
  return decrypt(recoveryKey, encryptedDekRecovery);
}

// Re-encrypt a known DEK with a new password. Generates a fresh salt so the
// previous Argon2 hash can't be precomputed even if it leaked.
export async function rewrapDek(
  newPassword: string,
  dek: Uint8Array,
): Promise<{ salt: Uint8Array; encryptedDek: Uint8Array; masterKey: Uint8Array }> {
  const salt = randomBytes(16);
  const masterKey = await deriveMasterKey(newPassword, salt);
  const encryptedDek = await encrypt(masterKey, dek);
  return { salt, encryptedDek, masterKey };
}

// =========================================================================
// Profile blob - what we store, encrypted, server-side
// =========================================================================

export type ExperienceLevel =
  | "intern"
  | "junior"
  | "mid"
  | "senior"
  | "staff"
  | "principal";

// Mirror of the api-side Industry union. Kept in this file because the
// profile blob is the source of truth for what the user opted into during
// onboarding, and crypto/vault.ts already carries the rest of the profile
// schema. If the api adds a new industry literal, mirror it here.
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

export type RoleArea =
  | "engineering"
  | "ml-ai"
  | "data"
  | "design"
  | "product"
  | "operations"
  | "security"
  | "sales-marketing"
  | "other";

export type RemotePref = "remote" | "hybrid" | "onsite" | "any";

export type SavedSearch = {
  id: string;            // local UUID
  name: string;          // user-given label
  query: string;         // free-text search
  filters: SavedSearchFilters;
  createdAt: number;
  lastCheckedAt: number;
  lastResultIds: string[]; // job IDs the search returned at last check
};

export type SavedSearchFilters = {
  levels?: string[];
  remotes?: string[];
  industries?: string[];
  sources?: string[];
  countries?: string[];
  location?: string;
  company?: string;
  salaryMin?: number;
  requireSalary?: boolean;
};

export type Preferences = {
  lookingFor: string;
  // Phase 1C: industry is the strongest filter signal we have on a user's
  // intent. Optional so the existing 1A-tech-only profiles migrate cleanly
  // (the migration runs at every login - see migrateProfile below).
  industry: Industry | null;
  level: ExperienceLevel | null;
  areas: RoleArea[];
  remotePref: RemotePref;
  locations: string[];
  savedSearches: SavedSearch[];
};

export const DEFAULT_PREFS: Preferences = {
  lookingFor: "",
  industry: null,
  level: null,
  areas: [],
  remotePref: "any",
  locations: [],
  savedSearches: [],
};

// Application lifecycle states. `applied` is the entry state - created when
// a user marks a job applied or clicks the external Apply button. Other
// states are explicit user choices except `ghosted`, which the UI computes
// at render time after 14d of no movement and the user can confirm or revert.
export type ApplicationStatus =
  | "applied"
  | "interviewing"
  | "offer"
  | "rejected"
  | "ghosted"
  | "withdrawn";

export type Application = {
  jobId: string;
  status: ApplicationStatus;
  appliedAt: number;       // when first marked applied
  lastTouchedAt: number;   // last status change or notes edit
  notes?: string;
};

export type ProfileBlob = {
  email: string;
  resumeText: string;
  skillVector: number[];
  preferences: Preferences;
  savedJobIds: string[];
  applications: Application[];
  updatedAt: number;
};

export function emptyProfile(email: string): ProfileBlob {
  return {
    email,
    resumeText: "",
    skillVector: [],
    preferences: { ...DEFAULT_PREFS },
    savedJobIds: [],
    applications: [],
    updatedAt: Date.now(),
  };
}

export function migrateProfile(raw: unknown, email: string): ProfileBlob {
  const p = (raw ?? {}) as Partial<ProfileBlob> & { preferences?: Partial<Preferences> };
  const prefs: Partial<Preferences> = p.preferences ?? {};
  return {
    email: p.email ?? email,
    resumeText: p.resumeText ?? "",
    skillVector: Array.isArray(p.skillVector) ? p.skillVector : [],
    preferences: {
      ...DEFAULT_PREFS,
      ...prefs,
      savedSearches: Array.isArray(prefs.savedSearches) ? prefs.savedSearches : [],
    },
    savedJobIds: Array.isArray(p.savedJobIds) ? p.savedJobIds : [],
    applications: Array.isArray(p.applications) ? p.applications : [],
    updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : Date.now(),
  };
}

export async function encryptProfile(
  dek: Uint8Array,
  profile: ProfileBlob,
): Promise<Uint8Array> {
  return encrypt(dek, utf8(JSON.stringify(profile)));
}

export async function decryptProfile(
  dek: Uint8Array,
  blob: Uint8Array,
  email: string,
): Promise<ProfileBlob> {
  const json = fromUtf8(await decrypt(dek, blob));
  return migrateProfile(JSON.parse(json), email);
}
