// MeetingPicker — customer-facing slot picker shown after accept-proposal
// (proposal §6.3 / S8). Also hosts the AISubscriptionsGate as the Phase 2
// entry surface (relocated from Onboarding.tsx per §3.7 third pass +
// AUDIT_2026-05-12 item 1). Customer connects Claude Pro + ChatGPT Pro
// BEFORE seeing slots; once both subscriptions are 'connected', the gate
// disappears and slots load.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase";
import { AISubscriptionsGate } from "@/components/AISubscriptionsGate";

interface Slot {
  starts_at: string;
  ends_at: string;
}

interface SlotsResp {
  admin_user_id: string;
  timezone: string;
  slots: Slot[];
  busy_windows_applied: boolean;
}

const SUPABASE_FUNCTIONS_URL =
  (import.meta.env.VITE_SUPABASE_FUNCTIONS_URL as string | undefined) ??
  `${(import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ""}/functions/v1`;

export default function MeetingPicker(): JSX.Element {
  const navigate = useNavigate();
  const [companyId, setCompanyId] = useState<string | null>(null);
  // Phase 2 entry gate state — true once both Claude Pro + ChatGPT Pro
  // ai_subscriptions rows are at status='connected'. While false, the
  // AISubscriptionsGate renders instead of the slot picker.
  const [subscriptionsConnected, setSubscriptionsConnected] = useState<boolean>(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [tz, setTz] = useState<string>("UTC");
  const [busyApplied, setBusyApplied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [booked, setBooked] = useState<{ meet_link: string | null; starts_at: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Resolve companyId first — independent of subscription state so the gate
  // has the companyId it needs to subscribe + write to ai_subscriptions.
  useEffect(() => {
    void (async () => {
      const { data: session } = await supabase.auth.getSession();
      const userId = session.session?.user?.id;
      if (!userId) { navigate("/login"); return; }
      const { data: company } = await supabase.from("companies").select("id").eq("user_id", userId).maybeSingle();
      if (!company) { setError("No company on file"); setLoading(false); return; }
      setCompanyId(company.id as string);
    })();
  }, [navigate]);

  // Slot fetch — gated on subscriptionsConnected so the gate renders first.
  useEffect(() => {
    if (!companyId || !subscriptionsConnected) return;
    void (async () => {
      setLoading(true);
      const { data: session } = await supabase.auth.getSession();
      const jwt = session.session?.access_token;
      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/list-available-slots`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ company_id: companyId }),
      });
      if (!res.ok) {
        setError(`Couldn't load slots: ${(await res.text()).slice(0, 200)}`);
        setLoading(false);
        return;
      }
      const data = (await res.json()) as SlotsResp;
      setSlots(data.slots ?? []);
      setTz(data.timezone ?? "UTC");
      setBusyApplied(data.busy_windows_applied);
      setLoading(false);
    })();
  }, [companyId, subscriptionsConnected]);

  const book = async (slot: Slot) => {
    if (!companyId) return;
    setBooking(true);
    setError(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      const jwt = session.session?.access_token;
      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/book-meeting`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ company_id: companyId, starts_at: slot.starts_at, ends_at: slot.ends_at }),
      });
      if (!res.ok) {
        setError((await res.text()).slice(0, 200));
        return;
      }
      const data = await res.json() as { meet_link: string | null };
      setBooked({ meet_link: data.meet_link, starts_at: slot.starts_at });
    } finally {
      setBooking(false);
    }
  };

  // Phase 2 entry gate — renders BEFORE the slot picker. Once both Pros are
  // connected, onAllConnected fires and the slot picker takes over via the
  // useEffect that watches `subscriptionsConnected`.
  if (!subscriptionsConnected && companyId) {
    return (
      <AISubscriptionsGate
        companyId={companyId}
        onAllConnected={() => setSubscriptionsConnected(true)}
      />
    );
  }
  if (loading) return <div className="meeting-picker-loading">Loading available times…</div>;
  if (booked) {
    return (
      <div className="meeting-picker-confirm">
        <h1>Meeting booked</h1>
        <p>You're scheduled for {new Date(booked.starts_at).toLocaleString()} ({tz}).</p>
        {booked.meet_link ? (
          <p>Join link: <a href={booked.meet_link} target="_blank" rel="noreferrer">{booked.meet_link}</a></p>
        ) : null}
        <p>We've sent a calendar invite to your email.</p>
      </div>
    );
  }
  if (error) return <div className="meeting-picker-error">{error}</div>;

  return (
    <div className="meeting-picker">
      <h1>Pick a kickoff time</h1>
      <p>All times shown in {tz}. {busyApplied ? "" : "Note: showing the full availability grid — admin's Google Calendar busy windows not yet filtered (S8 deferred wiring)."}</p>
      <ul className="meeting-picker-slots">
        {slots.map((s) => (
          <li key={s.starts_at}>
            <button
              type="button"
              className="meeting-picker-slot"
              onClick={() => void book(s)}
              disabled={booking}
            >
              {new Date(s.starts_at).toLocaleString()}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
