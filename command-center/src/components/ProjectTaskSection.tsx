// Project tasks section — displays tech_issues with filters by project, assignee, status, priority.
// Shows progress: open count, in-progress count, done count.

import { useMemo, useState } from 'react';
import type { TechIssue, OpsUser } from '../lib/team-data';

interface ProjectTaskSectionProps {
  issues: TechIssue[];
  users: OpsUser[];
}

type Priority = 'normal' | 'high' | 'urgent' | undefined;
type Status = 'open' | 'in_progress' | 'blocked' | 'done' | 'wontfix';

const priorityColor = (p: Priority | string): string => {
  switch (p) {
    case 'urgent':
      return '#dc2626';
    case 'high':
      return '#f59e0b';
    case 'normal':
    default:
      return '#9ca3af';
  }
};

const statusColor = (s: Status | string): string => {
  switch (s) {
    case 'done':
      return '#10b981';
    case 'in_progress':
      return '#3b82f6';
    case 'blocked':
      return '#ef4444';
    case 'open':
      return '#9ca3af';
    case 'wontfix':
      return '#6b7280';
    default:
      return '#9ca3af';
  }
};

export function ProjectTaskSection({ issues, users }: ProjectTaskSectionProps) {
  const [open, setOpen] = useState(false);
  const [filterProject, setFilterProject] = useState<string>('');
  const [filterAssignee, setFilterAssignee] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterPriority, setFilterPriority] = useState<string>('');

  // Distinct projects (company_ids) — show them by a name if available
  const projects = useMemo(() => {
    const uniq = new Set(issues.map((i) => i.company_id).filter(Boolean));
    return Array.from(uniq).sort();
  }, [issues]);

  // Distinct assignees
  const assignees = useMemo(() => {
    const uniq = new Set(issues.map((i) => i.assignee_id).filter(Boolean));
    return Array.from(uniq).sort();
  }, [issues]);

  // Filtered issues
  const filtered = useMemo(() => {
    let result = issues;

    if (filterProject) {
      result = result.filter((i) => i.company_id === filterProject);
    }
    if (filterAssignee) {
      result = result.filter((i) => i.assignee_id === filterAssignee);
    }
    if (filterStatus) {
      result = result.filter((i) => i.status === filterStatus);
    }
    if (filterPriority) {
      result = result.filter((i) => i.priority === filterPriority);
    }

    return result.sort((a, b) => {
      // Sort by: status (open first), then priority (urgent first), then age (newest first)
      const statusOrder = { open: 0, in_progress: 1, blocked: 2, done: 3, wontfix: 4 };
      const priorityOrder = { urgent: 0, high: 1, normal: 2 };
      const aSts = statusOrder[a.status as Status] ?? 99;
      const bSts = statusOrder[b.status as Status] ?? 99;
      if (aSts !== bSts) return aSts - bSts;
      const aPri = priorityOrder[(a.priority as Priority) ?? 'normal'] ?? 99;
      const bPri = priorityOrder[(b.priority as Priority) ?? 'normal'] ?? 99;
      if (aPri !== bPri) return aPri - bPri;
      return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
    });
  }, [issues, filterProject, filterAssignee, filterStatus, filterPriority]);

  // Progress counts (of all issues, not filtered)
  const allStats = {
    open: issues.filter((i) => i.status === 'open').length,
    in_progress: issues.filter((i) => i.status === 'in_progress').length,
    blocked: issues.filter((i) => i.status === 'blocked').length,
    done: issues.filter((i) => i.status === 'done').length,
  };

  const getAssigneeName = (id: string | null | undefined) => {
    if (!id) return '—';
    return users.find((u) => u.user_id === id)?.display_name ?? id.slice(0, 8);
  };

  return (
    <section style={{ padding: '24px 0' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: 0,
          fontSize: 16,
          fontWeight: 600,
          color: '#111827',
          marginBottom: open ? 16 : 0,
        }}
      >
        <span>{open ? '▼' : '▶'}</span>
        <span>Projects & tasks</span>
        <span style={{ fontSize: 13, fontWeight: 400, color: '#6b7280' }}>
          ({allStats.open} open · {allStats.in_progress} in progress · {allStats.done} done)
        </span>
      </button>

      {open && (
        <div style={{ display: 'grid', gap: 12 }}>
          {/* Filter bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>
                Project
              </label>
              <select
                value={filterProject ?? ''}
                onChange={(e) => setFilterProject(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  fontSize: 12,
                  border: '1px solid #e5e7eb',
                  borderRadius: 4,
                }}
              >
                <option value="">All projects ({projects.length})</option>
                {projects.map((p) => (
                  <option key={p} value={p ?? ''}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>
                Assignee
              </label>
              <select
                value={filterAssignee ?? ''}
                onChange={(e) => setFilterAssignee(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  fontSize: 12,
                  border: '1px solid #e5e7eb',
                  borderRadius: 4,
                }}
              >
                <option value="">All assignees ({assignees.length})</option>
                {assignees.map((a) => (
                  <option key={a} value={a ?? ''}>
                    {getAssigneeName(a)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>
                Status
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  fontSize: 12,
                  border: '1px solid #e5e7eb',
                  borderRadius: 4,
                }}
              >
                <option value="">All statuses</option>
                <option value="open">Open</option>
                <option value="in_progress">In progress</option>
                <option value="blocked">Blocked</option>
                <option value="done">Done</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4 }}>
                Priority
              </label>
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  fontSize: 12,
                  border: '1px solid #e5e7eb',
                  borderRadius: 4,
                }}
              >
                <option value="">All priorities</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="normal">Normal</option>
              </select>
            </div>
          </div>

          {/* Task table */}
          {filtered.length === 0 ? (
            <div style={{ color: '#9ca3af', fontSize: 13, padding: '16px 0' }}>
              No tasks match the filter.
            </div>
          ) : (
            <div
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
                  gap: 0,
                  padding: '8px 12px',
                  background: '#f9fafb',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#6b7280',
                  borderBottom: '1px solid #e5e7eb',
                }}
              >
                <div>Task name</div>
                <div>Assignee</div>
                <div>Status</div>
                <div>Priority</div>
                <div>Age</div>
              </div>
              {filtered.map((issue, i) => {
                const ageMs = Date.now() - new Date(issue.created_at ?? 0).getTime();
                const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

                return (
                  <div
                    key={issue.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr',
                      gap: 0,
                      padding: '10px 12px',
                      borderTop: i === 0 ? 'none' : '1px solid #f3f4f6',
                      background: 'transparent',
                      fontSize: 13,
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {issue.title}
                    </div>
                    <div style={{ color: '#6b7280', fontSize: 12 }}>
                      {getAssigneeName(issue.assignee_id)}
                    </div>
                    <div>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: statusColor(issue.status),
                          color: 'white',
                          fontSize: 11,
                          fontWeight: 500,
                        }}
                      >
                        {issue.status}
                      </span>
                    </div>
                    <div>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: priorityColor(issue.priority),
                          color: 'white',
                          fontSize: 11,
                          fontWeight: 500,
                        }}
                      >
                        {issue.priority ?? 'normal'}
                      </span>
                    </div>
                    <div style={{ color: '#6b7280', fontSize: 12 }}>
                      {ageDays}d
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
