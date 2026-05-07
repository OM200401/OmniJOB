import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  Lock,
  UploadCloud,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { extractPdfText } from "../lib/pdf";
import {
  type ExperienceLevel,
  type Preferences,
  type RemotePref,
  type RoleArea,
} from "../lib/crypto/vault";
import { Button } from "../components/Button";
import { Alert } from "../components/Alert";

const STEPS = ["goal", "level", "areas", "resume"] as const;
type Step = (typeof STEPS)[number];

const LEVELS: { value: ExperienceLevel; label: string; hint: string }[] = [
  { value: "intern", label: "Internship", hint: "Summer / co-op / 0 years FT" },
  { value: "junior", label: "New grad / Junior", hint: "0–2 years experience" },
  { value: "mid", label: "Mid-level", hint: "2–5 years" },
  { value: "senior", label: "Senior", hint: "5–8 years" },
  { value: "staff", label: "Staff", hint: "8+ years, scoped technical leadership" },
  { value: "principal", label: "Principal", hint: "Senior IC at scale" },
];

const AREAS: { value: RoleArea; label: string }[] = [
  { value: "engineering", label: "Software engineering" },
  { value: "ml-ai", label: "ML / AI" },
  { value: "data", label: "Data" },
  { value: "design", label: "Design" },
  { value: "product", label: "Product management" },
  { value: "security", label: "Security" },
  { value: "operations", label: "Operations / DevOps" },
  { value: "sales-marketing", label: "Sales / Marketing" },
  { value: "other", label: "Something else" },
];

const REMOTES: { value: RemotePref; label: string; hint: string }[] = [
  { value: "any", label: "Any", hint: "Show everything" },
  { value: "remote", label: "Remote-only", hint: "Fully distributed" },
  { value: "hybrid", label: "Hybrid", hint: "Some days in-office" },
  { value: "onsite", label: "Onsite", hint: "Office-first" },
];

export function Onboarding() {
  const { session, saveProfile } = useAuth();
  const nav = useNavigate();

  const initialPrefs = session?.profile.preferences;
  const [step, setStep] = useState<Step>(STEPS[0]);

  const [lookingFor, setLookingFor] = useState(initialPrefs?.lookingFor ?? "");
  const [level, setLevel] = useState<ExperienceLevel | null>(initialPrefs?.level ?? null);
  const [areas, setAreas] = useState<RoleArea[]>(initialPrefs?.areas ?? []);
  const [remotePref, setRemotePref] = useState<RemotePref>(initialPrefs?.remotePref ?? "any");
  const [resumeText, setResumeText] = useState(session?.profile.resumeText ?? "");
  const [resumeTab, setResumeTab] = useState<"paste" | "upload">("paste");
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => setErr(null), [step]);

  if (!session) return null;

  const stepIdx = STEPS.indexOf(step);
  const canNext = (() => {
    switch (step) {
      case "goal":
        return lookingFor.trim().length >= 8;
      case "level":
        return level !== null;
      case "areas":
        return areas.length > 0;
      case "resume":
        return resumeText.trim().length >= 100;
    }
  })();

  const goNext = () => {
    if (!canNext) return;
    const next = STEPS[stepIdx + 1];
    if (next) setStep(next);
  };
  const goBack = () => {
    const prev = STEPS[stepIdx - 1];
    if (prev) setStep(prev);
  };

  async function handleFile(file: File) {
    setErr(null);
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setErr("Only PDF files are supported.");
      return;
    }
    setBusy(true);
    try {
      const extracted = await extractPdfText(file);
      setResumeText(extracted);
      setFileName(file.name);
      setResumeTab("paste");
    } catch (e) {
      setErr(e instanceof Error ? `Could not parse PDF: ${e.message}` : "Could not parse PDF.");
    } finally {
      setBusy(false);
    }
  }

  async function finalize() {
    if (!session) return;
    setErr(null);
    setBusy(true);
    try {
      const trimmed = resumeText.trim();
      // Embed using résumé + stated career goal so the vector reflects both
      // what the user has done and what they're looking for.
      const queryText = [trimmed, lookingFor.trim()].filter(Boolean).join("\n\n");
      const { vector } = await api.embed(queryText);
      const prefs: Preferences = {
        ...session.profile.preferences,
        lookingFor: lookingFor.trim(),
        level,
        areas,
        remotePref,
      };
      await saveProfile({
        ...session.profile,
        resumeText: trimmed,
        skillVector: vector,
        preferences: prefs,
      });
      nav("/feed");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container-narrow" style={{ maxWidth: 640 }}>
      <Stepper step={stepIdx} total={STEPS.length} />

      <div className="card section">
        {step === "goal" && (
          <div className="col gap-md">
            <div>
              <h2>What are you looking for?</h2>
              <p className="muted text-sm">
                A sentence or two. Title, technologies, mission, anything specific -
                it's used as a soft signal in ranking.
              </p>
            </div>
            <textarea
              className="textarea"
              placeholder="e.g. Backend engineer roles using Python or Go. Interested in infra, ML platforms, dev tooling. Open to early-stage startups."
              value={lookingFor}
              onChange={(e) => setLookingFor(e.target.value)}
              autoFocus
              rows={6}
            />
          </div>
        )}

        {step === "level" && (
          <div className="col gap-md">
            <div>
              <h2>Your experience</h2>
              <p className="muted text-sm">
                We use this to filter the feed - you'll only see roles at your level
                (you can override on the feed itself).
              </p>
            </div>
            <div className="col gap-sm" role="radiogroup">
              {LEVELS.map((l) => (
                <label
                  key={l.value}
                  className={`select-card ${level === l.value ? "selected" : ""}`}
                >
                  <input
                    type="radio"
                    name="level"
                    value={l.value}
                    checked={level === l.value}
                    onChange={() => setLevel(l.value)}
                  />
                  <div className="col" style={{ gap: 2 }}>
                    <strong>{l.label}</strong>
                    <span className="text-xs muted">{l.hint}</span>
                  </div>
                  {level === l.value && (
                    <span className="select-check"><Check size={14} /></span>
                  )}
                </label>
              ))}
            </div>

            <div style={{ marginTop: 12 }}>
              <h3 style={{ fontSize: 14, marginBottom: 8 }}>Location preference</h3>
              <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
                {REMOTES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    className={`pill-toggle ${remotePref === r.value ? "selected" : ""}`}
                    onClick={() => setRemotePref(r.value)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === "areas" && (
          <div className="col gap-md">
            <div>
              <h2>Which areas?</h2>
              <p className="muted text-sm">
                Pick one or more. We'll boost relevance for these and downrank others.
              </p>
            </div>
            <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
              {AREAS.map((a) => {
                const selected = areas.includes(a.value);
                return (
                  <button
                    key={a.value}
                    type="button"
                    className={`pill-toggle ${selected ? "selected" : ""}`}
                    onClick={() =>
                      setAreas((cur) =>
                        cur.includes(a.value) ? cur.filter((x) => x !== a.value) : [...cur, a.value],
                      )
                    }
                  >
                    {selected && <Check size={12} style={{ marginRight: 4 }} />}
                    {a.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === "resume" && (
          <div className="col gap-md">
            <div>
              <span className="chip chip-accent" style={{ alignSelf: "flex-start" }}>
                <Lock size={11} /> Stays in your browser
              </span>
              <h2 style={{ marginTop: 8 }}>Your résumé</h2>
              <p className="muted text-sm">
                Paste in or drop a PDF. Text is embedded locally and the plaintext is
                AES-GCM-encrypted before being saved.
              </p>
            </div>

            <div className="row" style={{ marginBottom: 4 }}>
              <div className="tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={resumeTab === "paste"}
                  className={`tab ${resumeTab === "paste" ? "active" : ""}`}
                  onClick={() => setResumeTab("paste")}
                >
                  <FileText size={13} style={{ verticalAlign: -2, marginRight: 4 }} /> Paste
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={resumeTab === "upload"}
                  className={`tab ${resumeTab === "upload" ? "active" : ""}`}
                  onClick={() => setResumeTab("upload")}
                >
                  <UploadCloud size={13} style={{ verticalAlign: -2, marginRight: 4 }} /> Upload PDF
                </button>
              </div>
              {fileName && <span className="muted text-xs" style={{ marginLeft: 12 }}>from {fileName}</span>}
            </div>

            {resumeTab === "paste" ? (
              <textarea
                className="textarea"
                placeholder="Paste your résumé text here. Skills, experience, projects - the more, the better."
                value={resumeText}
                onChange={(e) => setResumeText(e.target.value)}
                rows={12}
              />
            ) : (
              <div
                className={`dropzone ${dragging ? "dragging" : ""}`}
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const f = e.dataTransfer.files[0];
                  if (f) void handleFile(f);
                }}
              >
                <span className="icon"><UploadCloud size={20} /></span>
                <strong>Drop your résumé PDF here</strong>
                <span className="muted text-sm">
                  or click to choose. Parsed by pdf.js - bytes never leave the browser.
                </span>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleFile(f);
                  }}
                />
              </div>
            )}
            <span className="muted text-xs">{resumeText.length.toLocaleString()} characters</span>
          </div>
        )}

        {err && <div style={{ marginTop: 14 }}><Alert variant="error">{err}</Alert></div>}

        <div className="row-between" style={{ marginTop: 22 }}>
          <Button
            variant="ghost"
            onClick={goBack}
            disabled={stepIdx === 0 || busy}
          >
            <ArrowLeft size={14} /> Back
          </Button>

          {step !== "resume" ? (
            <Button variant="accent" onClick={goNext} disabled={!canNext}>
              Continue <ArrowRight size={14} />
            </Button>
          ) : (
            <Button
              variant="accent"
              onClick={finalize}
              loading={busy}
              disabled={!canNext}
            >
              {busy ? "Embedding…" : <>Find matches <ArrowRight size={14} /></>}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stepper({ step, total }: { step: number; total: number }) {
  return (
    <div className="row" style={{ marginBottom: 20, gap: 6 }}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className="stepper-dot"
          data-state={i < step ? "done" : i === step ? "current" : "todo"}
        />
      ))}
    </div>
  );
}
