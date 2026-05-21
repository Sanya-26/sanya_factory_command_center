// Tech view: Project Management page — full task tracker view.
// Displays at /#factory/project-management.

import { useEffect, useMemo, useState } from 'react';
import { getFactorySupabase } from '../../lib/factorySupabase';
import { KpiTile } from '../../components/KpiTile';
import { ProjectTaskSection } from '../../components/ProjectTaskSection';
import type { TechIssue, OpsUser } from '../../lib/team-data';

export function ProjectManagementPage(): JSX.Element {
  const [issues, setIssues] = useState<TechIssue[]>([]);
  const [users, setUsers] = useState<OpsUser[]>([]);

  useEffect(() => {
    const sb = getFactorySupabase();
    Promise.all([
      sb.from('tech_issues').select('*'),
      sb.from('ops_users').select('user_id, email, display_name, role'),
    ]).then(([{ data: i }, { data: u }]) => {
      setIssues((i ?? []) as TechIssue[]);
      setUsers((u ?? []) as OpsUser[]);
    });
  }, []);

  const stats = useMemo(() => {
    return {
      total: issues.length,
      open: issues.filter((i) => i.status === 'open').length,
      in_progress: issues.filter((i) => i.status === 'in_progress').length,
      blocked: issues.filter((i) => i.status === 'blocked').length,
      done: issues.filter((i) => i.status === 'done').length,
    };
  }, [issues]);

  return (
    <div style={{ padding: 24, display: 'grid', gap: 20, maxWidth: 1280 }}>
      <header>
        <h1 style={{ margin: 0 }}>Project Management</h1>
        <p style={{ color: '#9ca3af', margin: '4px 0 0', fontSize: 13 }}>
          All engineering tasks across all projects.
        </p>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        <KpiTile label="Total tasks" value={String(stats.total)} insight="All tasks in system." />
        <KpiTile label="Open" value={String(stats.open)} insight="Not yet started." />
        <KpiTile label="In progress" value={String(stats.in_progress)} insight="Currently being worked." />
        <KpiTile
          label="Blocked"
          value={String(stats.blocked)}
          valueColor={stats.blocked > 0 ? '#dc2626' : '#10b981'}
          insight={stats.blocked > 0 ? 'Needs unblocking.' : 'None blocked.'}
        />
        <KpiTile label="Done" value={String(stats.done)} insight="Completed tasks." />
      </section>

      <ProjectTaskSection issues={issues} users={users} />
    </div>
  );
}
