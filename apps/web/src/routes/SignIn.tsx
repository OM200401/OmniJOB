import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useAuth } from "../lib/auth";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Alert } from "../components/Alert";

export function SignIn() {
  const { signIn } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      nav("/feed");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container-narrow">
      <div className="card section">
        <div className="col gap-md" style={{ marginBottom: 18 }}>
          <h2>Welcome back</h2>
          <p className="muted text-sm">
            Your master key is re-derived locally. A wrong password fails the AES-GCM check.
          </p>
        </div>

        <form onSubmit={onSubmit}>
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
            placeholder="you@example.com"
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />

          {err && <div style={{ marginTop: 14 }}><Alert variant="error">{err}</Alert></div>}

          <div style={{ marginTop: 18 }}>
            <Button type="submit" variant="accent" size="lg" block loading={busy} disabled={!email || !password}>
              {busy ? "Unlocking…" : (
                <>Unlock vault <ArrowRight size={16} /></>
              )}
            </Button>
          </div>
        </form>

        <div className="divider" />
        <div className="row-between text-sm">
          <span className="muted">
            New here? <Link className="link" to="/signup">Create a vault</Link>
          </span>
          <Link className="link" to="/recover">Forgot password?</Link>
        </div>
      </div>
    </div>
  );
}
