import { Link } from "react-router-dom";
import { ArrowRight, Bookmark, Building2, MapPin, Search } from "lucide-react";

export function Landing() {
  return (
    <div className="container-marketing">
      <section className="landing-hero">
        <span className="landing-eyebrow">
          <span className="dot" /> Live · {ATS_FACTS.companies}+ company boards indexed
        </span>
        <h1>
          Job search that reads your résumé,<br />
          not your <em>keywords</em>.
        </h1>
        <p className="lede">
          OmniJob ranks live postings from Greenhouse, Lever and Ashby boards by
          cosine similarity to your résumé. Encrypted on your device - the server
          never sees the plaintext.
        </p>
        <div className="landing-actions">
          <Link to="/signup" className="btn btn-primary btn-lg">
            Create your vault <ArrowRight size={15} />
          </Link>
          <Link to="/signin" className="btn btn-secondary btn-lg">
            Sign in
          </Link>
        </div>
      </section>

      {/* Live-ish product preview - non-interactive but the same components
          the real feed uses, so the landing reads as the product itself. */}
      <div className="preview-card">
        <div className="preview-chrome">
          <span className="dot" /> <span className="dot" /> <span className="dot" />
          <span className="url">omnijob.local/feed</span>
        </div>
        <div className="preview-body">
          <div className="row" style={{ marginBottom: 14 }}>
            <div className="search-wrap" style={{ maxWidth: "100%", flex: 1 }}>
              <Search size={15} className="search-icon" />
              <span style={{ flex: 1, padding: "0 8px", color: "var(--fg-2)" }}>
                ml platform engineer · python · kubernetes
              </span>
              <kbd className="kbd">/</kbd>
            </div>
          </div>

          <div className="job-list">
            <PreviewRow
              company="Anthropic"
              title="Senior Software Engineer, Inference Platform"
              location="San Francisco · Remote"
              level="Senior"
              age="2d"
              score={92}
              highlight
            />
            <PreviewRow
              company="Stripe"
              title="ML Platform Engineer"
              location="Remote (US)"
              level="Senior"
              age="6h"
              score={88}
              highlight
            />
            <PreviewRow
              company="Vercel"
              title="Software Engineer, Edge Runtime"
              location="Remote"
              level="Mid"
              age="1d"
              score={81}
            />
          </div>
        </div>
      </div>

      <section className="facts">
        <div className="fact">
          <h4>Encryption</h4>
          <p>
            Argon2id derives a 256-bit key from your password locally. Résumé +
            saved jobs are AES-256-GCM ciphertext on the wire and at rest.
          </p>
        </div>
        <div className="fact">
          <h4>Data</h4>
          <p>
            Live postings via the public Greenhouse, Lever and Ashby APIs.
            Embedded with nomic-embed-text (768 dim, cosine) on your machine.
          </p>
        </div>
        <div className="fact">
          <h4>No PII server-side</h4>
          <p>
            Your account id is SHA-256 of your email - the server never stores
            the email itself, the password, or any plaintext résumé.
          </p>
        </div>
      </section>
    </div>
  );
}

const ATS_FACTS = {
  companies: "40",
};

function PreviewRow({
  company,
  title,
  location,
  level,
  age,
  score,
  highlight = false,
}: {
  company: string;
  title: string;
  location: string;
  level: string;
  age: string;
  score: number;
  highlight?: boolean;
}) {
  return (
    <div className="job-row" style={{ cursor: "default" }}>
      <span
        aria-hidden
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: "var(--surface-2)",
          border: "1px solid var(--border-soft)",
          color: "var(--fg-3)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 14,
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        <Building2 size={14} />
      </span>

      <div className="job-row-body">
        <div className="job-row-line1">
          <span className="job-title">{title}</span>
          <span className="chip">{level}</span>
        </div>
        <div className="job-row-line2">
          <span className="job-company">{company}</span>
          <span className="meta-dot" />
          <span><MapPin size={11} style={{ verticalAlign: -1 }} /> {location}</span>
          <span className="meta-dot" />
          <span>{age}</span>
        </div>
      </div>

      <div className="job-row-right">
        <span className="match-pill" data-strong={highlight ? "true" : "false"}>{score}%</span>
        <span className="icon-btn" aria-hidden><Bookmark size={14} /></span>
      </div>
    </div>
  );
}
