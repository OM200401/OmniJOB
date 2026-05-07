import { useState } from "react";

type Props = {
  company: string;
  size?: number;
};

// Deterministic hue from company name for the fallback initial circle.
function hueFor(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}

// Best-effort domain inference. Many companies use {slug}.com - for everything
// else the Clearbit logo URL 404s and we fall back to the initial chip.
function domainGuess(company: string): string {
  const slug = company.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `${slug}.com`;
}

export function CompanyLogo({ company, size = 32 }: Props) {
  const [errored, setErrored] = useState(false);
  const initial = (company[0] ?? "?").toUpperCase();
  const hue = hueFor(company);
  const url = `https://logo.clearbit.com/${domainGuess(company)}?size=${size * 2}`;

  if (errored) {
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

  return (
    <img
      src={url}
      alt=""
      width={size}
      height={size}
      style={{
        borderRadius: 8,
        background: "var(--surface)",
        border: "1px solid var(--border-soft)",
        objectFit: "contain",
        flexShrink: 0,
        padding: 2,
      }}
      onError={() => setErrored(true)}
      loading="lazy"
    />
  );
}
