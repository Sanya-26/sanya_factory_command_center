// Sidebar — brand + role-aware department nav + admin footer.
//
// role=product_manager → Product sidebar (variations + Issues + Settings)
// other roles          → existing Cleo + AI Factory sidebar

import type { Route } from "./route";
import { navigate } from "./route";
import { isMockBackend, resetMockDB } from "../lib/factorySupabase";

interface SectionDef {
  id: string;
  label: string;
  // If true, dept+section+id must all match for the active highlight.
  exactId?: string;
}
interface DeptDef {
  id: "cleo" | "factory" | "product" | "ceo";
  label: string;
  glyph: string;
  sections: SectionDef[];
}

const TECH_DEPARTMENTS: DeptDef[] = [
  {
    id: "cleo",
    label: "Cleo",
    glyph: "◐",
    sections: [
      { id: "command-center", label: "Command Center" },
      { id: "audit-queue", label: "Audit queue" },
      { id: "customers", label: "Customers" },
      { id: "niche-library", label: "Niche library" },
      { id: "council-runs", label: "Council activity" },
      { id: "settings", label: "Settings" },
    ],
  },
  {
    id: "factory",
    label: "AI Factory",
    glyph: "◇",
    sections: [
      { id: "overview", label: "Overview" },
      { id: "active-builds", label: "Active builds" },
      { id: "tool-registry", label: "Tool registry" },
      { id: "build-agents", label: "Build agents" },
      { id: "tenants", label: "Tenants" },
      { id: "settings", label: "Settings" },
    ],
  },
];

const PRODUCT_DEPARTMENTS: DeptDef[] = [
  {
    id: "product",
    label: "Product",
    glyph: "◆",
    sections: [
      { id: "home", label: "Main dashboard" },
      { id: "cleo-for-pools", label: "· Cleo for Pools" },
      { id: "gameday-model", label: "· Gameday Model" },
      { id: "real-estate-model", label: "· Real Estate Model" },
      { id: "issues", label: "Issues" },
      { id: "settings", label: "Settings" },
    ],
  },
];

const CEO_DEPARTMENTS: DeptDef[] = [
  {
    id: "ceo",
    label: "Executive",
    glyph: "★",
    sections: [
      { id: "home", label: "Main dashboard" },
      { id: "contracts", label: "Contracts" },
      { id: "discounts", label: "Discount approvals" },
      { id: "wins", label: "Wins feed" },
      { id: "strategic", label: "Strategic comparison" },
      { id: "cash", label: "Cash & people" },
      { id: "board", label: "Board snapshot" },
    ],
  },
];

export function Sidebar({
  route,
  email,
  role,
  onSignOut,
}: {
  route: Route;
  onNavigate: (r: Route) => void;
  email: string;
  role: string;
  onSignOut: () => void;
}): JSX.Element {
  const departments =
    role === "product_manager" ? PRODUCT_DEPARTMENTS :
    role === "ceo" ? CEO_DEPARTMENTS :
    TECH_DEPARTMENTS;
  return (
    <aside className="shell-sidebar">
      <div className="shell-sidebar-brand">
        <div className="shell-sidebar-brand-mark">A</div>
        <div className="shell-sidebar-brand-text">
          <strong>AUBOS</strong>
          <span>{role === "product_manager" ? "Product" : role === "ceo" ? "Executive" : "Factory"}</span>
        </div>
      </div>

      <nav className="shell-sidebar-nav">
        {departments.map((d) => (
          <div key={d.id} className="shell-sidebar-dept">
            <div className="shell-sidebar-dept-label">
              <span className="shell-sidebar-dept-glyph">{d.glyph}</span>
              {d.label}
            </div>
            {d.sections.map((s) => {
              const active = route.dept === d.id && route.section === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`shell-sidebar-link ${active ? "active" : ""}`}
                  onClick={() => navigate({ dept: d.id, section: s.id })}
                >
                  <span className="shell-sidebar-link-dot" />
                  <span>{s.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="shell-sidebar-footer">
        {isMockBackend() ? (
          <div
            style={{
              background: "#fef3c7",
              color: "#92400e",
              border: "1px solid #fde68a",
              borderRadius: 6,
              padding: "6px 8px",
              fontSize: 11,
              marginBottom: 8,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
            title="VITE_DATA_BACKEND=mock"
          >
            <span>🧪 Local mock data</span>
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Wipe local mock DB and re-seed?")) {
                  resetMockDB();
                  window.location.reload();
                }
              }}
              style={{
                background: "transparent",
                border: "1px solid #fde68a",
                borderRadius: 4,
                color: "#92400e",
                fontSize: 11,
                padding: "2px 6px",
                cursor: "pointer",
              }}
            >
              Reset & reseed
            </button>
          </div>
        ) : null}
        <span className="shell-sidebar-email" title={email}>{email}</span>
        <span className="shell-sidebar-role-tag">{role}</span>
        <button type="button" className="shell-sidebar-signout" onClick={onSignOut}>
          ⏻ sign out
        </button>
      </div>
    </aside>
  );
}
