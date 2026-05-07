import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bookmark,
  CheckCircle2,
  CircleSlash,
  Clock,
  ExternalLink,
  Flame,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { api, type JobMetadata } from "../lib/api";
import {
  type Application,
  type ApplicationStatus,
} from "../lib/crypto/vault";
import { Alert } from "../components/Alert";
import { EmptyState } from "../components/EmptyState";
import { CompanyLogo } from "../components/CompanyLogo";
import { flagEmoji } from "../lib/countries";

const STATUS_ORDER: ApplicationStatus[] = [
  "applied",
  "interviewing",
  "offer",
  "rejected",
  "ghosted",
  "withdrawn",
];

const STATUS_META: Record<
  ApplicationStatus,
  { label: string; icon: LucideIcon; chip: string }
> = {
  applied:      { label: "Applied",      icon: Clock,         chip: "chip-accent" },
  interviewing: { label: "Interviewing", icon: Flame,         chip: "chip-warning" },
  offer:        { label: "Offer",        icon: CheckCircle2,  chip: "chip-success" },
  rejected:     { label: "Rejected",     icon: XCircle,       chip: "chip-danger" },
  ghosted:      { label: "Ghosted",      icon: CircleSlash,   chip: "chip-muted" },
  withdrawn:    { label: "Withdrawn",    icon: CircleSlash,   chip: "chip-muted" },
};

const GHOST_THRESHOLD_DAYS = 14;

type EnrichedApp = Application & {
  meta: JobMetadata | null;
  ghostFlag: boolean; // computed at render: looks ghosted but status hasn't been changed
};

export function Applications() {
  const { session, patchProfile } = useAuth();
  const [enriched, setEnriched] = useState<EnrichedApp[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const apps = session?.profile.applications ?? [];

  useEffect(() => {
    let cancelled = false;
    if (apps.length === 0) {
      setEnriched([]);
      return;
    }
    setErr(null);
    Promise.all(
      apps.map((a) =>
        api
          .getJob(a.jobId)
          .then(
            (r): EnrichedApp => ({
              ...a,
              meta: r.payload,
              ghostFlag:
                (a.status === "applied" || a.status === "interviewing") &&
                Date.now() - a.lastTouchedAt > GHOST_THRESHOLD_DAYS * 86_400_000,
            }),
          )
          .catch(
            (): EnrichedApp => ({
              ...a,
              meta: null,
              ghostFlag: false,
            }),
          ),
      ),
    )
      .then((res) => {
        if (!cancelled) setEnriched(res);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [apps.map((a) => a.jobId + a.status + a.lastTouchedAt).join("|")]);

  const buckets = useMemo(() => {
    const m = new Map<ApplicationStatus, EnrichedApp[]>();
    for (const s of STATUS_ORDER) m.set(s, []);
    for (const a of enriched ?? []) {
      const list = m.get(a.status);
      if (list) list.push(a);
    }
    // Sort each bucket by lastTouchedAt desc.
    for (const [, list] of m) {
      list.sort((a, b) => b.lastTouchedAt - a.lastTouchedAt);
    }
    return m;
  }, [enriched]);

  const updateStatus = (jobId: string, next: ApplicationStatus) => {
    if (!session) return;
    const updated = session.profile.applications.map((a) =>
      a.jobId === jobId ? { ...a, status: next, lastTouchedAt: Date.now() } : a,
    );
    void patchProfile({ applications: updated });
  };

  const updateNotes = (jobId: string, notes: string) => {
    if (!session) return;
    const updated = session.profile.applications.map((a) =>
      a.jobId === jobId ? { ...a, notes, lastTouchedAt: Date.now() } : a,
    );
    void patchProfile({ applications: updated });
  };

  const removeApp = (jobId: string) => {
    if (!session) return;
    const updated = session.profile.applications.filter((a) => a.jobId !== jobId);
    void patchProfile({ applications: updated });
  };

  const totalActive = apps.filter((a) => a.status === "applied" || a.status === "interviewing").length;

  return (
    <div className="container">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Applications</h1>
          <p className="muted text-sm">
            Stored encrypted in your profile blob - server only sees ciphertext. Auto-flagged as ghosted after {GHOST_THRESHOLD_DAYS} days without an update.
          </p>
        </div>
        {totalActive > 0 && (
          <span className="chip chip-accent">{totalActive} in flight</span>
        )}
      </div>

      {err && <Alert variant="error">{err}</Alert>}

      {enriched && enriched.length === 0 && (
        <EmptyState
          icon={<Bookmark size={20} />}
          title="No applications yet"
          description="Click 'Apply on company site' on a job and it'll appear here automatically. You can mark interview progress, ghost status, or offers."
          action={<Link to="/feed" className="btn btn-secondary btn-sm">Browse jobs</Link>}
        />
      )}

      {enriched && enriched.length > 0 && (
        <div className="col gap-md">
          {STATUS_ORDER.map((s) => {
            const list = buckets.get(s) ?? [];
            if (list.length === 0) return null;
            const Icon = STATUS_META[s].icon;
            return (
              <section key={s}>
                <div className="row gap-sm" style={{ marginBottom: 8 }}>
                  <span className={`chip ${STATUS_META[s].chip}`}>
                    <Icon size={11} /> {STATUS_META[s].label}
                  </span>
                  <span className="muted-2 text-xs">{list.length}</span>
                </div>
                <div className="job-list">
                  {list.map((app) => (
                    <ApplicationRow
                      key={app.jobId}
                      app={app}
                      onStatusChange={(next) => updateStatus(app.jobId, next)}
                      onNotesChange={(notes) => updateNotes(app.jobId, notes)}
                      onRemove={() => removeApp(app.jobId)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ApplicationRow({
  app,
  onStatusChange,
  onNotesChange,
  onRemove,
}: {
  app: EnrichedApp;
  onStatusChange: (s: ApplicationStatus) => void;
  onNotesChange: (n: string) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState(app.notes ?? "");
  const meta = app.meta;

  return (
    <div className="job-row" style={{ display: "block", cursor: "default" }}>
      <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
        {meta ? <CompanyLogo company={meta.company} size={32} /> : (
          <span style={{ width: 32, height: 32, borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border-soft)", flexShrink: 0 }} />
        )}
        <div className="job-row-body">
          <div className="job-row-line1">
            {meta ? (
              <Link
                to={`/jobs/${encodeURIComponent(app.jobId)}`}
                className="job-title"
                style={{ color: "inherit" }}
              >
                {meta.title}
              </Link>
            ) : (
              <span className="muted">Job no longer in index</span>
            )}
            {app.ghostFlag && (
              <span className="chip chip-warning" title="No status update in 14+ days">
                Likely ghosted
              </span>
            )}
          </div>
          <div className="job-row-line2">
            {meta && <span className="job-company">{meta.company}</span>}
            {meta?.country && (
              <>
                <span className="meta-dot" />
                <span><span aria-hidden style={{ marginRight: 4 }}>{flagEmoji(meta.country)}</span>{meta.location || "-"}</span>
              </>
            )}
            <span className="meta-dot" />
            <span>{relativeTime(app.lastTouchedAt)}</span>
          </div>
        </div>
        <div className="row gap-sm" style={{ flexShrink: 0 }}>
          <select
            className="input"
            value={app.status}
            onChange={(e) => onStatusChange(e.target.value as ApplicationStatus)}
            style={{ height: 28, fontSize: 12.5, padding: "3px 8px", width: 132 }}
          >
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{STATUS_META[s].label}</option>
            ))}
          </select>
          {meta && (
            <a
              href={meta.source_url}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary btn-sm"
            >
              <ExternalLink size={12} />
            </a>
          )}
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "Hide notes" : app.notes ? "Edit notes" : "Add notes"}
          </button>
        </div>
      </div>
      {open && (
        <div style={{ marginTop: 10, paddingLeft: 44 }}>
          <textarea
            className="textarea"
            placeholder="What stage are you at? Names of interviewers, take-home links, anything you want to remember."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              if (notes !== (app.notes ?? "")) onNotesChange(notes);
            }}
            rows={4}
          />
          <div className="row-between" style={{ marginTop: 6 }}>
            <span className="muted-2 text-xs">Saves on blur · encrypted in your profile blob</span>
            <button className="btn btn-danger-ghost btn-sm" onClick={onRemove}>
              Remove from list
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function relativeTime(ms: number): string {
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return `${Math.floor(s / (86400 * 30))} mo ago`;
}
