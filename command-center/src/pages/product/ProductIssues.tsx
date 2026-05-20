// Product · Issues page — tech_issues tracker, with create form.

import { useEffect, useState } from "react";
import { getFactorySupabase } from "../../lib/factorySupabase";

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
}
interface OpsUser {
  user_id: string;
  role: string;
}

export function ProductIssuesPage({ userId }: { userId: string }): JSX.Element {
  const [issues, setIssues] = useState<TechIssue[] | null>(null);
  const [ops, setOps] = useState<OpsUser[]>([]);
  const [filter, setFilter] = useState<"open" | "all">("open");
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
      <header style={{ display: "flex", gap: 16, alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Issues</h1>
        <select value={filter} onChange={(e) => setFilter(e.target.value as "open" | "all")}>
          <option value="open">Open only</option>
          <option value="all">All</option>
        </select>
        <button type="button" className="btn" onClick={() => setCreating(true)} style={{ marginLeft: "auto" }}>
          + New issue
        </button>
      </header>

      {error ? <div style={{ background: "#fee2e2", color: "#b91c1c", padding: 10, borderRadius: 6 }}>{error}</div> : null}

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
            <label>Severity:
              <select value={newIssue.severity} onChange={(e) => setNewIssue({ ...newIssue, severity: e.target.value })}>
                <option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="critical">critical</option>
              </select>
            </label>
            <label>Priority:
              <select value={newIssue.priority} onChange={(e) => setNewIssue({ ...newIssue, priority: e.target.value })}>
                <option value="normal">normal</option><option value="high">high</option><option value="urgent">urgent</option>
              </select>
            </label>
            <label>Assignee:
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

      <table style={{ width: "100%", borderCollapse: "collapse", background: "white", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
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
          {(issues ?? []).map((i) => (
            <tr key={i.id} style={{ borderTop: "1px solid #f3f4f6" }}>
              <td style={{ padding: 10 }}>{i.title}</td>
              <td style={{ padding: 10 }}>{i.severity}</td>
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
          {(issues?.length ?? 0) === 0 ? (
            <tr><td colSpan={6} style={{ padding: 20, textAlign: "center", color: "#9ca3af" }}>No issues.</td></tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
