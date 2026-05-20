// Generic card wrapper for any chart/widget with a ?-info popover explaining
// "What this is" + "What to do with it" (see docs/PRD-product-view.md §18.3).

import { useState } from "react";

export function ChartCard({
  title,
  whatThisIs,
  whatToDo,
  height,
  children,
}: {
  title: string;
  whatThisIs: string;
  whatToDo: string;
  height?: number;
  children: React.ReactNode;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <div
      style={{
        background: "white",
        color: "#111827",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 16,
        position: "relative",
        height: height ?? "auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ color: "#6b7280", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
          {title}
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          aria-label="What this chart means"
          style={{
            width: 18,
            height: 18,
            borderRadius: 999,
            background: open ? "#2563eb" : "#f3f4f6",
            color: open ? "white" : "#6b7280",
            border: "none",
            cursor: "pointer",
            fontSize: 11,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
            padding: 0,
          }}
        >
          ?
        </button>
      </div>
      {open ? (
        <div
          style={{
            position: "absolute",
            top: 38,
            right: 12,
            background: "#1f2937",
            color: "white",
            padding: "10px 12px",
            borderRadius: 8,
            fontSize: 12,
            lineHeight: 1.5,
            maxWidth: 280,
            zIndex: 50,
            boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
          }}
        >
          <div style={{ marginBottom: 6 }}>
            <strong style={{ color: "#a5f3fc" }}>What this is: </strong>
            {whatThisIs}
          </div>
          <div>
            <strong style={{ color: "#fde68a" }}>What to do with it: </strong>
            {whatToDo}
          </div>
        </div>
      ) : null}
      {children}
    </div>
  );
}
