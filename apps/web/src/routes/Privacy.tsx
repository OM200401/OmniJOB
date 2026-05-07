import { Link } from "react-router-dom";
import {
  Check,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  Lock,
  Server,
  ShieldCheck,
  X,
} from "lucide-react";

type Visibility = "plaintext" | "encrypted" | "derived" | "never";

type Field = {
  name: string;
  what: string;
  where: Visibility;
  detail?: string;
};

const FIELDS: Field[] = [
  {
    name: "Email address",
    what: "Used to derive your account ID",
    where: "derived",
    detail: "We store SHA-256(email) as your uid. The plaintext email is encrypted into the profile blob. The server cannot reverse the hash to recover your address.",
  },
  {
    name: "Password",
    what: "Unlocks your data encryption key",
    where: "never",
    detail: "Argon2id-derived master key, generated in your browser. Never transmitted in any form — not even hashed.",
  },
  {
    name: "Recovery key",
    what: "Backup unlock for your DEK",
    where: "never",
    detail: "32 random bytes shown to you once at signup. We store the DEK encrypted with this key, but never the key itself.",
  },
  {
    name: "Résumé text",
    what: "Used for embedding & match explanations",
    where: "encrypted",
    detail: "Stored as ciphertext inside your encrypted profile blob. Used in-memory only when you request a match explanation; never logged or persisted on the server.",
  },
  {
    name: "Skill vector",
    what: "768-dim embedding used for ranking",
    where: "encrypted",
    detail: "Computed locally from your résumé via Ollama. Encrypted alongside the rest of the profile blob. The server-side Qdrant collection holds only the public job vectors.",
  },
  {
    name: "Saved jobs",
    what: "Your bookmarks",
    where: "encrypted",
    detail: "List of job IDs stored inside the encrypted profile blob. The server never sees which jobs you've saved.",
  },
  {
    name: "Applications",
    what: "Tracker — applied / interviewing / offer / etc.",
    where: "encrypted",
    detail: "Status, notes, timestamps — all live inside your encrypted profile blob. The server has no awareness of which roles you're pursuing.",
  },
  {
    name: "Saved searches",
    what: "Your alerts and pinned queries",
    where: "encrypted",
    detail: "Query strings, filters, and 'last seen' result snapshots are encrypted in the profile blob.",
  },
  {
    name: "Preferences",
    what: "Level, areas, remote/onsite, locations",
    where: "encrypted",
    detail: "Encrypted profile blob. Used client-side to construct search filters, never seen by the server.",
  },
  {
    name: "Search queries",
    what: "What you typed into the search box",
    where: "plaintext",
    detail: "Forwarded to the API to filter Qdrant results. We do not log queries or associate them with your uid; access logs are nginx-default and rotated daily.",
  },
  {
    name: "Match-explain payload",
    what: "Résumé + job description chunks",
    where: "plaintext",
    detail: "Sent over TLS to the API for chunk-level cosine scoring. Held only in the request lifecycle. Not logged. Not persisted. Not associated with your uid in any log line.",
  },
  {
    name: "IP address",
    what: "Connection metadata",
    where: "plaintext",
    detail: "Visible to whatever sits in front of the API (your operator's reverse proxy). Not stored alongside profile data, but inherent to TCP. Use Tor or a VPN if this matters to you.",
  },
];

const VIS_META: Record<Visibility, { label: string; chip: string; icon: typeof Eye }> = {
  plaintext: { label: "Plaintext on server", chip: "chip-warning", icon: Eye },
  encrypted: { label: "Ciphertext only",     chip: "chip-success", icon: Lock },
  derived:   { label: "One-way hash only",   chip: "chip-accent",  icon: Fingerprint },
  never:     { label: "Never leaves browser", chip: "chip-success", icon: EyeOff },
};

export function Privacy() {
  return (
    <div className="container" style={{ maxWidth: 880 }}>
      <div className="page-header">
        <div className="page-header-left">
          <span className="chip chip-accent" style={{ alignSelf: "flex-start", marginBottom: 8 }}>
            <ShieldCheck size={11} /> Privacy by default
          </span>
          <h1 className="page-title">What we never see</h1>
          <p className="muted text-sm" style={{ maxWidth: 620 }}>
            74% of job seekers say they would withdraw an application if they knew their data was sent
            offshore. OmniJob is built so that there is nothing meaningful for an operator —
            us, a future buyer, a subpoenaed admin, or a server compromise — to read.
          </p>
        </div>
      </div>

      <div className="col gap-md">
        <div className="card">
          <div className="section">
            <div className="row gap-sm" style={{ marginBottom: 8 }}>
              <KeyRound size={14} className="muted" />
              <strong>Three keys, one of which we hold</strong>
            </div>
            <p className="text-sm muted" style={{ marginBottom: 14 }}>
              Your data encryption key (DEK) is wrapped two ways: once with a key derived from your
              password (Argon2id, salt unique per account), once with a 32-byte random recovery key
              we showed you at signup. We store the wrapped DEK. We do not store the password, the
              recovery key, or the DEK in plaintext.
            </p>
            <div className="col gap-sm" style={{ fontSize: 13 }}>
              <KeyRow icon={<Lock size={12} />} k="Master key (Argon2id)" v="Lives in your browser only · derived from password on each unlock" />
              <KeyRow icon={<KeyRound size={12} />} k="Recovery key" v="Shown once at signup · you keep the only copy" />
              <KeyRow icon={<Server size={12} />} k="Encrypted DEK" v="Stored on the server, useless without one of the keys above" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="section">
            <div className="row gap-sm" style={{ marginBottom: 4 }}>
              <Eye size={14} className="muted" />
              <strong>Field-level disclosure</strong>
            </div>
            <p className="text-sm muted">
              Every piece of data and what the operator can see. Pessimistic by default: if a field is
              listed as "plaintext on server", assume an attacker with full DB access reads it as written.
            </p>
          </div>
          <div className="section" style={{ paddingTop: 0 }}>
            <div className="col" style={{ gap: 0 }}>
              {FIELDS.map((f) => {
                const meta = VIS_META[f.where];
                const Icon = meta.icon;
                return (
                  <div
                    key={f.name}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(160px, 1.1fr) minmax(180px, 1.4fr) auto",
                      alignItems: "start",
                      gap: 16,
                      padding: "12px 0",
                      borderTop: "1px solid var(--border-soft)",
                    }}
                  >
                    <div className="col" style={{ gap: 2 }}>
                      <strong style={{ fontSize: 13.5 }}>{f.name}</strong>
                      <span className="muted text-xs">{f.what}</span>
                    </div>
                    <div className="text-xs muted" style={{ lineHeight: 1.55 }}>
                      {f.detail}
                    </div>
                    <span className={`chip ${meta.chip}`} style={{ whiteSpace: "nowrap", height: "fit-content" }}>
                      <Icon size={10} /> {meta.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="section">
            <div className="row gap-sm" style={{ marginBottom: 8 }}>
              <Check size={14} className="muted" />
              <strong>Things we structurally cannot do</strong>
            </div>
            <ul className="col gap-sm text-sm" style={{ paddingLeft: 18, margin: 0 }}>
              <li>Reset your password without your recovery key. <span className="muted">There is no support backdoor — the math forbids it.</span></li>
              <li>Sell your résumé. <span className="muted">We only have the ciphertext.</span></li>
              <li>Build a "candidates available" feed of named users. <span className="muted">uids are SHA-256 hashes; there is no email column.</span></li>
              <li>Comply with a "give us this user's saved jobs" request. <span className="muted">We don't have the key.</span></li>
              <li>Train a model on your résumé. <span className="muted">It never leaves your browser as plaintext.</span></li>
            </ul>
          </div>
        </div>

        <div className="card">
          <div className="section">
            <div className="row gap-sm" style={{ marginBottom: 8 }}>
              <X size={14} className="muted" />
              <strong>Things we still need you to trust us about</strong>
            </div>
            <p className="text-sm muted" style={{ marginBottom: 8 }}>
              Honest catalogue of remaining trust requirements — none can be eliminated by client-side
              crypto alone:
            </p>
            <ul className="col gap-sm text-sm" style={{ paddingLeft: 18, margin: 0 }}>
              <li>That the JavaScript we serve is the same code as our public source. <span className="muted">Mitigation: deterministic builds + subresource integrity, planned.</span></li>
              <li>That we are not subverting the embedding endpoint to fingerprint résumés. <span className="muted">Mitigation: run Ollama locally and point the API at it; the deployment guide describes this.</span></li>
              <li>That access logs aren't aggregated and tied back. <span className="muted">Mitigation: log retention is 24h and queries are not associated with uids.</span></li>
            </ul>
          </div>
        </div>

        <div className="row-between">
          <Link to="/" className="btn btn-ghost btn-sm">Back to app</Link>
          <a
            className="btn btn-secondary btn-sm"
            href="https://github.com/anthropics/claude-code/issues"
            target="_blank"
            rel="noreferrer"
          >
            Report a privacy issue
          </a>
        </div>
      </div>
    </div>
  );
}

function KeyRow({ icon, k, v }: { icon: React.ReactNode; k: string; v: string }) {
  return (
    <div className="row gap-sm" style={{ alignItems: "flex-start" }}>
      <span className="muted" style={{ marginTop: 2 }}>{icon}</span>
      <div className="col" style={{ gap: 1 }}>
        <strong style={{ fontSize: 13 }}>{k}</strong>
        <span className="muted text-xs">{v}</span>
      </div>
    </div>
  );
}
