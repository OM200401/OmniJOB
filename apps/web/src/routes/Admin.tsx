import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, AlertCircle, ExternalLink, KeyRound, RefreshCw, Users } from "lucide-react";
import { api, ApiError, type AdminStats } from "../lib/api";
import { Alert } from "../components/Alert";
import { Button } from "../components/Button";
import { Input } from "../components/Input";

const TOKEN_KEY = "omnijob:admin-token";
const POLL_MS = 15_000;

export function Admin() {
  const [token, setToken] = useState<string>(() => {
    try {
      return localStorage.getItem(TOKEN_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [draftToken, setDraftToken] = useState<string>("");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearToken = useCallback(() => {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
    setToken("");
    setStats(null);
  }, []);

  const fetchStats = useCallback(
    async (t: string) => {
      setBusy(true);
      setErr(null);
      try {
        const s = await api.adminStats(t);
        setStats(s);
        setLastFetchedAt(Date.now());
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          // Stored token is stale or wrong: wipe it and surface the form.
          clearToken();
          setErr("Token rejected. Enter the current ADMIN_TOKEN from the droplet.");
          return;
        }
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [clearToken],
  );

  // Initial + interval poll while token is set.
  useEffect(() => {
    if (!token) return;
    void fetchStats(token);
    pollRef.current = setInterval(() => void fetchStats(token), POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [token, fetchStats]);

  const submitToken = () => {
    const t = draftToken.trim();
    if (!t) return;
    try {
      localStorage.setItem(TOKEN_KEY, t);
    } catch {
      /* private mode - in-memory only */
    }
    setToken(t);
    setDraftToken("");
  };

  if (!token) {
    return (
      <div className="container-narrow">
        <div className="card section">
          <div className="col gap-md" style={{ marginBottom: 18 }}>
            <div className="row gap-sm" style={{ alignItems: "center", gap: 8 }}>
              <KeyRound size={18} />
              <h2 style={{ margin: 0 }}>Operator dashboard</h2>
            </div>
            <p className="muted text-sm">
              Token-gated. Paste the ADMIN_TOKEN from the droplet's systemd drop-in
              <code style={{ marginLeft: 4 }}>/etc/systemd/system/omnijob-api.service.d/admin.conf</code>.
              Token is stored in this browser's localStorage only.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitToken();
            }}
          >
            <Input
              label="ADMIN_TOKEN"
              type="password"
              value={draftToken}
              onChange={(e) => setDraftToken(e.target.value)}
              placeholder="hex string"
              autoFocus
            />
            {err && <div style={{ marginTop: 14 }}><Alert variant="error">{err}</Alert></div>}
            <div style={{ marginTop: 18 }}>
              <Button type="submit" variant="accent" size="lg" block disabled={!draftToken.trim()}>
                Unlock dashboard
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="row" style={{ alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div className="row gap-sm" style={{ alignItems: "center", gap: 8 }}>
          <Activity size={18} />
          <h2 style={{ margin: 0 }}>Operator dashboard</h2>
        </div>
        <div className="row gap-sm" style={{ gap: 8, alignItems: "center" }}>
          {lastFetchedAt && (
            <span className="muted-2 text-xs">
              Updated {timeAgo(lastFetchedAt)} · auto-refresh 15s
            </span>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void fetchStats(token)}
            disabled={busy}
            title="Refresh now"
          >
            <RefreshCw size={13} className={busy ? "spinner-icon" : ""} /> Refresh
          </Button>
          <Button variant="ghost" size="sm" onClick={clearToken} title="Forget token + sign out of dashboard">
            Sign out
          </Button>
        </div>
      </div>

      {err && <Alert variant="error">{err}</Alert>}

      {!stats && !err && <p className="muted">Loading…</p>}

      {stats && (
        <>
          {/* Users summary */}
          <section style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
              <Users size={15} /> Users
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
              <StatTile label="Total registered" value={stats.users.total} />
              <StatTile label="Active · last 24h" value={stats.users.active_24h} highlight />
              <StatTile label="Active · last 7d" value={stats.users.active_7d} />
              <StatTile label="Active · last 30d" value={stats.users.active_30d} />
            </div>
          </section>

          {/* Index size */}
          <section style={{ marginBottom: 24 }}>
            <div className="row" style={{ alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>Index</h3>
              <Link
                to="/feed?country=CA"
                className="btn btn-secondary btn-sm"
                style={{ textDecoration: "none" }}
              >
                <ExternalLink size={13} /> View Canadian jobs
              </Link>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
              <StatTile label="Jobs in Qdrant" value={stats.index.jobs.toLocaleString()} highlight />
              {stats.index.by_country.CA !== undefined && (
                <StatTile
                  label="Canadian jobs 🇨🇦"
                  value={stats.index.by_country.CA.toLocaleString()}
                  highlight
                />
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8, marginTop: 12 }}>
              {Object.entries(stats.index.by_country)
                .filter(([code]) => code !== "CA")
                .sort((a, b) => b[1] - a[1])
                .map(([code, count]) => (
                  <Mini key={code} label={code} value={count.toLocaleString()} />
                ))}
            </div>
          </section>

          {/* Events */}
          {Object.keys(stats.events_last_7d).length > 0 && (
            <section style={{ marginBottom: 24 }}>
              <h3 style={{ marginBottom: 10 }}>Events · last 7d</h3>
              <div className="card" style={{ padding: 14 }}>
                <table style={{ width: "100%", fontSize: 13 }}>
                  <tbody>
                    {Object.entries(stats.events_last_7d)
                      .sort((a, b) => b[1] - a[1])
                      .map(([event, count]) => (
                        <tr key={event}>
                          <td style={{ padding: "4px 0" }}>
                            <code style={{ fontSize: 12 }}>{event}</code>
                          </td>
                          <td style={{ padding: "4px 0", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                            {count}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Crawler */}
          <section style={{ marginBottom: 24 }}>
            <h3 style={{ marginBottom: 10 }}>Crawler</h3>
            {stats.crawler?.current_run ? (
              <div className="card" style={{ padding: 14 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 12 }}>
                  <Mini label="Started" value={formatDateTime(stats.crawler.current_run.started_at)} />
                  <Mini label="Elapsed" value={`${stats.crawler.current_run.elapsed_minutes}m`} />
                  <Mini label="Concurrency" value={String(stats.crawler.current_run.concurrency ?? "—")} />
                  <Mini label="Ingested" value={stats.crawler.current_run.ok.toLocaleString()} highlight />
                  <Mini label="Adapter pages" value={stats.crawler.current_run.skipped_or_done.toLocaleString()} />
                  <Mini label="Embed failures" value={stats.crawler.current_run.embed_failures.toString()} alert={stats.crawler.current_run.embed_failures > 0} />
                </div>
                <div style={{ fontSize: 12 }} className="muted">
                  Sources ({stats.crawler.current_run.sources.length}):{" "}
                  {stats.crawler.current_run.sources.join(", ")}
                </div>
                <div style={{ marginTop: 10, fontSize: 12, fontFamily: "var(--font-mono, monospace)" }} className="muted-2">
                  {stats.crawler.current_run.latest_log_line}
                </div>
              </div>
            ) : (
              <div className="card muted text-sm" style={{ padding: 14 }}>
                No active crawler run.
              </div>
            )}
            {stats.crawler?.previous_run_summary && (
              <div style={{ marginTop: 10, fontSize: 12, fontFamily: "var(--font-mono, monospace)" }} className="muted-2">
                Previous run: {stats.crawler.previous_run_summary}
              </div>
            )}
          </section>

          <p className="muted-2 text-xs">
            Generated {formatDateTime(stats.generated_at)} server-side.
          </p>
        </>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
}) {
  return (
    <div
      className="card"
      style={{
        padding: 14,
        borderColor: highlight ? "var(--accent)" : undefined,
      }}
    >
      <div style={{ fontSize: 12, marginBottom: 4 }} className="muted">
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}

function Mini({
  label,
  value,
  highlight,
  alert,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  alert?: boolean;
}) {
  return (
    <div>
      <div style={{ fontSize: 11, marginBottom: 2, color: alert ? "var(--danger)" : undefined }} className={alert ? "" : "muted"}>
        {label} {alert && <AlertCircle size={10} style={{ display: "inline" }} />}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: highlight ? 600 : 500,
          fontVariantNumeric: "tabular-nums",
          color: alert ? "var(--danger)" : highlight ? "var(--accent)" : undefined,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function timeAgo(ms: number): string {
  const s = (Date.now() - ms) / 1000;
  if (s < 5) return "just now";
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
