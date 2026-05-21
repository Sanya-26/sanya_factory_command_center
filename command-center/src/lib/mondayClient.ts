// Monday.com GraphQL client. Proxied through Vite dev server in local mode.
// Calls /api/monday which forwards to https://api.monday.com/v2 with Authorization header injected.

export interface MondayError {
  message: string;
  locations?: Array<{ line: number; column: number }>;
}

export async function mondayQuery<T>(
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const body = JSON.stringify({ query, variables });

  const response = await fetch('/api/monday', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!response.ok) {
    throw new Error(`Monday API request failed: ${response.status} ${response.statusText}`);
  }

  const data: { data?: T; errors?: MondayError[] } = await response.json();

  if (data.errors && data.errors.length > 0) {
    throw new Error(`Monday GraphQL error: ${data.errors.map((e) => e.message).join('; ')}`);
  }

  if (!data.data) {
    throw new Error('Monday API returned no data');
  }

  return data.data;
}
