// CEO Contracts — full table of every contract_drafts row, filterable.

import { useEffect, useState } from "react";
import { getFactorySupabase } from "../../lib/factorySupabase";
import { selectStyle } from "../../lib/ui-styles";

interface Row {
  id: string;
  company_id: string;
  company_name: string;
  niche: string | null;
  monthly_usd: number;
  list_monthly_usd: number | null;
  discount_pct: number | null;
  status: string;
  ceo_approval_status: string;
  ceo_signed_at: string | null;
  queue_bucket: string;
}

const BUCKETS: Record<string, { label: string; color: string }> = {
  awaiting_discount_approval: { label: "Discount pending", color: "#f59e0b" },
  awaiting_ceo_signature: { label: "Awaiting signature", color: "#3b82f6" },
  signed: { label: "Signed", color: "#10b981" },
  idle: { label: "Draft / other", color: "#9ca3af" },
};

export function CeoContractsPage({ userId }: { userId: string }): JSX.Element {
  const [rows, setRows] = useState<Row[]>([]);
  const [bucket, setBucket] = useState<string>("all");

  async function load() {
    const sb = getFactorySupabase();
    const { data } = await sb.from("v_ceo_contracts_pending").select("*").order("ceo_signed_at", { ascending: false });
    setRows((data ?? []) as Row[]);
  }
  useEffect(() => { void load(); }, []);

  async function sign(id: string, name: string) {
    if (!window.confirm(`Sign the contract for ${name}?`)) return;
    const sb = getFactorySupabase();
    await sb.from("contract_drafts").update({
      ceo_signed_at: new Date().toISOString(),
      ceo_signed_by: userId,
      status: "signed",
      signed_at: new Date().toISOString(),
    }).eq("id", id);
    await load();
  }

  const filtered = bucket === "all" ? rows : rows.filter((r) => r.queue_bucket === bucket);

  return (
    <div style={{ padding: 24, display: "grid", gap: 16 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Contracts</h1>
        <select value={bucket} onChange={(e) => setBucket(e.target.value)} style={selectStyle}>
          <option value="all">All ({rows.length})</option>
          {Object.entries(BUCKETS).map(([k, v]) => (
            <option key={k} value={k}>{v.label} ({rows.filter((r) => r.queue_bucket === k).length})</option>
          ))}
        </select>
      </header>

      <table style={{ width: "100%", borderCollapse: "collapse", background: "white", color: "#111827", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
        <thead>
          <tr style={{ background: "#f9fafb", color: "#6b7280", fontSize: 12, textAlign: "left" }}>
            <th style={{ padding: 10 }}>Customer</th>
            <th style={{ padding: 10 }}>Niche</th>
            <th style={{ padding: 10 }}>List → Final</th>
            <th style={{ padding: 10 }}>Discount</th>
            <th style={{ padding: 10 }}>Stage</th>
            <th style={{ padding: 10 }}>Signed</th>
            <th style={{ padding: 10 }}></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => {
            const b = BUCKETS[r.queue_bucket] ?? BUCKETS.idle;
            return (
              <tr key={r.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                <td style={{ padding: 10 }}>{r.company_name}</td>
                <td style={{ padding: 10, color: "#6b7280", fontSize: 12 }}>{r.niche ?? "—"}</td>
                <td style={{ padding: 10 }}>
                  {r.list_monthly_usd ? `$${Number(r.list_monthly_usd).toLocaleString()} → ` : ""}
                  <strong>${Number(r.monthly_usd).toLocaleString()}</strong>
                </td>
                <td style={{ padding: 10 }}>
                  {r.discount_pct && r.discount_pct > 0 ? (
                    <span style={{ background: "#fef3c7", color: "#92400e", padding: "2px 8px", borderRadius: 999, fontSize: 11 }}>−{r.discount_pct}%</span>
                  ) : "—"}
                </td>
                <td style={{ padding: 10 }}>
                  <span style={{ background: b.color, color: "white", padding: "2px 8px", borderRadius: 999, fontSize: 11 }}>{b.label}</span>
                </td>
                <td style={{ padding: 10, color: "#9ca3af", fontSize: 11 }}>
                  {r.ceo_signed_at ? new Date(r.ceo_signed_at).toLocaleDateString() : "—"}
                </td>
                <td style={{ padding: 10, textAlign: "right" }}>
                  {r.queue_bucket === "awaiting_ceo_signature" ? (
                    <button type="button" onClick={() => void sign(r.id, r.company_name)} style={{ padding: "4px 12px", background: "#10b981", color: "white", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>Sign →</button>
                  ) : null}
                </td>
              </tr>
            );
          })}
          {filtered.length === 0 ? (
            <tr><td colSpan={7} style={{ padding: 20, textAlign: "center", color: "#9ca3af" }}>No contracts in this view.</td></tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
