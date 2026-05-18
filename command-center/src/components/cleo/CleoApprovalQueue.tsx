// CleoApprovalQueue — surfaces cleo_packages rows that need admin action.
//
// Why this exists separately from CleoCustomerList: cleo_packages rows can
// exist for customers that don't have a row in `companies` (test / smoke /
// orphan packages). The customer detail flow requires a companies row, so
// those packages would be invisible. This queue reads cleo_packages
// directly and surfaces the Release-to-client action inline.
//
// S2 scope: Release-to-client button only. The other proposal §2.4 buttons
// (Build now, Accept-confirm, Mark needs-info, Reject) land in later
// sessions once their downstream wiring exists.

import { useCallback, useEffect, useState } from "react";
import { getFactorySupabase } from "../../lib/factorySupabase";

interface CleoPackage {
  id: string;
  company_id: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_website: string | null;
  priority: "p0" | "p1" | "p2";
  status: string;
  received_at: string;
  updated_at: string;
  released_for_client_at: string | null;
  released_by: string | null;
}

// Only awaiting-approval is actionable here — once released, the row leaves
// the queue. Other lifecycle stages (accepted, building, etc.) are tracked
// on the customer detail page in later sessions.
const ACTIONABLE_STATES = ["awaiting-approval"] as const;

export function CleoApprovalQueue(): JSX.Element | null {
  const [rows, setRows] = useState<CleoPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    const sb = getFactorySupabase();
    const { data, error: err } = await sb
      .from("cleo_packages")
      .select(
        "id, company_id, customer_name, customer_email, customer_website, priority, status, received_at, updated_at, released_for_client_at, released_by",
      )
      .in("status", ACTIONABLE_STATES as unknown as string[])
      .order("received_at", { ascending: true });
    if (err) {
      setError(err.message);
    } else {
      setRows((data ?? []) as CleoPackage[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
    const sb = getFactorySupabase();
    const ch = sb
      .channel("cleo-approval-queue")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cleo_packages" },
        () => void reload(),
      )
      .subscribe();
    return () => { void sb.removeChannel(ch); };
  }, [reload]);

  const releaseToClient = async (pkg: CleoPackage) => {
    if (pkg.status !== "awaiting-approval") return; // guard
    setBusyId(pkg.id);
    try {
      const sb = getFactorySupabase();
      const { data: session } = await sb.auth.getSession();
      const userId = session.session?.user?.id ?? null;
      const { error: err } = await sb
        .from("cleo_packages")
        .update({
          status: "released-for-client",
          released_for_client_at: new Date().toISOString(),
          released_by: userId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pkg.id)
        .eq("status", "awaiting-approval"); // optimistic-lock against double-clicks
      if (err) {
        setError(`Release failed: ${err.message}`);
      }
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return null;
  if (rows.length === 0) return null;

  return (
    <section className="approval-queue">
      <header className="approval-queue-header">
        <h2>Approval queue</h2>
        <span className="dim">{rows.length} package{rows.length === 1 ? "" : "s"} awaiting admin action</span>
      </header>
      {error ? <div className="approval-queue-error">{error}</div> : null}
      <table className="table">
        <thead>
          <tr>
            <th>Customer</th>
            <th>Website</th>
            <th>Priority</th>
            <th>Status</th>
            <th>Received</th>
            <th aria-label="actions" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <div className="approval-queue-customer">
                  <strong>{r.customer_name ?? "—"}</strong>
                  {r.customer_email ? (
                    <span className="dim mono">{r.customer_email}</span>
                  ) : null}
                </div>
              </td>
              <td className="dim">{r.customer_website ? stripHttp(r.customer_website) : "—"}</td>
              <td>
                <span className={`pill priority-${r.priority}`}>{r.priority}</span>
              </td>
              <td>
                <span className="pill running">
                  <span className="pill-dot" />
                  {r.status}
                </span>
              </td>
              <td className="dim mono">{relativeTime(r.received_at)}</td>
              <td className="approval-queue-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void releaseToClient(r)}
                  disabled={busyId === r.id}
                >
                  {busyId === r.id ? "Releasing…" : "Release to client"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function stripHttp(u: string): string {
  return u.replace(/^https?:\/\/(www\.)?/, "");
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.max(1, Math.floor(ms / 1000))}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return `${Math.floor(ms / 86_400_000)}d ago`;
}
