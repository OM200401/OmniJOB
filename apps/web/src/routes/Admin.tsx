import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
            {stats.history && stats.history.buckets.length > 1 && (
              <HistoryCard history={stats.history} />
            )}
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

// HistoryCard wraps the chart with range chips + clickable legend toggles.
// All state is local: changing range slices client-side from the server's
// 90-day payload, and toggling legend entries hides them from the SVG
// without re-fetching.
type RangeDays = 7 | 30 | 90;

const COUNTRY_COLORS: Record<string, string> = {
  CA: "#dc2626", // red
  US: "#2563eb", // blue
  GB: "#7c3aed", // purple
  IN: "#ea580c", // orange
  FR: "#0891b2", // cyan
  DE: "#65a30d", // green
};

const COUNTRY_FLAGS: Record<string, string> = {
  CA: "🇨🇦", US: "🇺🇸", GB: "🇬🇧", IN: "🇮🇳", FR: "🇫🇷", DE: "🇩🇪",
};

function HistoryCard({
  history,
}: {
  history: NonNullable<AdminStats["history"]>;
}) {
  // Build the canonical series list once - order controls legend order
  // and z-order in the chart (total drawn last/on top).
  const allSeries = useMemo<Series[]>(() => {
    const out: Series[] = [];
    for (const [code, values] of Object.entries(history.by_country)) {
      out.push({
        key: code,
        label: `${code} ${COUNTRY_FLAGS[code] ?? ""}`.trim(),
        color: COUNTRY_COLORS[code] ?? "#888",
        values,
      });
    }
    out.push({
      key: "total",
      label: "Total",
      color: "var(--accent, #3b82f6)",
      values: history.total,
    });
    return out;
  }, [history]);

  const [range, setRange] = useState<RangeDays>(30);
  // Default visibility: total + CA (the headline metrics). Click to add/remove.
  const [visible, setVisible] = useState<Set<string>>(() => new Set(["total", "CA"]));

  const maxRange = Math.min(history.buckets.length, 90) as RangeDays;
  const effectiveRange = Math.min(range, maxRange) as RangeDays;

  // Slice every series + buckets to the selected window.
  const sliceStart = Math.max(0, history.buckets.length - effectiveRange);
  const buckets = history.buckets.slice(sliceStart);
  const series = useMemo(
    () =>
      allSeries.map((s) => ({ ...s, values: s.values.slice(sliceStart) })),
    [allSeries, sliceStart],
  );

  const toggle = (key: string) => {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size > 1) next.delete(key); // keep at least one line visible
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <div className="card" style={{ padding: 14, marginTop: 14 }}>
      <div className="row" style={{ alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <div className="text-sm" style={{ fontWeight: 600 }}>
          Jobs over time · last {effectiveRange}d
        </div>
        <div className="row" style={{ gap: 4 }}>
          {([7, 30, 90] as RangeDays[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setRange(d)}
              disabled={d > maxRange}
              className="text-xs"
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid var(--border, #ccc)",
                background: range === d ? "var(--accent, #3b82f6)" : "transparent",
                color: range === d ? "white" : d > maxRange ? "var(--muted-2)" : "inherit",
                cursor: d > maxRange ? "not-allowed" : "pointer",
                fontWeight: range === d ? 600 : 400,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <HistoryChart buckets={buckets} series={series} visible={visible} />

      <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: 10 }}>
        {series.map((s) => {
          const isOn = visible.has(s.key);
          const end = s.values[s.values.length - 1] ?? 0;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggle(s.key)}
              className="text-xs"
              style={{
                padding: "4px 9px",
                borderRadius: 999,
                border: `1px solid ${isOn ? s.color : "var(--border, #ddd)"}`,
                background: isOn ? `${hexToRgba(s.color, 0.08)}` : "transparent",
                color: isOn ? s.color : "var(--muted-2)",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontWeight: isOn ? 600 : 400,
              }}
              title={isOn ? "Hide series" : "Show series"}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: isOn ? s.color : "transparent",
                  border: isOn ? "none" : `1.5px solid var(--muted-2)`,
                }}
              />
              {s.label}
              <span style={{ opacity: isOn ? 1 : 0.5, fontVariantNumeric: "tabular-nums" }}>
                {end.toLocaleString()}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

type Series = {
  key: string;
  label: string;
  color: string;
  values: number[];
};

// HistoryChart renders the visible series with independently-scaled y axes
// (so a 4000-job total and a 100-job FR line both read clearly), a hover
// crosshair, and a floating tooltip showing the exact values at the
// hovered date. Independent scaling preserves trend comparability across
// series of different magnitudes - readers compare slopes, not absolute
// y positions, and the right-edge labels show absolute end values.
function HistoryChart({
  buckets,
  series,
  visible,
}: {
  buckets: string[];
  series: Series[];
  visible: Set<string>;
}) {
  const w = 720;
  const h = 180;
  const padL = 8;
  const padR = 16;
  const padT = 12;
  const padB = 24;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const n = buckets.length;

  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Compute per-series scale (independent y axes). Each line is normalized
  // to the chart height by its own max, so even small-magnitude series
  // (Germany, France) trace a visible curve rather than flattening into
  // the baseline next to a 20k total.
  const scaled = useMemo(() => {
    return series
      .filter((s) => visible.has(s.key))
      .map((s) => {
        const max = Math.max(1, ...s.values);
        return {
          ...s,
          max,
          points: s.values.map((v, i) => ({
            x: padL + (n === 1 ? 0 : (i * innerW) / (n - 1)),
            y: padT + innerH - (v / max) * innerH,
          })),
        };
      });
  }, [series, visible, n, innerW, innerH]);

  const ticks = pickTicks(buckets);

  // Convert mouse position to nearest data index. Math fires on every
  // mousemove; cheap because we only do one O(1) calc per event.
  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * w;
    const xClamped = Math.max(padL, Math.min(padL + innerW, px));
    const ratio = n === 1 ? 0 : (xClamped - padL) / innerW;
    const idx = Math.round(ratio * (n - 1));
    if (idx >= 0 && idx < n) setHover(idx);
  };

  const handleLeave = () => setHover(null);

  // Tooltip placement: pin to whichever side gives it room. The tooltip
  // sits in HTML overlay positioned with absolute coords so text doesn't
  // need to fit the SVG viewBox.
  const tooltipX =
    hover === null
      ? 0
      : ((padL + (n === 1 ? 0 : (hover * innerW) / (n - 1))) / w) * 100;

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        style={{ width: "100%", height: "auto", maxHeight: 220, display: "block", cursor: "crosshair" }}
        role="img"
        aria-label="Cumulative jobs over time"
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
      >
        {/* baseline */}
        <line
          x1={padL}
          y1={padT + innerH}
          x2={padL + innerW}
          y2={padT + innerH}
          stroke="currentColor"
          strokeOpacity={0.15}
        />

        {/* x-axis ticks */}
        {ticks.map(({ i, label }) => {
          const x = padL + (n === 1 ? 0 : (i * innerW) / (n - 1));
          return (
            <g key={i}>
              <line
                x1={x}
                y1={padT + innerH}
                x2={x}
                y2={padT + innerH + 4}
                stroke="currentColor"
                strokeOpacity={0.3}
              />
              <text
                x={x}
                y={padT + innerH + 16}
                fontSize="10"
                textAnchor="middle"
                fill="currentColor"
                fillOpacity={0.55}
              >
                {label}
              </text>
            </g>
          );
        })}

        {/* hover crosshair */}
        {hover !== null && (
          <line
            x1={padL + (n === 1 ? 0 : (hover * innerW) / (n - 1))}
            y1={padT}
            x2={padL + (n === 1 ? 0 : (hover * innerW) / (n - 1))}
            y2={padT + innerH}
            stroke="currentColor"
            strokeOpacity={0.35}
            strokeDasharray="3 3"
          />
        )}

        {/* lines */}
        {scaled.map((s) => (
          <path
            key={s.key}
            d={s.points
              .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
              .join(" ")}
            fill="none"
            stroke={s.color}
            strokeWidth={s.key === "total" ? 2.2 : 1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* hover dots */}
        {hover !== null &&
          scaled.map((s) => {
            const p = s.points[hover];
            if (!p) return null;
            return (
              <circle
                key={s.key}
                cx={p.x}
                cy={p.y}
                r={3.5}
                fill={s.color}
                stroke="var(--bg, white)"
                strokeWidth={1.5}
              />
            );
          })}
      </svg>

      {hover !== null && (
        <div
          style={{
            position: "absolute",
            top: 8,
            left: `${tooltipX}%`,
            transform:
              tooltipX > 70 ? "translateX(-100%) translateX(-12px)" : "translateX(12px)",
            background: "var(--bg, white)",
            border: "1px solid var(--border, #ddd)",
            borderRadius: 6,
            padding: "8px 10px",
            fontSize: 12,
            boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            pointerEvents: "none",
            minWidth: 140,
            zIndex: 2,
          }}
        >
          <div style={{ marginBottom: 6, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
            {buckets[hover]}
          </div>
          {scaled
            .slice()
            .sort((a, b) => (b.values[hover] ?? 0) - (a.values[hover] ?? 0))
            .map((s) => (
              <div
                key={s.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "1px 0",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: s.color,
                      display: "inline-block",
                    }}
                  />
                  {s.label}
                </span>
                <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                  {(s.values[hover] ?? 0).toLocaleString()}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function pickTicks(buckets: string[]): Array<{ i: number; label: string }> {
  const n = buckets.length;
  if (n === 0) return [];
  const target = 5;
  const step = Math.max(1, Math.floor((n - 1) / (target - 1)));
  const out: Array<{ i: number; label: string }> = [];
  for (let i = 0; i < n; i += step) {
    out.push({ i, label: monthDay(buckets[i]!) });
  }
  if (out[out.length - 1]?.i !== n - 1) {
    out.push({ i: n - 1, label: monthDay(buckets[n - 1]!) });
  }
  return out;
}

function monthDay(iso: string): string {
  return iso.slice(5);
}

// hexToRgba converts a #rrggbb (or var(--...)) hint to a rgba() string at
// the given alpha for use as a subtle background tint behind a legend
// chip. var() hints fall back to a neutral gray since we can't introspect
// computed CSS at render time.
function hexToRgba(c: string, a: number): string {
  if (c.startsWith("#") && c.length === 7) {
    const r = parseInt(c.slice(1, 3), 16);
    const g = parseInt(c.slice(3, 5), 16);
    const b = parseInt(c.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  return `rgba(120, 120, 120, ${a})`;
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
