// Sidebar — brand + two-department nav + admin footer.

import type { Route } from "./route";
import { navigate } from "./route";

interface SectionDef {
  id: string;
  label: string;
}
interface DeptDef {
  id: "cleo" | "factory";
  label: string;
  glyph: string;
  sections: SectionDef[];
}

const DEPARTMENTS: DeptDef[] = [
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

export function Sidebar({
  route,
  email,
  onSignOut,
}: {
  route: Route;
  onNavigate: (r: Route) => void;
  email: string;
  onSignOut: () => void;
}): JSX.Element {
  return (
    <aside className="shell-sidebar">
      <div className="shell-sidebar-brand">
        <div className="shell-sidebar-brand-mark">A</div>
        <div className="shell-sidebar-brand-text">
          <strong>AUBOS</strong>
          <span>Factory</span>
        </div>
      </div>

      <nav className="shell-sidebar-nav">
        {DEPARTMENTS.map((d) => (
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
        <span className="shell-sidebar-email" title={email}>{email}</span>
        <button type="button" className="shell-sidebar-signout" onClick={onSignOut}>
          ⏻ sign out
        </button>
      </div>
    </aside>
  );
}
