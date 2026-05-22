// MyBookings — list of confirmed bookings for the current user, with cancel.
// Route: /#calendar/bookings

import { useEffect, useState } from "react";
import { getFactorySupabase } from "../../lib/factorySupabase";

interface Booking {
  id: string;
  company_id: string | null;
  starts_at: string;
  ends_at: string;
  booked_by_email: string;
  booked_by_name: string | null;
  title: string;
  status: "confirmed" | "cancelled" | "no_show";
  created_at: string;
  cancelled_at: string | null;
}

function formatRangeLocal(iso1: string, iso2: string): string {
  const d1 = new Date(iso1);
  const d2 = new Date(iso2);
  const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${time(d1)} – ${time(d2)}`;
}

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

export function MyBookingsPage({ userId }: { userId: string }): JSX.Element {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const sb = getFactorySupabase();
      const { data, error: e } = await sb
        .from("calendar_bookings")
        .select("id, company_id, starts_at, ends_at, booked_by_email, booked_by_name, title, status, created_at, cancelled_at")
        .eq("owner_user_id", userId)
        .order("starts_at", { ascending: true });
      if (cancelled) return;
      if (e) setError(e.message);
      setBookings((data ?? []) as Booking[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId, refreshTick]);

  async function cancel(id: string) {
    if (!window.confirm("Cancel this booking?")) return;
    const sb = getFactorySupabase();
    const { error: e } = await sb
      .from("calendar_bookings")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", id);
    if (e) { setError(e.message); return; }
    setRefreshTick((t) => t + 1);
  }

  const now = Date.now();
  const upcoming = bookings.filter((b) => b.status === "confirmed" && new Date(b.ends_at).getTime() > now);
  const past = bookings.filter((b) => b.status === "confirmed" && new Date(b.ends_at).getTime() <= now);
  const cancelled = bookings.filter((b) => b.status !== "confirmed");

  // Group upcoming by day
  const upcomingByDay = new Map<string, Booking[]>();
  for (const b of upcoming) {
    const k = dayKey(b.starts_at);
    if (!upcomingByDay.has(k)) upcomingByDay.set(k, []);
    upcomingByDay.get(k)!.push(b);
  }

  if (loading) return <div style={{ padding: 24 }}>Loading…</div>;

  return (
    <div style={{ padding: 24, display: "grid", gap: 16, maxWidth: 880 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0 }}>My bookings</h1>
          <p style={{ color: "#9ca3af", margin: "4px 0 0", fontSize: 13 }}>
            {upcoming.length} upcoming · {past.length} past · {cancelled.length} cancelled
          </p>
        </div>
        <button type="button" className="btn" onClick={() => setRefreshTick((t) => t + 1)} style={{ padding: "6px 12px", fontSize: 12 }}>↻ Refresh</button>
      </header>

      {error ? (
        <div style={{ background: "#fee2e2", color: "#b91c1c", padding: 10, borderRadius: 6, fontSize: 13 }}>{error}</div>
      ) : null}

      <section>
        <h2 style={{ margin: "0 0 8px", fontSize: 15 }}>Upcoming</h2>
        {upcomingByDay.size === 0 ? (
          <p style={{ color: "#9ca3af", fontSize: 13, fontStyle: "italic" }}>No upcoming bookings.</p>
        ) : (
          Array.from(upcomingByDay.entries()).map(([day, bs]) => (
            <div key={day} style={{ marginBottom: 16 }}>
              <div style={{ color: "#6b7280", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{day}</div>
              <div style={{ background: "white", color: "#111827", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
                {bs.map((b, i) => (
                  <div key={b.id} style={{ padding: "10px 12px", borderTop: i === 0 ? "none" : "1px solid #f3f4f6", display: "flex", gap: 12, alignItems: "center" }}>
                    <span style={{ fontWeight: 500, minWidth: 130 }}>{formatRangeLocal(b.starts_at, b.ends_at)}</span>
                    <span style={{ flex: 1, fontSize: 13 }}>
                      <strong>{b.title}</strong>{" · "}
                      <span style={{ color: "#6b7280" }}>{b.booked_by_name ?? b.booked_by_email}</span>
                    </span>
                    <button type="button" onClick={() => void cancel(b.id)} className="btn-ghost" style={{ fontSize: 12, padding: "4px 10px" }}>Cancel</button>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      {past.length > 0 ? (
        <section>
          <h2 style={{ margin: "0 0 8px", fontSize: 15, color: "#6b7280" }}>Past ({past.length})</h2>
          <div style={{ background: "white", color: "#111827", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", opacity: 0.7 }}>
            {past.slice(0, 10).map((b, i) => (
              <div key={b.id} style={{ padding: "8px 12px", borderTop: i === 0 ? "none" : "1px solid #f3f4f6", display: "flex", gap: 12, fontSize: 13 }}>
                <span style={{ minWidth: 200 }}>{dayKey(b.starts_at)}</span>
                <span style={{ flex: 1 }}>{b.booked_by_name ?? b.booked_by_email}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {cancelled.length > 0 ? (
        <section>
          <h2 style={{ margin: "0 0 8px", fontSize: 15, color: "#9ca3af" }}>Cancelled ({cancelled.length})</h2>
          <div style={{ fontSize: 12, color: "#9ca3af" }}>
            {cancelled.map((b) => (
              <div key={b.id} style={{ padding: 4 }}>
                {dayKey(b.starts_at)} · {b.booked_by_name ?? b.booked_by_email}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
