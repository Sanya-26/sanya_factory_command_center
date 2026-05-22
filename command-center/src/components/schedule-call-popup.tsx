// ScheduleCallPopup — Sanya (or any ops_user) multi-selects from REAL open
// slots derived from her saved calendar availability, then queues an email
// to the customer with a unique link to pick one.
//
// Phase 9 (2026-05-22): slots now come from /functions/v1/calendar-list-slots
// (in-house calendar v1). The customer-side picker URL hits
// /functions/v1/calendar-book-slot which writes the real booking. There is
// no longer a "mock provider" path on the customer-confirmation side.
//
// If the user hasn't set availability yet (/#calendar/availability), the
// list of slots will be empty — the popup surfaces a help banner pointing
// at that page.

import { useEffect, useState } from "react";
import { Modal } from "./Modal";
import { getFactorySupabase, isMockBackend } from "../lib/factorySupabase";

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
  const [slots, setSlots] = useState<Array<{ label: string; iso: string; endIso: string }>>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsHint, setSlotsHint] = useState<string | null>(null);

  // Load open slots from the in-house calendar when the popup opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setSlotsLoading(true);
      setSlotsHint(null);
      try {
        const sb = getFactorySupabase();
        const { data: session } = await sb.auth.getSession();
        const jwt = session?.session?.access_token;
        const userId = session?.session?.user?.id;
        if (!jwt || !userId) {
          if (!cancelled) {
            setSlotsHint("Sign in to load your calendar.");
            setSlots([]);
          }
          return;
        }
        const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
        const now = new Date();
        // Window: next 14 days starting tomorrow at 00:00 local.
        const start = new Date(now.getTime() + 86_400_000);
        const end = new Date(now.getTime() + 14 * 86_400_000);
        const res = await fetch(`${base}/functions/v1/calendar-list-slots`, {
          method: "POST",
          headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" },
          body: JSON.stringify({
            owner_user_id: userId,
            range_start: start.toISOString(),
            range_end: end.toISOString(),
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        const json = await res.json() as { slots?: Array<{ starts_at: string; ends_at: string }>; note?: string };
        if (cancelled) return;
        if (!json.slots || json.slots.length === 0) {
          setSlots([]);
          setSlotsHint(
            json.note?.includes("no active availability")
              ? "You haven't set your availability yet — go to Calendar → My availability."
              : "No open slots in the next 14 days. Check your availability or try a different week."
          );
          return;
        }
        setSlots(json.slots.map((s) => ({
          iso: s.starts_at,
          endIso: s.ends_at,
          label: new Date(s.starts_at).toLocaleString(undefined, {
            weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
          }),
        })));
      } catch (e) {
        if (!cancelled) {
          setSlotsHint(`Couldn't load slots: ${e instanceof Error ? e.message : String(e)}`);
          setSlots([]);
        }
      } finally {
        if (!cancelled) setSlotsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

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
      const { data: session } = await sb.auth.getSession();
      const offeredBy = session?.session?.user?.id ?? null;
      const token = randomToken();
      // Build slot pairs from the loaded slots (start_iso + end_iso) keyed by
      // the user's selections. The API gave us the canonical end, so use that
      // instead of computing start+duration ourselves.
      const slotMap = new Map(slots.map((s) => [s.iso, s.endIso]));
      const slotsArr = Array.from(selected).sort().map((iso) => ({
        start_iso: iso,
        end_iso: slotMap.get(iso) ?? new Date(new Date(iso).getTime() + duration * 60_000).toISOString(),
      }));
      const { data: offerRow, error: offErr } = await sb.from("call_slot_offers").insert({
        company_id: companyId,
        offered_by: offeredBy,
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
    // The pickerUrl looks like https://welcome.aubos.ai/pick/<token>; extract the token.
    const token = pickerUrl.split("/").pop() ?? "";
    if (token.length < 16) {
      alert("Picker token missing or malformed — can't simulate.");
      return;
    }
    try {
      const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
      const res = await fetch(`${base}/functions/v1/calendar-book-slot`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ picker_token: token, picked_slot_index: 0 }),
      });
      const json = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) {
        alert(`✗ Simulate failed: HTTP ${res.status} — ${JSON.stringify(json).slice(0, 200)}`);
        return;
      }
      alert(`✓ Customer picked the first slot.\nBooking id: ${(json as { booking_id?: string }).booking_id ?? "(missing)"}\nThis call will now show on your bookings page.`);
      onClose();
    } catch (e) {
      alert(`✗ Simulate failed: ${e instanceof Error ? e.message : String(e)}`);
    }
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
          {slotsLoading ? (
            <div style={{ padding: 16, border: "1px solid #e5e7eb", borderRadius: 6, color: "#6b7280", fontSize: 13, textAlign: "center" }}>
              Loading your available slots…
            </div>
          ) : slots.length === 0 ? (
            <div style={{ padding: 12, background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a", borderRadius: 6, fontSize: 13 }}>
              {slotsHint ?? "No slots available."}
            </div>
          ) : (
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
          )}
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
