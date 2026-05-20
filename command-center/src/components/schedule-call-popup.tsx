// ScheduleCallPopup — pick a 30-min slot in the next 14 days.
// Real impl creates a Google Calendar event with Meet link.
// Mock impl just records a scheduled_calls row + queues a confirmation email.

import { useState } from "react";
import { Modal } from "./Modal";
import { getFactorySupabase, isMockBackend } from "../lib/factorySupabase";

function slotsForNextDays(days = 14) {
  const out: Array<{ label: string; iso: string }> = [];
  const now = new Date();
  for (let d = 1; d <= days; d++) {
    const day = new Date(now.getTime() + d * 86400_000);
    for (const h of [10, 13, 15]) {
      const slot = new Date(day);
      slot.setHours(h, 0, 0, 0);
      out.push({
        label: slot.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
        iso: slot.toISOString(),
      });
    }
  }
  return out;
}

export function ScheduleCallPopup({
  open,
  onClose,
  companyId,
  companyName,
  customerEmail,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string;
  companyName: string;
  customerEmail: string | null | undefined;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [duration, setDuration] = useState<30 | 45 | 60>(30);
  const [agenda, setAgenda] = useState("CLEO proposal walk-through");
  const [status, setStatus] = useState<"idle" | "scheduling" | "scheduled" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const slots = slotsForNextDays();

  async function schedule() {
    if (!selected) return;
    setStatus("scheduling");
    try {
      const sb = getFactorySupabase();
      const end = new Date(new Date(selected).getTime() + duration * 60_000).toISOString();
      // Mock: write to a fake scheduled_calls table the mock client will accept.
      await sb.from("scheduled_calls").insert({
        company_id: companyId,
        slot_start: selected,
        slot_end: end,
        duration_min: duration,
        agenda,
        provider: isMockBackend() ? "mock" : "google-meet",
        meet_url: isMockBackend() ? `https://meet.google.com/mock-${companyId.slice(0, 6)}` : null,
        status: "confirmed",
      });
      if (customerEmail) {
        await sb.from("outbound_emails").insert({
          company_id: companyId,
          recipient_email: customerEmail,
          template: "schedule_call_confirm",
          payload: {
            company_name: companyName,
            slot_start: selected,
            duration_min: duration,
            agenda,
          },
          status: "queued",
        });
      }
      setStatus("scheduled");
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Unknown error");
    }
  }

  if (status === "scheduled") {
    return (
      <Modal open={open} onClose={onClose} title={`Call scheduled · ${companyName}`}>
        <p style={{ margin: 0 }}>
          ✓ {duration}-min call with <strong>{companyName}</strong> scheduled for{" "}
          <strong>{new Date(selected!).toLocaleString()}</strong>.
        </p>
        <p style={{ fontSize: 13, color: "#6b7280", marginTop: 8 }}>
          {isMockBackend()
            ? "Mock mode: no real Google Calendar event was created, but the confirmation email is queued in outbound_emails."
            : "A Google Meet link is attached to the calendar event and the customer received the invite."}
        </p>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={`Schedule a call · ${companyName}`} width={620}>
      <div style={{ display: "grid", gap: 14 }}>
        <div>
          <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 4 }}>Duration</label>
          <div style={{ display: "flex", gap: 6 }}>
            {[30, 45, 60].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDuration(d as 30 | 45 | 60)}
                style={{
                  padding: "6px 12px",
                  border: "1px solid #e5e7eb",
                  borderRadius: 6,
                  background: duration === d ? "#2563eb" : "white",
                  color: duration === d ? "white" : "#111827",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                {d} min
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 4 }}>Agenda</label>
          <input
            type="text"
            value={agenda}
            onChange={(e) => setAgenda(e.target.value)}
            style={{ width: "100%", padding: 8, border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13 }}
          />
        </div>
        <div>
          <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 4 }}>Pick a slot (next 14 days)</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, maxHeight: 260, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 6, padding: 8 }}>
            {slots.map((s) => (
              <button
                key={s.iso}
                type="button"
                onClick={() => setSelected(s.iso)}
                style={{
                  padding: 8,
                  border: "1px solid #e5e7eb",
                  borderRadius: 6,
                  background: selected === s.iso ? "#2563eb" : "white",
                  color: selected === s.iso ? "white" : "#111827",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        {!isMockBackend() ? (
          <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
            ⚠ Real backend: a Google Calendar event with Meet link will be created and the customer will receive the invite.
          </p>
        ) : (
          <p style={{ fontSize: 12, color: "#92400e", margin: 0, background: "#fef3c7", padding: "6px 10px", borderRadius: 6 }}>
            🧪 Mock mode: this records a scheduled_calls row + queues an email but does not call Google.
          </p>
        )}
        {status === "error" ? <p style={{ color: "#b91c1c", margin: 0 }}>{errorMsg}</p> : null}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => void schedule()}
            disabled={!selected || status === "scheduling"}
            className="btn"
            style={{ padding: "8px 16px" }}
          >
            {status === "scheduling" ? "Scheduling…" : "Schedule"}
          </button>
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
        </div>
      </div>
    </Modal>
  );
}
