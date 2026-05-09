type Props = {
  company: string;
  size?: number;
};

// Deterministic hue from company name for the initial chip background.
function hueFor(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

// Renders an initial-on-tinted-chip avatar. We previously fetched
// https://logo.clearbit.com/{slug}.com which (a) is brittle - the domain guess
// is wrong for most companies and (b) emits ERR_NAME_NOT_RESOLVED to the
// console for every miss. The CSS-only initial chip is instant, deterministic,
// and accessibility-equivalent (decorative; the company name is rendered in
// adjacent text anyway).
export function CompanyLogo({ company, size = 32 }: Props) {
  const initial = (company[0] ?? "?").toUpperCase();
  const hue = hueFor(company);
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        background: `hsl(${hue} 60% 92%)`,
        color: `hsl(${hue} 50% 30%)`,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.round(size * 0.42),
        fontWeight: 600,
        flexShrink: 0,
        border: "1px solid var(--border-soft)",
      }}
    >
      {initial}
    </span>
  );
}
