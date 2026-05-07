// Append-only JSON-lines audit log for auth events. Lets us reconstruct
// abuse patterns post-hoc (signup floods, credential-stuffing) without
// keeping a hot index of failed attempts in the request path.
//
// One file handle, opened lazily on first write. Writes are best-effort -
// a failed log line should never break the auth flow.

import { config } from "../config";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type AuditEvent =
  | "register"
  | "register_conflict"
  | "login"
  | "login_miss"
  | "recovery_lookup"
  | "recovery_miss"
  | "password_reset"
  | "password_reset_miss"
  | "profile_save"
  | "profile_blob_save";

type Writer = ReturnType<ReturnType<typeof Bun.file>["writer"]>;
let writer: Writer | null = null;

function ensureWriter() {
  if (writer) return writer;
  try {
    mkdirSync(dirname(config.security.auditLogPath), { recursive: true });
  } catch {
    // Directory already exists or we lack permission. The file write below
    // will surface the real error, which the caller swallows anyway.
  }
  writer = Bun.file(config.security.auditLogPath).writer();
  return writer;
}

export function audit(
  event: AuditEvent,
  details: { uid?: string; ip?: string; extra?: Record<string, unknown> } = {},
): void {
  try {
    const line =
      JSON.stringify({
        ts: new Date().toISOString(),
        event,
        uid: details.uid ?? null,
        ip: details.ip ?? null,
        ...(details.extra ?? {}),
      }) + "\n";
    const w = ensureWriter();
    if (!w) return;
    w.write(line);
    w.flush();
  } catch (e) {
    // Audit failures should never break the user flow; log to stderr so the
    // VM's journald captures it for later inspection.
    console.error("[audit] write failed:", e instanceof Error ? e.message : String(e));
  }
}

export function ipFrom(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() ?? "unknown";
}
