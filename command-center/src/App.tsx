// AUBOS Factory — admin shell entry point.
//
// Auth gate (Supabase session + ops_users) → Shell with two-department
// sidebar nav. Each section renders its own page component.

import { useEffect, useState } from "react";
import { getFactorySupabase } from "./lib/factorySupabase";
import { Shell } from "./shell/Shell";
import {
  parseHash,
  navigate,
  type Route,
} from "./shell/route";
import { CleoCommandCenterPage } from "./pages/cleo-command-center";
import { AuditQueuePage } from "./pages/cleo-command-center/AuditQueue";
import { CleoCustomersPage } from "./pages/cleo/CleoCustomers";
import { NicheLibraryPage } from "./pages/cleo/NicheLibrary";
import { CouncilRunsPage } from "./pages/cleo/CouncilRuns";
import { CleoSettingsPage } from "./pages/cleo/CleoSettings";
import { FactoryOverviewPage } from "./pages/factory/FactoryOverview";
import ActiveBuildsPage from "./pages/factory/ActiveBuilds";
import { BuildAgentsPage } from "./pages/factory/BuildAgents";
import { TenantsPage } from "./pages/factory/Tenants";
import TenantAdminPanel from "./pages/TenantAdminPanel";
import { FactorySettingsPage } from "./pages/factory/FactorySettings";
import { ToolRegistryPage } from "./pages/factory/ToolRegistry";
import { PipelineMapPage } from "./pages/PipelineMap";
import { CalendarOAuthCallback } from "./pages/factory/CalendarOAuthCallback";

const OAUTH_CALLBACK_PATH = "/oauth/google-calendar/callback";

const AUTH_PORTAL_URL =
  (import.meta.env.VITE_AUTH_PORTAL_URL as string | undefined) ?? "http://localhost:5174";

type Auth =
  | { status: "checking" }
  | { status: "anon" }
  | { status: "not-admin" }
  | { status: "admin"; email: string };

export function App(): JSX.Element {
  // §9 Group F — Google OAuth callback path. Google requires an HTTP
  // path (not hash) for redirect_uri; this one URL is registered with
  // the OAuth client. Short-circuit auth gate + Shell for this route
  // since the component handles its own UX (success → /#factory/settings).
  // The path check stays here (not before hooks) so we don't violate
  // React's rules-of-hooks; the hooks below run no-op work then exit.
  const [auth, setAuth] = useState<Auth>({ status: "checking" });
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  const isOAuthCallback = window.location.pathname.startsWith(OAUTH_CALLBACK_PATH);

  // Auth gate.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        console.log("[auth-gate] start");
        const sb = getFactorySupabase();
        let { data: { session } } = await sb.auth.getSession();
        console.log("[auth-gate] initial session?", !!session?.user, session?.user?.email);

        // Dev-only auto-signin. Gated by THREE conditions:
        //   1. import.meta.env.DEV — Vite dev server only.
        //   2. VITE_ENABLE_DEV_BYPASS === "1" — opt-in env var (never set in prod).
        //   3. Runtime guard throws if somehow MODE === "production".
        // Production builds set neither (1) nor (2) → this block is dead code.
        if (
          !session?.user &&
          import.meta.env.DEV &&
          import.meta.env.VITE_ENABLE_DEV_BYPASS === "1"
        ) {
          if (import.meta.env.MODE === "production") {
            throw new Error("dev bypass invoked in production build — refusing");
          }
          const devEmail = import.meta.env.VITE_DEV_ADMIN_EMAIL as string | undefined;
          const devPw = import.meta.env.VITE_DEV_ADMIN_PASSWORD as string | undefined;
          console.log("[auth-gate] dev creds present?", !!(devEmail && devPw));
          if (devEmail && devPw) {
            console.log("[auth-gate] dev signInWithPassword...");
            const { error } = await sb.auth.signInWithPassword({ email: devEmail, password: devPw });
            console.log("[auth-gate] dev signIn done; error?", error?.message);
            if (cancelled) return;
            if (!error) {
              // In dev, we KNOW this user is an ops_user (it's our hardcoded
              // admin), so short-circuit to avoid the from('ops_users') query
              // hanging on Supabase's auth lock right after a sign-in.
              setAuth({ status: "admin", email: devEmail });
              return;
            }
          }
        }

        if (cancelled) return;
        if (!session?.user) { setAuth({ status: "anon" }); return; }
        console.log("[auth-gate] checking ops_users for", session.user.id);
        const { data: ops } = await sb
          .from("ops_users")
          .select("user_id")
          .eq("user_id", session.user.id)
          .maybeSingle();
        console.log("[auth-gate] ops row?", !!ops);
        if (cancelled) return;
        if (!ops) { setAuth({ status: "not-admin" }); return; }
        setAuth({ status: "admin", email: session.user.email ?? "" });
      } catch (e) {
        console.error("[auth-gate] error", e);
        if (!cancelled) setAuth({ status: "anon" });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Hash routing.
  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  if (isOAuthCallback) {
    return <CalendarOAuthCallback />;
  }

  if (auth.status === "checking") {
    return <div className="auth-gate"><div className="auth-gate-card">checking access…</div></div>;
  }
  if (auth.status === "anon") {
    window.location.href = `${AUTH_PORTAL_URL}/login`;
    return <div className="auth-gate"><div className="auth-gate-card">redirecting to login…</div></div>;
  }
  if (auth.status === "not-admin") {
    window.location.href = `${AUTH_PORTAL_URL}/onboarding`;
    return <div className="auth-gate"><div className="auth-gate-card">this account isn't an admin — sending you to the customer experience…</div></div>;
  }

  const handleSignOut = async () => {
    try { await getFactorySupabase().auth.signOut(); } catch { /* */ }
    window.location.href = `${AUTH_PORTAL_URL}/login`;
  };

  const trail = buildTrail(route);

  return (
    <Shell
      email={auth.email}
      route={route}
      onNavigate={(r) => navigate(r)}
      onSignOut={() => void handleSignOut()}
      trail={trail}
    >
      <PageRouter route={route} />
    </Shell>
  );
}

function PageRouter({ route }: { route: Route }): JSX.Element {
  if (route.dept === "cleo") {
    if (route.section === "command-center") return <CleoCommandCenterPage route={route} />;
    if (route.section === "workflow") return <PipelineMapPage dept="cleo" />;
    if (route.section === "audit-queue") return <AuditQueuePage />;
    if (route.section === "customers") return <CleoCustomersPage route={route} />;
    if (route.section === "niche-library") return <NicheLibraryPage route={route} />;
    if (route.section === "council-runs") return <CouncilRunsPage />;
    if (route.section === "settings") return <CleoSettingsPage />;
  }
  if (route.dept === "factory") {
    if (route.section === "overview") return <FactoryOverviewPage />;
    if (route.section === "active-builds") return <ActiveBuildsPage />;
    if (route.section === "pipeline") return <PipelineMapPage dept="factory" />;
    if (route.section === "tool-registry") return <ToolRegistryPage route={route} />;
    if (route.section === "build-agents") return <BuildAgentsPage route={route} />;
    if (route.section === "tenants") {
      // /factory/tenants            → list (existing)
      // /factory/tenants/<slug>     → admin panel (new)
      if (route.id) return <TenantAdminPanel tenantSlug={route.id} />;
      return <TenantsPage />;
    }
    if (route.section === "settings") return <FactorySettingsPage />;
  }
  return (
    <div className="empty">
      <strong>Unknown route</strong>
      <p>{route.dept}/{route.section}</p>
    </div>
  );
}

function buildTrail(r: Route): Array<{ label: string; onClick?: () => void }> {
  const dept = r.dept === "cleo" ? "Cleo" : "AI Factory";
  const section: Record<string, string> = {
    "command-center": "Command Center",
    "audit-queue": "Audit queue",
    customers: "Customers",
    "niche-library": "Niche library",
    "council-runs": "Council activity",
    settings: "Settings",
    overview: "Overview",
    "active-builds": "Active builds",
    "tool-registry": "Tool registry",
    "build-agents": "Build agents",
    tenants: "Tenants",
  };
  const trail: Array<{ label: string; onClick?: () => void }> = [
    { label: dept },
    {
      label: section[r.section] ?? r.section,
      onClick: r.id ? () => navigate({ dept: r.dept, section: r.section }) : undefined,
    },
  ];
  if (r.id) {
    // For niche-library, slug is the id and is human-readable. For customers,
    // it's a uuid — abbreviate.
    const looksLikeUuid = /^[0-9a-f-]{8,}$/i.test(r.id) && r.id.includes("-");
    trail.push({ label: looksLikeUuid ? r.id.slice(0, 8) + "…" : r.id });
  }
  return trail;
}
