import { Link } from "react-router-dom";
import { Bookmark, BookmarkCheck, DollarSign } from "lucide-react";
import type { JobHit, RemoteStatus } from "../lib/api";
import { flagEmoji } from "../lib/countries";
import { CompanyLogo } from "./CompanyLogo";

type Props = {
  hit: JobHit;
  saved: boolean;
  onToggleSave: (id: string, save: boolean) => void;
};

const levelLabel: Record<string, string> = {
  intern: "Intern",
  junior: "Junior",
  mid: "Mid",
  senior: "Senior",
  staff: "Staff",
  principal: "Principal",
  manager: "Manager",
  director: "Director",
  executive: "Executive",
};

// Card grid item. Shows the full "should I click this?" surface — title,
// company, level chip, salary chip, location, remote, freshness, quality
// dot, match score — but never the description preview (that lives only on
// the detail page).
export function JobCard({ hit, saved, onToggleSave }: Props) {
  const id = String(hit.id);
  const remote = hit.payload.remote_status;
  const level = hit.payload.experience_level;
  const salary = hit.payload.salary_range;
  const posted = hit.payload.posted_at ?? hit.payload.scraped_at;
  const lastSeen = hit.payload.scraped_at ?? hit.payload.posted_at;
  const score = Math.round(Math.max(0, Math.min(1, hit.score)) * 100);
  const fresh = freshnessOf(lastSeen);

  return (
    <Link
      to={`/jobs/${encodeURIComponent(id)}`}
      className="job-card"
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div className="job-card-header">
        <CompanyLogo company={hit.payload.company} size={32} />
        <div className="row gap-sm" style={{ alignItems: "center", gap: 6 }}>
          {hit.payload.quality !== undefined && <QualityDot value={hit.payload.quality} />}
          <span className="match-pill" data-strong={hit.score >= 0.6 ? "true" : "false"}>
            {score}%
          </span>
        </div>
      </div>

      <div className="job-card-body">
        <h3 className="job-card-title">{hit.payload.title}</h3>
        <div className="job-card-company">{hit.payload.company}</div>
      </div>

      <div className="job-card-chips">
        {level && <span className="chip">{levelLabel[level] ?? level}</span>}
        {salary ? (
          <span className="chip chip-success" title={salary}>
            <DollarSign size={10} style={{ marginRight: -1 }} />
            <span className="chip-truncate">{salary}</span>
          </span>
        ) : (
          <span className="chip chip-muted" title="No salary disclosed">
            no salary
          </span>
        )}
      </div>

      <div className="job-card-footer">
        <div className="job-card-meta">
          {(hit.payload.location || hit.payload.country) && (
            <span className="meta-item">
              {hit.payload.country && (
                <span aria-hidden style={{ marginRight: 3 }}>
                  {flagEmoji(hit.payload.country)}
                </span>
              )}
              {hit.payload.location || "—"}
            </span>
          )}
          {isShownRemote(remote) && (
            <>
              <span className="meta-dot" />
              <span className="meta-item">{remote === "remote" ? "Remote" : "Hybrid"}</span>
            </>
          )}
          {posted && (
            <>
              <span className="meta-dot" />
              <span className="meta-item">{timeAgo(posted)}</span>
            </>
          )}
          {fresh && (
            <span
              className={`chip ${fresh === "fresh" ? "chip-success" : "chip-warning"}`}
              style={{ height: 16, padding: "0 5px", fontSize: 10, marginLeft: 2 }}
            >
              {fresh === "fresh" ? "Fresh" : "Stale"}
            </span>
          )}
        </div>
        <button
          className="icon-btn"
          aria-label={saved ? "Unsave" : "Save"}
          title={saved ? "Saved" : "Save"}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleSave(id, !saved);
          }}
        >
          {saved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
        </button>
      </div>
    </Link>
  );
}

function isShownRemote(r: RemoteStatus | undefined): r is "remote" | "hybrid" {
  return r === "remote" || r === "hybrid";
}

function timeAgo(ms: number): string {
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d`;
  return `${Math.floor(s / (86400 * 30))}mo`;
}

function freshnessOf(ms: number | undefined): "fresh" | "stale" | null {
  if (!ms) return null;
  const days = (Date.now() - ms) / 86_400_000;
  if (days < 7) return "fresh";
  if (days > 45) return "stale";
  return null;
}

function QualityDot({ value }: { value: number }) {
  // Three tiers — high ≥ 0.65, medium ≥ 0.40, low otherwise.
  const tier = value >= 0.65 ? "high" : value >= 0.4 ? "med" : "low";
  const label =
    tier === "high"
      ? "High-quality posting"
      : tier === "med"
        ? "Average-quality posting"
        : "Low-signal posting";
  const color =
    tier === "high"
      ? "var(--success)"
      : tier === "med"
        ? "var(--warning)"
        : "var(--fg-4)";
  return (
    <span
      title={`${label} · score ${Math.round(value * 100)}/100`}
      aria-label={label}
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
      }}
    />
  );
}
