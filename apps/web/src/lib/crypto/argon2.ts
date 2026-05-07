import { argon2id } from "hash-wasm";

// Argon2id parameters per PROJECT.md §6 (security model). Baseline tuned for
// modern desktop browsers; mobile tuning will live in apps/mobile when it
// lands. See PROJECT.md §9 for the open question on per-tier params.
const PARAMS = {
  iterations: 3,
  memorySize: 65536, // 64 MiB
  parallelism: 1,
  hashLength: 32, // 256-bit master key
} as const;

export async function deriveMasterKey(
  password: string,
  salt: Uint8Array,
): Promise<Uint8Array> {
  const hex = await argon2id({
    password,
    salt,
    iterations: PARAMS.iterations,
    memorySize: PARAMS.memorySize,
    parallelism: PARAMS.parallelism,
    hashLength: PARAMS.hashLength,
    outputType: "binary",
  });
  // hash-wasm returns Uint8Array when outputType is "binary".
  return hex as Uint8Array;
}
