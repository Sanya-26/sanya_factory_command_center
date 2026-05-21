// CEO-side: queue of escalations raised by Sanya.

import { useEffect, useState } from "react";
import { getFactorySupabase } from "../lib/factorySupabase";
import { EscalationDecisionModal } from "./EscalationDecisionModal";

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

const CAT_COLOR: Record<string, { bg: string; fg: string }> = {
  customer: { bg: "#dbeafe", fg: "#1e40af" },
  contract: { bg: "#fce7f3", fg: "#9d174d" },
  strategic: { bg: "#ede9fe", fg: "#5b21b6" },
  budget: { bg: "#fef3c7", fg: "#92400e" },
  hire: { bg: "#d1fae5", fg: "#065f46" },
  vendor: { bg: "#fee2e2", fg: "#991b1b" },
  other: { bg: "#f3f4f6", fg: "#374151" },
};
const URGENCY_RANK: Record<string, number> = { urgent: 4, high: 3, normal: 2, low: 1 };
const URGENCY_COLOR: Record<string, string> = { urgent: "#ef4444", high: "#f59e0b", normal: "#3b82f6", low: "#9ca3af" };

function relTime(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

export function CeoEscalationQueue({ userId, onRefresh }: { userId: string; onRefresh?: () => void }) {
  const [rows, setRows] = useState<Esc[]>([]);
  const [open, setOpen] = useState<Esc | null>(null);

  async function load() {
    const sb = getFactorySupabase();
    const { data } = await sb.from("ceo_escalations").select("*").in("status", ["open", "acknowledged"]);
    const { data: comps } = await sb.from("companies").select("id, name");
    const nameById = new Map<string, string>();
    for (const c of (comps ?? []) as Array<{ id: string; name: string }>) nameById.set(c.id, c.name);
    const list = ((data ?? []) as Esc[]).map((r) => ({ ...r, related_company_name: r.related_company_id ? nameById.get(r.related_company_id) : undefined }));
    list.sort((a, b) => (URGENCY_RANK[b.urgency] ?? 0) - (URGENCY_RANK[a.urgency] ?? 0) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setRows(list);
  }
  useEffect(() => { void load(); }, []);

  return (
    <div>
      {rows.length === 0 ? (
        <p style={{ color: "#10b981", margin: 0, fontWeight: 500, fontSize: 13 }}>No items raised by Sanya right now.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {rows.map((r) => {
            const cat = CAT_COLOR[r.category] ?? CAT_COLOR.other;
            return (
              <li
                key={r.id}
                style={{ display: "grid", gridTemplateColumns: "10px 1fr auto", gap: 12, alignItems: "flex-start", padding: "12px 4px", borderTop: "1px solid #f3f4f6" }}
              >
                <span style={{ width: 10, height: 10, borderRadius: 999, background: URGENCY_COLOR[r.urgency] ?? "#9ca3af", marginTop: 5 }} title={r.urgency} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ background: cat.bg, color: cat.fg, padding: "2px 8px", borderRadius: 999, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{r.category}</span>
                    {r.status === "acknowledged" ? (
                      <span style={{ background: "#fef9c3", color: "#854d0e", padding: "2px 8px", borderRadius: 999, fontSize: 10 }}>acknowledged</span>
                    ) : null}
                    {r.related_company_name ? (
                      <span style={{ color: "#6b7280", fontSize: 11 }}>· {r.related_company_name}</span>
                    ) : null}
                    <span style={{ marginLeft: "auto", color: "#9ca3af", fontSize: 11 }}>{relTime(r.created_at)}</span>
                  </div>
                  <div style={{ fontWeight: 600, marginTop: 4, color: "#111827" }}>{r.title}</div>
                  <div style={{ color: "#6b7280", fontSize: 12, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.body.slice(0, 110)}{r.body.length > 110 ? "…" : ""}
                  </div>
                </div>
                <button type="button" onClick={() => setOpen(r)} style={{ padding: "5px 12px", background: "#2563eb", color: "white", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
                  Open →
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <EscalationDecisionModal
        open={open !== null}
        escalation={open}
        userId={userId}
        onClose={() => setOpen(null)}
        onDecided={() => { void load(); onRefresh?.(); }}
      />
    </div>
  );
}
