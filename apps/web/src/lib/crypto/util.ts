export function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

export function b64decode(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

export function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

export function fromUtf8(b: Uint8Array): string {
  return new TextDecoder().decode(b);
}

export function hex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i]!.toString(16).padStart(2, "0");
  return out;
}

export function fromHex(s: string): Uint8Array {
  if (s.length % 2 !== 0) throw new Error("hex string must have even length");
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(s.substring(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) throw new Error(`invalid hex at offset ${i * 2}`);
    out[i] = byte;
  }
  return out;
}

// uid = lowercase-hex of SHA-256 over the lowercased, trimmed email. Used so
// the server stores only an opaque 64-char identifier and never the email.
export async function uidFromEmail(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const digest = await crypto.subtle.digest("SHA-256", utf8(normalized) as BufferSource);
  return hex(new Uint8Array(digest));
}

// Recovery key: 32 random bytes. Displayed and re-entered as 16 groups of
// 4 lowercase-hex chars separated by hyphens, e.g.
// `c8af-1b2e-...-aa01`. Total entropy: 256 bits.
const RECOVERY_KEY_BYTES = 32;
const RECOVERY_GROUP = 4;

export function generateRecoveryKey(): { bytes: Uint8Array; display: string } {
  const bytes = randomBytes(RECOVERY_KEY_BYTES);
  return { bytes, display: formatRecoveryKey(bytes) };
}

export function formatRecoveryKey(bytes: Uint8Array): string {
  const h = hex(bytes);
  const groups: string[] = [];
  for (let i = 0; i < h.length; i += RECOVERY_GROUP) {
    groups.push(h.substring(i, i + RECOVERY_GROUP));
  }
  return groups.join("-");
}

export function parseRecoveryKey(s: string): Uint8Array {
  const cleaned = s.toLowerCase().replace(/[^0-9a-f]/g, "");
  if (cleaned.length !== RECOVERY_KEY_BYTES * 2) {
    throw new Error(
      `recovery key must be ${RECOVERY_KEY_BYTES * 2} hex characters (got ${cleaned.length})`,
    );
  }
  return fromHex(cleaned);
}
