// Product · Issues page — tech_issues with flag-stats + click-to-see-linked-flags.

import { useEffect, useMemo, useState } from "react";
import { getFactorySupabase } from "../../lib/factorySupabase";
import { StatusDonut } from "../../components/charts/StatusDonut";
import { Modal } from "../../components/Modal";
import { selectStyle } from "../../lib/ui-styles";

interface IssueWithStats {
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
  flag_count: number;
  customer_count: number;
  priority_score: number;
}
interface Flag {
  id: string;
  company_id: string;
  title: string;
  severity: string;
  reported_at: string;
  status: string;
  linked_issue_id: string | null;
  company_name?: string;
}
interface OpsUser { user_id: string; role: string }

const SEV_COLOR: Record<string, string> = { low: "#9ca3af", medium: "#f59e0b", high: "#ef4444", critical: "#7f1d1d" };

export function ProductIssuesPage({ userId }: { userId: string }): JSX.Element {
  const [issues, setIssues] = useState<IssueWithStats[] | null>(null);
  const [ops, setOps] = useState<OpsUser[]>([]);
  const [companies, setCompanies] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [search, setSearch] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [newIssue, setNewIssue] = useState({ title: "", description: "", severity: "medium", priority: "normal", assignee_id: "" });
  const [error, setError] = useState<string | null>(null);
  const [drillIssue, setDrillIssue] = useState<IssueWithStats | null>(null);
  const [drillFlags, setDrillFlags] = useState<Flag[] | null>(null);

  async function load() {
    const sb = getFactorySupabase();
    let q = sb.from("v_issues_with_flag_stats").select("*").order("priority_score", { ascending: false });
    if (filter === "open") q = q.in("status", ["open", "in_progress", "blocked"]);
    const { data, error: err } = await q;
    if (err) { setError(err.message); return; }
    setIssues((data ?? []) as IssueWithStats[]);
    const { data: opsRows } = await sb.from("ops_users").select("user_id, role");
    setOps((opsRows ?? []) as OpsUser[]);
    const { data: comps } = await sb.from("companies").select("id, name");
    const map: Record<string, string> = {};
    for (const c of (comps ?? []) as Array<{ id: string; name: string }>) map[c.id] = c.name;
    setCompanies(map);
  }
  useEffect(() => { void load(); }, [filter]);

  async function openIssueDrawer(issue: IssueWithStats) {
    setDrillIssue(issue);
    setDrillFlags(null);
    const sb = getFactorySupabase();
    const { data } = await sb.from("customer_flags").select("*").eq("linked_issue_id", issue.id).order("reported_at", { ascending: false });
    setDrillFlags(((data ?? []) as Flag[]).map((f) => ({ ...f, company_name: companies[f.company_id] ?? f.company_id })));
  }

  const filtered = useMemo(() => {
    let xs = issues ?? [];
    if (search.trim()) {
      const q = search.toLowerCase();
      xs = xs.filter((i) => i.title.toLowerCase().includes(q) || (i.description ?? "").toLowerCase().includes(q));
    }
    if (assigneeFilter) xs = xs.filter((i) => i.assignee_id === assigneeFilter);
    return xs;
  }, [issues, search, assigneeFilter]);

  const stats = useMemo(() => {
    const all = issues ?? [];
    const open = all.filter((i) => i.status === "open").length;
    const ip = all.filter((i) => i.status === "in_progress").length;
    const blocked = all.filter((i) => i.status === "blocked").length;
    const recentDone = all.filter((i) => i.status === "done" && i.closed_at && new Date(i.closed_at).getTime() > Date.now() - 7 * 86400_000).length;
    const sevCounts = { low: 0, medium: 0, high: 0, critical: 0 } as Record<string, number>;
    for (const i of all) if (!["done", "wontfix"].includes(i.status)) sevCounts[i.severity] = (sevCounts[i.severity] || 0) + 1;
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
      status: "open",
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

  async function setAssignee(id: string, assignee_id: string | null) {
    const sb = getFactorySupabase();
    await sb.from("tech_issues").update({ assignee_id }).eq("id", id);
    await load();
  }

  const assignableOps = ops.filter((o) => o.role === "tech" || o.role === "cto");

  return (
    <div style={{ padding: 24, display: "grid", gap: 16 }}>
      <header style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <h1 style={{ margin: 0 }}>Issues</h1>
        <select value={filter} onChange={(e) => setFilter(e.target.value as "open" | "all")} style={selectStyle}>
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
        <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} style={{ ...selectStyle, padding: "6px 10px", fontSize: 13 }}>
          <option value="">All assignees</option>
          {assignableOps.map((o) => (
            <option key={o.user_id} value={o.user_id}>{o.user_id.slice(0, 8)}…</option>
          ))}
        </select>
        <button type="button" className="btn" onClick={() => setCreating(true)} style={{ marginLeft: "auto" }}>
          + New issue
        </button>
      </header>

      {error ? <div style={{ background: "#fee2e2", color: "#b91c1c", padding: 10, borderRadius: 6 }}>{error}</div> : null}

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
        <div style={{ background: "white", color: "#111827", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, display: "grid", gap: 8 }}>
          <input placeholder="Issue title" value={newIssue.title} onChange={(e) => setNewIssue({ ...newIssue, title: e.target.value })} style={{ padding: 8 }} />
          <textarea placeholder="Description (optional)" value={newIssue.description} onChange={(e) => setNewIssue({ ...newIssue, description: e.target.value })} rows={3} style={{ padding: 8 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <label>Severity:{" "}
              <select value={newIssue.severity} onChange={(e) => setNewIssue({ ...newIssue, severity: e.target.value })} style={selectStyle}>
                <option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="critical">critical</option>
              </select>
            </label>
            <label>Priority:{" "}
              <select value={newIssue.priority} onChange={(e) => setNewIssue({ ...newIssue, priority: e.target.value })} style={selectStyle}>
                <option value="normal">normal</option><option value="high">high</option><option value="urgent">urgent</option>
              </select>
            </label>
            <label>Assignee:{" "}
              <select value={newIssue.assignee_id} onChange={(e) => setNewIssue({ ...newIssue, assignee_id: e.target.value })} style={selectStyle}>
                <option value="">— unassigned —</option>
                {assignableOps.map((o) => <option key={o.user_id} value={o.user_id}>{o.role}: {o.user_id.slice(0, 8)}…</option>)}
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
            <th style={{ padding: 10 }}>Issue</th>
            <th style={{ padding: 10, width: 70 }}>Flags</th>
            <th style={{ padding: 10, width: 90 }}>Customers</th>
            <th style={{ padding: 10, width: 80 }}>Priority</th>
            <th style={{ padding: 10, width: 80 }}>Severity</th>
            <th style={{ padding: 10, width: 110 }}>Status</th>
            <th style={{ padding: 10 }}>Assignee</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((i) => (
            <tr
              key={i.id}
              style={{ borderTop: "1px solid #f3f4f6", cursor: i.flag_count > 0 ? "pointer" : "default" }}
              onClick={() => { if (i.flag_count > 0) void openIssueDrawer(i); }}
            >
              <td style={{ padding: 10 }}>
                <div>{i.title}</div>
                {i.description ? <div style={{ color: "#9ca3af", fontSize: 11, marginTop: 2 }}>{i.description.slice(0, 80)}</div> : null}
              </td>
              <td style={{ padding: 10 }}>
                <span style={{ display: "inline-block", padding: "2px 8px", background: i.flag_count > 0 ? "#fee2e2" : "#f3f4f6", color: i.flag_count > 0 ? "#b91c1c" : "#6b7280", borderRadius: 999, fontSize: 12, minWidth: 24, textAlign: "center" }}>
                  {i.flag_count}
                </span>
              </td>
              <td style={{ padding: 10 }}>
                <span style={{ color: i.customer_count > 0 ? "#111827" : "#9ca3af", fontSize: 13 }}>
                  {i.customer_count > 0 ? `${i.customer_count} customer${i.customer_count === 1 ? "" : "s"}` : "—"}
                </span>
              </td>
              <td style={{ padding: 10 }}>
                <span style={{ fontWeight: 600, color: i.priority_score >= 10 ? "#ef4444" : i.priority_score >= 5 ? "#f59e0b" : "#6b7280" }}>
                  {i.priority_score}
                </span>
              </td>
              <td style={{ padding: 10 }}>
                <span style={{ background: SEV_COLOR[i.severity] ?? "#9ca3af", color: "white", padding: "2px 8px", borderRadius: 999, fontSize: 12 }}>
                  {i.severity}
                </span>
              </td>
              <td style={{ padding: 10 }} onClick={(e) => e.stopPropagation()}>
                <select value={i.status} onChange={(e) => void setStatus(i.id, e.target.value)} style={selectStyle}>
                  <option value="open">open</option>
                  <option value="in_progress">in_progress</option>
                  <option value="blocked">blocked</option>
                  <option value="done">done</option>
                  <option value="wontfix">wontfix</option>
                </select>
              </td>
              <td style={{ padding: 10 }} onClick={(e) => e.stopPropagation()}>
                <select value={i.assignee_id ?? ""} onChange={(e) => void setAssignee(i.id, e.target.value || null)} style={selectStyle}>
                  <option value="">— unassigned —</option>
                  {assignableOps.map((o) => <option key={o.user_id} value={o.user_id}>{o.role}: {o.user_id.slice(0, 8)}…</option>)}
                </select>
              </td>
            </tr>
          ))}
          {filtered.length === 0 ? (
            <tr><td colSpan={7} style={{ padding: 20, textAlign: "center", color: "#9ca3af" }}>
              {issues === null ? "Loading…" : "No issues."}
            </td></tr>
          ) : null}
        </tbody>
      </table>

      <Modal
        open={drillIssue !== null}
        onClose={() => setDrillIssue(null)}
        title={drillIssue ? `${drillIssue.title} · ${drillIssue.flag_count} flag${drillIssue.flag_count === 1 ? "" : "s"} from ${drillIssue.customer_count} customer${drillIssue.customer_count === 1 ? "" : "s"}` : ""}
        width={800}
      >
        {!drillFlags ? (
          <p style={{ color: "#9ca3af", fontStyle: "italic" }}>Loading linked flags…</p>
        ) : drillFlags.length === 0 ? (
          <p style={{ color: "#9ca3af", fontStyle: "italic" }}>No linked flags.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#6b7280", fontSize: 12 }}>
                <th style={{ padding: 6 }}>Customer</th>
                <th style={{ padding: 6 }}>Reported</th>
                <th style={{ padding: 6 }}>Severity</th>
                <th style={{ padding: 6 }}>Title</th>
              </tr>
            </thead>
            <tbody>
              {drillFlags.map((f) => (
                <tr key={f.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                  <td style={{ padding: 6 }}>{f.company_name}</td>
                  <td style={{ padding: 6, color: "#9ca3af", fontSize: 11 }}>{new Date(f.reported_at).toLocaleString()}</td>
                  <td style={{ padding: 6 }}>
                    <span style={{ background: SEV_COLOR[f.severity] ?? "#9ca3af", color: "white", padding: "1px 6px", borderRadius: 999, fontSize: 11 }}>{f.severity}</span>
                  </td>
                  <td style={{ padding: 6 }}>{f.title}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: "white", color: "#111827", border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
      <div style={{ color: "#6b7280", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, marginTop: 2, color }}>{value}</div>
    </div>
  );
}
