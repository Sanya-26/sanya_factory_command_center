// Cleo · Council activity — cross-customer view of recent council runs.

import { useEffect, useState } from "react";
import { getFactorySupabase } from "../../lib/factorySupabase";
import { navigate } from "../../shell/route";

export function CouncilRunsPage(): JSX.Element {
  const [rows, setRows] = useState<any[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = getFactorySupabase();
      const { data } = await sb
        .from("council_outputs")
        .select("id, company_id, agent, round, status, started_at, completed_at, output")
        .order("started_at", { ascending: false })
        .limit(80);
      if (cancelled) return;
      // Pull a name per company in batch.
      const ids = Array.from(new Set((data ?? []).map((r: any) => r.company_id)));
      let nameById: Record<string, string> = {};
      if (ids.length) {
        const { data: companies } = await sb
          .from("companies").select("id, name").in("id", ids);
        for (const c of (companies ?? []) as any[]) nameById[c.id] = c.name;
      }
      setRows(((data ?? []) as any[]).map((r) => ({ ...r, _name: nameById[r.company_id] ?? r.company_id.slice(0, 8) })));
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="shell-content-wide">
      <div className="page-header">
        <h1 className="page-title">Council activity</h1>
        <p className="page-subtitle">
          Live feed of every agent run across every customer. Click a row to jump
          to that customer's full council page.
        </p>
      </div>

      {rows === null ? (
        <div className="empty">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="empty">
          <strong>No council runs yet</strong>
          <p>Runs appear here once a customer's deep scrape finishes.</p>
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>customer</th>
              <th>agent</th>
              <th>round</th>
              <th>status</th>
              <th>duration</th>
              <th>started</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const dur = r.started_at && r.completed_at
                ? new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()
                : null;
              return (
                <tr key={r.id} className="clickable" onClick={() => navigate({ dept: "cleo", section: "customers", id: r.company_id, sub: "council" })}>
                  <td>{r._name}</td>
                  <td className="mono">{r.agent}</td>
                  <td className="dim mono">r{r.round}</td>
                  <td><span className={`pill ${pillFor(r.status)}`}><span className="pill-dot"/>{r.status}</span></td>
                  <td className="dim">{dur ? `${(dur / 1000).toFixed(0)}s` : "—"}</td>
                  <td className="dim">{r.started_at ? new Date(r.started_at).toLocaleString() : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function pillFor(s: string): string {
  if (s === "done") return "done";
  if (s === "running" || s === "queued") return "running";
  if (s === "failed") return "failed";
  if (s === "revise") return "warn";
  return "muted";
}
