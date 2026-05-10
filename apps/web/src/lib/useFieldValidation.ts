import { useEffect, useRef, useState } from "react";

type Validator<T> = (v: T) => { ok: boolean; msg?: string };

export type FieldValidation = {
  ok: boolean;
  msg?: string;
  // Whether the error message should be visible. False on first render so
  // the user doesn't see angry red text before they've typed anything.
  // Flips to true once the field has been blurred at least once OR the
  // parent form calls `markTouched` (typically on submit attempt).
  show: boolean;
  onBlur: () => void;
  // For the parent form: e.g. on submit-failure, walk every field and
  // call `markTouched()` to reveal pending errors.
  markTouched: () => void;
};

type Options = {
  // Debounce typing-time validation to avoid the message flickering on
  // every keystroke. Default 300ms. Set to 0 to validate synchronously.
  debounceMs?: number;
  // If false, `show` flips on first change instead of waiting for blur.
  // Useful for confirm-password where blur-only feedback is too late.
  touchedOnBlur?: boolean;
};

// Lightweight validation hook used across SignUp / Recover / Settings
// password forms. Keeps validation state local to the field so each form
// stays declarative.
export function useFieldValidation<T extends string>(
  value: T,
  validator: Validator<T>,
  opts: Options = {},
): FieldValidation {
  const debounceMs = opts.debounceMs ?? 300;
  const touchedOnBlur = opts.touchedOnBlur ?? true;

  const [touched, setTouched] = useState(false);
  // Stash the latest validator in a ref so the debounced timeout always
  // runs the freshest one without us having to re-create the timer when
  // the validator identity changes.
  const validatorRef = useRef(validator);
  validatorRef.current = validator;

  const [result, setResult] = useState<{ ok: boolean; msg?: string }>(() =>
    validator(value),
  );

  useEffect(() => {
    if (debounceMs <= 0) {
      setResult(validatorRef.current(value));
      return;
    }
    const t = setTimeout(() => {
      setResult(validatorRef.current(value));
    }, debounceMs);
    return () => clearTimeout(t);
  }, [value, debounceMs]);

  const onBlur = () => {
    if (touchedOnBlur) setTouched(true);
    // Force a sync re-validation on blur so the user always sees the
    // current state of the field after they tab away.
    setResult(validatorRef.current(value));
  };

  const markTouched = () => setTouched(true);

  return {
    ok: result.ok,
    msg: result.msg,
    show: touched && !result.ok && Boolean(result.msg),
    onBlur,
    markTouched,
  };
}
