import { Link } from "react-router-dom";
import { ArrowRight, Bookmark, Building2, MapPin, Search } from "lucide-react";

export function Landing() {
  return (
    <div className="container-marketing">
      <section className="landing-hero">
        <span className="landing-eyebrow">
          <span className="dot" /> Live · across every industry, ranked to you
        </span>
        <h1>
          Every job.<br />
          <em>One search.</em>
        </h1>
        <p className="lede">
          Stop tab-hopping between dozens of job boards and company career
          pages. OmniJob pulls live postings from every source - tech,
          healthcare, retail, trades, government, and more - into one
          search ranked to you.
        </p>
        <div className="landing-actions">
          <Link to="/signup" className="btn btn-primary btn-lg">
            Start searching <ArrowRight size={15} />
          </Link>
        </div>
      </section>

      {/* Live-ish product preview - non-interactive but the same components
          the real feed uses, so the landing reads as the product itself.
          Phase 1C: examples rotate across industries (tech / healthcare /
          trades) to reinforce the "every job" message instead of signalling
          "this is for software engineers". */}
      <div className="preview-card">
        <div className="preview-chrome">
          <span className="dot" /> <span className="dot" /> <span className="dot" />
          <span className="url">omnijob.tech/feed</span>
        </div>
        <div className="preview-body">
          <div className="row" style={{ marginBottom: 14 }}>
            <div className="search-wrap" style={{ maxWidth: "100%", flex: 1 }}>
              <Search size={15} className="search-icon" />
              <span style={{ flex: 1, padding: "0 8px", color: "var(--fg-2)" }}>
                find roles across every industry
              </span>
              <kbd className="kbd">/</kbd>
            </div>
          </div>

          <div className="job-list">
            <PreviewRow
              company="Mayo Clinic"
              title="Registered Nurse, ICU"
              location="Rochester, MN · Onsite"
              level="Senior"
              age="4h"
              score={94}
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
              company="IBEW Local 3"
              title="Journeyman Electrician"
              location="New York, NY · Onsite"
              level="Senior"
              age="1d"
              score={81}
            />
          </div>
        </div>
      </div>

    </div>
  );
}

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
