// Phase funnel — horizontal stacked bar with custom tooltip showing the
// one-sentence description of the hovered phase.

import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";

export interface PhaseDatum {
  phase: string;
  [niche: string]: string | number;
}

export function PhaseFunnel({
  data,
  niches,
  descriptions,
  height = 240,
}: {
  data: PhaseDatum[];
  niches: { slug: string; label: string; color: string }[];
  descriptions?: Record<string, string>;
  height?: number;
}): JSX.Element {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey="phase" tick={{ fontSize: 12, fill: "#6b7280" }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#6b7280" }} />
          <Tooltip
            content={(rawProps) => {
              const props = rawProps as { active?: boolean; payload?: ReadonlyArray<{ value?: number; name?: string; color?: string }>; label?: string };
              if (!props.active || !props.payload || props.payload.length === 0) return null;
              const phaseLabel = String(props.label ?? "");
              const desc = descriptions?.[phaseLabel];
              return (
                <div style={{ background: "#1f2937", color: "white", padding: "8px 12px", borderRadius: 8, fontSize: 12, maxWidth: 260, boxShadow: "0 10px 24px rgba(0,0,0,0.25)" }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{phaseLabel}</div>
                  {desc ? <div style={{ color: "#cbd5e1", marginBottom: 6, lineHeight: 1.4 }}>{desc}</div> : null}
                  {props.payload.map((p, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: p.color }} />
                      <span style={{ flex: 1 }}>{p.name}</span>
                      <strong>{p.value}</strong>
                    </div>
                  ))}
                </div>
              );
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {niches.map((n) => (
            <Bar key={n.slug} dataKey={n.slug} name={n.label} stackId="a" fill={n.color} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
