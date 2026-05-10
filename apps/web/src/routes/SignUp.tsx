import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Check,
  Copy,
  Download,
  Lock,
  ShieldAlert,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Alert } from "../components/Alert";
import { PasswordStrengthMeter } from "../components/PasswordStrengthMeter";
import {
  validateEmail,
  validateMatch,
  validatePassword,
} from "../lib/validation";
import { useFieldValidation } from "../lib/useFieldValidation";

type Phase = "form" | "recovery";

export function SignUp() {
  const { signUp } = useAuth();
  const nav = useNavigate();
  const [phase, setPhase] = useState<Phase>("form");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [confirmedSaved, setConfirmedSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const emailFv = useFieldValidation(email, validateEmail);
  const passwordFv = useFieldValidation(password, validatePassword);
  const confirmFv = useFieldValidation(confirm, (v) => validateMatch(password, v));

  const formValid = emailFv.ok && passwordFv.ok && confirmFv.ok;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    // Reveal any pending field errors that hadn't been touched yet.
    if (!formValid) {
      emailFv.markTouched();
      passwordFv.markTouched();
      confirmFv.markTouched();
      return;
    }
    setBusy(true);
    try {
      const { recoveryKey } = await signUp(email, password);
      setRecoveryKey(recoveryKey);
      setPhase("recovery");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copyKey = async () => {
    if (!recoveryKey) return;
    try {
      await navigator.clipboard.writeText(recoveryKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked - user can still select manually */
    }
  };

  const downloadKey = () => {
    if (!recoveryKey) return;
    const content =
      `OmniJob recovery key for ${email}\n` +
      `Generated ${new Date().toISOString()}\n\n` +
      `${recoveryKey}\n\n` +
      `Treat this like a password - anyone with both your email and this key\n` +
      `can reset your password and decrypt your résumé. The server does not\n` +
      `have a copy. If you lose both your password and this key, your data\n` +
      `is permanently inaccessible.`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `omnijob-recovery-${email.split("@")[0] ?? "key"}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const onContinue = () => {
    if (!confirmedSaved) return;
    nav("/onboarding");
  };

  if (phase === "form") {
    return (
      <div className="container-narrow">
        <div className="card section">
          <div className="col gap-md" style={{ marginBottom: 18 }}>
            <span className="chip chip-accent" style={{ alignSelf: "flex-start" }}>
              <Lock size={11} /> End-to-end encrypted
            </span>
            <h2>Create your vault</h2>
            <p className="muted text-sm">
              Your password derives a 256-bit master key in this browser via Argon2id.
              We never see the password - wrong password just means decryption fails.
            </p>
          </div>

          <form onSubmit={onSubmit} noValidate>
            <Input
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={emailFv.onBlur}
              disabled={busy}
              placeholder="you@example.com"
              hint="We never store your email - only SHA-256(email) as your account id."
              error={emailFv.show ? emailFv.msg : null}
            />
            <Input
              label="Password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={passwordFv.onBlur}
              disabled={busy}
              hint="8+ characters. Argon2id derivation takes ~1–2 seconds locally."
              error={passwordFv.show ? passwordFv.msg : null}
            />
            <PasswordStrengthMeter password={password} />
            <Input
              label="Confirm password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onBlur={confirmFv.onBlur}
              disabled={busy}
              error={confirmFv.show ? confirmFv.msg : null}
            />

            {err && <div style={{ marginTop: 14 }}><Alert variant="error">{err}</Alert></div>}

            <div style={{ marginTop: 18 }}>
              <Button
                type="submit"
                variant="accent"
                size="lg"
                block
                loading={busy}
                disabled={!formValid || busy}
              >
                {busy ? "Deriving key…" : (
                  <>Continue <ArrowRight size={16} /></>
                )}
              </Button>
            </div>
          </form>

          <div className="divider" />
          <p className="text-sm muted">
            Already have an account? <Link className="link" to="/signin">Sign in</Link>
          </p>
        </div>
      </div>
    );
  }

  // Recovery-key reveal phase
  return (
    <div className="container-narrow" style={{ maxWidth: 580 }}>
      <div className="card section">
        <div className="col gap-md" style={{ marginBottom: 18 }}>
          <span className="chip chip-warning" style={{ alignSelf: "flex-start" }}>
            <ShieldAlert size={11} /> Save this - shown once
          </span>
          <h2>Your recovery key</h2>
          <p className="muted text-sm">
            If you ever forget your password, this key is the only way to regain access.
            We can't show it again. Copy it to a password manager or save the file.
          </p>
        </div>

        <div className="recovery-key">{recoveryKey}</div>

        <div className="row gap-sm" style={{ marginTop: 12 }}>
          <Button variant="secondary" size="sm" onClick={copyKey}>
            {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
          </Button>
          <Button variant="secondary" size="sm" onClick={downloadKey}>
            <Download size={13} /> Download as .txt
          </Button>
        </div>

        <div style={{ marginTop: 18 }}>
          <Alert variant="info">
            <span>
              The server stores your DEK encrypted twice - once with your password,
              once with this recovery key. Neither key ever leaves this browser. If
              you lose both, your data is permanently unrecoverable.
            </span>
          </Alert>
        </div>

        <label className="row gap-sm" style={{ marginTop: 18, cursor: "pointer", userSelect: "none" }}>
          <input
            type="checkbox"
            checked={confirmedSaved}
            onChange={(e) => setConfirmedSaved(e.target.checked)}
            style={{ accentColor: "var(--accent)" }}
          />
          <span className="text-sm">I've saved my recovery key somewhere safe.</span>
        </label>

        <div style={{ marginTop: 18 }}>
          <Button
            variant="accent"
            size="lg"
            block
            onClick={onContinue}
            disabled={!confirmedSaved}
          >
            Continue to onboarding <ArrowRight size={15} />
          </Button>
        </div>
      </div>
    </div>
  );
}
