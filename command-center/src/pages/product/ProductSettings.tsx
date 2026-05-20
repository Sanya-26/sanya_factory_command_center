// Product · Settings page — CTO-only role assignment UI.

import { useEffect, useState } from "react";
import { getFactorySupabase } from "../../lib/factorySupabase";

const ROLES = [
  "product_manager",
  "tech",
  "cto",
  "ceo",
  "founder",
  "admin",
  "operator",
  "ops",
  "counsel",
  "content",
  "staff",
  "viewer",
];

interface OpsRow {
  user_id: string;
  role: string;
  slack_user_id: string | null;
}

export function ProductSettingsPage({ userRole }: { userRole: string }): JSX.Element {
  const [rows, setRows] = useState<OpsRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const sb = getFactorySupabase();
    const { data, error: err } = await sb
      .from("ops_users")
      .select("user_id, role, slack_user_id")
      .order("role");
    if (err) { setError(err.message); return; }
    setRows((data ?? []) as OpsRow[]);
  }
  useEffect(() => { void load(); }, []);

  if (userRole !== "cto") {
    return (
      <div style={{ padding: 24 }}>
        <h1>Settings</h1>
        <p style={{ color: "#6b7280" }}>
          Only CTO can manage roles. Your role: <strong>{userRole}</strong>.
        </p>
      </div>
    );
  }

  async function setRole(user_id: string, role: string) {
    const sb = getFactorySupabase();
    const { error: err } = await sb.from("ops_users").update({ role }).eq("user_id", user_id);
    if (err) { setError(err.message); return; }
    await load();
  }

  return (
    <div style={{ padding: 24, display: "grid", gap: 16 }}>
      <h1 style={{ margin: 0 }}>Role assignment</h1>
      <p style={{ color: "#6b7280", margin: 0 }}>
        Only CTO can change roles. Changes take effect on next page reload.
      </p>
      {error ? <div style={{ background: "#fee2e2", color: "#b91c1c", padding: 10, borderRadius: 6 }}>{error}</div> : null}

      <table style={{ width: "100%", borderCollapse: "collapse", background: "white", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
        <thead>
          <tr style={{ background: "#f9fafb", textAlign: "left", color: "#6b7280", fontSize: 12 }}>
            <th style={{ padding: 10 }}>User ID</th>
            <th style={{ padding: 10 }}>Role</th>
            <th style={{ padding: 10 }}>Slack</th>
          </tr>
        </thead>
        <tbody>
          {(rows ?? []).map((r) => (
            <tr key={r.user_id} style={{ borderTop: "1px solid #f3f4f6" }}>
              <td style={{ padding: 10, fontFamily: "monospace", fontSize: 12 }}>{r.user_id}</td>
              <td style={{ padding: 10 }}>
                <select value={r.role} onChange={(e) => void setRole(r.user_id, e.target.value)}>
                  {ROLES.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </td>
              <td style={{ padding: 10, color: "#9ca3af" }}>{r.slack_user_id ?? "—"}</td>
            </tr>
          ))}
          {(rows?.length ?? 0) === 0 ? <tr><td colSpan={3} style={{ padding: 20, textAlign: "center", color: "#9ca3af" }}>No ops users.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}
