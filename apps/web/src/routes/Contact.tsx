import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Mail, MessageSquare, Send } from "lucide-react";
import { api } from "../lib/api";
import { validateEmail } from "../lib/validation";
import { Button } from "../components/Button";
import { Alert } from "../components/Alert";

const SUBJECT_MIN = 3;
const SUBJECT_MAX = 120;
const MESSAGE_MIN = 10;
const MESSAGE_MAX = 4000;

export function Contact() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  // Honeypot: real users never see this; bots will fill it. Submissions with
  // a non-empty value are silently accepted but never written.
  const [website, setWebsite] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const trimSubject = subject.trim();
  const trimMessage = message.trim();
  const trimEmail = email.trim();
  const emailOk = trimEmail.length === 0 || validateEmail(trimEmail).ok;
  const subjectOk =
    trimSubject.length >= SUBJECT_MIN && trimSubject.length <= SUBJECT_MAX;
  const messageOk =
    trimMessage.length >= MESSAGE_MIN && trimMessage.length <= MESSAGE_MAX;
  const canSubmit = subjectOk && messageOk && emailOk && !submitting;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setErr(null);
    try {
      await api.contact({
        name: name.trim() || undefined,
        email: trimEmail || undefined,
        subject: trimSubject,
        message: trimMessage,
        website,
      });
      setDone(true);
    } catch (e) {
      setErr(
        e instanceof Error
          ? e.message === "rate_limited"
            ? "You've sent a few messages already. Try again in an hour."
            : e.message
          : "Could not send. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="container" style={{ maxWidth: 640 }}>
        <div className="card section" style={{ textAlign: "center", padding: 36 }}>
          <CheckCircle2 size={36} style={{ color: "var(--success)", margin: "0 auto 12px" }} />
          <h2 style={{ marginBottom: 8 }}>Message sent</h2>
          <p className="muted text-sm" style={{ maxWidth: 420, margin: "0 auto 18px" }}>
            Thanks for reaching out. If you left an email we'll reply when we
            see it. Otherwise consider this a one-way drop.
          </p>
          <Link to="/" className="btn btn-secondary btn-sm">Back to OmniJob</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ maxWidth: 640 }}>
      <div className="page-header">
        <div className="page-header-left">
          <span className="chip chip-accent" style={{ alignSelf: "flex-start", marginBottom: 8 }}>
            <MessageSquare size={11} /> Contact
          </span>
          <h1 className="page-title">Get in touch</h1>
          <p className="muted text-sm" style={{ maxWidth: 560 }}>
            Bug report, feature request, privacy concern, takedown request, or
            anything else - send it here. Your message goes straight to the
            person running OmniJob.
          </p>
        </div>
      </div>

      <form className="card section" onSubmit={onSubmit} noValidate>
        <div className="col gap-md">
          <div className="col" style={{ gap: 6 }}>
            <label htmlFor="contact-name" className="text-sm" style={{ fontWeight: 500 }}>
              Name <span className="muted-2 text-xs">(optional)</span>
            </label>
            <input
              id="contact-name"
              type="text"
              className="input"
              placeholder="What we should call you"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              autoComplete="name"
            />
          </div>

          <div className="col" style={{ gap: 6 }}>
            <label htmlFor="contact-email" className="text-sm" style={{ fontWeight: 500 }}>
              Email <span className="muted-2 text-xs">(optional - only if you want a reply)</span>
            </label>
            <input
              id="contact-email"
              type="email"
              className="input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={254}
              autoComplete="email"
              aria-invalid={!emailOk}
            />
            {!emailOk && (
              <span className="text-xs" style={{ color: "var(--danger)" }}>
                Enter a valid email or leave it blank.
              </span>
            )}
          </div>

          <div className="col" style={{ gap: 6 }}>
            <label htmlFor="contact-subject" className="text-sm" style={{ fontWeight: 500 }}>
              Subject
            </label>
            <input
              id="contact-subject"
              type="text"
              className="input"
              placeholder="One line summary"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={SUBJECT_MAX}
              required
            />
            <span className="muted-2 text-xs">
              {trimSubject.length}/{SUBJECT_MAX}
            </span>
          </div>

          <div className="col" style={{ gap: 6 }}>
            <label htmlFor="contact-message" className="text-sm" style={{ fontWeight: 500 }}>
              Message
            </label>
            <textarea
              id="contact-message"
              className="textarea"
              placeholder="As much detail as helps. Include the URL or action you took if you're reporting a bug."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={8}
              maxLength={MESSAGE_MAX}
              required
            />
            <span className="muted-2 text-xs">
              {trimMessage.length}/{MESSAGE_MAX}
            </span>
          </div>

          {/* Honeypot. Hidden from real users via inline style; bots that
              naively fill every text input give themselves away. Real-user
              accessibility is preserved by aria-hidden + tabIndex=-1. */}
          <div
            aria-hidden="true"
            style={{ position: "absolute", left: "-10000px", top: "auto", width: 1, height: 1, overflow: "hidden" }}
          >
            <label htmlFor="contact-website">Website</label>
            <input
              id="contact-website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </div>

          {err && <Alert variant="error">{err}</Alert>}

          <div className="row-between" style={{ alignItems: "center" }}>
            <span className="muted-2 text-xs row gap-sm">
              <Mail size={11} /> Stored as plain text on our server until we read it.
            </span>
            <Button variant="primary" type="submit" loading={submitting} disabled={!canSubmit}>
              <Send size={13} /> Send message
            </Button>
          </div>
        </div>
      </form>

      <div className="row-between" style={{ marginTop: 16 }}>
        <Link to="/" className="btn btn-ghost btn-sm">Back to OmniJob</Link>
        <Link to="/privacy" className="btn btn-ghost btn-sm">Privacy notice</Link>
      </div>
    </div>
  );
}
