// Compact Monday board summary for ProductHome.
// Shows: In progress · Stuck · Done · Due in 3 days.

import { useEffect, useState } from 'react';
import { fetchBoardSummary, type MondayBoardSummary } from '../lib/monday-data';

interface MondayBoardSummaryWidgetProps {
  boardId: string;
}

export function MondayBoardSummaryWidget({ boardId }: MondayBoardSummaryWidgetProps) {
  const [summary, setSummary] = useState<MondayBoardSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchBoardSummary(boardId)
      .then((data) => {
        setSummary(data);
        setLoading(false);
      })
      .catch((err) => {
        setError((err as Error).message);
        setLoading(false);
      });
  }, [boardId]);

  if (loading) {
    return (
      <div style={{ padding: '16px', color: '#9ca3af', fontSize: 13 }}>
        Loading Monday data…
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div style={{ padding: '16px', color: '#dc2626', fontSize: 13 }}>
        Could not load Monday data
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12,
      }}
    >
      <div
        style={{
          padding: '12px',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 24, fontWeight: 700, color: '#3b82f6' }}>
          {summary.inProgress}
        </div>
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>In progress</div>
      </div>

      <div
        style={{
          padding: '12px',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          textAlign: 'center',
          background: summary.stuck > 0 ? '#fee2e2' : 'transparent',
        }}
      >
        <div style={{ fontSize: 24, fontWeight: 700, color: summary.stuck > 0 ? '#dc2626' : '#10b981' }}>
          {summary.stuck}
        </div>
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Stuck</div>
      </div>

      <div
        style={{
          padding: '12px',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 24, fontWeight: 700, color: '#10b981' }}>
          {summary.done}
        </div>
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Done</div>
      </div>

      <div
        style={{
          padding: '12px',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 24, fontWeight: 700, color: '#f59e0b' }}>
          {summary.dueWithin3Days}
        </div>
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Due soon</div>
      </div>
    </div>
  );
}
