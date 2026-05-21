// Monday board display — collapsible table of items.
// Used in ProductTeam (collapsed by default) and ProjectManagement (expanded by default).

import { useState, useEffect } from 'react';
import { fetchBoardItems, type MondayItem } from '../lib/monday-data';

interface MondayBoardSectionProps {
  boardId: string;
  expanded?: boolean;
}

export function MondayBoardSection({ boardId, expanded = false }: MondayBoardSectionProps) {
  const [items, setItems] = useState<MondayItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(expanded);

  useEffect(() => {
    if (!open) return;

    setLoading(true);
    setError(null);
    fetchBoardItems(boardId)
      .then((data) => {
        setItems(data);
        setLoading(false);
      })
      .catch((err) => {
        setError((err as Error).message);
        setLoading(false);
      });
  }, [boardId, open]);

  const statusColor = (status: string): string => {
    switch (status) {
      case 'Done':
        return '#10b981';
      case 'Working on it':
        return '#3b82f6';
      case 'Stuck':
        return '#ef4444';
      default:
        return '#9ca3af';
    }
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
        <span>Monday board</span>
        <span style={{ fontSize: 13, fontWeight: 400, color: '#6b7280' }}>({items.length} items)</span>
      </button>

      {open && (
        <div>
          {loading && <div style={{ color: '#9ca3af', fontSize: 13 }}>Loading…</div>}
          {error && <div style={{ color: '#dc2626', fontSize: 13 }}>Error: {error}</div>}
          {!loading && !error && items.length === 0 && (
            <div style={{ color: '#9ca3af', fontSize: 13 }}>No items found.</div>
          )}
          {!loading && !error && items.length > 0 && (
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
                  gridTemplateColumns: '2fr 1fr 1fr 1fr',
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
                <div>Owner</div>
                <div>Status</div>
                <div>Due date</div>
              </div>
              {items.map((item, i) => {
                const owner = item.column_values.find((cv) => cv.id === 'person')?.text ?? '—';
                const status = item.column_values.find((cv) => cv.id === 'status')?.text ?? '—';
                const dueDate = item.column_values.find((cv) => cv.id === 'date_mm1jqnpr')?.text ?? '—';
                const isStuck = status === 'Stuck';

                return (
                  <div
                    key={item.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '2fr 1fr 1fr 1fr',
                      gap: 0,
                      padding: '10px 12px',
                      borderTop: i === 0 ? 'none' : '1px solid #f3f4f6',
                      background: isStuck ? '#fee2e2' : 'transparent',
                      fontSize: 13,
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.name}
                    </div>
                    <div style={{ color: '#6b7280', fontSize: 12 }}>{owner}</div>
                    <div>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: 4,
                          background: statusColor(status),
                          color: 'white',
                          fontSize: 11,
                          fontWeight: 500,
                        }}
                      >
                        {status}
                      </span>
                    </div>
                    <div style={{ color: '#6b7280', fontSize: 12 }}>{dueDate === '' ? '—' : dueDate}</div>
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
