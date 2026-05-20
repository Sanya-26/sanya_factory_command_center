// ScheduleCallPopup — Sanya multi-selects 3+ slots that work for her, then
// queues an email to the customer with a unique link to pick one.
// Real backend would create call_slot_offers + (on customer pick) a
// scheduled_calls row with a real Google Meet link.
// Mock backend writes call_slot_offers + an outbound_emails row.

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

function randomToken() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [duration, setDuration] = useState<30 | 45 | 60>(30);
  const [agenda, setAgenda] = useState("CLEO proposal walk-through");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pickerUrl, setPickerUrl] = useState<string | null>(null);
  const slots = slotsForNextDays();

  function toggle(iso: string) {
    const next = new Set(selected);
    if (next.has(iso)) next.delete(iso);
    else next.add(iso);
    setSelected(next);
  }

  async function offer() {
    if (selected.size < 1) return;
    setStatus("sending");
    try {
      const sb = getFactorySupabase();
      const token = randomToken();
      const slotsArr = Array.from(selected).sort().map((iso) => ({
        start_iso: iso,
        end_iso: new Date(new Date(iso).getTime() + duration * 60_000).toISOString(),
      }));
      const { data: offerRow, error: offErr } = await sb.from("call_slot_offers").insert({
        company_id: companyId,
        offered_by: null,
        agenda,
        duration_min: duration,
        slots: slotsArr,
        picker_token: token,
      }).select("id").single();
      if (offErr) throw offErr;
      const url = `https://welcome.aubos.ai/pick/${token}`;
      setPickerUrl(url);
      if (customerEmail) {
        await sb.from("outbound_emails").insert({
          company_id: companyId,
          recipient_email: customerEmail,
          template: "schedule_call_offer",
          payload: {
            company_name: companyName,
            picker_url: url,
            duration_min: duration,
            agenda,
            slot_count: slotsArr.length,
            offer_id: offerRow?.id,
          },
          status: "queued",
        });
      }
      setStatus("sent");
    } catch (e) {
      setStatus("error");
      setErrorMsg(e instanceof Error ? e.message : "Unknown error");
    }
  }

  async function simulateClientPick() {
    if (!pickerUrl || selected.size === 0) return;
    const sb = getFactorySupabase();
    const slotsArr = Array.from(selected).sort();
    const chosen = slotsArr[0];
    const meet = `https://meet.google.com/mock-${randomToken().slice(0, 11)}`;
    await sb.from("scheduled_calls").insert({
      company_id: companyId,
      offer_id: null,
      slot_start: chosen,
      slot_end: new Date(new Date(chosen).getTime() + duration * 60_000).toISOString(),
      agenda,
      provider: "mock",
      meet_url: meet,
    });
    if (customerEmail) {
      await sb.from("outbound_emails").insert({
        company_id: companyId,
        recipient_email: customerEmail,
        template: "schedule_call_confirm",
        payload: { company_name: companyName, slot_start: chosen, meet_url: meet },
        status: "queued",
      });
    }
    alert(`✓ Mock customer picked the first slot.\nMeet link: ${meet}\nThis call will now show on the Calendar widget.`);
    onClose();
  }

  if (status === "sent" && pickerUrl) {
    return (
      <Modal open={open} onClose={onClose} title={`Slot offer sent · ${companyName}`}>
        <div style={{ display: "grid", gap: 12 }}>
          <p style={{ margin: 0 }}>
            ✓ Emailed <strong>{companyName}</strong> a link to pick from your{" "}
            <strong>{selected.size} slot{selected.size === 1 ? "" : "s"}</strong>.
          </p>
          <div style={{ padding: 12, background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12, fontFamily: "monospace" }}>
            {pickerUrl}
          </div>
          <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
            When the customer picks a slot, a {isMockBackend() ? "mock " : ""}Google Meet event is created and added to your "This week's customer calls" panel.
          </p>
          {isMockBackend() ? (
            <div style={{ padding: 10, background: "#fef3c7", color: "#92400e", borderRadius: 6, fontSize: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span>🧪 Mock mode: no real email/Meet is created. Simulate the customer picking?</span>
              <button type="button" onClick={() => void simulateClientPick()} style={{ padding: "6px 12px", background: "#92400e", color: "white", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, whiteSpace: "nowrap" }}>
                Simulate client picks slot 1
              </button>
            </div>
          ) : null}
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={`Offer call slots · ${companyName}`} width={640}>
      <div style={{ display: "grid", gap: 14 }}>
        <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
          Pick 3+ slots that work for you. We'll email <strong>{customerEmail ?? "the customer"}</strong> a link to choose one.
        </p>

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
          <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 4 }}>
            Pick slots (multi-select) — {selected.size} selected
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, maxHeight: 280, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 6, padding: 8 }}>
            {slots.map((s) => {
              const isSel = selected.has(s.iso);
              return (
                <button
                  key={s.iso}
                  type="button"
                  onClick={() => toggle(s.iso)}
                  style={{
                    padding: 8,
                    border: "1px solid #e5e7eb",
                    borderRadius: 6,
                    background: isSel ? "#2563eb" : "white",
                    color: isSel ? "white" : "#111827",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  {isSel ? "✓ " : ""}{s.label}
                </button>
              );
            })}
          </div>
        </div>

        {isMockBackend() ? (
          <p style={{ fontSize: 12, color: "#92400e", margin: 0, background: "#fef3c7", padding: "6px 10px", borderRadius: 6 }}>
            🧪 Mock mode: records a call_slot_offers row + queues a schedule_call_offer email; no real send.
          </p>
        ) : (
          <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
            On submit: customer gets an email with a public link to pick one slot. We'll then create the Google Meet event.
          </p>
        )}

        {status === "error" ? <p style={{ color: "#b91c1c", margin: 0 }}>{errorMsg}</p> : null}

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => void offer()}
            disabled={selected.size === 0 || status === "sending"}
            className="btn"
            style={{ padding: "8px 16px" }}
          >
            {status === "sending" ? "Sending…" : `Send offer (${selected.size} slot${selected.size === 1 ? "" : "s"})`}
          </button>
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
        </div>
      </div>
    </Modal>
  );
}
