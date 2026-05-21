// Modal for Sanya/Product to raise something to the CEO for approval.

import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { getFactorySupabase } from "../lib/factorySupabase";
import { selectStyle, inputStyle } from "../lib/ui-styles";

const CATEGORIES = [
  { value: "customer", label: "Customer-specific" },
  { value: "contract", label: "Contract / pricing" },
  { value: "strategic", label: "Strategic" },
  { value: "budget", label: "Budget / spend" },
  { value: "hire", label: "Hiring" },
  { value: "vendor", label: "Vendor / tool" },
  { value: "other", label: "Other" },
];

const URGENCIES = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

interface Company { id: string; name: string }

export function RaiseToCeoPopup({
  open,
  onClose,
  userId,
  presetCompanyId = null,
  presetCategory = "other",
  onRaised,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  presetCompanyId?: string | null;
  presetCategory?: string;
  onRaised?: () => void;
}) {
  const [category, setCategory] = useState(presetCategory);
  const [urgency, setUrgency] = useState("normal");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [companyId, setCompanyId] = useState<string | null>(presetCompanyId);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");

  useEffect(() => {
    if (!open) return;
    setCategory(presetCategory);
    setCompanyId(presetCompanyId);
    setStatus("idle");
    void (async () => {
      const sb = getFactorySupabase();
      const { data } = await sb.from("companies").select("id, name").order("name", { ascending: true });
      setCompanies((data ?? []) as Company[]);
    })();
  }, [open, presetCompanyId, presetCategory]);

  async function submit() {
    if (!title.trim() || !body.trim()) return;
    setStatus("submitting");
    const sb = getFactorySupabase();
    await sb.from("ceo_escalations").insert({
      raised_by: userId,
      title: title.trim(),
      body: body.trim(),
      category,
      urgency,
      related_company_id: companyId,
      status: "open",
    });
    await sb.from("notifications").insert({
      recipient_user_id: userId,
      kind: "ceo-escalation-raised",
      severity: urgency === "urgent" ? "error" : urgency === "high" ? "warning" : "info",
      title: `Sanya raised an item for your decision: ${title}`,
      body: body.slice(0, 200),
      related_company_id: companyId,
    });
    setStatus("done");
    setTitle("");
    setBody("");
    onRaised?.();
  }

  if (status === "done") {
    return (
      <Modal open={open} onClose={onClose} title="Sent to CEO">
        <p style={{ margin: 0 }}>✓ Ouadie will see this in his Decision Queue. You'll get a notification when he decides.</p>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Raise to CEO for decision" width={680}>
      <div style={{ display: "grid", gap: 12 }}>
        <Row label="What kind?">
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={selectStyle}>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Row>
        <Row label="Urgency">
          <select value={urgency} onChange={(e) => setUrgency(e.target.value)} style={selectStyle}>
            {URGENCIES.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
        </Row>
        <Row label="Title">
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="One-line summary" style={inputStyle} />
        </Row>
        <Row label="Body">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="Why does Ouadie need to decide this? Give him the context + your recommendation." style={{ ...inputStyle, fontFamily: "inherit" }} />
        </Row>
        <Row label="Tie to a customer? (optional)">
          <select value={companyId ?? ""} onChange={(e) => setCompanyId(e.target.value || null)} style={selectStyle}>
            <option value="">— none —</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Row>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button type="button" onClick={() => void submit()} disabled={!title.trim() || !body.trim() || status === "submitting"} className="btn" style={{ padding: "8px 18px" }}>
            {status === "submitting" ? "Sending…" : "Send to CEO"}
          </button>
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
        </div>
      </div>
    </Modal>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", color: "#6b7280", fontSize: 12, marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}
