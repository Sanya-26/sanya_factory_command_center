// Round-6 §22 — Team Management. Engineer-first view of tech_issues so Sanya
// can spot imbalance and slippage at a glance.

import { useEffect, useMemo, useState } from "react";
import { getFactorySupabase } from "../../lib/factorySupabase";
import { KpiTile } from "../../components/KpiTile";
import { ChartCard } from "../../components/ChartCard";
import { EngineerCard } from "../../components/EngineerCard";
import { EngineerQueueDrawer } from "../../components/EngineerQueueDrawer";
import { MondayBoardSection } from "../../components/MondayBoardSection";
import {
  computeEngineerCards,
  computeTeamStuckList,
  stuckReasonLabel,
  type EngineerCard as EngineerCardData,
  type OpsUser,
  type StuckRow,
  type TechIssue,
} from "../../lib/team-data";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const ENGINEER_LINE_COLORS = ["#2563eb", "#10b981", "#7c3aed", "#f59e0b", "#ef4444"];
const MONDAY_BOARD_ID = (import.meta.env.VITE_MONDAY_BOARD_ID as string | undefined) ?? "18403740335";

export function ProductTeamPage(): JSX.Element {
  const [issues, setIssues] = useState<TechIssue[]>([]);
  const [users, setUsers] = useState<OpsUser[]>([]);
  const [drawer, setDrawer] = useState<{ id: string; name: string; role: string } | null>(null);

  async function load() {
    const sb = getFactorySupabase();
    const [{ data: i }, { data: u }] = await Promise.all([
      sb.from("tech_issues").select("*"),
      sb.from("ops_users").select("user_id, email, display_name, role"),
    ]);
    setIssues((i ?? []) as TechIssue[]);
    setUsers((u ?? []) as OpsUser[]);
  }
  useEffect(() => { void load(); }, []);

  const cards: EngineerCardData[] = useMemo(() => computeEngineerCards(issues, users), [issues, users]);
  const stuckList: StuckRow[] = useMemo(() => computeTeamStuckList(issues, users), [issues, users]);

  const activeEngineers = cards.filter((c) => c.open_count + c.in_progress_count + c.blocked_count > 0).length;
  const openIssuesTotal = cards.reduce((s, c) => s + c.open_count + c.in_progress_count + c.blocked_count, 0);
  const stuckTotal = stuckList.length;
  const throughput7d = cards.reduce((s, c) => s + c.closed_last_7d, 0);

  const insights = {
    active: cards.length
      ? `${cards.map((c) => c.name).join(", ")} on the team. ${activeEngineers} active right now.`
      : "No engineers seeded.",
    open:
      openIssuesTotal === 0
        ? "Backlog is empty — savor the moment."
        : `${topByOpen(cards)?.name ?? "Someone"} carries the most open work (${topByOpen(cards)?.open_count ?? 0} open).`,
    stuck:
      stuckTotal === 0
        ? "Nothing stuck. Keep it that way."
        : `Oldest stuck: ${stuckList[0].title} · ${stuckList[0].age_days}d (${stuckList[0].assignee_name}).`,
    throughput:
      throughput7d === 0
        ? "Nothing closed in the last 7 days — investigate why."
        : `Top closer: ${topByThroughput(cards)?.name ?? "—"} (${topByThroughput(cards)?.closed_last_7d ?? 0} closed).`,
  };

  // Recharts shapes
  const balanceData = cards.map((c) => ({
    name: c.name,
    Open: c.open_count,
    "In progress": c.in_progress_count,
    Blocked: c.blocked_count,
  }));
  const trendData = useMemo(() => {
    const weeks = new Array(12).fill(0).map((_, i) => ({ week: `W${i - 11}` } as Record<string, number | string>));
    cards.forEach((c) => {
      c.throughput_weekly.forEach((v, i) => {
        weeks[i][c.name] = v;
      });
    });
    return weeks;
  }, [cards]);

  return (
    <div style={{ padding: 24, display: "grid", gap: 20, maxWidth: 1280 }}>
      <header>
        <h1 style={{ margin: 0 }}>Team</h1>
        <p style={{ color: "#9ca3af", margin: "4px 0 0", fontSize: 13 }}>
          What everyone is working on. Who's stuck. Who's been sitting on something too long.
        </p>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <KpiTile label="Active engineers" value={String(activeEngineers)} insight={insights.active} />
        <KpiTile label="Open issues (team)" value={String(openIssuesTotal)} insight={insights.open} />
        <KpiTile
          label="Stuck items"
          value={String(stuckTotal)}
          valueColor={stuckTotal > 0 ? "#dc2626" : "#10b981"}
          insight={insights.stuck}
        />
        <KpiTile label="Throughput · 7d" value={String(throughput7d)} insight={insights.throughput} />
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, alignItems: "start" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
          {cards.map((c) => (
            <EngineerCard
              key={c.user_id}
              data={c}
              onOpenQueue={() => setDrawer({ id: c.user_id, name: c.name, role: c.role })}
            />
          ))}
        </div>

        <ChartCard
          title="Team-wide stuck list"
          whatThisIs="Every open item that's blocked, stale (5d+ no activity), or sitting unstarted (7d+). Sorted oldest first."
          whatToDo="Open the worst one, unblock it, or reassign it. Nothing on this list should outlive the week."
        >
          {stuckList.length === 0 ? (
            <p style={{ margin: 0, color: "#10b981", fontWeight: 500, fontSize: 13 }}>
              Nothing stuck. Strong week.
            </p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {stuckList.map((r) => (
                <li
                  key={r.issue_id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "10px 1fr auto",
                    gap: 10,
                    alignItems: "flex-start",
                    padding: "10px 4px",
                    borderTop: "1px solid #f3f4f6",
                  }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: 999, background: "#ef4444", marginTop: 6 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 13, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.title}
                    </div>
                    <div style={{ color: "#6b7280", fontSize: 11, marginTop: 2 }}>
                      {r.assignee_name} · {stuckReasonLabel(r.reason)} · {r.age_days}d
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setDrawer({
                        id: r.assignee_id ?? "",
                        name: r.assignee_name,
                        role: cards.find((c) => c.user_id === r.assignee_id)?.role ?? "tech",
                      })
                    }
                    style={{ padding: "3px 10px", background: "#2563eb", color: "white", border: "none", borderRadius: 6, fontSize: 11, cursor: "pointer" }}
                  >
                    Open
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <ChartCard
          title="Workload balance"
          whatThisIs="Open + in-progress + blocked items per engineer. Shows who's overloaded."
          whatToDo="If one engineer's bar is 2× the others, rebalance — pull work onto a lighter queue."
        >
          <div style={{ height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={balanceData} layout="vertical" margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={80} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Open" stackId="a" fill="#9ca3af" />
                <Bar dataKey="In progress" stackId="a" fill="#2563eb" />
                <Bar dataKey="Blocked" stackId="a" fill="#dc2626" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard
          title="Throughput trend · 12 weeks"
          whatThisIs="Issues closed per week, per engineer."
          whatToDo="A flat line for an engineer means they're stuck on big work or under-utilized — drill into their queue."
        >
          <div style={{ height: 220 }}>
            <ResponsiveContainer>
              <LineChart data={trendData} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {cards.map((c, i) => (
                  <Line
                    key={c.user_id}
                    type="monotone"
                    dataKey={c.name}
                    stroke={ENGINEER_LINE_COLORS[i % ENGINEER_LINE_COLORS.length]}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </section>

      <MondayBoardSection boardId={MONDAY_BOARD_ID} expanded={false} />

      <EngineerQueueDrawer
        open={drawer !== null}
        onClose={() => setDrawer(null)}
        engineerId={drawer?.id ?? null}
        engineerName={drawer?.name ?? ""}
        engineerRole={drawer?.role ?? ""}
      />
    </div>
  );
}

function topByOpen(cards: EngineerCardData[]): EngineerCardData | undefined {
  return cards.slice().sort((a, b) => b.open_count + b.in_progress_count + b.blocked_count - (a.open_count + a.in_progress_count + a.blocked_count))[0];
}
function topByThroughput(cards: EngineerCardData[]): EngineerCardData | undefined {
  return cards.slice().sort((a, b) => b.closed_last_7d - a.closed_last_7d)[0];
}
