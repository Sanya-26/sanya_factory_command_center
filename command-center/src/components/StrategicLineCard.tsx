// Per-product-line strategic card for the CEO Home + /strategic page.

import { MockBadge } from "./MockBadge";
import type { StrategicCardData } from "../lib/ceo-data";

const REC_STYLES: Record<StrategicCardData["recommendation"], { label: string; bg: string; color: string; border: string }> = {
  invest: { label: "Invest", bg: "#d1fae5", color: "#065f46", border: "#86efac" },
  hold: { label: "Hold", bg: "#fef3c7", color: "#92400e", border: "#fde68a" },
  reassess: { label: "Reassess", bg: "#fee2e2", color: "#b91c1c", border: "#fecaca" },
};

export function StrategicLineCard({ data, compact = true }: { data: StrategicCardData; compact?: boolean }) {
  const rec = REC_STYLES[data.recommendation];
  return (
    <div
      style={{
        background: "white",
        color: "#111827",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 16,
        display: "grid",
        gap: compact ? 8 : 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16 }}>{data.niche_label}</h3>
          <div style={{ color: "#9ca3af", fontSize: 11, marginTop: 2 }}>{data.niche_slug}</div>
        </div>
        <span
          style={{
            background: rec.bg,
            color: rec.color,
            border: `1px solid ${rec.border}`,
            padding: "2px 10px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: 0.6,
          }}
        >
          {rec.label}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, fontSize: 12 }}>
        <Stat label="MRR" value={`$${data.mrr.toLocaleString()}`} />
        <Stat label="30d growth" value={`${data.growth30dPct >= 0 ? "+" : ""}${data.growth30dPct}%`} valueColor={data.growth30dPct > 0 ? "#10b981" : data.growth30dPct < 0 ? "#ef4444" : "#6b7280"} />
        <Stat label="Live" value={String(data.liveCount)} />
        <Stat label="In flight" value={String(data.inFlightCount)} />
        <Stat label={<>Burn allocation <MockBadge size="xs" /></>} value={`$${data.burnAllocation.toLocaleString()}/mo`} />
        <Stat label={<>CAC <MockBadge size="xs" /></>} value={data.cac ? `$${data.cac.toLocaleString()}` : "—"} />
        {!compact ? (
          <>
            <Stat label={<>LTV <MockBadge size="xs" /></>} value={data.ltv ? `$${data.ltv.toLocaleString()}` : "—"} />
            <Stat label={<>Payback <MockBadge size="xs" /></>} value={data.paybackMonths ? `${data.paybackMonths} mo` : "—"} />
          </>
        ) : null}
      </div>
      <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.4, borderTop: "1px solid #f3f4f6", paddingTop: 8 }}>
        {data.recommendationReason}
      </div>
    </div>
  );
}

function Stat({ label, value, valueColor }: { label: React.ReactNode; value: string; valueColor?: string }) {
  return (
    <div>
      <div style={{ color: "#9ca3af", fontSize: 11, marginBottom: 2 }}>{label}</div>
      <div style={{ fontWeight: 600, color: valueColor ?? "#111827" }}>{value}</div>
    </div>
  );
}
