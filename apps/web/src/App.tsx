import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { Layout } from "./routes/Layout";
import { Landing } from "./routes/Landing";
import { SignIn } from "./routes/SignIn";
import { SignUp } from "./routes/SignUp";
import { Recover } from "./routes/Recover";
import { Onboarding } from "./routes/Onboarding";
import { Feed } from "./routes/Feed";
import { JobDetail } from "./routes/JobDetail";
import { Saved } from "./routes/Saved";
import { Settings } from "./routes/Settings";
import { Applications } from "./routes/Applications";
import { Privacy } from "./routes/Privacy";
import { Terms } from "./routes/Terms";
import { Contact } from "./routes/Contact";
import { Admin } from "./routes/Admin";
import { ProtectedRoute } from "./routes/ProtectedRoute";

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomeRedirect />} />
          <Route path="signin" element={<SignIn />} />
          <Route path="signup" element={<SignUp />} />
          <Route path="recover" element={<Recover />} />
          <Route path="privacy" element={<Privacy />} />
          <Route path="terms" element={<Terms />} />
          <Route path="contact" element={<Contact />} />
          <Route path="admin" element={<Admin />} />

          <Route element={<ProtectedRoute />}>
            <Route path="onboarding" element={<Onboarding />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          <Route element={<ProtectedRoute requireProfile />}>
            <Route path="feed" element={<Feed />} />
            <Route path="saved" element={<Saved />} />
            <Route path="applications" element={<Applications />} />
            <Route path="jobs/:id" element={<JobDetail />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}

function HomeRedirect() {
  const { session, vaultSkipped } = useAuth();
  if (!session) return <Landing />;
  // Sign-in landing: if there's a profile vector, go to /feed. If not,
  // route to /onboarding unless the user has previously chosen to skip.
  const hasProfile = session.profile.skillVector.length > 0;
  return <Navigate to={hasProfile || vaultSkipped ? "/feed" : "/onboarding"} replace />;
}
