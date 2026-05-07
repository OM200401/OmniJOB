// AES-256-GCM via the browser's native SubtleCrypto. Web Crypto's encrypt()
// returns ciphertext+tag concatenated; we prepend a 12-byte IV so the whole
// blob round-trips as a single base64 string.
//
// TS 5.7+ infers `Uint8Array<ArrayBufferLike>` (which includes
// SharedArrayBuffer) while Web Crypto wants `ArrayBuffer`-backed views, so
// we cast at each subtle.* boundary.

const IV_LEN = 12;

async function importKey(keyBytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encrypt(
  keyBytes: Uint8Array,
  plaintext: Uint8Array,
): Promise<Uint8Array> {
  const key = await importKey(keyBytes);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      plaintext as BufferSource,
    ),
  );
  const out = new Uint8Array(IV_LEN + ct.length);
  out.set(iv, 0);
  out.set(ct, IV_LEN);
  return out;
}

export async function decrypt(
  keyBytes: Uint8Array,
  blob: Uint8Array,
): Promise<Uint8Array> {
  if (blob.length < IV_LEN + 16) throw new Error("ciphertext too short");
  const iv = blob.subarray(0, IV_LEN);
  const ct = blob.subarray(IV_LEN);
  const key = await importKey(keyBytes);
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      ct as BufferSource,
    ),
  );
}
