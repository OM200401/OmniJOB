import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Database, Lock, LogOut, RefreshCw, Sparkles, TrendingUp } from "lucide-react";
import { useAuth } from "../lib/auth";
import { api, type Health, type JobHit } from "../lib/api";
import { extractSkills, type ExtractedSkill } from "../lib/skills";
import { Button } from "../components/Button";
import { Alert } from "../components/Alert";

const LEVEL_LABEL: Record<string, string> = {
  intern: "Internship",
  junior: "Junior / new grad",
  mid: "Mid-level",
  senior: "Senior",
  staff: "Staff",
  principal: "Principal",
};
const REMOTE_LABEL: Record<string, string> = {
  any: "Any",
  remote: "Remote-only",
  hybrid: "Hybrid",
  onsite: "Onsite",
};
const AREA_LABEL: Record<string, string> = {
  engineering: "Software engineering",
  "ml-ai": "ML / AI",
  data: "Data",
  design: "Design",
  product: "Product",
  security: "Security",
  operations: "Operations / DevOps",
  "sales-marketing": "Sales / Marketing",
  other: "Other",
};

export function Settings() {
  const { session, signOut } = useAuth();
  const nav = useNavigate();
  const [health, setHealth] = useState<Health | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refreshHealth = async () => {
    setErr(null);
    try {
      setHealth(await api.health());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    void refreshHealth();
  }, []);

  if (!session) return null;
  const prefs = session.profile.preferences;

  return (
    <div className="container">
      <div className="page-header">
        <div className="page-header-left">
          <h1 className="page-title">Settings</h1>
          <p className="muted text-sm">Vault, preferences and infrastructure status.</p>
        </div>
      </div>

      <div className="col gap-md" style={{ maxWidth: 720 }}>
        <div className="card">
          <div className="section row-between">
            <div>
              <div className="row gap-sm" style={{ marginBottom: 4 }}>
                <Lock size={13} className="muted" />
                <strong>Vault</strong>
              </div>
              <p className="text-sm muted">Signed in as <strong style={{ color: "var(--fg)" }}>{session.email}</strong></p>
              <p className="text-xs muted-2" style={{ marginTop: 2 }}>
                uid <code className="kv" style={{ display: "inline", padding: "1px 6px" }}>{session.uid.slice(0, 16)}…</code>
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => { signOut(); nav("/"); }}>
              <LogOut size={13} /> Sign out
            </Button>
          </div>
          <div className="section">
            <p className="text-sm muted">
              Master key &amp; DEK live in memory only. Refreshing the page or signing out
              clears them — you'll re-derive from your password to unlock.
            </p>
          </div>
        </div>

        <div className="card">
          <div className="section row-between">
            <div className="row gap-sm">
              <Sparkles size={13} className="muted" />
              <strong>Preferences</strong>
            </div>
            <Link to="/onboarding" className="btn btn-secondary btn-sm">Edit</Link>
          </div>
          <div className="section col gap-sm">
            <Row k="Goal" v={prefs.lookingFor || <em className="muted-2">not set</em>} />
            <Row k="Level" v={prefs.level ? LEVEL_LABEL[prefs.level] : <em className="muted-2">not set</em>} />
            <Row k="Areas" v={
              prefs.areas.length > 0 ? (
                <span className="row" style={{ flexWrap: "wrap", gap: 6 }}>
                  {prefs.areas.map((a) => <span className="chip" key={a}>{AREA_LABEL[a] ?? a}</span>)}
                </span>
              ) : <em className="muted-2">not set</em>
            } />
            <Row k="Location" v={REMOTE_LABEL[prefs.remotePref]} />
            <Row k="Saved jobs" v={`${session.profile.savedJobIds.length}`} />
          </div>
        </div>

        <SkillGapCard />

        <div className="card">
          <div className="section row-between">
            <div className="row gap-sm">
              <Database size={13} className="muted" />
              <strong>Infrastructure</strong>
            </div>
            <Button variant="ghost" size="sm" onClick={refreshHealth}>
              <RefreshCw size={12} /> Refresh
            </Button>
          </div>
          <div className="section col gap-sm">
            {err && <Alert variant="error">{err}</Alert>}
            {!err && (
              <div className="col gap-sm">
                <HealthRow name="API" ok={Boolean(health?.status === "ok")} detail="Bun + Elysia, http://localhost:3000" />
                <HealthRow name="Qdrant" ok={Boolean(health?.qdrant)} detail="Vector DB · 768-dim cosine" />
                <HealthRow name="SQLite" ok={Boolean(health?.sqlite)} detail="Encrypted user blobs" />
                <HealthRow name="Ollama" ok={Boolean(health?.ollama)} detail="nomic-embed-text — local embeddings" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

type GapRow = ExtractedSkill & { count: number };

function SkillGapCard() {
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [analyzed, setAnalyzed] = useState<{
    sampled: number;
    yourSkills: ExtractedSkill[];
    gaps: GapRow[];
    confirmed: GapRow[]; // skills you have AND employers want
  } | null>(null);

  const runAnalysis = async () => {
    if (!session) return;
    if (!session.profile.skillVector || session.profile.skillVector.length === 0) {
      setErr("Complete onboarding first so we have a résumé embedding to query with.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const { hits } = await api.searchJobs(session.profile.skillVector, {
        k: 50,
        max_age_days: 45,
      });
      const yourSkills = extractSkills(session.profile.resumeText);
      const yourSkillNames = new Set(yourSkills.map((s) => s.name));

      const gapCounts = new Map<string, GapRow>();
      const confirmedCounts = new Map<string, GapRow>();

      for (const h of hits as JobHit[]) {
        const text = [h.payload.title, h.payload.description ?? ""].join("\n");
        const jobSkills = extractSkills(text);
        for (const s of jobSkills) {
          if (yourSkillNames.has(s.name)) {
            const cur = confirmedCounts.get(s.name);
            if (cur) cur.count += 1;
            else confirmedCounts.set(s.name, { ...s, count: 1 });
          } else {
            const cur = gapCounts.get(s.name);
            if (cur) cur.count += 1;
            else gapCounts.set(s.name, { ...s, count: 1 });
          }
        }
      }

      const gaps = Array.from(gapCounts.values()).sort((a, b) => b.count - a.count);
      const confirmed = Array.from(confirmedCounts.values()).sort((a, b) => b.count - a.count);
      setAnalyzed({ sampled: hits.length, yourSkills, gaps, confirmed });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="section row-between">
        <div className="row gap-sm">
          <TrendingUp size={13} className="muted" />
          <strong>Skill gap analysis</strong>
        </div>
        <Button variant="secondary" size="sm" onClick={runAnalysis} loading={busy}>
          {analyzed ? "Re-run" : "Run analysis"}
        </Button>
      </div>
      <div className="section">
        {err && <Alert variant="error">{err}</Alert>}
        {!err && !analyzed && !busy && (
          <p className="text-sm muted">
            Looks at your top 50 ranked jobs, extracts named skills, and surfaces the
            highest-frequency skills that aren't on your résumé yet. Pure heuristic — no
            data leaves your browser beyond the search call you'd make anyway.
          </p>
        )}
        {analyzed && (
          <div className="col gap-md">
            <p className="text-xs muted-2" style={{ margin: 0 }}>
              Across <strong style={{ color: "var(--fg-2)" }}>{analyzed.sampled}</strong> top-ranked
              jobs · résumé contains{" "}
              <strong style={{ color: "var(--fg-2)" }}>{analyzed.yourSkills.length}</strong> known
              skills.
            </p>

            {analyzed.gaps.length > 0 && (
              <div>
                <h5 style={{ fontSize: 11, textTransform: "uppercase", color: "var(--fg-4)", margin: "0 0 8px" }}>
                  Highest-leverage gaps
                </h5>
                <div className="col" style={{ gap: 4 }}>
                  {analyzed.gaps.slice(0, 12).map((g) => (
                    <GapBar key={g.name} skill={g} max={analyzed.gaps[0]?.count ?? 1} kind="gap" />
                  ))}
                </div>
              </div>
            )}

            {analyzed.confirmed.length > 0 && (
              <div>
                <h5 style={{ fontSize: 11, textTransform: "uppercase", color: "var(--fg-4)", margin: "0 0 8px" }}>
                  Confirmed strengths (you have, employers ask)
                </h5>
                <div className="col" style={{ gap: 4 }}>
                  {analyzed.confirmed.slice(0, 8).map((c) => (
                    <GapBar key={c.name} skill={c} max={analyzed.confirmed[0]?.count ?? 1} kind="confirmed" />
                  ))}
                </div>
              </div>
            )}

            {analyzed.gaps.length === 0 && analyzed.confirmed.length === 0 && (
              <p className="text-sm muted">
                None of the lexicon skills showed up. Either descriptions are sparse or the
                lexicon needs widening — open an issue.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function GapBar({
  skill,
  max,
  kind,
}: {
  skill: GapRow;
  max: number;
  kind: "gap" | "confirmed";
}) {
  const pct = max > 0 ? Math.round((skill.count / max) * 100) : 0;
  const color = kind === "gap" ? "var(--warning)" : "var(--success)";
  return (
    <div className="row" style={{ gap: 10, alignItems: "center", fontSize: 12.5 }}>
      <span style={{ minWidth: 132, color: "var(--fg-2)" }}>{skill.name}</span>
      <span
        style={{
          flex: 1,
          height: 4,
          background: "var(--surface-3)",
          borderRadius: 2,
          overflow: "hidden",
          position: "relative",
        }}
      >
        <span
          style={{
            position: "absolute",
            inset: 0,
            right: "auto",
            width: `${pct}%`,
            background: color,
          }}
        />
      </span>
      <span className="mono text-xs muted-2" style={{ minWidth: 52, textAlign: "right" }}>
        {skill.count} role{skill.count === 1 ? "" : "s"}
      </span>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="row-between text-sm">
      <span className="muted" style={{ minWidth: 96 }}>{k}</span>
      <span style={{ color: "var(--fg)", textAlign: "right" }}>{v}</span>
    </div>
  );
}

function HealthRow({ name, ok, detail }: { name: string; ok: boolean; detail: string }) {
  return (
    <div className="row-between text-sm">
      <div className="row gap-sm">
        <span
          aria-label={ok ? "ok" : "down"}
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: ok ? "var(--success)" : "var(--danger)",
            boxShadow: ok ? "0 0 0 3px var(--success-soft)" : "0 0 0 3px var(--danger-soft)",
          }}
        />
        <strong>{name}</strong>
        <span className="muted">{detail}</span>
      </div>
      <span className={ok ? "chip chip-success" : "chip chip-danger"}>{ok ? "ok" : "down"}</span>
    </div>
  );
}
