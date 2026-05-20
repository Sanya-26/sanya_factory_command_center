// KPI tile with a hover popover that reveals one insight.
// Wraps the previous inline StatTile used on ProductHome.

import { useRef, useState } from "react";

export function KpiTile({
  label,
  value,
  valueColor,
  insight,
}: {
  label: string;
  value: string;
  valueColor?: string;
  insight?: string;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      tabIndex={0}
      style={{
        background: "white",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 16,
        color: "#111827",
        position: "relative",
        cursor: insight ? "default" : "default",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ color: "#6b7280", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
          {label}
        </div>
        {insight ? (
          <span
            aria-hidden
            style={{
              fontSize: 9,
              color: "#9ca3af",
              border: "1px solid #e5e7eb",
              borderRadius: 999,
              padding: "1px 6px",
            }}
          >
            insight ↗
          </span>
        ) : null}
      </div>
      <div style={{ fontSize: 24, fontWeight: 600, marginTop: 4, color: valueColor ?? "#111827" }}>{value}</div>
      {insight && open ? (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            top: -10,
            left: 0,
            right: 0,
            transform: "translateY(-100%)",
            background: "#1f2937",
            color: "white",
            padding: "10px 12px",
            borderRadius: 8,
            fontSize: 12,
            lineHeight: 1.5,
            zIndex: 30,
            boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
          }}
        >
          {insight}
          <span
            aria-hidden
            style={{
              position: "absolute",
              bottom: -6,
              left: 24,
              width: 12,
              height: 12,
              background: "#1f2937",
              transform: "rotate(45deg)",
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
