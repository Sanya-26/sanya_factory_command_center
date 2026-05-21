// Tech view: Project Management page showing the complete Monday board.
// Displays at /#factory/project-management.

import { useState, useEffect } from 'react';
import { fetchBoardItems, fetchBoardSummary, type MondayBoardSummary } from '../../lib/monday-data';
import { KpiTile } from '../../components/KpiTile';
import { MondayBoardSection } from '../../components/MondayBoardSection';

const MONDAY_BOARD_ID = (import.meta.env.VITE_MONDAY_BOARD_ID as string | undefined) ?? '18403740335';

export function ProjectManagementPage(): JSX.Element {
  const [summary, setSummary] = useState<MondayBoardSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchBoardSummary(MONDAY_BOARD_ID)
      .then((data) => {
        setSummary(data);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  return (
    <div style={{ padding: 24, display: 'grid', gap: 20, maxWidth: 1280 }}>
      <header>
        <h1 style={{ margin: 0 }}>Project Management</h1>
        <p style={{ color: '#9ca3af', margin: '4px 0 0', fontSize: 13 }}>
          Complete Monday board — all sprints, all team members.
        </p>
      </header>

      {loading ? (
        <div style={{ color: '#9ca3af' }}>Loading…</div>
      ) : summary ? (
        <>
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <KpiTile label="Total items" value={String(summary.inProgress + summary.stuck + summary.done)} insight="All items across board." />
            <KpiTile label="In progress" value={String(summary.inProgress)} insight="Currently being worked on." />
            <KpiTile
              label="Stuck items"
              value={String(summary.stuck)}
              valueColor={summary.stuck > 0 ? '#dc2626' : '#10b981'}
              insight={summary.stuck > 0 ? 'Needs attention.' : 'None blocked.'}
            />
            <KpiTile label="Done" value={String(summary.done)} insight="Completed tasks." />
          </section>

          <MondayBoardSection boardId={MONDAY_BOARD_ID} expanded={true} />
        </>
      ) : null}
    </div>
  );
}
