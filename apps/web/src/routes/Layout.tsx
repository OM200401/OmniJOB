import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { Bookmark, ClipboardList, LogOut, Search, Settings as SettingsIcon, ShieldCheck } from "lucide-react";
import { useAuth } from "../lib/auth";

export function Layout() {
  const { session, signOut } = useAuth();
  const nav = useNavigate();

  const handleSignOut = () => {
    signOut();
    nav("/");
  };

  const initial = session?.email[0]?.toUpperCase() ?? "?";

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to={session ? "/feed" : "/"} className="brand">
            omnijob<span className="brand-sep">.</span>
          </Link>

          {session && (
            <nav className="nav" style={{ marginLeft: 8 }}>
              <NavLink to="/feed" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                <Search size={13} /> Feed
              </NavLink>
              <NavLink to="/applications" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                <ClipboardList size={13} /> Applications
              </NavLink>
              <NavLink to="/saved" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                <Bookmark size={13} /> Saved
              </NavLink>
              <NavLink to="/settings" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                <SettingsIcon size={13} /> Settings
              </NavLink>
            </nav>
          )}

          <div className="row gap-sm" style={{ marginLeft: "auto" }}>
            <NavLink
              to="/privacy"
              className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
              title="What we never see"
            >
              <ShieldCheck size={13} /> Privacy
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
      </header>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
