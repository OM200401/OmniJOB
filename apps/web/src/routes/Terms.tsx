// Placeholder Terms of Service. Drafted by the founder, NOT legal counsel.
// Replace with lawyer-reviewed text before any commercial relationship,
// payments, or jurisdictions outside Canada.

import { Link } from "react-router-dom";
import { FileText, ScrollText } from "lucide-react";

type Section = {
  heading: string;
  body: string;
  bullets?: string[];
};

const SECTIONS: Section[] = [
  {
    heading: "1. Acceptance of terms",
    body:
      "By creating an account or using OmniJob, you agree to these terms. If you do not agree, do not use the service. Continued use after a change to these terms constitutes acceptance of the revised terms.",
  },
  {
    heading: "2. Description of service",
    body:
      "OmniJob is a privacy-first semantic job-search tool. We aggregate job listings from public sources and provide ranking against an embedding of your résumé. Job listings are best-effort and provided for informational purposes; we do not warrant their accuracy, currency, or availability.",
  },
  {
    heading: "3. Account responsibilities",
    body: "You are responsible for safeguarding your credentials.",
    bullets: [
      "Keep your recovery key safe. We cannot reset your password without it - the cryptography forbids it.",
      "One account per person. Do not share accounts.",
      "Use a current email address for signup - it derives the account ID and (if you choose) is used for email-based notifications.",
    ],
  },
  {
    heading: "4. Acceptable use",
    body: "Do not abuse the service.",
    bullets: [
      "No scraping, crawling, or automated bulk extraction of listings or other users' data.",
      "No attempts to circumvent rate limits, authentication, or encryption.",
      "No automated bulk ingest, account creation, or résumé submission against listed employers.",
      "No use of the service to harass employers, candidates, or operators.",
      "No use of the service to violate any law or third-party right.",
    ],
  },
  {
    heading: "5. Intellectual property and content",
    body:
      "Job listings are aggregated from public sources; the listing copy belongs to the originating employer or aggregator. You retain all rights to your résumé, profile data, and any text you upload. We do not claim ownership of your content. We do not sell, license, or share your résumé with third parties; the privacy notice describes the storage model in detail.",
  },
  {
    heading: "6. Disclaimer of warranties",
    body:
      "OmniJob is provided \"as is\" and \"as available\" without warranty of any kind. We make no guarantee of uptime, ranking accuracy, freshness of listings, or fitness for any particular purpose. Match scores are heuristic - a high score does not imply you will be hired, and a low score does not imply you should not apply.",
  },
  {
    heading: "7. Limitation of liability",
    body:
      "To the maximum extent permitted by law, neither OmniJob nor its operators are liable for any indirect, incidental, consequential, special, or exemplary damages arising from your use of the service. Direct damages, if any, are limited to the amount you have paid us in the preceding twelve months (which is zero unless a paid plan is offered).",
  },
  {
    heading: "8. Termination",
    body:
      "You may delete your account at any time from Settings; deletion removes your encrypted profile blob from our storage. We may suspend or terminate accounts that we reasonably believe have violated these terms, including via abusive automated access, infrastructure attacks, or attempts to harm other users.",
  },
  {
    heading: "9. Changes to terms",
    body:
      "We may revise these terms from time to time. Material changes will be reflected in the effective date below. Continued use after a revision constitutes acceptance. Check this page periodically.",
  },
  {
    heading: "10. Governing law",
    body:
      "These terms are governed by the laws of the Province of British Columbia and the federal laws of Canada applicable therein, without regard to conflict-of-laws principles. Any dispute arising from or relating to these terms or the service is subject to the exclusive jurisdiction of the courts of British Columbia.",
  },
  {
    heading: "11. Contact",
    body:
      "For questions about these terms, account issues, or to report abuse, use the contact form at /contact. Include enough detail that we can act on it; an email address is optional but helps us reply.",
  },
];

export function Terms() {
  return (
    <div className="container" style={{ maxWidth: 880 }}>
      <div className="page-header">
        <div className="page-header-left">
          <span className="chip chip-accent" style={{ alignSelf: "flex-start", marginBottom: 8 }}>
            <ScrollText size={11} /> Terms of service
          </span>
          <h1 className="page-title">Terms of service</h1>
          <p className="muted text-sm" style={{ maxWidth: 620 }}>
            The ground rules for using OmniJob. Plain language; if anything here is unclear or
            looks off, write to us via Settings before agreeing.
          </p>
          <p className="muted text-xs" style={{ marginTop: 6 }}>
            Effective date: 2026-05-08
          </p>
        </div>
      </div>

      <div className="col gap-md">
        <div className="card">
          <div className="section">
            <div className="row gap-sm" style={{ marginBottom: 8 }}>
              <FileText size={14} className="muted" />
              <strong>Plain-language summary</strong>
            </div>
            <ul className="col gap-sm text-sm" style={{ paddingLeft: 18, margin: 0 }}>
              <li>Use the service in good faith. Don't scrape it, don't try to break it, don't harass anyone through it.</li>
              <li>We aggregate public listings best-effort. We do not guarantee any job is real, current, or a match.</li>
              <li>Your data stays encrypted on our side; you keep the keys. The privacy notice has the technical detail.</li>
              <li>You can delete your account anytime from Settings. We can suspend accounts that abuse the service.</li>
              <li>We are based in Canada; Canadian law governs.</li>
            </ul>
          </div>
        </div>

        {SECTIONS.map((s) => (
          <div key={s.heading} className="card">
            <div className="section">
              <strong style={{ display: "block", marginBottom: 8 }}>{s.heading}</strong>
              <p className="text-sm muted" style={{ marginBottom: s.bullets ? 10 : 0 }}>
                {s.body}
              </p>
              {s.bullets && (
                <ul className="col gap-sm text-sm" style={{ paddingLeft: 18, margin: 0 }}>
                  {s.bullets.map((b) => (
                    <li key={b} className="muted">{b}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ))}

        <div className="row-between">
          <Link to="/" className="btn btn-ghost btn-sm">Back to app</Link>
          <Link to="/privacy" className="btn btn-secondary btn-sm">Read the privacy notice</Link>
        </div>
      </div>
    </div>
  );
}
