// One card per engineer on the Team page. Shows now-state + working-on + stuck + throughput.

import { Sparkline } from "./charts/Sparkline";
import { stuckReasonLabel, type EngineerCard as EngineerCardData } from "../lib/team-data";

const SEVERITY_COLOR: Record<string, { bg: string; fg: string }> = {
  low: { bg: "#f3f4f6", fg: "#374151" },
  medium: { bg: "#fef3c7", fg: "#92400e" },
  high: { bg: "#fed7aa", fg: "#9a3412" },
  critical: { bg: "#fee2e2", fg: "#991b1b" },
};

export function EngineerCard({
  data,
  onOpenQueue,
}: {
  data: EngineerCardData;
  onOpenQueue: () => void;
}): JSX.Element {
  const stuck = data.stuck_top;
  return (
    <div
      style={{
        background: "white",
        color: "#111827",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 16,
        display: "grid",
        gap: 12,
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>{data.name}</span>
        <span
          style={{
            background: data.role === "cto" ? "#ede9fe" : "#dbeafe",
            color: data.role === "cto" ? "#5b21b6" : "#1e40af",
            padding: "1px 8px",
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          {data.role}
        </span>
        {data.stuck_count > 0 ? (
          <span
            style={{
              marginLeft: "auto",
              background: "#fee2e2",
              color: "#991b1b",
              padding: "1px 8px",
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 600,
            }}
          >
            {data.stuck_count} stuck
          </span>
        ) : null}
      </header>

      <div style={{ display: "flex", gap: 6 }}>
        <Pill label="Open" value={data.open_count} color="#6b7280" />
        <Pill label="In progress" value={data.in_progress_count} color="#2563eb" />
        <Pill label="Blocked" value={data.blocked_count} color="#dc2626" />
      </div>

      <div>
        <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Working on</div>
        {data.working_on.length === 0 ? (
          <p style={{ margin: 0, color: "#9ca3af", fontSize: 12, fontStyle: "italic" }}>
            Nothing in progress.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
            {data.working_on.map((i) => {
              const sev = SEVERITY_COLOR[i.severity] ?? SEVERITY_COLOR.low;
              return (
                <li
                  key={i.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto",
                    gap: 8,
                    alignItems: "center",
                    fontSize: 12,
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {i.title}
                  </span>
                  <span
                    style={{
                      background: sev.bg,
                      color: sev.fg,
                      padding: "1px 6px",
                      borderRadius: 999,
                      fontSize: 9,
                      fontWeight: 600,
                      textTransform: "uppercase",
                    }}
                  >
                    {i.severity}
                  </span>
                  <span style={{ color: "#9ca3af", fontSize: 11 }}>{i.age_days}d</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {stuck ? (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: 8,
            padding: "8px 10px",
            display: "grid",
            gap: 2,
          }}
        >
          <div style={{ fontSize: 10, color: "#991b1b", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
            Stuck · {stuckReasonLabel(stuck.reason)}
          </div>
          <div
            style={{
              fontSize: 12,
              color: "#7f1d1d",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={stuck.title}
          >
            {stuck.title} · {stuck.age_days}d
          </div>
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: 12,
          alignItems: "center",
          borderTop: "1px solid #f3f4f6",
          paddingTop: 10,
        }}
      >
        <div>
          <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Closed · 7d
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, color: "#10b981" }}>{data.closed_last_7d}</div>
        </div>
        <div title="Issues closed per week, last 12 weeks">
          <Sparkline data={data.throughput_weekly} color="#10b981" height={36} />
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenQueue}
        style={{
          padding: "6px 12px",
          background: "#f3f4f6",
          color: "#111827",
          border: "1px solid #e5e7eb",
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        Open queue →
      </button>
    </div>
  );
}

function Pill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      style={{
        background: "#f9fafb",
        border: "1px solid #e5e7eb",
        borderRadius: 6,
        padding: "4px 8px",
        fontSize: 11,
        display: "grid",
        gap: 0,
        flex: 1,
        textAlign: "center",
      }}
    >
      <span style={{ color: "#6b7280" }}>{label}</span>
      <span style={{ color, fontSize: 16, fontWeight: 600 }}>{value}</span>
    </div>
  );
}
