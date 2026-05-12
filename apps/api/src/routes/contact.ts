import { Elysia, t } from "elysia";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config";
import { ipFrom } from "../lib/audit";

// Contact form pipeline:
//   1. Append a JSONL line to CONTACT_LOG_PATH. This is the source of truth
//      and survives a Resend outage or a missing API key.
//   2. If RESEND_API_KEY + CONTACT_TO_EMAIL are configured, fire-and-forget
//      a POST to Resend so the operator gets the message in their inbox.
//      The HTTP response to the user does NOT wait for Resend; an email
//      failure must never surface to the submitter.

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

type Submission = {
  ts: string;
  ip: string;
  userAgent: string | null;
  name: string | null;
  email: string | null;
  subject: string;
  message: string;
};

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

async function forwardToResend(sub: Submission): Promise<void> {
  const { resendApiKey, toEmail, fromEmail } = config.contact;
  if (!resendApiKey || !toEmail) {
    // Surface the skip so an operator debugging a missing email immediately
    // sees the cause instead of silent nothing. Reasons spelled out so a
    // wrong-name env var (e.g. RESEND_KEY vs RESEND_API_KEY) is obvious.
    console.warn(
      `[contact] skipping resend forward: ` +
        `apiKey=${resendApiKey ? "set" : "MISSING"} ` +
        `to=${toEmail ? "set" : "MISSING"}`,
    );
    return;
  }
  console.log(
    `[contact] forwarding to resend (to=${toEmail}, from=${fromEmail})`,
  );

  const subject = `[OmniJob contact] ${sub.subject}`;
  // Plain-text body — most email clients render it cleanly and we don't
  // need any styling. Keep the metadata at the top so it's visible without
  // scrolling on mobile.
  const text =
    `From: ${sub.name ?? "(anonymous)"} <${sub.email ?? "no email provided"}>\n` +
    `Sent: ${sub.ts}\n` +
    `IP: ${sub.ip}\n` +
    `User-Agent: ${sub.userAgent ?? "unknown"}\n` +
    `\n---\n\n` +
    sub.message;
  const html =
    `<p style="font-family:system-ui,sans-serif;font-size:13px;color:#555">` +
    `<strong>From:</strong> ${escapeHtml(sub.name ?? "(anonymous)")} ` +
    `&lt;${escapeHtml(sub.email ?? "no email provided")}&gt;<br>` +
    `<strong>Sent:</strong> ${escapeHtml(sub.ts)}<br>` +
    `<strong>IP:</strong> ${escapeHtml(sub.ip)}<br>` +
    `<strong>User-Agent:</strong> ${escapeHtml(sub.userAgent ?? "unknown")}` +
    `</p><hr><pre style="font-family:system-ui,sans-serif;font-size:14px;` +
    `white-space:pre-wrap;word-break:break-word">${escapeHtml(sub.message)}</pre>`;

  const payload: Record<string, unknown> = {
    from: fromEmail,
    to: [toEmail],
    subject,
    text,
    html,
  };
  // If the submitter left an email, set Reply-To so the operator can hit
  // Reply in their mail client and the response goes to the right place.
  if (sub.email) payload["reply_to"] = sub.email;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify(payload),
      // Hard ceiling so a hung Resend connection can't pin the runtime.
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(
        `[contact] resend forward failed: ${res.status} ${res.statusText} ${detail.slice(0, 200)}`,
      );
    } else {
      const body = (await res.json().catch(() => null)) as { id?: string } | null;
      console.log(
        `[contact] resend forward delivered (id=${body?.id ?? "unknown"})`,
      );
    }
  } catch (e) {
    console.error(
      "[contact] resend forward error:",
      e instanceof Error ? e.message : String(e),
    );
  }
}

export const contact = new Elysia().post(
  "/contact",
  ({ body, request, set }) => {
    if (body.website && body.website.length > 0) {
      // Silent drop. Returning 200 keeps the bot from retrying with variant
      // payloads, and prevents real users from getting a confusing error if
      // they somehow autofilled the hidden field.
      return { status: "ok" };
    }
    const sub: Submission = {
      ts: new Date().toISOString(),
      ip: ipFrom(request.headers),
      userAgent: request.headers.get("user-agent")?.slice(0, 200) ?? null,
      name: body.name?.trim() || null,
      email: body.email?.trim() || null,
      subject: body.subject.trim(),
      message: body.message.trim(),
    };
    try {
      const w = ensureWriter();
      w.write(JSON.stringify(sub) + "\n");
      w.flush();
    } catch (e) {
      console.error(
        "[contact] write failed:",
        e instanceof Error ? e.message : String(e),
      );
      set.status = 500;
      return { error: "could not record message" };
    }
    // Fire-and-forget. The user's response is not blocked on Resend, and a
    // Resend failure surfaces only in server logs (the JSONL is canonical).
    void forwardToResend(sub);
    return { status: "ok" };
  },
  { body: ContactBody },
);
