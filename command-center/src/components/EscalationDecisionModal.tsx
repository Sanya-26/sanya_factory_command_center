// CEO-side: open an escalation, see full context, decide.

import { useState } from "react";
import { Modal } from "./Modal";
import { getFactorySupabase } from "../lib/factorySupabase";

interface Escalation {
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

const CAT_LABEL: Record<string, string> = { customer: "Customer", contract: "Contract", strategic: "Strategic", budget: "Budget", hire: "Hiring", vendor: "Vendor", other: "Other" };

export function EscalationDecisionModal({
  open,
  onClose,
  escalation,
  userId,
  onDecided,
}: {
  open: boolean;
  onClose: () => void;
  escalation: Escalation | null;
  userId: string;
  onDecided?: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  if (!escalation) return null;

  async function decide(status: string, decision: string | null, requireNotes: boolean) {
    if (requireNotes && !notes.trim()) {
      alert("Please give Sanya a reason in the notes.");
      return;
    }
    setBusy(true);
    const sb = getFactorySupabase();
    await sb.from("ceo_escalations").update({
      status,
      decision,
      decision_notes: notes.trim() || null,
      decided_by: userId,
      decided_at: status === "acknowledged" ? null : new Date().toISOString(),
    }).eq("id", escalation!.id);
    await sb.from("notifications").insert({
      recipient_user_id: userId,
      kind: "escalation-decided",
      severity: "info",
      title: `Ouadie ${status === "decided" ? "decided" : status}: ${escalation!.title}`,
      body: notes.trim() || null,
    });
    setBusy(false);
    setNotes("");
    onDecided?.();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={escalation.title} width={720}>
      <div style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <UrgencyDot urgency={escalation.urgency} />
          <span style={{ background: "#f3f4f6", color: "#374151", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 600 }}>
            {CAT_LABEL[escalation.category] ?? escalation.category}
          </span>
          {escalation.related_company_name ? (
            <span style={{ color: "#6b7280", fontSize: 12 }}>· {escalation.related_company_name}</span>
          ) : null}
          <span style={{ color: "#9ca3af", fontSize: 11, marginLeft: "auto" }}>
            Raised {new Date(escalation.created_at).toLocaleDateString()} by Sanya
          </span>
        </div>

        <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: 14, fontSize: 14, lineHeight: 1.55, color: "#1f2937", whiteSpace: "pre-wrap" }}>
          {escalation.body}
        </div>

        <div>
          <label style={{ display: "block", color: "#6b7280", fontSize: 12, marginBottom: 4 }}>Notes for Sanya (optional, required if rejecting)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Give Sanya your reasoning so she knows how to proceed."
            style={{ width: "100%", padding: 10, border: "1px solid #d1d5db", borderRadius: 6, fontSize: 13, color: "#111827", fontFamily: "inherit" }}
          />
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={() => void decide("decided", "approved", false)} disabled={busy} style={{ padding: "8px 16px", background: "#10b981", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>✓ Approve</button>
          <button type="button" onClick={() => void decide("rejected", "rejected", true)} disabled={busy} style={{ padding: "8px 16px", background: "#ef4444", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>✕ Reject</button>
          <button type="button" onClick={() => void decide("deferred", null, false)} disabled={busy} style={{ padding: "8px 16px", background: "#f59e0b", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>⏸ Defer</button>
          <button type="button" onClick={() => void decide("acknowledged", null, false)} disabled={busy} className="btn-ghost" style={{ padding: "8px 16px" }}>Acknowledge only</button>
        </div>
      </div>
    </Modal>
  );
}

const URGENCY_DOT: Record<string, string> = { low: "#9ca3af", normal: "#3b82f6", high: "#f59e0b", urgent: "#ef4444" };

function UrgencyDot({ urgency }: { urgency: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "#6b7280" }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: URGENCY_DOT[urgency] ?? "#9ca3af" }} />
      {urgency}
    </span>
  );
}
