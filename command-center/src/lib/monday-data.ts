// Monday.com board data types and fetchers.
// Queries the AUBOS Sprints board (ID: 18403740335).

import { mondayQuery } from './mondayClient';

export interface MondayColumnValue {
  id: string;
  text: string;
}

export interface MondayGroup {
  id: string;
  title: string;
}

export interface MondayItem {
  id: string;
  name: string;
  group: MondayGroup;
  column_values: MondayColumnValue[];
}

export interface MondayUser {
  id: number;
  name: string;
  email: string;
}

export interface MondayBoardSummary {
  inProgress: number;
  stuck: number;
  done: number;
  dueWithin3Days: number;
}

// Fetch all items from the board with key columns.
export async function fetchBoardItems(boardId: string): Promise<MondayItem[]> {
  const query = `{
    boards(ids: [${boardId}]) {
      items_page(limit: 100) {
        items {
          id
          name
          group { id title }
          column_values(ids: ["person","status","status_1","date_mm1jqnpr"]) {
            id
            text
          }
        }
      }
    }
  }`;

  const result = await mondayQuery<{
    boards: Array<{
      items_page: {
        items: MondayItem[];
      };
    }>;
  }>(query);

  return result.boards[0]?.items_page.items ?? [];
}

// Fetch Monday users (for name→id mapping).
export async function fetchMondayUsers(): Promise<MondayUser[]> {
  const query = `{
    users {
      id
      name
      email
    }
  }`;

  const result = await mondayQuery<{
    users: MondayUser[];
  }>(query);

  return result.users ?? [];
}

// Summarize board state: in-progress, stuck, done, due soon.
export async function fetchBoardSummary(boardId: string): Promise<MondayBoardSummary> {
  const items = await fetchBoardItems(boardId);
  const now = new Date();
  const threeDaysAway = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  let inProgress = 0;
  let stuck = 0;
  let done = 0;
  let dueWithin3Days = 0;

  items.forEach((item) => {
    const status = item.column_values.find((cv) => cv.id === 'status')?.text ?? '';
    const dueDate = item.column_values.find((cv) => cv.id === 'date_mm1jqnpr')?.text ?? '';

    if (status === 'Stuck') {
      stuck++;
    } else if (status === 'Done') {
      done++;
    } else if (status === 'Working on it') {
      inProgress++;
    }

    if (dueDate) {
      const due = new Date(dueDate);
      if (due <= threeDaysAway && due >= now) {
        dueWithin3Days++;
      }
    }
  });

  return { inProgress, stuck, done, dueWithin3Days };
}

// Map internal status to Monday status label.
export function mapStatusToMonday(status: 'open' | 'in_progress' | 'blocked' | 'done'): string {
  switch (status) {
    case 'done':
      return 'Done';
    case 'blocked':
      return 'Stuck';
    case 'open':
    case 'in_progress':
      return 'Working on it';
  }
}

// Map Monday status label back to internal status.
export function mapMondayStatusToInternal(
  status: string
): 'open' | 'in_progress' | 'blocked' | 'done' | null {
  switch (status) {
    case 'Done':
      return 'done';
    case 'Stuck':
      return 'blocked';
    case 'Working on it':
      return 'in_progress';
    default:
      return null;
  }
}
