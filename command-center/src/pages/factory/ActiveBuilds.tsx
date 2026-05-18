// ActiveBuilds — the operator's "is my factory healthy?" page.
//
// Surfaces:
//   • Every build_run with status in (queued, running, refire-requested)
//   • Recent failures + blocks (status in (failed, blocked))
//   • Per-build: stage, last heartbeat age, ticket progress, Refire button
//
// The Refire button POSTs to functions/v1/factory-refire which calls
// requeue_build_run + clears stuck ticket_queue rows + resolves alerts.
//
// Live-updates via 8s polling. The page is read-only to non-admins; admins
// see the Refire button.

import { useEffect, useMemo, useState } from "react";
import { getFactorySupabase } from "../../lib/factorySupabase";

interface BuildRow {
  id: string;
  package_id: string | null;
  kind: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  total_cost_usd: number | null;
  duration_ms: number | null;
  claimed_by: string | null;
  claimed_at: string | null;
  last_heartbeat_at: string | null;
  heartbeat_payload: Record<string, unknown> | null;
  errors: unknown;
}

interface TicketRow {
  build_run_id: string;
  status: string;
  rank: number;
  ticket_id: string;
  layer: string;
  module: string;
}

interface AlertRow {
  id: string;
  build_run_id: string | null;
  kind: string;
  severity: string;
  message: string | null;
  payload: Record<string, unknown> | null;
  ts: string;
  resolved_at: string | null;
}

interface ProgressByBuild {
  total: number;
  done: number;
  failed: number;
  pending: number;
  in_progress: number;
}

function formatAge(iso: string | null): string {
  if (!iso) return "—";
  const min = (Date.now() - new Date(iso).getTime()) / 60000;
  if (min < 1) return "just now";
  if (min < 60) return `${Math.floor(min)}m ago`;
  return `${(min / 60).toFixed(1)}h ago`;
}

function statusBadge(status: string): string {
  const colors: Record<string, string> = {
    queued: "bg-slate-100 text-slate-700",
    "refire-requested": "bg-amber-100 text-amber-800",
    running: "bg-blue-100 text-blue-700",
    passed: "bg-green-100 text-green-700",
    failed: "bg-rose-100 text-rose-700",
    blocked: "bg-rose-100 text-rose-700",
  };
  return colors[status] ?? "bg-slate-100 text-slate-700";
}

export default function ActiveBuildsPage(): JSX.Element {
  const supabase = useMemo(() => getFactorySupabase(), []);
  const [builds, setBuilds] = useState<BuildRow[]>([]);
  const [progress, setProgress] = useState<Record<string, ProgressByBuild>>({});
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [refiring, setRefiring] = useState<Record<string, boolean>>({});
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function fetchAll(): Promise<void> {
    try {
      // Active + recent terminal
      const { data: br, error: brErr } = await supabase
        .from("build_runs")
        .select("id,package_id,kind,status,started_at,completed_at,total_cost_usd,duration_ms,claimed_by,claimed_at,last_heartbeat_at,heartbeat_payload,errors")
        .in("status", ["queued", "running", "refire-requested", "failed", "blocked", "passed"])
        .order("started_at", { ascending: false })
        .limit(30);
      if (brErr) throw brErr;

      // Per-build ticket aggregates
      const buildIds = (br ?? []).map((b) => b.id);
      const prog: Record<string, ProgressByBuild> = {};
      if (buildIds.length) {
        const { data: tq } = await supabase
          .from("ticket_queue")
          .select("build_run_id,status,rank,ticket_id,layer,module")
          .in("build_run_id", buildIds);
        for (const id of buildIds) prog[id] = { total: 0, done: 0, failed: 0, pending: 0, in_progress: 0 };
        for (const t of (tq ?? []) as TicketRow[]) {
          if (!prog[t.build_run_id]) continue;
          prog[t.build_run_id].total++;
          if (t.status === "done") prog[t.build_run_id].done++;
          else if (t.status === "failed") prog[t.build_run_id].failed++;
          else if (t.status === "pending") prog[t.build_run_id].pending++;
          else if (t.status === "in_progress") prog[t.build_run_id].in_progress++;
        }
      }

      // Unresolved alerts
      const { data: al } = await supabase
        .from("tenant_alerts")
        .select("id,build_run_id,kind,severity,message,payload,ts,resolved_at")
        .is("resolved_at", null)
        .not("build_run_id", "is", null)
        .order("ts", { ascending: false })
        .limit(50);

      setBuilds(br ?? []);
      setProgress(prog);
      setAlerts((al ?? []) as AlertRow[]);
      setLastFetch(new Date());
      setError(null);
    } catch (err) {
      setError((err as Error).message ?? String(err));
    }
  }

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 8_000);
    return () => clearInterval(t);
  }, []);

  async function refire(buildRunId: string): Promise<void> {
    setRefiring((p) => ({ ...p, [buildRunId]: true }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        alert("Sign in required");
        return;
      }
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/factory-refire`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ build_run_id: buildRunId, reason: "operator-refire from active-builds page" }),
      });
      const body = await res.json();
      if (!res.ok) {
        alert(`Refire failed: ${body.error ?? res.status}`);
        return;
      }
      await fetchAll();
    } finally {
      setRefiring((p) => ({ ...p, [buildRunId]: false }));
    }
  }

  const active = builds.filter((b) => ["queued", "running", "refire-requested"].includes(b.status));
  const terminal = builds.filter((b) => ["failed", "blocked", "passed"].includes(b.status)).slice(0, 10);
  const alertsByBuild = useMemo(() => {
    const map: Record<string, AlertRow[]> = {};
    for (const a of alerts) {
      if (!a.build_run_id) continue;
      (map[a.build_run_id] ??= []).push(a);
    }
    return map;
  }, [alerts]);

  return (
    <div className="px-8 py-6 space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Active builds</h1>
          <p className="text-sm text-slate-500 mt-1">
            Builds in flight + recent terminal verdicts. Refire any build whose orchestrator-daemon went silent.
          </p>
        </div>
        <div className="text-xs text-slate-400">
          {lastFetch ? `last refresh ${formatAge(lastFetch.toISOString())}` : "loading…"}
        </div>
      </header>

      {error && (
        <div className="border border-rose-200 bg-rose-50 text-rose-800 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* ACTIVE */}
      <section>
        <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-2">In flight ({active.length})</h2>
        {active.length === 0 ? (
          <div className="border border-slate-200 rounded-lg px-4 py-6 text-sm text-slate-500 bg-white">
            No builds in flight. New builds appear here when a proposal is approved or a daemon claims a queued build_run.
          </div>
        ) : (
          <div className="space-y-2">
            {active.map((b) => {
              const p = progress[b.id];
              const hbAge = formatAge(b.last_heartbeat_at);
              const stuck = b.status === "running" && b.last_heartbeat_at !== null && (Date.now() - new Date(b.last_heartbeat_at).getTime()) / 60000 > 15;
              const buildAlerts = alertsByBuild[b.id] ?? [];
              return (
                <div key={b.id} className={`border rounded-lg px-4 py-3 bg-white ${stuck ? "border-rose-300 bg-rose-50/30" : "border-slate-200"}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded ${statusBadge(b.status)}`}>{b.status}</span>
                        <span className="font-mono text-xs text-slate-500">{b.id.slice(0, 8)}</span>
                        <span className="text-xs text-slate-400">started {formatAge(b.started_at)}</span>
                        {stuck && <span className="text-xs text-rose-700 font-medium">⚠ stuck — last heartbeat {hbAge}</span>}
                      </div>
                      {p && p.total > 0 && (
                        <div className="mt-2 text-xs text-slate-600">
                          tickets: {p.done}/{p.total} done
                          {p.in_progress > 0 && <span className="ml-2 text-blue-700">· {p.in_progress} in progress</span>}
                          {p.failed > 0 && <span className="ml-2 text-rose-700">· {p.failed} failed</span>}
                          {p.pending > 0 && <span className="ml-2 text-slate-500">· {p.pending} pending</span>}
                        </div>
                      )}
                      {b.claimed_by && (
                        <div className="mt-1 text-xs text-slate-400 font-mono truncate">worker: {b.claimed_by}</div>
                      )}
                      {buildAlerts.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {buildAlerts.slice(0, 3).map((a) => (
                            <li key={a.id} className="text-xs text-rose-700">
                              <span className="font-mono text-[10px] mr-1">[{a.severity}]</span>
                              {a.message ?? a.kind}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <button
                      onClick={() => refire(b.id)}
                      disabled={refiring[b.id]}
                      className="text-xs px-3 py-1.5 border border-slate-300 rounded hover:bg-slate-100 disabled:opacity-50 whitespace-nowrap"
                    >
                      {refiring[b.id] ? "Refiring…" : "Refire"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* RECENT TERMINAL */}
      <section>
        <h2 className="text-xs uppercase tracking-wider text-slate-500 mb-2">Recent ({terminal.length})</h2>
        {terminal.length === 0 ? (
          <div className="border border-slate-200 rounded-lg px-4 py-6 text-sm text-slate-500 bg-white">
            No recent terminal builds.
          </div>
        ) : (
          <div className="space-y-1">
            {terminal.map((b) => {
              const p = progress[b.id];
              return (
                <div key={b.id} className="border border-slate-200 rounded-lg px-4 py-2 bg-white flex items-center gap-3 text-sm">
                  <span className={`text-xs px-2 py-0.5 rounded ${statusBadge(b.status)}`}>{b.status}</span>
                  <span className="font-mono text-xs text-slate-500">{b.id.slice(0, 8)}</span>
                  <span className="text-xs text-slate-400">{formatAge(b.completed_at ?? b.started_at)}</span>
                  {p && p.total > 0 && (
                    <span className="text-xs text-slate-500">
                      tickets {p.done}/{p.total}{p.failed > 0 ? ` · ${p.failed} failed` : ""}
                    </span>
                  )}
                  {b.total_cost_usd !== null && (
                    <span className="text-xs text-slate-400">${(b.total_cost_usd ?? 0).toFixed(2)}</span>
                  )}
                  <div className="flex-1" />
                  {(b.status === "failed" || b.status === "blocked") && (
                    <button
                      onClick={() => refire(b.id)}
                      disabled={refiring[b.id]}
                      className="text-xs px-2 py-1 border border-slate-300 rounded hover:bg-slate-100 disabled:opacity-50"
                    >
                      {refiring[b.id] ? "…" : "Refire"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
