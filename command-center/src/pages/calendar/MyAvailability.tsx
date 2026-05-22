// MyAvailability — per-user calendar v1 setup page.
// Route: /#calendar/availability
// Reads / writes the calendar_availabilities row for the current user.
//
// v1 scope:
//   • 7-row weekly grid (Mon-Sun) with start + end times per day
//   • toggle "unavailable this day"
//   • slot_duration_minutes, buffer_minutes, advance_notice_hours, booking_window_days
//   • is_active toggle
//   • timezone dropdown (defaults to browser timezone)
//
// Future: multiple named profiles, recurring exceptions, holiday calendar.

import { useEffect, useMemo, useState } from "react";
import { getFactorySupabase } from "../../lib/factorySupabase";
import { inputStyle, selectStyle } from "../../lib/ui-styles";
import type { CalendarAvailability, CalendarWeeklyRule } from "../../lib/calendar/types";

const DAYS = [
  { weekday: 1, label: "Monday" },
  { weekday: 2, label: "Tuesday" },
  { weekday: 3, label: "Wednesday" },
  { weekday: 4, label: "Thursday" },
  { weekday: 5, label: "Friday" },
  { weekday: 6, label: "Saturday" },
  { weekday: 7, label: "Sunday" },
] as const;

// Curated short list of IANA timezones. The Intl spec doesn't expose a list
// across all browsers, so we hardcode the common ones. A "(other)" option
// lets the user type any IANA name.
const COMMON_TZ = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC",
];

interface DayState {
  weekday: 1|2|3|4|5|6|7;
  enabled: boolean;
  start: string;
  end: string;
}

const defaultDays: DayState[] = DAYS.map((d) => ({
  weekday: d.weekday,
  enabled: d.weekday >= 1 && d.weekday <= 5,
  start: "09:00",
  end: "17:00",
}));

function browserTz(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "UTC"; }
}

export function MyAvailabilityPage({ userId }: { userId: string }): JSX.Element {
  const [rowId, setRowId] = useState<string | null>(null);
  const [tz, setTz] = useState<string>(browserTz());
  const [tzCustom, setTzCustom] = useState<string>("");
  const [days, setDays] = useState<DayState[]>(defaultDays);
  const [slotDuration, setSlotDuration] = useState<number>(30);
  const [bufferMin, setBufferMin] = useState<number>(0);
  const [advanceHours, setAdvanceHours] = useState<number>(2);
  const [windowDays, setWindowDays] = useState<number>(14);
  const [isActive, setIsActive] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load existing row
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = getFactorySupabase();
      const { data, error: e } = await sb
        .from("calendar_availabilities")
        .select("*")
        .eq("owner_user_id", userId)
        .eq("is_active", true)
        .maybeSingle();
      if (cancelled) return;
      if (e) { setError(e.message); setLoading(false); return; }
      if (data) {
        const row = data as unknown as CalendarAvailability & { id: string };
        setRowId(row.id);
        setTz(row.timezone);
        setSlotDuration(row.slot_duration_minutes);
        setBufferMin(row.buffer_minutes);
        setAdvanceHours(row.advance_notice_hours);
        setWindowDays(row.booking_window_days);
        setIsActive(row.is_active);
        const ruleByWeekday = new Map<number, CalendarWeeklyRule>();
        for (const r of row.weekly_rules ?? []) ruleByWeekday.set(r.weekday, r);
        setDays(DAYS.map((d) => {
          const r = ruleByWeekday.get(d.weekday);
          return {
            weekday: d.weekday,
            enabled: !!r,
            start: r?.start ?? "09:00",
            end: r?.end ?? "17:00",
          };
        }));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const effectiveTz = useMemo(() => (tz === "__custom__" ? tzCustom.trim() : tz), [tz, tzCustom]);

  async function save() {
    setSaving(true);
    setError(null);
    setToast(null);
    try {
      if (!effectiveTz) throw new Error("timezone is required");
      const weekly_rules: CalendarWeeklyRule[] = days
        .filter((d) => d.enabled)
        .map((d) => ({ weekday: d.weekday, start: d.start, end: d.end }));
      if (weekly_rules.length === 0) throw new Error("at least one day must be enabled");
      // Basic sanity: end > start per row.
      for (const r of weekly_rules) {
        if (r.end <= r.start) throw new Error(`Day ${r.weekday}: end time must be after start time`);
      }
      const sb = getFactorySupabase();
      const payload = {
        owner_user_id: userId,
        timezone: effectiveTz,
        weekly_rules,
        slot_duration_minutes: slotDuration,
        buffer_minutes: bufferMin,
        advance_notice_hours: advanceHours,
        booking_window_days: windowDays,
        is_active: isActive,
      };
      if (rowId) {
        const { error: e } = await sb.from("calendar_availabilities").update(payload).eq("id", rowId);
        if (e) throw e;
      } else {
        const { data, error: e } = await sb.from("calendar_availabilities").insert(payload).select("id").single();
        if (e) throw e;
        setRowId((data as { id: string }).id);
      }
      setToast("Saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;

  return (
    <div style={{ padding: 24, display: "grid", gap: 20, maxWidth: 760 }}>
      <header>
        <h1 style={{ margin: 0 }}>My availability</h1>
        <p style={{ color: "#9ca3af", margin: "4px 0 0", fontSize: 13 }}>
          Define when customers can book a call with you. Used by the in-house
          calendar booking flow on customer detail pages.
        </p>
      </header>

      <section style={{ background: "white", color: "#111827", border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, display: "grid", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 500 }}>
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} style={{ marginRight: 8 }} />
            Calendar is active (accepting bookings)
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 4 }}>Timezone</label>
            <select value={COMMON_TZ.includes(tz) ? tz : "__custom__"} onChange={(e) => { setTz(e.target.value); if (e.target.value !== "__custom__") setTzCustom(""); }} style={selectStyle}>
              {COMMON_TZ.map((z) => <option key={z} value={z}>{z}</option>)}
              <option value="__custom__">Other (type IANA name)</option>
            </select>
            {tz === "__custom__" ? (
              <input type="text" placeholder="e.g. Africa/Lagos" value={tzCustom} onChange={(e) => setTzCustom(e.target.value)} style={{ ...inputStyle, marginTop: 6 }} />
            ) : null}
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 4 }}>Slot duration</label>
            <select value={slotDuration} onChange={(e) => setSlotDuration(Number(e.target.value))} style={selectStyle}>
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
              <option value={45}>45 min</option>
              <option value={60}>60 min</option>
            </select>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 4 }}>Buffer between slots (min)</label>
            <input type="number" min={0} max={240} value={bufferMin} onChange={(e) => setBufferMin(Math.max(0, Number(e.target.value)))} style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 4 }}>Advance notice (hours)</label>
            <input type="number" min={0} max={720} value={advanceHours} onChange={(e) => setAdvanceHours(Math.max(0, Number(e.target.value)))} style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 4 }}>Booking window (days)</label>
            <input type="number" min={1} max={365} value={windowDays} onChange={(e) => setWindowDays(Math.max(1, Number(e.target.value)))} style={inputStyle} />
          </div>
        </div>

        <div>
          <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 6 }}>Weekly hours</label>
          <div style={{ display: "grid", gap: 6 }}>
            {days.map((d, i) => (
              <div key={d.weekday} style={{ display: "grid", gridTemplateColumns: "120px 80px 1fr 80px 1fr", gap: 8, alignItems: "center" }}>
                <label style={{ fontSize: 13 }}>
                  <input type="checkbox" checked={d.enabled} onChange={(e) => setDays(days.map((x, j) => j === i ? { ...x, enabled: e.target.checked } : x))} style={{ marginRight: 6 }} />
                  {DAYS[i].label}
                </label>
                <span style={{ fontSize: 12, color: "#9ca3af" }}>start</span>
                <input type="time" value={d.start} disabled={!d.enabled} onChange={(e) => setDays(days.map((x, j) => j === i ? { ...x, start: e.target.value } : x))} style={inputStyle} />
                <span style={{ fontSize: 12, color: "#9ca3af" }}>end</span>
                <input type="time" value={d.end} disabled={!d.enabled} onChange={(e) => setDays(days.map((x, j) => j === i ? { ...x, end: e.target.value } : x))} style={inputStyle} />
              </div>
            ))}
          </div>
        </div>

        {error ? (
          <div style={{ background: "#fee2e2", color: "#b91c1c", padding: 10, borderRadius: 6, fontSize: 13 }}>{error}</div>
        ) : null}
        {toast ? (
          <div style={{ background: "#dcfce7", color: "#166534", padding: 10, borderRadius: 6, fontSize: 13 }}>{toast}</div>
        ) : null}

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving} style={{ padding: "8px 16px" }}>
            {saving ? "Saving…" : rowId ? "Save changes" : "Create availability"}
          </button>
          {rowId ? <span style={{ color: "#9ca3af", fontSize: 12, alignSelf: "center" }}>Row {rowId.slice(0, 8)}…</span> : null}
        </div>
      </section>
    </div>
  );
}
