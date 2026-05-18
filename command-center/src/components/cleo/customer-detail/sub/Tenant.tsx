// Tenant — live tenant status, IP, costs, recent ops actions.

import type { CustomerDetailContext } from "../CustomerDetailLayout";

export function TenantPage({ ctx }: { ctx: CustomerDetailContext }): JSX.Element {
  const t = ctx.tenant;
  if (!t) {
    return (
      <div className="cd-page">
        <header className="cd-page-head">
          <h1>Live tenant</h1>
          <p>No tenant provisioned yet — appears after the customer accepts and the build pipeline finishes.</p>
        </header>
      </div>
    );
  }
  const totalCost = ctx.tenantCosts.reduce((s, c: any) => s + Number(c.cost_usd ?? 0), 0);
  return (
    <div className="cd-page cd-tenant">
      <header className="cd-page-head">
        <h1>Live tenant</h1>
        <p>VPS + per-tenant Supabase + agent runtime. Status: <strong>{t.status ?? "—"}</strong></p>
      </header>

      <div className="cd-stat-grid">
        <Stat label="VPS IP" value={t.vps_ip ?? "—"} mono />
        <Stat label="Region" value={t.region ?? "—"} />
        <Stat label="Domain" value={t.domain ?? "—"} mono />
        <Stat label="Cost (14d)" value={`$${totalCost.toFixed(2)}`} />
        <Stat label="Daily avg" value={ctx.tenantCosts.length > 0 ? `$${(totalCost / ctx.tenantCosts.length).toFixed(2)}` : "—"} />
        <Stat label="Provisioned" value={t.created_at ? new Date(t.created_at).toLocaleDateString() : "—"} />
      </div>

      <section className="cd-section">
        <h2>Recent ops actions ({ctx.tenantActions.length})</h2>
        {ctx.tenantActions.length === 0 ? <div className="dim">none</div> : (
          <table className="cd-table">
            <thead>
              <tr><th>action</th><th>by</th><th>status</th><th>when</th></tr>
            </thead>
            <tbody>
              {ctx.tenantActions.map((a: any) => (
                <tr key={a.id}>
                  <td>{a.action ?? a.kind ?? "—"}</td>
                  <td>{a.actor ?? a.actor_email ?? "—"}</td>
                  <td><span className={`cd-status-pill ${a.status === "done" ? "done" : a.status === "failed" ? "failed" : "running"}`}>{a.status ?? "—"}</span></td>
                  <td className="dim">{a.created_at ? new Date(a.created_at).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="cd-section">
        <h2>Daily costs</h2>
        {ctx.tenantCosts.length === 0 ? <div className="dim">no cost data yet</div> : (
          <ul className="cd-list">
            {ctx.tenantCosts.map((c: any) => (
              <li key={c.day ?? c.id}>
                <span className="dim">{c.day}</span>
                <strong style={{ marginLeft: 8 }}>${Number(c.cost_usd ?? 0).toFixed(2)}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }): JSX.Element {
  return (
    <div className="cd-stat-card">
      <span className={`cd-stat-value ${mono ? "mono-tiny" : ""}`}>{value}</span>
      <span className="cd-stat-label">{label}</span>
    </div>
  );
}
