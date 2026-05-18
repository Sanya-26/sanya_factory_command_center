// FactorySettings — §9 Group F. Replaces the original "Coming soon" stub
// with the admin's Google Calendar / availability rules editor. Single
// surface today (no tabs); future settings concerns can graduate to tabs
// when there's a second.

import { useCallback, useEffect, useMemo, useState } from "react";
import { getFactorySupabase } from "../../lib/factorySupabase";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
type DayKey = typeof DAY_KEYS[number];

interface WorkingHours { [day: string]: { start: string; end: string } }

interface RuleRow {
  user_id: string;
  timezone: string | null;
  working_hours: WorkingHours | null;
  meeting_duration_min: number | null;
  buffer_min: number | null;
  earliest_booking_hours: number | null;
  max_horizon_days: number | null;
  google_calendar_credential_id: string | null;
  updated_at: string | null;
}

interface FormState {
  timezone: string;
  workingHours: Record<DayKey, { start: string; end: string; enabled: boolean }>;
  meetingDurationMin: number;
  bufferMin: number;
  earliestBookingHours: number;
  maxHorizonDays: number;
}

const DEFAULT_FORM: FormState = {
  timezone: typeof Intl !== "undefined"
    ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
    : "UTC",
  workingHours: {
    sun: { start: "09:00", end: "17:00", enabled: false },
    mon: { start: "09:00", end: "17:00", enabled: true },
    tue: { start: "09:00", end: "17:00", enabled: true },
    wed: { start: "09:00", end: "17:00", enabled: true },
    thu: { start: "09:00", end: "17:00", enabled: true },
    fri: { start: "09:00", end: "17:00", enabled: true },
    sat: { start: "09:00", end: "17:00", enabled: false },
  },
  meetingDurationMin: 30,
  bufferMin: 10,
  earliestBookingHours: 24,
  maxHorizonDays: 21,
};

const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CALENDAR_OAUTH_CLIENT_ID as string | undefined) ?? "";
const GOOGLE_REDIRECT_URI = `${window.location.origin}/oauth/google-calendar/callback`;
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar";

export function FactorySettingsPage(): JSX.Element {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [rule, setRule] = useState<RuleRow | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Load current admin's rule.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const sb = getFactorySupabase();
        const { data: session } = await sb.auth.getSession();
        const uid = session.session?.user?.id ?? null;
        if (!uid) throw new Error("No session.");
        if (cancelled) return;
        setUserId(uid);
        const { data, error: err } = await sb
          .from("admin_availability_rules")
          .select("user_id, timezone, working_hours, meeting_duration_min, buffer_min, earliest_booking_hours, max_horizon_days, google_calendar_credential_id, updated_at")
          .eq("user_id", uid)
          .maybeSingle();
        if (err) throw err;
        if (cancelled) return;
        setRule(data as RuleRow | null);
        if (data) setForm(ruleToForm(data as RuleRow));
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const onConnectCalendar = useCallback(() => {
    if (!GOOGLE_CLIENT_ID) {
      setError("VITE_GOOGLE_CALENDAR_OAUTH_CLIENT_ID is not configured.");
      return;
    }
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_REDIRECT_URI,
      response_type: "code",
      scope: GOOGLE_SCOPE,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
    });
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }, []);

  const onSave = useCallback(async () => {
    if (!userId) return;
    setSaving(true);
    setError(null);
    try {
      const wh: WorkingHours = {};
      for (const day of DAY_KEYS) {
        if (form.workingHours[day].enabled) {
          wh[day] = { start: form.workingHours[day].start, end: form.workingHours[day].end };
        }
      }
      const sb = getFactorySupabase();
      const { error: err } = await sb.from("admin_availability_rules").upsert({
        user_id: userId,
        timezone: form.timezone,
        working_hours: wh,
        meeting_duration_min: form.meetingDurationMin,
        buffer_min: form.bufferMin,
        earliest_booking_hours: form.earliestBookingHours,
        max_horizon_days: form.maxHorizonDays,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (err) throw err;
      setToast("Settings saved.");
      setTimeout(() => setToast(null), 2200);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [userId, form]);

  const connected = useMemo(() => Boolean(rule?.google_calendar_credential_id), [rule]);

  if (loading) {
    return (
      <div className="shell-content-narrow">
        <div className="page-header">
          <h1 className="page-title">Factory · Settings</h1>
          <p className="page-subtitle">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="shell-content-narrow settings-page">
      <div className="page-header">
        <h1 className="page-title">Factory · Settings</h1>
        <p className="page-subtitle">
          Calendar availability for customer kickoff bookings. Other settings will graduate here over time.
        </p>
      </div>

      {error ? <div className="empty" style={{ marginBottom: 16 }}>{error}</div> : null}
      {toast ? <div className="empty" style={{ marginBottom: 16, color: "var(--green)" }}>{toast}</div> : null}

      <section className="settings-section">
        <div className="settings-section-head">
          <h2>Google Calendar</h2>
          <p className="dim">Connect your calendar so customer slot picker subtracts your busy windows.</p>
        </div>
        <div className="settings-row">
          {connected ? (
            <>
              <span className="pill done"><span className="pill-dot" />connected</span>
              <button type="button" className="btn btn-ghost" onClick={onConnectCalendar}>Reconnect</button>
            </>
          ) : (
            <button type="button" className="btn btn-primary" onClick={onConnectCalendar}>
              Connect Google Calendar
            </button>
          )}
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-head">
          <h2>Working hours</h2>
          <p className="dim">Times shown to customers when they pick a kickoff slot.</p>
        </div>
        <div className="settings-working-hours">
          {DAY_KEYS.map((day) => (
            <div key={day} className="settings-day-row">
              <label className="settings-day-label">
                <input
                  type="checkbox"
                  checked={form.workingHours[day].enabled}
                  onChange={(e) => setForm((f) => ({
                    ...f,
                    workingHours: {
                      ...f.workingHours,
                      [day]: { ...f.workingHours[day], enabled: e.target.checked },
                    },
                  }))}
                />
                <span>{prettyDay(day)}</span>
              </label>
              <input
                type="time"
                value={form.workingHours[day].start}
                disabled={!form.workingHours[day].enabled}
                onChange={(e) => setForm((f) => ({
                  ...f,
                  workingHours: {
                    ...f.workingHours,
                    [day]: { ...f.workingHours[day], start: e.target.value },
                  },
                }))}
              />
              <span className="dim">→</span>
              <input
                type="time"
                value={form.workingHours[day].end}
                disabled={!form.workingHours[day].enabled}
                onChange={(e) => setForm((f) => ({
                  ...f,
                  workingHours: {
                    ...f.workingHours,
                    [day]: { ...f.workingHours[day], end: e.target.value },
                  },
                }))}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-head">
          <h2>Meeting controls</h2>
          <p className="dim">Defaults for new customer kickoffs.</p>
        </div>
        <div className="settings-grid-2col">
          <label className="settings-field">
            <span>Timezone</span>
            <input
              type="text"
              value={form.timezone}
              onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
              placeholder="America/New_York"
            />
          </label>
          <label className="settings-field">
            <span>Meeting duration (minutes)</span>
            <input
              type="number"
              min={5} max={240}
              value={form.meetingDurationMin}
              onChange={(e) => setForm((f) => ({ ...f, meetingDurationMin: Number(e.target.value) }))}
            />
          </label>
          <label className="settings-field">
            <span>Buffer between meetings (minutes)</span>
            <input
              type="number"
              min={0} max={120}
              value={form.bufferMin}
              onChange={(e) => setForm((f) => ({ ...f, bufferMin: Number(e.target.value) }))}
            />
          </label>
          <label className="settings-field">
            <span>Earliest booking lead time (hours)</span>
            <input
              type="number"
              min={0} max={336}
              value={form.earliestBookingHours}
              onChange={(e) => setForm((f) => ({ ...f, earliestBookingHours: Number(e.target.value) }))}
            />
          </label>
          <label className="settings-field">
            <span>Booking horizon (days ahead)</span>
            <input
              type="number"
              min={1} max={120}
              value={form.maxHorizonDays}
              onChange={(e) => setForm((f) => ({ ...f, maxHorizonDays: Number(e.target.value) }))}
            />
          </label>
        </div>
      </section>

      <div className="settings-actions">
        <button type="button" className="btn btn-primary" onClick={() => void onSave()} disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </button>
        {rule?.updated_at ? <span className="dim" style={{ marginLeft: 12 }}>Last saved {new Date(rule.updated_at).toLocaleString()}</span> : null}
      </div>
    </div>
  );
}

function ruleToForm(r: RuleRow): FormState {
  const wh = r.working_hours ?? {};
  const workingHours = { ...DEFAULT_FORM.workingHours };
  for (const day of DAY_KEYS) {
    const w = wh[day];
    if (w && typeof w.start === "string" && typeof w.end === "string") {
      workingHours[day] = { start: w.start, end: w.end, enabled: true };
    } else {
      workingHours[day] = { ...DEFAULT_FORM.workingHours[day], enabled: false };
    }
  }
  return {
    timezone: r.timezone || DEFAULT_FORM.timezone,
    workingHours,
    meetingDurationMin: r.meeting_duration_min ?? DEFAULT_FORM.meetingDurationMin,
    bufferMin: r.buffer_min ?? DEFAULT_FORM.bufferMin,
    earliestBookingHours: r.earliest_booking_hours ?? DEFAULT_FORM.earliestBookingHours,
    maxHorizonDays: r.max_horizon_days ?? DEFAULT_FORM.maxHorizonDays,
  };
}

function prettyDay(d: DayKey): string {
  return ({ sun: "Sun", mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat" } as const)[d];
}
