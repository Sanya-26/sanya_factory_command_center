// Tiny inline sparkline for KPI tiles.

import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip } from "recharts";

export function Sparkline({
  data,
  color = "#3b82f6",
  height = 36,
  width = "100%",
}: {
  data: number[];
  color?: string;
  height?: number;
  width?: number | string;
}): JSX.Element {
  const chartData = data.map((v, i) => ({ i, v }));
  return (
    <div style={{ width, height }}>
      <ResponsiveContainer>
        <LineChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Tooltip
            cursor={false}
            formatter={(v) => [String(v ?? ""), ""]}
            labelFormatter={() => ""}
            contentStyle={{ borderRadius: 6, fontSize: 11, padding: "2px 6px" }}
          />
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
