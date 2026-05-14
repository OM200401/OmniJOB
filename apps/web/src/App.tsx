import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { Layout } from "./routes/Layout";
import { Landing } from "./routes/Landing";
import { SignIn } from "./routes/SignIn";
import { SignUp } from "./routes/SignUp";
import { Feed } from "./routes/Feed";
import { ProtectedRoute } from "./routes/ProtectedRoute";

// Route-level code splitting. The eagerly-imported set above covers the
// landing surface and the most-used signed-in screen (Feed). Everything
// else lazy-loads on first navigation; in particular:
//   - Onboarding pulls in pdfjs-dist (~200KB JS + 1.4MB worker) for
//     résumé parsing - splitting it shrinks the initial bundle by
//     roughly a third and removes the worker chunk from the home-page
//     critical path.
//   - Admin imports the dashboard charts that nothing outside /admin
//     ever sees.
//   - JobDetail loads the match-explain UI which only runs after a
//     card click.
// React Router v6 + React.lazy plays cleanly; the Suspense fallback
// below is what users see for the ~50-300ms a chunk takes to fetch
// over a warm connection.
// Each lazy entry pairs the React.lazy component with a `prefetch()`
// function exposing the same import promise. Hover/touch handlers in
// the Layout call prefetch() so the chunk is already in cache by the
// time the user clicks - shaves the ~50-300ms chunk-fetch from the
// perceived navigation latency. Calling prefetch() repeatedly is free
// because the dynamic import() is itself cached.
const lazyRoute = <T,>(loader: () => Promise<T>) => {
  return { component: lazy(loader as any), prefetch: loader };
};

const OnboardingRoute = lazyRoute(() => import("./routes/Onboarding").then((m) => ({ default: m.Onboarding })));
const JobDetailRoute = lazyRoute(() => import("./routes/JobDetail").then((m) => ({ default: m.JobDetail })));
const SavedRoute = lazyRoute(() => import("./routes/Saved").then((m) => ({ default: m.Saved })));
const SettingsRoute = lazyRoute(() => import("./routes/Settings").then((m) => ({ default: m.Settings })));
const ApplicationsRoute = lazyRoute(() => import("./routes/Applications").then((m) => ({ default: m.Applications })));
const PrivacyRoute = lazyRoute(() => import("./routes/Privacy").then((m) => ({ default: m.Privacy })));
const TermsRoute = lazyRoute(() => import("./routes/Terms").then((m) => ({ default: m.Terms })));
const ContactRoute = lazyRoute(() => import("./routes/Contact").then((m) => ({ default: m.Contact })));
const RecoverRoute = lazyRoute(() => import("./routes/Recover").then((m) => ({ default: m.Recover })));
const AdminRoute = lazyRoute(() => import("./routes/Admin").then((m) => ({ default: m.Admin })));

const Onboarding = OnboardingRoute.component;
const JobDetail = JobDetailRoute.component;
const Saved = SavedRoute.component;
const Settings = SettingsRoute.component;
const Applications = ApplicationsRoute.component;
const Privacy = PrivacyRoute.component;
const Terms = TermsRoute.component;
const Contact = ContactRoute.component;
const Recover = RecoverRoute.component;
const Admin = AdminRoute.component;

// Exported map of (path -> prefetch fn) used by Layout to warm chunks
// on link hover. Paths match the React Router definitions below.
export const ROUTE_PREFETCH: Record<string, () => Promise<unknown>> = {
  "/onboarding": OnboardingRoute.prefetch,
  "/saved": SavedRoute.prefetch,
  "/settings": SettingsRoute.prefetch,
  "/applications": ApplicationsRoute.prefetch,
  "/privacy": PrivacyRoute.prefetch,
  "/terms": TermsRoute.prefetch,
  "/contact": ContactRoute.prefetch,
  "/recover": RecoverRoute.prefetch,
  "/admin": AdminRoute.prefetch,
  // /jobs/:id is highest-value to prefetch; the JobCard fires it on
  // pointer-enter so the detail page is instant on click.
  "/jobs": JobDetailRoute.prefetch,
};

// Minimal Suspense fallback. Renders inside <main> so it doesn't push
// the header around. Keeps the same vertical rhythm as a real page so
// the transition feels like nothing happened.
function RouteFallback() {
  return (
    <div className="container" style={{ padding: "48px 24px" }}>
      <div className="muted text-sm" aria-live="polite">Loading…</div>
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<RouteFallback />}>
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
      </Suspense>
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
