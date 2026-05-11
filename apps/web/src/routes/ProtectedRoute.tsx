import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";

type Props = {
  /** When true, only allow if the user has completed onboarding (has a skill vector). */
  requireProfile?: boolean;
};

export function ProtectedRoute({ requireProfile = false }: Props) {
  const { session, vaultSkipped } = useAuth();
  const loc = useLocation();
  if (!session) return <Navigate to="/signin" replace state={{ from: loc.pathname }} />;
  // Only bounce to /onboarding if the user has neither a profile nor an
  // explicit "skip for now" choice. Without this check the Skip button
  // sets vaultSkipped, navigates to /feed, and this guard immediately
  // sends them back to /onboarding - looks like the button does nothing.
  if (requireProfile && session.profile.skillVector.length === 0 && !vaultSkipped) {
    return <Navigate to="/onboarding" replace />;
  }
  return <Outlet />;
}
