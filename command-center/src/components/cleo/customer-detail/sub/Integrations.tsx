// Integrations — list of customer_secrets connected/pending.

import type { CustomerDetailContext } from "../CustomerDetailLayout";

export function IntegrationsPage({ ctx }: { ctx: CustomerDetailContext }): JSX.Element {
  const required = (ctx.canvas?.nodes ?? [])
    .filter((n: any) => n.kind === "integration")
    .map((n: any) => ({
      id: (n.data?.provider as string) ?? n.id,
      label: n.label,
    }));
  const connected = ctx.secrets.reduce<Record<string, any>>((acc, s: any) => {
    acc[s.integration_id] = s;
    return acc;
  }, {});

  return (
    <div className="cd-page cd-integrations">
      <header className="cd-page-head">
        <h1>Integrations</h1>
        <p>{Object.keys(connected).length} connected · {required.length} required by the proposal.</p>
      </header>
      {required.length === 0 && ctx.secrets.length === 0 ? (
        <div className="cd-empty">No integrations referenced yet.</div>
      ) : (
        <table className="cd-table">
          <thead>
            <tr>
              <th>integration</th>
              <th>status</th>
              <th>required by proposal</th>
              <th>connected at</th>
              <th>vault id</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const ids = new Set<string>();
              required.forEach((r: any) => ids.add(r.id));
              ctx.secrets.forEach((s: any) => ids.add(s.integration_id));
              return [...ids].map((id) => {
                const sec = connected[id];
                const req = required.find((r: any) => r.id === id);
                return (
                  <tr key={id}>
                    <td>{req?.label ?? id}</td>
                    <td>
                      {sec ? (
                        <span className={`cd-status-pill ${sec.status === "connected" ? "done" : "failed"}`}>
                          {sec.status}
                        </span>
                      ) : (
                        <span className="cd-status-pill pending">not connected</span>
                      )}
                    </td>
                    <td>{req ? "yes" : "—"}</td>
                    <td className="dim">{sec ? new Date(sec.connected_at).toLocaleString() : "—"}</td>
                    <td className="dim mono-tiny">{sec?.vault_secret_id?.slice(0, 8) ?? "—"}</td>
                  </tr>
                );
              });
            })()}
          </tbody>
        </table>
      )}
    </div>
  );
}
