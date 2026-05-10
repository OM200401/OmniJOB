import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, KeyRound, ShieldAlert } from "lucide-react";
import { api, ApiError } from "../lib/api";
import * as vault from "../lib/crypto/vault";
import {
  b64decode,
  b64encode,
  parseRecoveryKey,
  uidFromEmail,
} from "../lib/crypto/util";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Alert } from "../components/Alert";
import { PasswordStrengthMeter } from "../components/PasswordStrengthMeter";
import {
  validateEmail,
  validateMatch,
  validatePassword,
  validateRecoveryKey,
} from "../lib/validation";
import { useFieldValidation } from "../lib/useFieldValidation";

export function Recover() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [recoveryKeyInput, setRecoveryKeyInput] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNew, setConfirmNew] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const emailFv = useFieldValidation(email, validateEmail);
  const recoveryFv = useFieldValidation(recoveryKeyInput, validateRecoveryKey);
  const passwordFv = useFieldValidation(newPassword, validatePassword);
  const confirmFv = useFieldValidation(confirmNew, (v) => validateMatch(newPassword, v));

  const formValid = emailFv.ok && recoveryFv.ok && passwordFv.ok && confirmFv.ok;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!formValid) {
      emailFv.markTouched();
      recoveryFv.markTouched();
      passwordFv.markTouched();
      confirmFv.markTouched();
      return;
    }

    let recoveryBytes: Uint8Array;
    try {
      recoveryBytes = parseRecoveryKey(recoveryKeyInput);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Recovery key looks malformed.");
      return;
    }

    setBusy(true);
    try {
      const uid = await uidFromEmail(email);

      // 1. Pull the recovery-encrypted DEK + the user's salt.
      let recoveryRes: Awaited<ReturnType<typeof api.getRecovery>>;
      try {
        recoveryRes = await api.getRecovery(uid);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          throw new Error("No account found for that email.");
        }
        throw e;
      }

      // 2. Decrypt the DEK with the recovery key. Wrong key → AES-GCM throws.
      let dek: Uint8Array;
      try {
        dek = await vault.unlockWithRecovery(
          recoveryBytes,
          b64decode(recoveryRes.encrypted_dek_recovery),
        );
      } catch {
        throw new Error("That recovery key is incorrect.");
      }

      // 3. Re-encrypt the DEK with the new password (fresh salt).
      const rewrap = await vault.rewrapDek(newPassword, dek);

      // 4. Tell the server: replace salt + encrypted_dek for this uid.
      await api.resetPassword(
        uid,
        b64encode(rewrap.salt),
        b64encode(rewrap.encryptedDek),
      );

      setDone(true);
      // Bounce to sign-in after a beat. The user has to re-enter password
      // there because the master key/DEK aren't kept around (we don't sign
      // them in here, since this surface is intentionally minimal).
      setTimeout(() => nav("/signin"), 1800);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="container-narrow">
        <div className="card section">
          <div className="col gap-md">
            <span className="chip chip-success" style={{ alignSelf: "flex-start" }}>Password reset</span>
            <h2>You're set</h2>
            <p className="muted text-sm">
              Sending you to sign in. Your résumé and saved jobs are still there -
              the recovery key only re-wrapped the data-encryption key.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container-narrow" style={{ maxWidth: 560 }}>
      <div className="card section">
        <div className="col gap-md" style={{ marginBottom: 18 }}>
          <span className="chip chip-accent" style={{ alignSelf: "flex-start" }}>
            <KeyRound size={11} /> Recover with key
          </span>
          <h2>Reset your password</h2>
          <p className="muted text-sm">
            Enter the recovery key you saved at signup. We'll decrypt your DEK
            locally and re-wrap it with a new password - no data is lost.
          </p>
        </div>

        <Alert variant="info">
          <span>
            Don't have the recovery key? It can't be regenerated. The fastest
            path is to <Link to="/signup" className="link">create a new account</Link>.
          </span>
        </Alert>

        <form onSubmit={onSubmit} style={{ marginTop: 14 }} noValidate>
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={emailFv.onBlur}
            disabled={busy}
            placeholder="you@example.com"
            error={emailFv.show ? emailFv.msg : null}
          />

          <div className="field">
            <label className="label" htmlFor="recoverykey">Recovery key</label>
            <textarea
              id="recoverykey"
              className="textarea mono"
              style={{ minHeight: 90, fontSize: 12.5, letterSpacing: 0.5 }}
              placeholder="paste your 32-character-group recovery key - formatting doesn't matter"
              value={recoveryKeyInput}
              onChange={(e) => setRecoveryKeyInput(e.target.value)}
              onBlur={recoveryFv.onBlur}
              disabled={busy}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={recoveryFv.show || undefined}
            />
            {recoveryFv.show ? (
              <span className="field-error">{recoveryFv.msg}</span>
            ) : (
              <span className="hint">Hyphens, spaces and case are ignored.</span>
            )}
          </div>

          <Input
            label="New password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            onBlur={passwordFv.onBlur}
            disabled={busy}
            hint="8+ characters."
            error={passwordFv.show ? passwordFv.msg : null}
          />
          <PasswordStrengthMeter password={newPassword} />
          <Input
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            value={confirmNew}
            onChange={(e) => setConfirmNew(e.target.value)}
            onBlur={confirmFv.onBlur}
            disabled={busy}
            error={confirmFv.show ? confirmFv.msg : null}
          />

          {err && (
            <div style={{ marginTop: 14 }}>
              <Alert variant="error">
                <span style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                  <ShieldAlert size={14} style={{ marginTop: 1, flexShrink: 0 }} />
                  {err}
                </span>
              </Alert>
            </div>
          )}

          <div style={{ marginTop: 18 }}>
            <Button
              type="submit"
              variant="accent"
              size="lg"
              block
              loading={busy}
              disabled={!formValid || busy}
            >
              {busy ? "Re-wrapping key…" : (
                <>Reset password <ArrowRight size={15} /></>
              )}
            </Button>
          </div>
        </form>

        <div className="divider" />
        <p className="text-sm muted">
          Remember your password? <Link className="link" to="/signin">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
