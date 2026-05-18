// Shell — outer chrome of the admin app.
// Two departments (Cleo and AI Factory) live as labelled section groups in
// the left sidebar. The active section's page renders in the main pane.

import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import type { Route } from "./route";
import { NotificationBell } from "../components/NotificationBell";

export function Shell({
  email,
  route,
  onNavigate,
  onSignOut,
  trail,
  children,
}: {
  email: string;
  route: Route;
  onNavigate: (r: Route) => void;
  onSignOut: () => void;
  trail: Array<{ label: string; onClick?: () => void }>;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="shell">
      <Sidebar
        route={route}
        onNavigate={onNavigate}
        email={email}
        onSignOut={onSignOut}
      />
      <div className="shell-main">
        <header className="shell-topbar">
          <div className="shell-topbar-trail">
            {trail.map((t, i) => (
              <span key={i} className="shell-topbar-trail-item">
                {i > 0 ? <span className="sep">/</span> : null}
                {t.onClick ? (
                  <button type="button" className="btn btn-ghost" onClick={t.onClick}>
                    {t.label}
                  </button>
                ) : (
                  <strong>{t.label}</strong>
                )}{" "}
              </span>
            ))}
          </div>
          <div className="shell-topbar-spacer" />
          <NotificationBell />
        </header>
        <div className="shell-content">{children}</div>
      </div>
    </div>
  );
}
