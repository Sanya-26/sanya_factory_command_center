// CalendarWidget — compact list of upcoming customer calls (next 7 days).
// Reads from scheduled_calls (created by the multi-slot picker flow).

import { useEffect, useState } from "react";
import { getFactorySupabase } from "../lib/factorySupabase";

interface ScheduledCall {
  id: string;
  company_id: string;
  slot_start: string;
  slot_end: string;
  agenda: string;
  provider: string;
  meet_url: string | null;
  company_name?: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CalendarWidget(): JSX.Element {
  const [calls, setCalls] = useState<ScheduledCall[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = getFactorySupabase();
      const { data } = await sb.from("scheduled_calls").select("*").order("slot_start", { ascending: true });
      const now = Date.now();
      const weekOut = now + 7 * 86400_000;
      const upcoming = ((data ?? []) as ScheduledCall[])
        .filter((c) => {
          const ts = new Date(c.slot_start).getTime();
          return ts >= now && ts <= weekOut;
        });
      const ids = Array.from(new Set(upcoming.map((c) => c.company_id)));
      const { data: comps } = await sb.from("companies").select("id, name").in("id", ids);
      const nameById: Record<string, string> = {};
      for (const c of (comps ?? []) as Array<{ id: string; name: string }>) nameById[c.id] = c.name;
      if (cancelled) return;
      setCalls(upcoming.map((c) => ({ ...c, company_name: nameById[c.company_id] ?? c.company_id })));
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div>
      {calls === null ? (
        <p style={{ color: "#9ca3af", fontStyle: "italic", margin: 0, fontSize: 13 }}>Loading…</p>
      ) : calls.length === 0 ? (
        <p style={{ color: "#9ca3af", fontStyle: "italic", margin: 0, fontSize: 13 }}>No calls scheduled this week.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 13 }}>
          {calls.map((c) => (
            <li
              key={c.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 0",
                borderTop: "1px solid #f3f4f6",
              }}
            >
              <div style={{ minWidth: 130, color: "#111827", fontWeight: 500 }}>
                {formatDate(c.slot_start)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ color: "#111827" }}>{c.company_name}</div>
                <div style={{ color: "#6b7280", fontSize: 11, marginTop: 2 }}>{c.agenda}</div>
              </div>
              {c.meet_url ? (
                <a
                  href={c.meet_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#2563eb", fontSize: 12, textDecoration: "none" }}
                >
                  Meet ↗
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
