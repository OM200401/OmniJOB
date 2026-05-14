// Auto-scrolling brand strip for the Landing page. Renders a horizontally
// scrolling row of every ATS / board / aggregator we pull live jobs from,
// so first-time visitors immediately get "this replaces all those tabs".
//
// Implementation notes:
//   - Two duplicate <Track> rows side-by-side. The CSS animation translates
//     the whole strip by exactly -50% over a long duration, so the second
//     copy is in the same screen position the first copy started in -
//     creating a seamless infinite loop with no JS.
//   - Brand colors are picked-by-eye to match each platform's marketing
//     site. They render as a small tinted dot + the platform name on a
//     subtle chip, matching the rest of the OmniJob chip aesthetic.
//   - prefers-reduced-motion: reduce pauses the scroll (handled in CSS).
//   - Mask-image fades the edges so chips appear to enter / exit cleanly
//     instead of getting clipped by a hard edge.

type Source = {
  name: string;
  // Brand-accurate hex. Used as the tinted dot, not the chip background,
  // so the strip stays visually consistent with the rest of the UI.
  color: string;
  // Optional short label override - some platforms shorten well (e.g.
  // "We Work Remotely" -> "WWR" reads cleaner inside a chip).
  label?: string;
};

const SOURCES: Source[] = [
  { name: "Greenhouse",       color: "#1f9d55" },
  { name: "Lever",            color: "#5d3aa6" },
  { name: "Ashby",            color: "#1a1a1a" },
  { name: "Workday",          color: "#0875e1" },
  { name: "SmartRecruiters",  color: "#0db14b" },
  { name: "Workable",         color: "#2c87ec" },
  { name: "BambooHR",         color: "#73c41d" },
  { name: "Breezy",           color: "#7c4dff" },
  { name: "Recruitee",        color: "#ff5a44" },
  { name: "Teamtailor",       color: "#1d1d1f" },
  { name: "Pinpoint",         color: "#0066ff" },
  { name: "Personio",         color: "#003a52" },
  { name: "Y Combinator",     color: "#ff6600" },
  { name: "HN Hiring",        color: "#ff6600" },
  { name: "RemoteOK",         color: "#ee2a7b" },
  { name: "We Work Remotely", color: "#df3636" },
  { name: "The Muse",         color: "#ff5a5a" },
  { name: "Adzuna",           color: "#5e3df5" },
  { name: "Reed",             color: "#ec2024" },
  { name: "Careerjet",        color: "#ff7a00" },
  { name: "Jooble",           color: "#1c8adb" },
  { name: "USAJobs",          color: "#112e51" },
  { name: "Amazon Jobs",      color: "#ff9900" },
  { name: "Shopify",          color: "#7ab55c" },
  { name: "Stripe",           color: "#635bff" },
  { name: "RBC Careers",      color: "#0073cf" },
  { name: "TD Careers",       color: "#15823d" },
  { name: "Loblaw",           color: "#cf202e" },
];

function Chip({ src }: { src: Source }) {
  return (
    <span className="src-chip">
      <span className="src-chip-dot" style={{ background: src.color }} aria-hidden />
      <span>{src.label ?? src.name}</span>
    </span>
  );
}

function Track({ ariaHidden = false }: { ariaHidden?: boolean }) {
  return (
    <div className="src-track" aria-hidden={ariaHidden ? true : undefined}>
      {SOURCES.map((s, i) => (
        <Chip key={i} src={s} />
      ))}
    </div>
  );
}

export function SourceMarquee() {
  return (
    <div
      className="src-marquee"
      role="region"
      aria-label={`We pull live jobs from ${SOURCES.length}+ platforms`}
    >
      <div className="src-marquee-inner">
        <Track />
        {/* Duplicate copy is decorative - screen readers should only hear
            the source list once. */}
        <Track ariaHidden />
      </div>
    </div>
  );
}
