// Right-side drawer for a single engineer. Lists their issues grouped by status.

import { useEffect, useMemo, useState } from "react";
import { getFactorySupabase } from "../lib/factorySupabase";
import { navigate } from "../shell/route";
import type { TechIssue } from "../lib/team-data";

const SEVERITY_COLOR: Record<string, { bg: string; fg: string }> = {
  low: { bg: "#f3f4f6", fg: "#374151" },
  medium: { bg: "#fef3c7", fg: "#92400e" },
  high: { bg: "#fed7aa", fg: "#9a3412" },
  critical: { bg: "#fee2e2", fg: "#991b1b" },
};

const DAY_MS = 86_400_000;
function age(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
}

export function EngineerQueueDrawer({
  open,
  onClose,
  engineerId,
  engineerName,
  engineerRole,
}: {
  open: boolean;
  onClose: () => void;
  engineerId: string | null;
  engineerName: string;
  engineerRole: string;
}): JSX.Element | null {
  const [issues, setIssues] = useState<TechIssue[]>([]);

  useEffect(() => {
    if (!open || !engineerId) return;
    void (async () => {
      const sb = getFactorySupabase();
      const { data } = await sb.from("tech_issues").select("*").eq("assignee_id", engineerId);
      setIssues((data ?? []) as TechIssue[]);
    })();
  }, [open, engineerId]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const groups = useMemo(() => {
    const inProgress = issues.filter((i) => i.status === "in_progress");
    const openIssues = issues.filter((i) => i.status === "open");
    const blocked = issues.filter((i) => i.status === "blocked");
    const recentlyClosed = issues
      .filter((i) => i.status === "done" && i.closed_at && Date.now() - new Date(i.closed_at).getTime() <= 14 * DAY_MS)
      .sort((a, b) => new Date(b.closed_at!).getTime() - new Date(a.closed_at!).getTime());
    return { inProgress, openIssues, blocked, recentlyClosed };
  }, [issues]);

  const closedLast7d = issues.filter(
    (i) => i.status === "done" && i.closed_at && Date.now() - new Date(i.closed_at!).getTime() <= 7 * DAY_MS,
  ).length;

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.55)",
        zIndex: 100,
        display: "flex",
        justifyContent: "flex-end",
      }}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(520px, 90vw)",
          background: "white",
          color: "#111827",
          height: "100vh",
          overflow: "auto",
          boxShadow: "-12px 0 30px rgba(0,0,0,0.2)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <header style={{ padding: "16px 20px", borderBottom: "1px solid #e5e7eb", display: "grid", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>{engineerName}</h2>
            <span
              style={{
                background: engineerRole === "cto" ? "#ede9fe" : "#dbeafe",
                color: engineerRole === "cto" ? "#5b21b6" : "#1e40af",
                padding: "1px 8px",
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              {engineerRole}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{ marginLeft: "auto", background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#6b7280", lineHeight: 1 }}
            >
              ×
            </button>
          </div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            {groups.openIssues.length} open · {groups.inProgress.length} in progress · {groups.blocked.length} blocked · 7d closed: {closedLast7d}
          </div>
        </header>

        <div style={{ padding: 20, display: "grid", gap: 20 }}>
          <Group title="In progress" rows={groups.inProgress} ageFn={(i) => age(i.updated_at)} ageLabel="Last touched" emptyText="Nothing in progress." />
          <Group title="Blocked" rows={groups.blocked} ageFn={(i) => age(i.updated_at)} ageLabel="Stuck for" emptyText="No blocked items." accent="#dc2626" />
          <Group title="Open · not started" rows={groups.openIssues} ageFn={(i) => age(i.created_at)} ageLabel="Sitting for" emptyText="Backlog is empty." />
          <Group title="Closed · last 14 days" rows={groups.recentlyClosed} ageFn={(i) => age(i.closed_at ?? i.updated_at)} ageLabel="Closed" emptyText="Nothing closed in the last 2 weeks." accent="#10b981" />
        </div>
      </aside>
    </div>
  );
}

function Group({
  title,
  rows,
  ageFn,
  ageLabel,
  emptyText,
  accent,
}: {
  title: string;
  rows: TechIssue[];
  ageFn: (i: TechIssue) => number;
  ageLabel: string;
  emptyText: string;
  accent?: string;
}) {
  return (
    <section>
      <h3 style={{ margin: "0 0 8px", fontSize: 12, color: accent ?? "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
        {title} · {rows.length}
      </h3>
      {rows.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: "#9ca3af", fontStyle: "italic" }}>{emptyText}</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, border: "1px solid #f3f4f6", borderRadius: 8 }}>
          {rows.map((i, idx) => {
            const sev = SEVERITY_COLOR[i.severity] ?? SEVERITY_COLOR.low;
            return (
              <li
                key={i.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto",
                  gap: 10,
                  alignItems: "center",
                  padding: "10px 12px",
                  borderTop: idx === 0 ? "none" : "1px solid #f3f4f6",
                  fontSize: 12,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.title}</div>
                  <div style={{ color: "#9ca3af", fontSize: 10, marginTop: 2 }}>{ageLabel}: {ageFn(i)}d ago</div>
                </div>
                <span
                  style={{
                    background: sev.bg,
                    color: sev.fg,
                    padding: "1px 6px",
                    borderRadius: 999,
                    fontSize: 9,
                    fontWeight: 600,
                    textTransform: "uppercase",
                  }}
                >
                  {i.severity}
                </span>
                <button
                  type="button"
                  onClick={() => navigate({ dept: "product", section: "issues" })}
                  style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", fontSize: 11 }}
                >
                  Open →
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
