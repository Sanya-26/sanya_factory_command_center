// Bar chart: MRR per niche.

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from "recharts";

export interface MrrDatum {
  niche: string;
  mrr_usd: number;
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

export function MrrByNicheBar({
  data,
  height = 240,
}: {
  data: MrrDatum[];
  height?: number;
}): JSX.Element {
  const fmt = (v: number) => `$${v.toLocaleString()}`;
  return (
    <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
      <div style={{ color: "#6b7280", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
        MRR by niche
      </div>
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="niche" tick={{ fontSize: 11, fill: "#6b7280" }} />
            <YAxis tickFormatter={fmt} tick={{ fontSize: 11, fill: "#6b7280" }} />
            <Tooltip formatter={(v) => fmt(Number(v ?? 0))} contentStyle={{ borderRadius: 6, fontSize: 12 }} />
            <Bar dataKey="mrr_usd" radius={[4, 4, 0, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
