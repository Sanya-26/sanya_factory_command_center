// Product · Issues page — tech_issues tracker, with create form + charts.

import { useEffect, useMemo, useState } from "react";
import { getFactorySupabase } from "../../lib/factorySupabase";
import { StatusDonut } from "../../components/charts/StatusDonut";

interface TechIssue {
  id: string;
  company_id: string | null;
  title: string;
  description: string | null;
  severity: string;
  priority: string;
  status: string;
  assignee_id: string | null;
  raised_by: string;
  created_at: string;
  closed_at: string | null;
}
interface OpsUser {
  user_id: string;
  role: string;
}

const SEV_COLOR: Record<string, string> = { low: "#9ca3af", medium: "#f59e0b", high: "#ef4444", critical: "#7f1d1d" };

export function ProductIssuesPage({ userId }: { userId: string }): JSX.Element {
  const [issues, setIssues] = useState<TechIssue[] | null>(null);
  const [ops, setOps] = useState<OpsUser[]>([]);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [search, setSearch] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [newIssue, setNewIssue] = useState({ title: "", description: "", severity: "medium", priority: "normal", assignee_id: "" });
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const sb = getFactorySupabase();
    let q = sb.from("tech_issues").select("*").order("created_at", { ascending: false });
    if (filter === "open") q = q.in("status", ["open", "in_progress", "blocked"]);
    const { data, error: err } = await q;
    if (err) { setError(err.message); return; }
    setIssues((data ?? []) as TechIssue[]);
    const { data: opsRows } = await sb.from("ops_users").select("user_id, role");
    setOps((opsRows ?? []) as OpsUser[]);
  }
  useEffect(() => { void load(); }, [filter]);

  const filtered = useMemo(() => {
    let xs = issues ?? [];
    if (search.trim()) {
      const q = search.toLowerCase();
      xs = xs.filter((i) => i.title.toLowerCase().includes(q) || (i.description ?? "").toLowerCase().includes(q));
    }
    if (assigneeFilter) xs = xs.filter((i) => i.assignee_id === assigneeFilter);
    return xs;
  }, [issues, search, assigneeFilter]);

  // Stats
  const stats = useMemo(() => {
    const all = issues ?? [];
    const open = all.filter((i) => i.status === "open").length;
    const ip = all.filter((i) => i.status === "in_progress").length;
    const blocked = all.filter((i) => i.status === "blocked").length;
    const recentDone = all.filter((i) => i.status === "done" && i.closed_at && new Date(i.closed_at as unknown as string).getTime() > Date.now() - 7 * 86400_000).length;
    const sevCounts = { low: 0, medium: 0, high: 0, critical: 0 } as Record<string, number>;
    for (const i of all) if (i.status !== "done" && i.status !== "wontfix") sevCounts[i.severity] = (sevCounts[i.severity] || 0) + 1;
    return { open, ip, blocked, recentDone, sevCounts };
  }, [issues]);

  async function create() {
    if (!newIssue.title.trim()) return;
    setError(null);
    const sb = getFactorySupabase();
    const { error: err } = await sb.from("tech_issues").insert({
      title: newIssue.title,
      description: newIssue.description || null,
      severity: newIssue.severity,
      priority: newIssue.priority,
      assignee_id: newIssue.assignee_id || null,
      raised_by: userId,
    });
    if (err) { setError(err.message); return; }
    setCreating(false);
    setNewIssue({ title: "", description: "", severity: "medium", priority: "normal", assignee_id: "" });
    await load();
  }

  async function setStatus(id: string, status: string) {
    const sb = getFactorySupabase();
    await sb.from("tech_issues").update({
      status,
      closed_at: status === "done" || status === "wontfix" ? new Date().toISOString() : null,
    }).eq("id", id);
    await load();
  }

  return (
    <div style={{ padding: 24, display: "grid", gap: 16 }}>
      <header style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Issues</h1>
        <select value={filter} onChange={(e) => setFilter(e.target.value as "open" | "all")}>
          <option value="open">Open only</option>
          <option value="all">All</option>
        </select>
        <input
          type="search"
          placeholder="Search title…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: "6px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13 }}
        />
        <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} style={{ padding: "6px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13 }}>
          <option value="">All assignees</option>
          {ops.filter((o) => o.role === "tech").map((o) => (
            <option key={o.user_id} value={o.user_id}>{o.user_id.slice(0, 8)}…</option>
          ))}
        </select>
        <button type="button" className="btn" onClick={() => setCreating(true)} style={{ marginLeft: "auto" }}>
          + New issue
        </button>
      </header>

      {error ? <div style={{ background: "#fee2e2", color: "#b91c1c", padding: 10, borderRadius: 6 }}>{error}</div> : null}

      {/* Stat strip */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr) 1.2fr", gap: 12 }}>
        <MiniStat label="Open" value={stats.open} color="#3b82f6" />
        <MiniStat label="In progress" value={stats.ip} color="#f59e0b" />
        <MiniStat label="Blocked" value={stats.blocked} color="#ef4444" />
        <MiniStat label="Closed (7d)" value={stats.recentDone} color="#10b981" />
        <StatusDonut
          title="Severity (active)"
          slices={[
            { label: "Low", value: stats.sevCounts.low ?? 0, color: SEV_COLOR.low },
            { label: "Medium", value: stats.sevCounts.medium ?? 0, color: SEV_COLOR.medium },
            { label: "High", value: stats.sevCounts.high ?? 0, color: SEV_COLOR.high },
            { label: "Critical", value: stats.sevCounts.critical ?? 0, color: SEV_COLOR.critical },
          ]}
          height={120}
        />
      </section>

      {creating ? (
        <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, display: "grid", gap: 8 }}>
          <input
            placeholder="Issue title"
            value={newIssue.title}
            onChange={(e) => setNewIssue({ ...newIssue, title: e.target.value })}
            style={{ padding: 8 }}
          />
          <textarea
            placeholder="Description (optional)"
            value={newIssue.description}
            onChange={(e) => setNewIssue({ ...newIssue, description: e.target.value })}
            rows={3}
            style={{ padding: 8 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <label>Severity:{" "}
              <select value={newIssue.severity} onChange={(e) => setNewIssue({ ...newIssue, severity: e.target.value })}>
                <option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="critical">critical</option>
              </select>
            </label>
            <label>Priority:{" "}
              <select value={newIssue.priority} onChange={(e) => setNewIssue({ ...newIssue, priority: e.target.value })}>
                <option value="normal">normal</option><option value="high">high</option><option value="urgent">urgent</option>
              </select>
            </label>
            <label>Assignee:{" "}
              <select value={newIssue.assignee_id} onChange={(e) => setNewIssue({ ...newIssue, assignee_id: e.target.value })}>
                <option value="">— unassigned —</option>
                {ops.filter((o) => o.role === "tech").map((o) => (
                  <option key={o.user_id} value={o.user_id}>{o.user_id.slice(0, 8)}…</option>
                ))}
              </select>
            </label>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn" onClick={() => void create()}>Create</button>
            <button type="button" className="btn-ghost" onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </div>
      ) : null}

      <table style={{ width: "100%", borderCollapse: "collapse", background: "white", color: "#111827", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
        <thead>
          <tr style={{ background: "#f9fafb", textAlign: "left", color: "#6b7280", fontSize: 12 }}>
            <th style={{ padding: 10 }}>Title</th>
            <th style={{ padding: 10 }}>Severity</th>
            <th style={{ padding: 10 }}>Priority</th>
            <th style={{ padding: 10 }}>Status</th>
            <th style={{ padding: 10 }}>Assignee</th>
            <th style={{ padding: 10 }}>Created</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((i) => (
            <tr key={i.id} style={{ borderTop: "1px solid #f3f4f6" }}>
              <td style={{ padding: 10 }}>{i.title}</td>
              <td style={{ padding: 10 }}>
                <span style={{ background: SEV_COLOR[i.severity] ?? "#9ca3af", color: "white", padding: "2px 8px", borderRadius: 999, fontSize: 12 }}>
                  {i.severity}
                </span>
              </td>
              <td style={{ padding: 10 }}>{i.priority}</td>
              <td style={{ padding: 10 }}>
                <select value={i.status} onChange={(e) => void setStatus(i.id, e.target.value)}>
                  <option value="open">open</option>
                  <option value="in_progress">in_progress</option>
                  <option value="blocked">blocked</option>
                  <option value="done">done</option>
                  <option value="wontfix">wontfix</option>
                </select>
              </td>
              <td style={{ padding: 10 }}>{i.assignee_id ? i.assignee_id.slice(0, 8) + "…" : "—"}</td>
              <td style={{ padding: 10, color: "#9ca3af", fontSize: 12 }}>{new Date(i.created_at).toLocaleString()}</td>
            </tr>
          ))}
          {filtered.length === 0 ? (
            <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: "#9ca3af" }}>
              {issues === null ? "Loading…" : "No issues."}
            </td></tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
      <div style={{ color: "#6b7280", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, marginTop: 2, color }}>{value}</div>
    </div>
  );
}
