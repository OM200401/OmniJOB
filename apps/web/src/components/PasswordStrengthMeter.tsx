import { scorePasswordStrength, type PasswordStrength } from "../lib/validation";

const LABELS: Record<PasswordStrength, string> = {
  0: "",
  1: "Weak",
  2: "Fair",
  3: "Good",
  4: "Excellent",
};

type Props = {
  password: string;
  // Optional precomputed score, e.g. when the parent already has one
  // from useFieldValidation -> validatePassword.
  score?: PasswordStrength;
};

// Four-segment strength bar. Each segment fills (and colors) once the
// score reaches that step. Empty input renders a neutral row so the layout
// doesn't jump as the user types the first character.
export function PasswordStrengthMeter({ password, score }: Props) {
  const s: PasswordStrength = score ?? scorePasswordStrength(password);
  return (
    <div className="pw-strength" aria-live="polite">
      <div className="pw-strength-bar" data-score={s}>
        {[1, 2, 3, 4].map((seg) => (
          <span
            key={seg}
            className="pw-strength-seg"
            data-active={s >= seg ? "true" : "false"}
            data-tier={s}
          />
        ))}
      </div>
      {password.length > 0 && (
        <span className="pw-strength-label" data-tier={s}>
          {LABELS[s]}
        </span>
      )}
    </div>
  );
}
