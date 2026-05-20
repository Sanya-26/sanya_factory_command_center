// Donut chart for status distribution (R/Y/G or severity buckets).

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

export function StatusDonut({
  slices,
  title,
  height = 180,
}: {
  slices: DonutSlice[];
  title?: string;
  height?: number;
}): JSX.Element {
  const total = slices.reduce((s, x) => s + x.value, 0);
  return (
    <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
      {title ? (
        <div style={{ color: "#6b7280", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
          {title}
        </div>
      ) : null}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 140, height }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={slices}
                dataKey="value"
                nameKey="label"
                innerRadius="60%"
                outerRadius="90%"
                stroke="white"
                strokeWidth={2}
                paddingAngle={total === 0 ? 0 : 2}
              >
                {slices.map((s, i) => (
                  <Cell key={i} fill={s.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v, name) => [`${v ?? 0}`, String(name ?? "")]}
                contentStyle={{ borderRadius: 6, fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 13 }}>
          {slices.map((s, i) => (
            <li key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: 999, background: s.color }} />
              <span style={{ color: "#374151", minWidth: 80 }}>{s.label}</span>
              <strong>{s.value}</strong>
            </li>
          ))}
          {total === 0 ? <li style={{ color: "#9ca3af", fontStyle: "italic" }}>No data</li> : null}
        </ul>
      </div>
    </div>
  );
}
