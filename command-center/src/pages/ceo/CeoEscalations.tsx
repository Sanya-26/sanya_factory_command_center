// CEO Escalations — full history of items Sanya raised for Ouadie's decision.

import { useEffect, useMemo, useState } from "react";
import { getFactorySupabase } from "../../lib/factorySupabase";
import { EscalationDecisionModal } from "../../components/EscalationDecisionModal";
import { selectStyle } from "../../lib/ui-styles";

interface Esc {
  id: string;
  title: string;
  body: string;
  category: string;
  urgency: string;
  related_company_id: string | null;
  status: string;
  decision: string | null;
  decision_notes: string | null;
  decided_at: string | null;
  created_at: string;
  related_company_name?: string;
}

const CATEGORIES = ["all", "customer", "contract", "strategic", "budget", "hire", "vendor", "other"];
const STATUSES = ["all", "open", "acknowledged", "decided", "deferred", "rejected"];

const CAT_COLOR: Record<string, { bg: string; fg: string }> = {
  customer: { bg: "#dbeafe", fg: "#1e40af" },
  contract: { bg: "#fce7f3", fg: "#9d174d" },
  strategic: { bg: "#ede9fe", fg: "#5b21b6" },
  budget: { bg: "#fef3c7", fg: "#92400e" },
  hire: { bg: "#d1fae5", fg: "#065f46" },
  vendor: { bg: "#fee2e2", fg: "#991b1b" },
  other: { bg: "#f3f4f6", fg: "#374151" },
};
const STATUS_COLOR: Record<string, { bg: string; fg: string }> = {
  open: { bg: "#fef3c7", fg: "#92400e" },
  acknowledged: { bg: "#fef9c3", fg: "#854d0e" },
  decided: { bg: "#d1fae5", fg: "#065f46" },
  rejected: { bg: "#fee2e2", fg: "#991b1b" },
  deferred: { bg: "#e0e7ff", fg: "#3730a3" },
};

export function CeoEscalationsPage({ userId }: { userId: string }): JSX.Element {
  const [rows, setRows] = useState<Esc[]>([]);
  const [cat, setCat] = useState("all");
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState<Esc | null>(null);

  async function load() {
    const sb = getFactorySupabase();
    const { data } = await sb.from("ceo_escalations").select("*").order("created_at", { ascending: false });
    const { data: comps } = await sb.from("companies").select("id, name");
    const nameById = new Map<string, string>();
    for (const c of (comps ?? []) as Array<{ id: string; name: string }>) nameById.set(c.id, c.name);
    setRows(((data ?? []) as Esc[]).map((r) => ({ ...r, related_company_name: r.related_company_id ? nameById.get(r.related_company_id) : undefined })));
  }
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => rows.filter((r) => (cat === "all" || r.category === cat) && (status === "all" || r.status === status)), [rows, cat, status]);

  const counts = useMemo(() => ({
    open: rows.filter((r) => r.status === "open").length,
    acknowledged: rows.filter((r) => r.status === "acknowledged").length,
    decided: rows.filter((r) => r.status === "decided").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
    deferred: rows.filter((r) => r.status === "deferred").length,
  }), [rows]);

  return (
    <div style={{ padding: 24, display: "grid", gap: 20 }}>
      <header>
        <h1 style={{ margin: 0 }}>Escalations from Product</h1>
        <p style={{ color: "#9ca3af", margin: "4px 0 0", fontSize: 13 }}>Everything Sanya has raised for your decision.</p>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
        <Stat label="Open" value={counts.open} color="#f59e0b" />
        <Stat label="Acknowledged" value={counts.acknowledged} color="#eab308" />
        <Stat label="Decided" value={counts.decided} color="#10b981" />
        <Stat label="Rejected" value={counts.rejected} color="#ef4444" />
        <Stat label="Deferred" value={counts.deferred} color="#6366f1" />
      </section>

      <section style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <label style={{ color: "#6b7280", fontSize: 12 }}>Category</label>
        <select value={cat} onChange={(e) => setCat(e.target.value)} style={selectStyle}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label style={{ color: "#6b7280", fontSize: 12, marginLeft: 8 }}>Status</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={selectStyle}>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span style={{ marginLeft: "auto", color: "#9ca3af", fontSize: 12 }}>{filtered.length} of {rows.length}</span>
      </section>

      <table style={{ width: "100%", borderCollapse: "collapse", background: "white", color: "#111827", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
        <thead>
          <tr style={{ background: "#f9fafb", color: "#6b7280", fontSize: 12, textAlign: "left" }}>
            <th style={{ padding: 10 }}>Title</th>
            <th style={{ padding: 10 }}>Category</th>
            <th style={{ padding: 10 }}>Urgency</th>
            <th style={{ padding: 10 }}>Customer</th>
            <th style={{ padding: 10 }}>Status</th>
            <th style={{ padding: 10 }}>Raised</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => {
            const c = CAT_COLOR[r.category] ?? CAT_COLOR.other;
            const s = STATUS_COLOR[r.status] ?? STATUS_COLOR.open;
            return (
              <tr key={r.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                <td style={{ padding: 10, fontWeight: 500 }}>{r.title}</td>
                <td style={{ padding: 10 }}>
                  <span style={{ background: c.bg, color: c.fg, padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{r.category}</span>
                </td>
                <td style={{ padding: 10, fontSize: 12 }}>{r.urgency}</td>
                <td style={{ padding: 10, color: "#6b7280", fontSize: 12 }}>{r.related_company_name ?? "—"}</td>
                <td style={{ padding: 10 }}>
                  <span style={{ background: s.bg, color: s.fg, padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 600 }}>{r.status}</span>
                </td>
                <td style={{ padding: 10, color: "#9ca3af", fontSize: 11 }}>{new Date(r.created_at).toLocaleDateString()}</td>
                <td style={{ padding: 10, textAlign: "right" }}>
                  <button type="button" onClick={() => setOpen(r)} style={{ padding: "4px 10px", background: "#2563eb", color: "white", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>
                    Open →
                  </button>
                </td>
              </tr>
            );
          })}
          {filtered.length === 0 ? (
            <tr><td colSpan={7} style={{ padding: 16, textAlign: "center", color: "#9ca3af" }}>None.</td></tr>
          ) : null}
        </tbody>
      </table>

      <EscalationDecisionModal
        open={open !== null}
        escalation={open}
        userId={userId}
        onClose={() => setOpen(null)}
        onDecided={() => void load()}
      />
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: "white", color: "#111827", border: "1px solid #e5e7eb", borderRadius: 12, padding: 14 }}>
      <div style={{ color: "#6b7280", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, marginTop: 2, color }}>{value}</div>
    </div>
  );
}
