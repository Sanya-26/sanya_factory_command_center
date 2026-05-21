// AUBOS Factory — admin shell entry point.
//
// Auth gate (Supabase session + ops_users) → role-aware Shell.
// product_manager → Product view (docs/PRD-product-view.md).
// All other roles → existing Cleo / AI Factory Tech view.

import { useEffect, useState } from "react";
import { getFactorySupabase } from "./lib/factorySupabase";
import { Shell } from "./shell/Shell";
import {
  parseHash,
  navigate,
  defaultRouteFor,
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
import { ProjectManagementPage } from "./pages/factory/ProjectManagement";
import { PipelineMapPage } from "./pages/PipelineMap";
import { CalendarOAuthCallback } from "./pages/factory/CalendarOAuthCallback";
import { ProductHomePage } from "./pages/product/ProductHome";
import { ProductVariationPage } from "./pages/product/ProductVariation";
import { ProductCustomerDetailPage } from "./pages/product/ProductCustomerDetail";
import { ProductIssuesPage } from "./pages/product/ProductIssues";
import { ProductTeamPage } from "./pages/product/ProductTeam";
import { ProductSettingsPage } from "./pages/product/ProductSettings";
import { ProductFlagsPage } from "./pages/product/ProductFlags";
import { CeoHomePage } from "./pages/ceo/CeoHome";
import { CeoContractsPage } from "./pages/ceo/CeoContracts";
import { CeoDiscountsPage } from "./pages/ceo/CeoDiscounts";
import { CeoEscalationsPage } from "./pages/ceo/CeoEscalations";
import { CeoWinsPage } from "./pages/ceo/CeoWins";
import { CeoStrategicPage } from "./pages/ceo/CeoStrategic";
import { CeoCashPage } from "./pages/ceo/CeoCash";
import { CeoBoardSnapshotPage } from "./pages/ceo/CeoBoardSnapshot";

const OAUTH_CALLBACK_PATH = "/oauth/google-calendar/callback";

const AUTH_PORTAL_URL =
  (import.meta.env.VITE_AUTH_PORTAL_URL as string | undefined) ?? "http://localhost:5174";

type Auth =
  | { status: "checking" }
  | { status: "anon" }
  | { status: "not-admin" }
  | { status: "admin"; email: string; userId: string; role: string };

export function App(): JSX.Element {
  const [auth, setAuth] = useState<Auth>({ status: "checking" });
  const [route, setRoute] = useState<Route | null>(() => parseHash(window.location.hash));
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

        // Dev-only auto-signin (unchanged).
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
          if (devEmail && devPw) {
            const { error } = await sb.auth.signInWithPassword({ email: devEmail, password: devPw });
            if (cancelled) return;
            if (!error) {
              // Re-fetch session to get the user id.
              const { data: { session: s2 } } = await sb.auth.getSession();
              session = s2;
            }
          }
        }

        if (cancelled) return;
        if (!session?.user) { setAuth({ status: "anon" }); return; }
        const { data: ops } = await sb
          .from("ops_users")
          .select("user_id, role")
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (cancelled) return;
        if (!ops) { setAuth({ status: "not-admin" }); return; }
        setAuth({
          status: "admin",
          email: session.user.email ?? "",
          userId: session.user.id,
          role: (ops as { role?: string }).role ?? "viewer",
        });
      } catch (e) {
        console.error("[auth-gate] error", e);
        if (!cancelled) setAuth({ status: "anon" });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Default landing once role is known.
  useEffect(() => {
    if (auth.status !== "admin") return;
    if (route) return;
    const r = defaultRouteFor(auth.role);
    navigate(r);
    setRoute(r);
  }, [auth, route]);

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

  const currentRoute = route ?? defaultRouteFor(auth.role);
  const trail = buildTrail(currentRoute);

  return (
    <Shell
      email={auth.email}
      role={auth.role}
      userId={auth.userId}
      route={currentRoute}
      onNavigate={(r) => navigate(r)}
      onSignOut={() => void handleSignOut()}
      trail={trail}
    >
      <PageRouter route={currentRoute} role={auth.role} userId={auth.userId} />
    </Shell>
  );
}

function PageRouter({
  route,
  role,
  userId,
}: {
  route: Route;
  role: string;
  userId: string;
}): JSX.Element {
  if (route.dept === "ceo") {
    if (route.section === "home") return <CeoHomePage userId={userId} />;
    if (route.section === "contracts") return <CeoContractsPage userId={userId} />;
    if (route.section === "discounts") return <CeoDiscountsPage userId={userId} />;
    if (route.section === "escalations") return <CeoEscalationsPage userId={userId} />;
    if (route.section === "wins") return <CeoWinsPage />;
    if (route.section === "strategic") return <CeoStrategicPage />;
    if (route.section === "cash") return <CeoCashPage />;
    if (route.section === "board") return <CeoBoardSnapshotPage />;
    return <CeoHomePage userId={userId} />;
  }
  if (route.dept === "product") {
    if (route.section === "home") return <ProductHomePage />;
    if (route.section === "issues") return <ProductIssuesPage userId={userId} />;
    if (route.section === "team") return <ProductTeamPage />;
    if (route.section === "settings") return <ProductSettingsPage userRole={role} />;
    // /product/<niche>[/customer/<id>] or /product/<niche>/flags
    const niche = route.section;
    if (route.id === "customer" && route.sub)
      return <ProductCustomerDetailPage niche={niche} companyId={route.sub} userId={userId} />;
    if (route.id === "flags") return <ProductFlagsPage niche={niche} />;
    return <ProductVariationPage niche={niche} />;
  }
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
    if (route.section === "project-management") return <ProjectManagementPage />;
    if (route.section === "tenants") {
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
  if (r.dept === "ceo") {
    const ceoSection: Record<string, string> = {
      home: "Main dashboard",
      contracts: "Contracts",
      discounts: "Discount approvals",
      wins: "Wins feed",
      strategic: "Strategic comparison",
      cash: "Cash & people",
      board: "Board snapshot",
    };
    return [
      { label: "Executive" },
      { label: ceoSection[r.section] ?? r.section },
    ];
  }
  if (r.dept === "product") {
    const trail: Array<{ label: string; onClick?: () => void }> = [{ label: "Product" }];
    if (r.section === "home") return trail;
    if (r.section === "issues") return [...trail, { label: "Issues" }];
    if (r.section === "settings") return [...trail, { label: "Settings" }];
    const niche = r.section;
    trail.push({
      label: nicheTitle(niche),
      onClick: r.id ? () => navigate({ dept: "product", section: niche }) : undefined,
    });
    if (r.id === "customer" && r.sub) {
      trail.push({ label: r.sub.slice(0, 8) + "…" });
    } else if (r.id === "flags") {
      trail.push({ label: "Flags" });
    }
    return trail;
  }
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
    const looksLikeUuid = /^[0-9a-f-]{8,}$/i.test(r.id) && r.id.includes("-");
    trail.push({ label: looksLikeUuid ? r.id.slice(0, 8) + "…" : r.id });
  }
  return trail;
}

function nicheTitle(slug: string): string {
  return slug
    .split("-")
    .map((s) => s[0]?.toUpperCase() + s.slice(1))
    .join(" ");
}
