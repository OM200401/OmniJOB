import { Elysia, t } from "elysia";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config";
import { ipFrom } from "../lib/audit";

// Append-only JSONL store for contact-form submissions. The operator pulls
// messages off the box with `tail` or `cat`; we deliberately do not send
// email so there's no SMTP secret to leak and no third-party in the loop.
//
// One writer, opened lazily on first submission. Writes are best-effort -
// a failed disk write surfaces a 500 to the client so they know to retry.

type Writer = ReturnType<ReturnType<typeof Bun.file>["writer"]>;
let writer: Writer | null = null;

function ensureWriter() {
  if (writer) return writer;
  mkdirSync(dirname(config.security.contactLogPath), { recursive: true });
  writer = Bun.file(config.security.contactLogPath).writer();
  return writer;
}

const ContactBody = t.Object({
  name: t.Optional(t.String({ maxLength: 80 })),
  email: t.Optional(t.String({ maxLength: 254 })),
  subject: t.String({ minLength: 3, maxLength: 120 }),
  message: t.String({ minLength: 10, maxLength: 4000 }),
  // Honeypot. Real users never fill this; bots that target every <input>
  // expose themselves. We accept the submission as a 200 but never persist.
  website: t.Optional(t.String({ maxLength: 256 })),
});

export const contact = new Elysia().post(
  "/contact",
  ({ body, request, set }) => {
    if (body.website && body.website.length > 0) {
      // Silent drop. Returning 200 keeps the bot from retrying with variant
      // payloads, and prevents real users from getting a confusing error if
      // they somehow autofilled the hidden field.
      return { status: "ok" };
    }
    const ip = ipFrom(request.headers);
    const userAgent = request.headers.get("user-agent")?.slice(0, 200) ?? null;
    const line =
      JSON.stringify({
        ts: new Date().toISOString(),
        ip,
        userAgent,
        name: body.name?.trim() || null,
        email: body.email?.trim() || null,
        subject: body.subject.trim(),
        message: body.message.trim(),
      }) + "\n";
    try {
      const w = ensureWriter();
      w.write(line);
      w.flush();
    } catch (e) {
      console.error(
        "[contact] write failed:",
        e instanceof Error ? e.message : String(e),
      );
      set.status = 500;
      return { error: "could not record message" };
    }
    return { status: "ok" };
  },
  { body: ContactBody },
);
