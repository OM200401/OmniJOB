import { forwardRef, type InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string | null;
};

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  { label, hint, error, id, className = "", ...rest },
  ref,
) {
  const inputId = id ?? rest.name ?? rest.placeholder?.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="field">
      {label && (
        <label htmlFor={inputId} className="label">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={`input ${className}`}
        aria-invalid={Boolean(error) || undefined}
        {...rest}
      />
      {error ? (
        <span className="hint" style={{ color: "var(--danger)" }}>
          {error}
        </span>
      ) : hint ? (
        <span className="hint">{hint}</span>
      ) : null}
    </div>
  );
});
