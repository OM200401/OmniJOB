import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { X } from "lucide-react";

// Global keyboard-shortcuts cheatsheet. Toggled by pressing "?" anywhere
// outside a text field. Esc or clicking the backdrop closes it. The
// shortcut list is contextual: Feed and JobDetail have different bindings,
// and other routes only show the global "/" search-focus binding.
//
// Mounted once in App at the top level so it overlays everything. Pure
// presentation - the actual keybindings live in Feed.tsx and
// JobDetail.tsx; this component documents them.
type Binding = { keys: string[]; label: string };

function bindingsForPath(pathname: string): Binding[] {
  if (pathname.startsWith("/jobs/")) {
    return [
      { keys: ["s"], label: "Save / unsave this job" },
      { keys: ["a"], label: "Apply on company site" },
      { keys: ["b", "Esc"], label: "Back to feed" },
      { keys: ["?"], label: "Show this cheatsheet" },
    ];
  }
  if (pathname === "/feed") {
    return [
      { keys: ["/"], label: "Focus the search bar" },
      { keys: ["j", "↓"], label: "Next job card" },
      { keys: ["k", "↑"], label: "Previous job card" },
      { keys: ["Enter"], label: "Open the focused card" },
      { keys: ["s"], label: "Save / unsave the focused card" },
      { keys: ["Esc"], label: "Clear keyboard focus" },
      { keys: ["?"], label: "Show this cheatsheet" },
    ];
  }
  return [
    { keys: ["/"], label: "Jump to search (Feed)" },
    { keys: ["?"], label: "Show this cheatsheet" },
  ];
}

export function ShortcutsOverlay() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const inField = (el: EventTarget | null) =>
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement ||
      (el instanceof HTMLElement && el.isContentEditable);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "?" && !inField(e.target)) {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (open && e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Close on route change so a forgotten overlay doesn't trail the user.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  if (!open) return null;

  const bindings = bindingsForPath(location.pathname);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={() => setOpen(false)}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.4)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        zIndex: 80,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{
          maxWidth: 420,
          width: "100%",
          padding: 20,
          boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
        }}
      >
        <div
          className="row"
          style={{
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 14 }}>Keyboard shortcuts</div>
          <button
            className="icon-btn"
            onClick={() => setOpen(false)}
            aria-label="Close"
            type="button"
          >
            <X size={14} />
          </button>
        </div>

        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {bindings.map((b, i) => (
            <li
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                fontSize: 13,
              }}
            >
              <span>{b.label}</span>
              <span className="row" style={{ gap: 4 }}>
                {b.keys.map((k, j) => (
                  <kbd key={j} className="kbd">
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>

        <p
          className="muted-2 text-xs"
          style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border-soft)" }}
        >
          Tip: press <kbd className="kbd">?</kbd> anywhere to reopen this list.
        </p>
      </div>
    </div>
  );
}
