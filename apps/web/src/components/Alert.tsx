import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";

type Variant = "error" | "info" | "success";

type Props = {
  variant?: Variant;
  children: ReactNode;
};

export function Alert({ variant = "info", children }: Props) {
  const Icon = variant === "error" ? AlertCircle : variant === "success" ? CheckCircle2 : Info;
  return (
    <div className={`alert alert-${variant}`}>
      <Icon size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{children}</span>
    </div>
  );
}
