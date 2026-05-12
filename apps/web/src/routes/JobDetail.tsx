import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Building2,
  ClipboardCheck,
  ClipboardCopy,
  ExternalLink,
  MapPin,
  Wifi,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { api, type JobMetadata, type JobSources } from "../lib/api";
import { type ApplicationStatus } from "../lib/crypto/vault";
import { diffSkills, extractSkills, type ExtractedSkill } from "../lib/skills";
import { sourceDisplayName } from "../lib/sources";
import { Button } from "../components/Button";
import { Alert } from "../components/Alert";

type ExplainPair = { resume: string; job: string; score: number };

export function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const { session, patchProfile } = useAuth();
  const [meta, setMeta] = useState<JobMetadata | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pairs, setPairs] = useState<ExplainPair[] | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [sources, setSources] = useState<JobSources | null>(null);

  const resumeText = session?.profile.resumeText;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    setPairs(null);
    setSources(null);
    if (!id) return;
    api
      .getJob(id)
      .then((res) => {
        if (!cancelled) setMeta(res.payload);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Lazy-load the cross-source disclosure once the job is loaded.
  useEffect(() => {
    if (!id || !meta) return;
    let cancelled = false;
    api
      .fetchJobSources(id)
      .then((res) => {
        if (!cancelled) setSources(res);
      })
      .catch(() => {
        // Quietly ignore - panel just won't render.
      });
    return () => {
      cancelled = true;
    };
  }, [id, meta]);

  // Inject JobPosting JSON-LD so Google indexes us into Google for Jobs.
  // Lives in <head> while this route is mounted; removed on unmount.
  useEffect(() => {
    if (!id || !meta) return;
    const el = document.createElement("script");
    el.type = "application/ld+json";
    el.id = `jobposting-${id}`;
    el.textContent = JSON.stringify(buildJobPostingSchema(meta));
    document.head.appendChild(el);
    return () => {
      if (el.parentNode) el.parentNode.removeChild(el);
    };
  }, [id, meta]);

  // Lazy-load match explanation once the job is loaded.
  useEffect(() => {
    if (!id || !meta || !resumeText || resumeText.length < 50) return;
    let cancelled = false;
    setExplaining(true);
    api
      .matchExplain(id, resumeText)
      .then((res) => {
        if (!cancelled) setPairs(res.pairs);
      })
      .catch(() => {
        // Quietly ignore - the rest of the page still works.
      })
      .finally(() => {
        if (!cancelled) setExplaining(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, meta, resumeText]);

  if (!id) return null;

  const saved = session?.profile.savedJobIds.includes(id) ?? false;
  const application = useMemo(
    () => session?.profile.applications.find((a) => a.jobId === id),
    [session?.profile.applications, id],
  );

  const toggleSave = () => {
    if (!session) return;
    const cur = new Set(session.profile.savedJobIds);
    if (saved) cur.delete(id);
    else cur.add(id);
    void patchProfile({ savedJobIds: Array.from(cur) });
  };

  const markApplied = () => {
    if (!session || application) return;
    const now = Date.now();
    const next = [
      ...session.profile.applications,
      { jobId: id, status: "applied" as ApplicationStatus, appliedAt: now, lastTouchedAt: now },
    ];
    void patchProfile({ applications: next });
  };

  const updateStatus = (status: ApplicationStatus) => {
    if (!session) return;
    const next = session.profile.applications.map((a) =>
      a.jobId === id ? { ...a, status, lastTouchedAt: Date.now() } : a,
    );
    void patchProfile({ applications: next });
  };

  const onApplyClick = () => {
    markApplied();
    window.open(meta?.source_url, "_blank", "noopener,noreferrer");
  };

  const [resumeCopied, setResumeCopied] = useState(false);
  const copyResume = async () => {
    if (!session?.profile.resumeText) return;
    try {
      await navigator.clipboard.writeText(session.profile.resumeText);
      setResumeCopied(true);
      setTimeout(() => setResumeCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="container">
      <Link to="/feed" className="nav-link" style={{ marginBottom: 14, paddingLeft: 0 }}>
        <ArrowLeft size={14} /> Back to feed
      </Link>

      {err && <Alert variant="error">{err}</Alert>}
      {loading && (
        <div className="card section" style={{ padding: 32, textAlign: "center" }}>
          <span className="spinner" /> <span className="muted">Loading job…</span>
        </div>
      )}

      {meta && (
        <div className="detail-grid">
          <div className="col gap-md">
            <div className="detail-header">
              <h1>{meta.title}</h1>
              <div className="detail-meta">
                <span className="row gap-sm"><Building2 size={14} /> {meta.company}</span>
                {meta.location && (
                  <>
                    <span className="meta-dot" />
                    <span className="row gap-sm"><MapPin size={14} /> {meta.location}</span>
                  </>
                )}
                {meta.remote_status === "remote" && (
                  <>
                    <span className="meta-dot" />
                    <span className="chip chip-success"><Wifi size={11} /> Remote</span>
                  </>
                )}
                {meta.remote_status === "hybrid" && (
                  <>
                    <span className="meta-dot" />
                    <span className="chip chip-accent">Hybrid</span>
                  </>
                )}
                {meta.source && (
                  <>
                    <span className="meta-dot" />
                    {/* Primary apply path. Direct click-through to the canonical
                        source - proves the listing isn't laundered through an
                        aggregator and lets the user verify without leaving us. */}
                    <a
                      href={meta.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link text-sm row gap-sm"
                      style={{ alignItems: "center", gap: 4 }}
                    >
                      via {sourceDisplayName(meta.source)} <ExternalLink size={12} />
                    </a>
                  </>
                )}
                {sources && sources.duplicates.length > 0 && (
                  <>
                    <span className="meta-dot" />
                    <span
                      className="chip chip-success"
                      style={{ fontSize: 11, height: 19 }}
                      title={`Same role found across ${1 + sources.duplicates.length} sources`}
                    >
                      Verified · {1 + sources.duplicates.length} sources
                    </span>
                  </>
                )}
              </div>
              <div className="row gap-sm" style={{ marginTop: 4 }}>
                {meta.salary_range ? (
                  <span className="chip chip-success" style={{ fontSize: 12.5, height: 24, padding: "0 10px" }}>
                    💰 {meta.salary_range}
                  </span>
                ) : (
                  <span className="chip chip-muted" style={{ fontSize: 12.5, height: 24, padding: "0 10px" }}>
                    Salary not disclosed by employer
                  </span>
                )}
              </div>
            </div>

            <div className="card detail-body">
              {meta.description ? meta.description : <span className="muted">No description provided.</span>}
            </div>

            <SkillsPanel
              jobText={[meta.title, meta.description ?? ""].join("\n")}
              resumeText={resumeText ?? ""}
              industry={meta.industry}
            />

            {(explaining || pairs) && (
              <ExplainPanel pairs={pairs} loading={explaining} />
            )}
          </div>

          <aside className="detail-aside">
            <div className="card section" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              {meta.source && <ApplyHandoff source={meta.source} />}

              <Button variant="accent" block onClick={onApplyClick}>
                Apply on company site <ExternalLink size={14} />
              </Button>

              <Button variant="secondary" block onClick={copyResume} disabled={!session?.profile.resumeText}>
                {resumeCopied ? (
                  <><ClipboardCheck size={14} /> Copied to clipboard</>
                ) : (
                  <><ClipboardCopy size={14} /> Copy résumé text</>
                )}
              </Button>

              {application ? (
                <div className="col gap-sm" style={{ paddingTop: 10, borderTop: "1px solid var(--border-soft)" }}>
                  <div className="row-between text-xs">
                    <span className="muted-2" style={{ textTransform: "uppercase", letterSpacing: 0.06 }}>
                      Tracked application
                    </span>
                    <Link to="/applications" className="link text-xs">View all</Link>
                  </div>
                  <select
                    className="input"
                    value={application.status}
                    onChange={(e) => updateStatus(e.target.value as ApplicationStatus)}
                    style={{ height: 32, fontSize: 13 }}
                  >
                    <option value="applied">Applied</option>
                    <option value="interviewing">Interviewing</option>
                    <option value="offer">Offer</option>
                    <option value="rejected">Rejected</option>
                    <option value="ghosted">Ghosted</option>
                    <option value="withdrawn">Withdrawn</option>
                  </select>
                </div>
              ) : (
                <Button variant="ghost" block onClick={markApplied} style={{ marginTop: 4 }}>
                  Mark as applied (no redirect)
                </Button>
              )}

              <Button variant="ghost" block onClick={toggleSave} size="sm">
                {saved ? (
                  <><BookmarkCheck size={14} /> Saved</>
                ) : (
                  <><Bookmark size={14} /> Save for later</>
                )}
              </Button>
            </div>

            {meta.quality !== undefined && meta.quality_breakdown && (
              <QualityPanel total={meta.quality} breakdown={meta.quality_breakdown} />
            )}

            {sources && sources.duplicates.length > 0 ? (
              <VerifiedSourcesPanel sources={sources} />
            ) : (
              <div className="card section" style={{ padding: 16 }}>
                <h4 style={{ fontSize: 11, textTransform: "uppercase", color: "var(--fg-4)", marginBottom: 8 }}>Source</h4>
                <a className="link text-sm" href={meta.source_url} target="_blank" rel="noopener noreferrer">
                  {sourceDisplayName(meta.source)} <ExternalLink size={11} style={{ verticalAlign: "-1px" }} />
                </a>
                <p className="text-xs muted" style={{ marginTop: 6 }}>
                  Scraped {timeAgo(meta.scraped_at)}
                </p>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

// Per-source UX guidance shown above the Apply button. Calibrated from
// hands-on observation of each ATS's apply flow - saves the user from
// surprise (no account vs. account required, single-page vs. multi-step).
const HANDOFF: Record<string, { steps: string; minutes: string; account: "no" | "maybe" | "yes" }> = {
  greenhouse:      { steps: "single-page",         minutes: "3-5",  account: "no" },
  ashby:           { steps: "single-page",         minutes: "5-8",  account: "no" },
  lever:           { steps: "single-page",         minutes: "5-8",  account: "maybe" },
  smartrecruiters: { steps: "multi-step portal",   minutes: "10-15", account: "yes" },
  recruitee:       { steps: "per-company hosted",  minutes: "5-10", account: "maybe" },
  workable:        { steps: "multi-step portal",   minutes: "8-12", account: "yes" },
};

function ApplyHandoff({ source }: { source: string }) {
  const info = HANDOFF[source];
  if (!info) return null;
  const accountLabel =
    info.account === "no"
      ? "No account required"
      : info.account === "maybe"
        ? "Account may be required"
        : "Account required";
  const accountChip =
    info.account === "no" ? "chip-success" : info.account === "yes" ? "chip-warning" : "chip-muted";
  return (
    <div
      style={{
        padding: 10,
        borderRadius: 8,
        background: "var(--surface-2)",
        border: "1px solid var(--border-soft)",
        fontSize: 12,
      }}
    >
      <div className="row-between" style={{ marginBottom: 4 }}>
        <span className="muted-2" style={{ textTransform: "uppercase", letterSpacing: 0.06, fontSize: 10.5, fontWeight: 600 }}>
          What to expect
        </span>
        <span className={`chip ${accountChip}`} style={{ fontSize: 10.5, height: 17 }}>
          {accountLabel}
        </span>
      </div>
      <p className="muted text-xs" style={{ margin: 0, lineHeight: 1.4 }}>
        {info.steps} · ~{info.minutes} min · {source.charAt(0).toUpperCase() + source.slice(1)} board
      </p>
    </div>
  );
}

// Surface the dedupe pass's cross-source merge: the canonical row first
// (marked primary), then every duplicate that scripts/dedupe.ts collapsed
// into it. Each row links to the original posting on its source - the
// "verified across N sources" trust signal made tangible.
function VerifiedSourcesPanel({ sources }: { sources: JobSources }) {
  const total = 1 + sources.duplicates.length;
  return (
    <div className="card section verified-sources" style={{ padding: 16 }}>
      <h4 style={{ fontSize: 11, textTransform: "uppercase", color: "var(--fg-4)", marginBottom: 4 }}>
        Verified across {total} sources
      </h4>
      <p className="text-xs muted-2" style={{ margin: "0 0 12px" }}>
        We found the same role posted on {total} independent boards.
      </p>
      <ul className="verified-sources-list">
        <li className="verified-sources-row">
          <div className="col" style={{ gap: 1, minWidth: 0 }}>
            <span className="text-sm" style={{ fontWeight: 500 }}>
              {sourceDisplayName(sources.canonical.source)}{" "}
              <span className="muted-2 text-xs" style={{ fontWeight: 400 }}>(primary)</span>
            </span>
          </div>
          <a
            className="link text-xs row gap-sm"
            href={sources.canonical.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ alignItems: "center", whiteSpace: "nowrap" }}
          >
            View <ExternalLink size={11} />
          </a>
        </li>
        {sources.duplicates.map((d, i) => (
          <li key={`${d.source}-${i}`} className="verified-sources-row">
            <div className="col" style={{ gap: 1, minWidth: 0 }}>
              <span className="text-sm">{sourceDisplayName(d.source)}</span>
            </div>
            <a
              className="link text-xs row gap-sm"
              href={d.source_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ alignItems: "center", whiteSpace: "nowrap" }}
            >
              View <ExternalLink size={11} />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function periodToUnitText(period?: string): string {
  switch (period) {
    case "annual": return "YEAR";
    case "monthly": return "MONTH";
    case "weekly": return "WEEK";
    case "daily": return "DAY";
    case "hourly": return "HOUR";
    default: return "YEAR";
  }
}

function buildJobPostingSchema(meta: JobMetadata): Record<string, unknown> {
  const baseTs = meta.posted_at ?? meta.scraped_at;
  const datePosted = new Date(baseTs).toISOString();
  const validThrough = new Date(baseTs + 30 * 86400 * 1000).toISOString();
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: meta.title,
    description: meta.description ?? meta.title,
    datePosted,
    validThrough,
    employmentType: "FULL_TIME",
    hiringOrganization: { "@type": "Organization", name: meta.company },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: meta.location ?? "",
        addressCountry: meta.country ?? "",
      },
    },
    directApply: false,
  };
  if (
    meta.salary_min !== undefined &&
    meta.salary_max !== undefined &&
    meta.salary_currency
  ) {
    schema.baseSalary = {
      "@type": "MonetaryAmount",
      currency: meta.salary_currency,
      value: {
        "@type": "QuantitativeValue",
        minValue: meta.salary_min,
        maxValue: meta.salary_max,
        unitText: periodToUnitText(meta.salary_period),
      },
    };
  }
  return schema;
}

function timeAgo(ts: number): string {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

function ExplainPanel({
  pairs,
  loading,
}: {
  pairs: ExplainPair[] | null;
  loading: boolean;
}) {
  return (
    <div className="card section" style={{ padding: 18 }}>
      <h4 style={{ fontSize: 11, textTransform: "uppercase", color: "var(--fg-4)", margin: "0 0 12px" }}>
        Why this matched
      </h4>
      {loading && (
        <div className="row gap-sm muted text-sm">
          <span className="spinner" /> Comparing your résumé to the description…
        </div>
      )}
      {!loading && pairs && pairs.length === 0 && (
        <p className="muted text-sm">
          We couldn't extract a strong phrase-level overlap. The whole-document match still applies.
        </p>
      )}
      {!loading && pairs && pairs.length > 0 && (
        <div className="col gap-md">
          {pairs.map((p, i) => (
            <div key={i} className="explain-pair">
              <div className="explain-side">
                <span className="explain-label">Your résumé</span>
                <p className="explain-text">{p.resume}</p>
              </div>
              <div className="explain-arrow" aria-hidden>
                ↔
                <span className="explain-score mono">
                  {Math.round(p.score * 100)}%
                </span>
              </div>
              <div className="explain-side">
                <span className="explain-label">Job description</span>
                <p className="explain-text">{p.job}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function QualityPanel({
  total,
  breakdown,
}: {
  total: number;
  breakdown: NonNullable<import("../lib/api").JobMetadata["quality_breakdown"]>;
}) {
  const pct = Math.round(total * 100);
  const tier = total >= 0.65 ? "high" : total >= 0.4 ? "medium" : "low";
  const tierColor =
    tier === "high" ? "var(--success)" : tier === "medium" ? "var(--warning)" : "var(--fg-4)";
  return (
    <div className="card section" style={{ padding: 16 }}>
      <div className="row-between" style={{ marginBottom: 10 }}>
        <h4 style={{ fontSize: 11, textTransform: "uppercase", color: "var(--fg-4)", margin: 0 }}>
          Posting quality
        </h4>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            fontWeight: 600,
            color: tierColor,
          }}
        >
          {pct}/100
        </span>
      </div>
      <div className="col gap-sm" style={{ fontSize: 12.5 }}>
        <ScoreRow label="Salary disclosed" value={breakdown.salary_disclosed} weight={0.3} />
        <ScoreRow label="Freshness" value={breakdown.freshness} weight={0.3} />
        <ScoreRow label="Description depth" value={breakdown.description_length} weight={0.25} />
        <ScoreRow label="Source reliability" value={breakdown.source_reliability} weight={0.15} />
      </div>
      <p className="text-xs muted-2" style={{ marginTop: 10 }}>
        Composite signal of how trustworthy this posting looks. Doesn't affect ranking - just disclosure.
      </p>
    </div>
  );
}

function SkillsPanel({
  jobText,
  resumeText,
  industry,
}: {
  jobText: string;
  resumeText: string;
  industry?: import("../lib/api").Industry;
}) {
  const { matched, missing } = useMemo(() => {
    // Use the job's industry to pick the right skill lexicon. A healthcare
    // posting compares against the healthcare lexicon (RN License, IV
    // Therapy, Epic, ...) rather than the tech default (Python, React, ...).
    const job = extractSkills(jobText, industry);
    const resume = extractSkills(resumeText, industry);
    return diffSkills(resume, job);
  }, [jobText, resumeText, industry]);

  if (matched.length === 0 && missing.length === 0) return null;

  return (
    <div className="card section" style={{ padding: 18 }}>
      <h4 style={{ fontSize: 11, textTransform: "uppercase", color: "var(--fg-4)", margin: "0 0 4px" }}>
        Skill fit
      </h4>
      <p className="muted text-xs" style={{ margin: "0 0 14px" }}>
        Heuristic match against a known-skills lexicon. Not algorithmic ranking - just
        what's literally named in both texts.
      </p>

      {matched.length > 0 && (
        <div style={{ marginBottom: missing.length > 0 ? 14 : 0 }}>
          <div className="text-xs muted-2" style={{ marginBottom: 6, fontWeight: 600 }}>
            Matched on ({matched.length})
          </div>
          <SkillRow skills={matched} chip="chip-success" />
        </div>
      )}

      {missing.length > 0 && (
        <div>
          <div className="text-xs muted-2" style={{ marginBottom: 6, fontWeight: 600 }}>
            Job mentions, your résumé doesn't ({missing.length})
          </div>
          <SkillRow skills={missing} chip="chip-warning" />
          <p className="text-xs muted-2" style={{ marginTop: 8 }}>
            These aren't blockers - they're a checklist of what to highlight in your application
            (or learn, if it matters).
          </p>
        </div>
      )}
    </div>
  );
}

function SkillRow({ skills, chip }: { skills: ExtractedSkill[]; chip: string }) {
  return (
    <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
      {skills.map((s) => (
        <span
          key={s.name}
          className={`chip ${chip}`}
          style={{ fontSize: 11.5, height: 22 }}
          title={s.category}
        >
          {s.name}
        </span>
      ))}
    </div>
  );
}

function ScoreRow({ label, value, weight }: { label: string; value: number; weight: number }) {
  return (
    <div className="row-between">
      <span className="muted">{label}</span>
      <span className="row gap-sm" style={{ alignItems: "center" }}>
        <span
          style={{
            display: "inline-block",
            width: 56,
            height: 4,
            borderRadius: 2,
            background: "var(--surface-3)",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <span
            style={{
              position: "absolute",
              inset: 0,
              right: "auto",
              width: `${Math.round(value * 100)}%`,
              background: value >= 0.7 ? "var(--success)" : value >= 0.4 ? "var(--warning)" : "var(--fg-4)",
            }}
          />
        </span>
        <span className="mono text-xs muted" style={{ minWidth: 36, textAlign: "right" }}>
          {Math.round(value * 100)}<span className="muted-2"> · ×{weight}</span>
        </span>
      </span>
    </div>
  );
}
