import { t } from "elysia";

const VectorSchema = t.Array(t.Number());

const Base64 = t.String({ pattern: "^[A-Za-z0-9+/=_-]+$", minLength: 1 });

// uid = lowercase hex of SHA-256(lowercased_email). The server never sees the
// email itself - derivation happens client-side. PROJECT.md §6 + §9 entry on
// the email-as-PII tradeoff.
const Uid = t.String({ pattern: "^[a-f0-9]{64}$" });

export const UserRegisterSchema = t.Object({
  uid: Uid,
  salt: Base64,
  encrypted_dek: Base64,
  encrypted_dek_recovery: Base64,
});

export const UserLoginSchema = t.Object({
  uid: Uid,
});

export const UserProfileSchema = t.Object({
  uid: Uid,
  encrypted_profile_blob: Base64,
  skill_vector: VectorSchema,
});

export const UserProfileBlobOnlySchema = t.Object({
  uid: Uid,
  encrypted_profile_blob: Base64,
});

export const ResetPasswordSchema = t.Object({
  uid: Uid,
  salt: Base64,
  encrypted_dek: Base64,
});
