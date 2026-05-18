// AI Factory · Tenants — every provisioned customer VPS in one table.

import { useEffect, useState } from "react";
import { getFactorySupabase } from "../../lib/factorySupabase";
import { navigate } from "../../shell/route";

export function TenantsPage(): JSX.Element {
  const [rows, setRows] = useState<any[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = getFactorySupabase();
      const { data } = await sb
        .from("tenants")
        .select("id, company_id, vps_ip, region, domain, status, created_at")
        .order("created_at", { ascending: false });
      if (cancelled) return;
      const ids = Array.from(new Set((data ?? []).map((r: any) => r.company_id)));
      let nameById: Record<string, string> = {};
      if (ids.length) {
        const { data: companies } = await sb.from("companies").select("id, name").in("id", ids);
        for (const c of (companies ?? []) as any[]) nameById[c.id] = c.name;
      }
      setRows(((data ?? []) as any[]).map((r) => ({ ...r, _name: nameById[r.company_id] ?? r.company_id })));
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="shell-content-wide">
      <div className="page-header">
        <h1 className="page-title">Tenants</h1>
        <p className="page-subtitle">
          Every customer's live VPS. Click a row to open that customer's tenant ops.
        </p>
      </div>
      {rows === null ? (
        <div className="empty">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="empty">
          <strong>No tenants provisioned yet</strong>
          <p>Tenants land here once a build run completes and the VPS is reachable.</p>
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>customer</th>
              <th>status</th>
              <th>ip</th>
              <th>region</th>
              <th>domain</th>
              <th>provisioned</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="clickable"
                onClick={() => navigate({ dept: "cleo", section: "customers", id: r.company_id, sub: "tenant" })}
              >
                <td>{r._name}</td>
                <td><span className={`pill ${r.status === "live" ? "done" : r.status === "failed" ? "failed" : "running"}`}><span className="pill-dot"/>{r.status ?? "—"}</span></td>
                <td className="mono">{r.vps_ip ?? "—"}</td>
                <td className="dim">{r.region ?? "—"}</td>
                <td className="mono dim">{r.domain ?? "—"}</td>
                <td className="dim">{r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
