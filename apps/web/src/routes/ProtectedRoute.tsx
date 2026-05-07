import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";

type Props = {
  /** When true, only allow if the user has completed onboarding (has a skill vector). */
  requireProfile?: boolean;
};

export function ProtectedRoute({ requireProfile = false }: Props) {
  const { session } = useAuth();
  const loc = useLocation();
  if (!session) return <Navigate to="/signin" replace state={{ from: loc.pathname }} />;
  if (requireProfile && session.profile.skillVector.length === 0) {
    return <Navigate to="/onboarding" replace />;
  }
  return <Outlet />;
}
