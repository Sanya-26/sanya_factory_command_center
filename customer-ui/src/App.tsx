// App — top-level routes.
//
//   /login                  public · unified for admin + customer (post-auth routing)
//   /signup                 public · invite-gated customer signup
//   /onboarding             customer · 3D Cleo + canvas
//   /modules/qc-recovery/*  operator cockpit · QC + compliance + integration recovery
//   /admin                  admin · ops_users-gated console
//
// Default redirect: /login.

import { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import CleoOnboarding from "@/pages/customer/Onboarding";
import CustomerSettings from "@/pages/customer/Settings";
import AnthropicOAuthCallback from "@/pages/customer/AnthropicOAuthCallback";
import MeetingPicker from "@/pages/customer/MeetingPicker";
import DrinkGioControlPanel from "@/pages/customer/DrinkGioControlPanel";
import AdminHome from "@/pages/admin/AdminHome";
import { RequireCustomer, RequireAdmin } from "@/components/RouteGuards";

// ── QC Recovery module (lazy-loaded) ─────────────────────────────────────────
const QCRecoveryDashboard = lazy(
  () => import("@/pages/_modules/qc-recovery/index")
);
const ComplianceQueue = lazy(
  () => import("@/pages/_modules/qc-recovery/ComplianceQueue")
);
const IntegrationHealth = lazy(
  () => import("@/pages/_modules/qc-recovery/IntegrationHealth")
);
const AuditFindings = lazy(
  () => import("@/pages/_modules/qc-recovery/AuditFindings")
);

function QCFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">
      Loading QC module…
    </div>
  );
}

export default function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route
        path="/onboarding"
        element={
          <RequireCustomer>
            <CleoOnboarding />
          </RequireCustomer>
        }
      />
      <Route
        path="/settings"
        element={
          <RequireCustomer>
            <CustomerSettings />
          </RequireCustomer>
        }
      />
      <Route
        path="/oauth/anthropic-callback"
        element={
          <RequireCustomer>
            <AnthropicOAuthCallback />
          </RequireCustomer>
        }
      />
      <Route
        path="/meeting"
        element={
          <RequireCustomer>
            <MeetingPicker />
          </RequireCustomer>
        }
      />
      <Route
        path="/gio"
        element={
          <RequireCustomer>
            <DrinkGioControlPanel />
          </RequireCustomer>
        }
      />
      <Route path="/gio/quiz" element={<Navigate to="/gio" replace />} />
      <Route path="/drinkgio" element={<Navigate to="/gio" replace />} />

      {/* ── QC Recovery cockpit (ticket: recovery-e2e-auditor-61115444) ── */}
      <Route
        path="/modules/qc-recovery"
        element={
          <RequireCustomer>
            <Suspense fallback={<QCFallback />}>
              <QCRecoveryDashboard />
            </Suspense>
          </RequireCustomer>
        }
      />
      <Route
        path="/modules/qc-recovery/compliance"
        element={
          <RequireCustomer>
            <Suspense fallback={<QCFallback />}>
              <ComplianceQueue />
            </Suspense>
          </RequireCustomer>
        }
      />
      <Route
        path="/modules/qc-recovery/integrations"
        element={
          <RequireCustomer>
            <Suspense fallback={<QCFallback />}>
              <IntegrationHealth />
            </Suspense>
          </RequireCustomer>
        }
      />
      <Route
        path="/modules/qc-recovery/audit"
        element={
          <RequireCustomer>
            <Suspense fallback={<QCFallback />}>
              <AuditFindings />
            </Suspense>
          </RequireCustomer>
        }
      />
      <Route
        path="/modules/qc-recovery/audit/:runId"
        element={
          <RequireCustomer>
            <Suspense fallback={<QCFallback />}>
              <AuditFindings />
            </Suspense>
          </RequireCustomer>
        }
      />

      <Route
        path="/admin/*"
        element={
          <RequireAdmin>
            <AdminHome />
          </RequireAdmin>
        }
      />
      <Route
        path="/"
        element={
          <Navigate
            to={import.meta.env.DEV && import.meta.env.VITE_DEV_CLIENT_EMAIL ? "/onboarding" : "/login"}
            replace
          />
        }
      />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
