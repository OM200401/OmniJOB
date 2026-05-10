// Reusable, dependency-free form-validation primitives. Pure functions so
// they can be called inline from event handlers, useEffect, or the
// useFieldValidation hook below — no React, no hooks, no third-party
// password-strength libraries.
//
// The shape `{ ok, msg }` is deliberately minimal. Callers render `msg`
// inline beneath the field when `ok === false` (and only after a touched
// signal — see useFieldValidation for the gating).

export type ValidationResult = { ok: boolean; msg?: string };

// Strength score: 0 empty / 1 weak / 2 fair / 3 good / 4 excellent.
export type PasswordStrength = 0 | 1 | 2 | 3 | 4;

export type PasswordValidationResult = ValidationResult & {
  strength: PasswordStrength;
};

// Pragmatic email regex. We're not RFC-5322 compliant — the goal is to
// catch obvious typos like "foo@bar" or "foo bar@x.com" before a network
// round-trip. Server still does its own validation.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(s: string): ValidationResult {
  const v = s.trim();
  if (v.length === 0) return { ok: false, msg: "Email is required." };
  if (v.length > 254) return { ok: false, msg: "Email is too long." };
  if (!EMAIL_RE.test(v)) return { ok: false, msg: "Enter a valid email address." };
  return { ok: true };
}

// Score a password on length + character-class variety. Capped at 4.
// 0 means empty; 1 means under our length minimum (rendered as red).
export function scorePasswordStrength(s: string): PasswordStrength {
  if (s.length === 0) return 0;
  if (s.length < 8) return 1;
  let variety = 0;
  if (/[a-z]/.test(s)) variety += 1;
  if (/[A-Z]/.test(s)) variety += 1;
  if (/\d/.test(s)) variety += 1;
  if (/[^A-Za-z0-9]/.test(s)) variety += 1;

  // 8+ chars with one class -> 1 (still weak).
  // Two classes -> 2. Three -> 3. Four classes OR 12+ chars with three -> 4.
  let score: number;
  if (variety <= 1) score = 1;
  else if (variety === 2) score = 2;
  else if (variety === 3) score = s.length >= 12 ? 4 : 3;
  else score = 4;

  return Math.max(0, Math.min(4, score)) as PasswordStrength;
}

export function validatePassword(s: string): PasswordValidationResult {
  const strength = scorePasswordStrength(s);
  if (s.length === 0) {
    return { ok: false, msg: "Password is required.", strength };
  }
  if (s.length < 8) {
    return { ok: false, msg: "Use at least 8 characters.", strength };
  }
  // Past the length floor: technically acceptable, but we surface a hint
  // for very weak combos so users can self-improve. `ok` stays true so
  // submit isn't blocked.
  return { ok: true, strength };
}

export function validateMatch(a: string, b: string): ValidationResult {
  if (b.length === 0) return { ok: false, msg: "Confirm your password." };
  if (a !== b) return { ok: false, msg: "Passwords don't match." };
  return { ok: true };
}

// Recovery key: 32 random bytes rendered as 64 lowercase hex chars,
// typically displayed in groups of 4 separated by hyphens. Hyphens,
// spaces and case are all ignored — same as the parser in crypto/util.
const RECOVERY_HEX_LEN = 64;

export function validateRecoveryKey(s: string): ValidationResult {
  const cleaned = s.toLowerCase().replace(/[^0-9a-f]/g, "");
  if (cleaned.length === 0) return { ok: false, msg: "Recovery key is required." };
  if (cleaned.length < RECOVERY_HEX_LEN) {
    return {
      ok: false,
      msg: `Recovery key looks too short (${cleaned.length}/${RECOVERY_HEX_LEN} hex chars).`,
    };
  }
  if (cleaned.length > RECOVERY_HEX_LEN) {
    return {
      ok: false,
      msg: `Recovery key looks too long (${cleaned.length}/${RECOVERY_HEX_LEN} hex chars).`,
    };
  }
  // Final defense — `replace` already stripped non-hex, so this is a
  // belt-and-suspenders check after the length passes.
  if (!/^[0-9a-f]+$/.test(cleaned)) {
    return { ok: false, msg: "Recovery key should only contain 0–9 and a–f." };
  }
  return { ok: true };
}
