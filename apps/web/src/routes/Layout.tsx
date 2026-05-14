import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Bookmark,
  ClipboardList,
  LogOut,
  Mail,
  Menu,
  Search,
  ScrollText,
  Settings as SettingsIcon,
  ShieldCheck,
  X,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { ROUTE_PREFETCH } from "../App";

// prefetchPath warms the lazy chunk for a route path. Called on
// pointerenter/focus from any nav link - subsequent navigation is
// instant because the chunk is in browser cache. Failures are
// swallowed (the user can still click; React.lazy will try again).
function prefetchPath(path: string) {
  const fn = ROUTE_PREFETCH[path];
  if (fn) void fn().catch(() => {});
}

export function Layout() {
  const { session, signOut } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [navOpen]);

  const handleSignOut = () => {
    signOut();
    nav("/");
  };

  const initial = session?.email[0]?.toUpperCase() ?? "?";

  return (
    <div className="shell" data-nav-open={navOpen ? "true" : "false"}>
      <div className="nav-drawer-backdrop" onClick={() => setNavOpen(false)} aria-hidden />
      <header className="topbar">
        <div className="topbar-inner">
          <Link to={session ? "/feed" : "/"} className="brand">
            omnijob<span className="brand-sep">.</span>
          </Link>

          <div className="topbar-collapse">
            {session && (
              <nav className="nav">
                <NavLink to="/feed" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                  <Search size={13} /> Feed
                </NavLink>
                <NavLink
                  to="/applications"
                  className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
                  onPointerEnter={() => prefetchPath("/applications")}
                  onFocus={() => prefetchPath("/applications")}
                >
                  <ClipboardList size={13} /> Applications
                </NavLink>
                <NavLink
                  to="/saved"
                  className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
                  onPointerEnter={() => prefetchPath("/saved")}
                  onFocus={() => prefetchPath("/saved")}
                >
                  <Bookmark size={13} /> Saved
                </NavLink>
                <NavLink
                  to="/settings"
                  className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
                  onPointerEnter={() => prefetchPath("/settings")}
                  onFocus={() => prefetchPath("/settings")}
                >
                  <SettingsIcon size={13} /> Settings
                </NavLink>
              </nav>
            )}

            <div className="row gap-sm topbar-actions">
              <NavLink
                to="/privacy"
                className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
                title="What we never see"
                onPointerEnter={() => prefetchPath("/privacy")}
                onFocus={() => prefetchPath("/privacy")}
              >
                <ShieldCheck size={13} /> Privacy
              </NavLink>
              <NavLink
                to="/terms"
                className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
                title="Terms of service"
                onPointerEnter={() => prefetchPath("/terms")}
                onFocus={() => prefetchPath("/terms")}
              >
                <ScrollText size={13} /> Terms
              </NavLink>
              <NavLink
                to="/contact"
                className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
                title="Get in touch"
                onPointerEnter={() => prefetchPath("/contact")}
                onFocus={() => prefetchPath("/contact")}
              >
                <Mail size={13} /> Contact
              </NavLink>
              {session ? (
                <>
                  <span className="user-pill">
                    <span className="avatar">{initial}</span>
                    <span>{session.email}</span>
                  </span>
                  <button className="icon-btn" onClick={handleSignOut} title="Sign out">
                    <LogOut size={14} />
                  </button>
                </>
              ) : (
                <>
                  <Link to="/signin" className="nav-link">Sign in</Link>
                  <Link to="/signup" className="btn btn-primary btn-sm">Get started</Link>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            className="nav-trigger"
            aria-label={navOpen ? "Close menu" : "Open menu"}
            aria-expanded={navOpen}
            onClick={() => setNavOpen((o) => !o)}
          >
            {navOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </header>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
