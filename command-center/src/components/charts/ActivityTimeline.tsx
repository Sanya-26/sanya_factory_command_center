// Compact activity timeline: chronological list of journey events.

interface Event {
  id: string;
  event_kind: string;
  at: string;
  actor?: string | null;
  payload?: Record<string, unknown> | null;
}

const EVENT_COLOR: Record<string, string> = {
  signup: "#8b5cf6",
  onboarding_complete: "#10b981",
  council_started: "#3b82f6",
  council_complete: "#3b82f6",
  proposal_drafted: "#3b82f6",
  proposal_sent: "#3b82f6",
  contract_sent: "#3b82f6",
  build_started: "#f59e0b",
  build_queued: "#f59e0b",
  build_planning: "#f59e0b",
  build_completed: "#f59e0b",
  tenant_deployed: "#f59e0b",
  qc_checklist_generated: "#f59e0b",
  ticket_assigned: "#ef4444",
  audit_bugs_filed: "#ef4444",
  support_request: "#ef4444",
  feature_request: "#8b5cf6",
  monthly_review_passed: "#10b981",
  first_lead: "#10b981",
};

function relTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function ActivityTimeline({
  events,
  title = "Activity",
  emptyText = "No activity yet.",
}: {
  events: Event[];
  title?: string;
  emptyText?: string;
}): JSX.Element {
  return (
    <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
      <div style={{ color: "#6b7280", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
        {title}
      </div>
      {events.length === 0 ? (
        <p style={{ color: "#9ca3af", fontStyle: "italic", margin: 0 }}>{emptyText}</p>
      ) : (
        <ol style={{ listStyle: "none", padding: 0, margin: 0, position: "relative" }}>
          <div style={{ position: "absolute", left: 7, top: 6, bottom: 6, width: 2, background: "#e5e7eb" }} />
          {events.map((e) => (
            <li key={e.id} style={{ display: "flex", gap: 12, marginBottom: 12, position: "relative" }}>
              <span
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 999,
                  background: EVENT_COLOR[e.event_kind] ?? "#9ca3af",
                  marginTop: 2,
                  flexShrink: 0,
                  border: "2px solid white",
                  zIndex: 1,
                }}
              />
              <div>
                <div style={{ fontSize: 13, color: "#111827" }}>
                  {humanize(e.event_kind)}
                  {e.actor ? <span style={{ color: "#9ca3af" }}> · {e.actor}</span> : null}
                </div>
                <div style={{ fontSize: 11, color: "#9ca3af" }}>{relTime(e.at)}</div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function humanize(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
