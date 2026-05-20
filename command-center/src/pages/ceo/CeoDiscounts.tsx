// CEO Discounts — every contract with a discount, including history.

import { useEffect, useState } from "react";
import { getFactorySupabase } from "../../lib/factorySupabase";

interface Row {
  id: string;
  company_name: string;
  list_monthly_usd: number | null;
  monthly_usd: number;
  discount_pct: number | null;
  discount_justification: string | null;
  ceo_approval_status: string;
  ceo_approval_at: string | null;
  ceo_approval_notes: string | null;
}

export function CeoDiscountsPage({ userId }: { userId: string }): JSX.Element {
  const [rows, setRows] = useState<Row[]>([]);

  async function load() {
    const sb = getFactorySupabase();
    const { data } = await sb.from("v_ceo_contracts_pending").select("*");
    setRows(((data ?? []) as Row[]).filter((r) => r.discount_pct && r.discount_pct > 0));
  }
  useEffect(() => { void load(); }, []);

  async function decide(id: string, decision: "approved" | "rejected") {
    const notes = decision === "rejected" ? window.prompt("Reason?") : "";
    if (decision === "rejected" && notes === null) return;
    const sb = getFactorySupabase();
    await sb.from("contract_drafts").update({
      ceo_approval_status: decision,
      ceo_approval_by: userId,
      ceo_approval_at: new Date().toISOString(),
      ceo_approval_notes: notes ?? null,
      ...(decision === "approved" ? { status: "approved" } : {}),
    }).eq("id", id);
    await load();
  }

  const pending = rows.filter((r) => r.ceo_approval_status === "pending");
  const decided = rows.filter((r) => r.ceo_approval_status === "approved" || r.ceo_approval_status === "rejected");

  return (
    <div style={{ padding: 24, display: "grid", gap: 20 }}>
      <header><h1 style={{ margin: 0 }}>Discount approvals</h1></header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <Stat label="Pending" value={pending.length} color="#f59e0b" />
        <Stat label="Approved (all-time)" value={decided.filter((r) => r.ceo_approval_status === "approved").length} color="#10b981" />
        <Stat label="Rejected (all-time)" value={decided.filter((r) => r.ceo_approval_status === "rejected").length} color="#ef4444" />
        <Stat label="Avg discount" value={`${avgDiscount(rows)}%`} color="#3b82f6" />
      </section>

      <section>
        <h2 style={{ fontSize: 15, marginBottom: 8 }}>Pending ({pending.length})</h2>
        <DiscountTable rows={pending} actionable onDecide={decide} />
      </section>

      <section>
        <h2 style={{ fontSize: 15, marginBottom: 8 }}>History ({decided.length})</h2>
        <DiscountTable rows={decided} />
      </section>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{ background: "white", color: "#111827", border: "1px solid #e5e7eb", borderRadius: 12, padding: 14 }}>
      <div style={{ color: "#6b7280", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, marginTop: 2, color }}>{value}</div>
    </div>
  );
}

function DiscountTable({ rows, actionable, onDecide }: { rows: Row[]; actionable?: boolean; onDecide?: (id: string, d: "approved" | "rejected") => void }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", background: "white", color: "#111827", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
      <thead>
        <tr style={{ background: "#f9fafb", color: "#6b7280", fontSize: 12, textAlign: "left" }}>
          <th style={{ padding: 10 }}>Customer</th>
          <th style={{ padding: 10 }}>List → Final</th>
          <th style={{ padding: 10 }}>%</th>
          <th style={{ padding: 10 }}>Justification</th>
          <th style={{ padding: 10 }}>Status</th>
          {actionable ? <th></th> : <th>Decided</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} style={{ borderTop: "1px solid #f3f4f6" }}>
            <td style={{ padding: 10 }}>{r.company_name}</td>
            <td style={{ padding: 10 }}>${Number(r.list_monthly_usd ?? 0).toLocaleString()} → <strong>${Number(r.monthly_usd).toLocaleString()}</strong></td>
            <td style={{ padding: 10 }}>{r.discount_pct}%</td>
            <td style={{ padding: 10, color: "#6b7280", fontSize: 12, maxWidth: 300 }}>{r.discount_justification ?? "—"}</td>
            <td style={{ padding: 10, fontSize: 12 }}>{r.ceo_approval_status}</td>
            {actionable ? (
              <td style={{ padding: 10, textAlign: "right", whiteSpace: "nowrap" }}>
                <button type="button" onClick={() => onDecide?.(r.id, "approved")} style={{ padding: "4px 10px", background: "#2563eb", color: "white", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer", marginRight: 4 }}>Approve</button>
                <button type="button" onClick={() => onDecide?.(r.id, "rejected")} style={{ padding: "4px 10px", background: "#ef4444", color: "white", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>Reject</button>
              </td>
            ) : (
              <td style={{ padding: 10, color: "#9ca3af", fontSize: 11 }}>{r.ceo_approval_at ? new Date(r.ceo_approval_at).toLocaleDateString() : "—"}</td>
            )}
          </tr>
        ))}
        {rows.length === 0 ? <tr><td colSpan={6} style={{ padding: 16, textAlign: "center", color: "#9ca3af" }}>None.</td></tr> : null}
      </tbody>
    </table>
  );
}

function avgDiscount(rows: Row[]): number {
  if (rows.length === 0) return 0;
  return Math.round(rows.reduce((s, r) => s + (Number(r.discount_pct) || 0), 0) / rows.length);
}
