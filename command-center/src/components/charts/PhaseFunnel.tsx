// Phase funnel — horizontal stacked bar showing per-phase customer counts.

import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";

export interface PhaseDatum {
  phase: string;
  [niche: string]: string | number;
}

export function PhaseFunnel({
  data,
  niches,
  height = 240,
}: {
  data: PhaseDatum[];
  niches: { slug: string; label: string; color: string }[];
  height?: number;
}): JSX.Element {
  return (
    <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
      <div style={{ color: "#6b7280", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
        Phase funnel
      </div>
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="phase" tick={{ fontSize: 12, fill: "#6b7280" }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#6b7280" }} />
            <Tooltip contentStyle={{ borderRadius: 6, fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {niches.map((n) => (
              <Bar key={n.slug} dataKey={n.slug} name={n.label} stackId="a" fill={n.color} radius={[4, 4, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
