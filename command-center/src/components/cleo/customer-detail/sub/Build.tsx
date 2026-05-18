// Build — factory-side progress map for one client build.

import { useMemo } from "react";
import type { ReactNode } from "react";
import type { CustomerDetailContext, StageStatus } from "../CustomerDetailLayout";

type TicketStatus = "pending" | "in_progress" | "done" | "blocked" | "failed";

interface TicketRow {
  build_run_id: string;
  ticket_id: string;
  status: TicketStatus;
  rank: number;
  layer: string;
  module: string;
  depends_on?: string[];
  blocked_by_external?: string[];
  estimated_dev_slots?: string[];
  rationale?: string | null;
  retry_count?: number | null;
  claimed_by?: string | null;
  claimed_at?: string | null;
  completed_at?: string | null;
  findings?: unknown;
  cost_usd?: number | null;
  duration_ms?: number | null;
  updated_at?: string | null;
}

interface LaneRow {
  build_run_id: string;
  ticket_id: string;
  lane_key: string;
  visible_agent_name: string;
  dev_slot: string;
  primary_engine: string;
  secondary_engine?: string | null;
  lane_mode: string;
  task_layer: string;
  task_module: string;
  budget_usd?: number | null;
  status: string;
  updated_at?: string | null;
  completed_at?: string | null;
}

interface Phase {
  id: string;
  label: string;
  subtitle: string;
  tickets: TicketRow[];
}

export function BuildPage({ ctx }: { ctx: CustomerDetailContext }): JSX.Element {
  const visibleBuildRuns = useMemo(() => sortBuildRunsForCockpit(ctx), [ctx]);
  const latestBuild = visibleBuildRuns[0] ?? null;
  const view = useMemo(() => buildView(ctx, latestBuild?.id), [ctx, latestBuild?.id]);

  const empty =
    ctx.buildRuns.length === 0 &&
    ctx.plannerOutputs.length === 0 &&
    ctx.devAgentRuns.length === 0 &&
    ctx.ticketQueue.length === 0;

  return (
    <div className="cd-page cd-build">
      <header className="cd-page-head cd-build-head">
        <div>
          <h1>Build cockpit</h1>
          <p>Live factory graph for this client: dependencies, agents, blockers, proof, and next executable work.</p>
        </div>
        {latestBuild && (
          <div className="cd-build-run-chip">
            <span>{latestBuild.status ?? "unknown"}</span>
            <strong>{String(latestBuild.id).slice(0, 8)}</strong>
          </div>
        )}
      </header>

      {empty ? (
        <div className="cd-empty">No build runs yet. Once the client map is approved, this becomes the live factory cockpit.</div>
      ) : (
        <>
          <section className="cd-build-kpis" aria-label="Build progress">
            <Kpi label="Current tickets" value={view.stats.total} />
            <Kpi label="Done" value={view.stats.done} tone="done" />
            <Kpi label="Running" value={view.stats.inProgress} tone="running" />
            <Kpi label="Failed / blocked" value={view.stats.failed + view.stats.blocked} tone={view.stats.failed + view.stats.blocked > 0 ? "failed" : undefined} />
            <Kpi label="Ready next" value={view.readyTickets.length} />
            <Kpi label="Active lanes" value={view.activeLanes.length} tone={view.activeLanes.length > 0 ? "running" : undefined} />
          </section>

          <section className="cd-build-next">
            <div>
              <span className="cd-build-eyebrow">Next executable ticket</span>
              {view.nextTicket ? (
                <>
                  <strong>{view.nextTicket.ticket_id}</strong>
                  <p>{summarizeTicket(view.nextTicket)}</p>
                </>
              ) : (
                <>
                  <strong>No ready ticket</strong>
                  <p>{view.stats.pending > 0 ? "Pending tickets are waiting for upstream dependencies." : "The current queue has no pending work."}</p>
                </>
              )}
            </div>
            <div className="cd-build-next-meta">
              <span>{view.currentBuildTickets.length ? `${view.stats.done}/${view.stats.total} complete` : "no current queue"}</span>
              <ProgressBar pct={view.stats.total ? (view.stats.done / view.stats.total) * 100 : 0} />
            </div>
          </section>

          <section className="cd-section">
            <h2>Dependency map</h2>
            <div className="cd-build-map" role="list">
              {view.phases.map((phase) => (
                <article key={phase.id} className={`cd-build-phase status-${phaseStatus(phase.tickets)}`} role="listitem">
                  <header>
                    <span>{phase.label}</span>
                    <strong>{phase.tickets.filter((t) => t.status === "done").length}/{phase.tickets.length}</strong>
                  </header>
                  <p>{phase.subtitle}</p>
                  <div className="cd-build-phase-progress">
                    <ProgressBar pct={phase.tickets.length ? (phase.tickets.filter((t) => t.status === "done").length / phase.tickets.length) * 100 : 0} />
                  </div>
                  <div className="cd-build-ticket-stack">
                    {phase.tickets.slice(0, 10).map((ticket) => (
                      <TicketCard key={ticket.ticket_id} ticket={ticket} ticketStatusById={view.ticketStatusById} />
                    ))}
                    {phase.tickets.length > 10 && (
                      <div className="cd-build-more">+{phase.tickets.length - 10} more tickets</div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="cd-build-split">
            <Section title={`Agent lanes (${view.lanes.length})`}>
              {view.lanes.length === 0 ? <div className="dim">No lane has claimed work yet.</div> : (
                <table className="cd-table">
                  <thead>
                    <tr><th>agent</th><th>engine</th><th>ticket</th><th>status</th><th>updated</th></tr>
                  </thead>
                  <tbody>
                    {view.lanes.slice(0, 18).map((lane) => (
                      <tr key={lane.lane_key}>
                        <td>
                          <strong>{lane.visible_agent_name}</strong>
                          <span className="cd-build-subline">{lane.dev_slot} · {lane.lane_mode}</span>
                        </td>
                        <td className="mono-tiny">{lane.secondary_engine ? `${lane.primary_engine}+${lane.secondary_engine}` : lane.primary_engine}</td>
                        <td className="mono-tiny">{lane.ticket_id}</td>
                        <td><span className={`cd-status-pill ${pillStatus(lane.status)}`}>{lane.status}</span></td>
                        <td className="dim">{lane.updated_at ? fmtTime(lane.updated_at) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            <Section title="Build runs">
              <table className="cd-table">
                <thead>
                  <tr><th>id</th><th>status</th><th>started</th><th>completed</th></tr>
                </thead>
                <tbody>
                  {visibleBuildRuns.map((r: any) => (
                    <tr key={r.id}>
                      <td className="mono-tiny">{r.id?.slice(0, 8)}...</td>
                      <td><span className={`cd-status-pill ${pillStatus(r.status)}`}>{r.status ?? "—"}</span></td>
                      <td className="dim">{r.started_at ? fmtTime(r.started_at) : fmtTime(r.created_at)}</td>
                      <td className="dim">{r.completed_at ? fmtTime(r.completed_at) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          </section>

          {view.problemTickets.length > 0 && (
            <Section title={`Failures and blockers (${view.problemTickets.length})`}>
              <div className="cd-build-problems">
                {view.problemTickets.map((ticket) => (
                  <div key={ticket.ticket_id} className="cd-build-problem">
                    <span className={`cd-status-pill ${pillStatus(ticket.status)}`}>{ticket.status}</span>
                    <strong>{ticket.ticket_id}</strong>
                    <p>{extractFinding(ticket.findings) || summarizeTicket(ticket)}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  );
}

function sortBuildRunsForCockpit(ctx: CustomerDetailContext): any[] {
  const tickets = ctx.ticketQueue as TicketRow[];
  const foundationBuildIds = new Set(
    tickets
      .filter((ticket) => ticket.ticket_id.startsWith("foundation-"))
      .map((ticket) => ticket.build_run_id)
  );
  return [...ctx.buildRuns].sort((a: any, b: any) => {
    const aHasCurrentPlan = foundationBuildIds.has(a.id) ? 1 : 0;
    const bHasCurrentPlan = foundationBuildIds.has(b.id) ? 1 : 0;
    if (aHasCurrentPlan !== bHasCurrentPlan) return bHasCurrentPlan - aHasCurrentPlan;
    return buildActivityTime(b) - buildActivityTime(a);
  });
}

function buildActivityTime(run: any): number {
  const stamp = run.completed_at ?? run.updated_at ?? run.started_at ?? run.created_at;
  return stamp ? new Date(stamp).getTime() : 0;
}

function buildView(ctx: CustomerDetailContext, buildRunId?: string) {
  const buildTickets = (ctx.ticketQueue as TicketRow[])
    .filter((t) => !buildRunId || t.build_run_id === buildRunId)
    .sort((a, b) => Number(a.rank ?? 0) - Number(b.rank ?? 0));
  const hasFactoryPlan = buildTickets.some((t) => t.ticket_id.startsWith("foundation-"));
  const currentBuildTickets = (hasFactoryPlan
    ? buildTickets.filter((t) => t.ticket_id.startsWith("foundation-") || t.ticket_id.startsWith("cap-"))
    : buildTickets
  ).sort((a, b) => Number(a.rank ?? 0) - Number(b.rank ?? 0));
  const ticketStatusById = new Map(currentBuildTickets.map((t) => [t.ticket_id, t.status]));
  const lanes = (ctx.buildLanes as LaneRow[])
    .filter((l) => !buildRunId || l.build_run_id === buildRunId)
    .sort((a, b) => new Date(b.updated_at ?? 0).getTime() - new Date(a.updated_at ?? 0).getTime());
  const activeLanes = lanes.filter((l) => l.status === "running" || l.status === "queued");
  const readyTickets = currentBuildTickets.filter((t) => t.status === "pending" && depsDone(t, ticketStatusById));
  const nextTicket = currentBuildTickets.find((t) => t.status === "in_progress")
    ?? readyTickets[0]
    ?? currentBuildTickets.find((t) => t.status === "pending")
    ?? null;
  const problemTickets = currentBuildTickets.filter((t) => t.status === "failed" || t.status === "blocked");
  const stats = {
    total: currentBuildTickets.length,
    done: currentBuildTickets.filter((t) => t.status === "done").length,
    inProgress: currentBuildTickets.filter((t) => t.status === "in_progress").length,
    pending: currentBuildTickets.filter((t) => t.status === "pending").length,
    failed: currentBuildTickets.filter((t) => t.status === "failed").length,
    blocked: currentBuildTickets.filter((t) => t.status === "blocked").length,
  };
  const phases = buildPhases(currentBuildTickets);
  return { buildTickets, currentBuildTickets, ticketStatusById, lanes, activeLanes, readyTickets, nextTicket, problemTickets, stats, phases };
}

function buildPhases(tickets: TicketRow[]): Phase[] {
  const definitions: Array<Omit<Phase, "tickets"> & { match: (t: TicketRow) => boolean }> = [
    { id: "foundation-db", label: "DB foundation", subtitle: "tenant core, module SQL, integration registry, Cleo canvas tables", match: (t) => t.ticket_id.startsWith("foundation-0") && t.layer === "db" },
    { id: "capability-db", label: "Capability data", subtitle: "business tables and views after the shared database contract", match: (t) => t.layer === "db" && !t.ticket_id.startsWith("foundation-") },
    { id: "sdk-vps", label: "SDK + VPS + Cleo", subtitle: "AUBOS SDK contract and tenant VPS harness runtime", match: (t) => t.ticket_id === "foundation-04-aubos-sdk-contract" || t.ticket_id === "foundation-05-vps-harness-cleo" },
    { id: "tools", label: "Tools + workflows", subtitle: "backend, integrations, automations, business modules, content flows", match: (t) => ["edge", "content", "cross-cutting"].includes(t.layer) && !t.ticket_id.startsWith("foundation-") },
    { id: "ui", label: "Client UI", subtitle: "operator control surfaces connected to real API/DB/runtime contracts", match: (t) => t.layer === "ui" },
    { id: "qc", label: "QC + deploy", subtitle: "observability, Playwright, runtime checks, delivery gates", match: (t) => t.layer === "ops" && !t.ticket_id.startsWith("foundation-") },
  ];
  return definitions
    .map((d) => ({ id: d.id, label: d.label, subtitle: d.subtitle, tickets: tickets.filter(d.match) }))
    .filter((p) => p.tickets.length > 0);
}

function TicketCard({ ticket, ticketStatusById }: { ticket: TicketRow; ticketStatusById: Map<string, string> }): JSX.Element {
  const deps = Array.isArray(ticket.depends_on) ? ticket.depends_on : [];
  const slots = Array.isArray(ticket.estimated_dev_slots) ? ticket.estimated_dev_slots : [];
  const missingDeps = deps.filter((dep) => ticketStatusById.has(dep) && ticketStatusById.get(dep) !== "done");
  return (
    <div className={`cd-build-ticket status-${pillStatus(ticket.status)} ${missingDeps.length ? "waiting" : ""}`}>
      <div className="cd-build-ticket-top">
        <span className={`cd-status-dot ${pillStatus(ticket.status)}`} />
        <strong>{ticket.ticket_id}</strong>
        <span className="mono-tiny">#{ticket.rank}</span>
      </div>
      <p>{ticket.module} · {ticket.layer}</p>
      <div className="cd-build-tags">
        {slots.slice(0, 3).map((slot) => <span key={slot}>{slot}</span>)}
        {missingDeps.length > 0 && <span className="waiting">waiting {missingDeps.length}</span>}
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: StageStatus }): JSX.Element {
  return (
    <div className={`cd-build-kpi ${tone ? `tone-${tone}` : ""}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="cd-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function ProgressBar({ pct }: { pct: number }): JSX.Element {
  const width = Math.max(0, Math.min(100, pct));
  return <div className="cd-build-progressbar" aria-hidden><span style={{ width: `${width}%` }} /></div>;
}

function depsDone(ticket: TicketRow, ticketStatusById: Map<string, string>): boolean {
  const deps = Array.isArray(ticket.depends_on) ? ticket.depends_on : [];
  return deps.every((dep) => !ticketStatusById.has(dep) || ticketStatusById.get(dep) === "done");
}

function phaseStatus(tickets: TicketRow[]): StageStatus {
  if (tickets.some((t) => t.status === "failed" || t.status === "blocked")) return "failed";
  if (tickets.some((t) => t.status === "in_progress")) return "running";
  if (tickets.length > 0 && tickets.every((t) => t.status === "done")) return "done";
  return "pending";
}

function summarizeTicket(ticket: TicketRow): string {
  const notes = String(ticket.rationale ?? "");
  const goal = notes.match(/business_goal=([^\n]+)/)?.[1];
  if (goal) return goal;
  return `${ticket.layer} · ${ticket.module}`;
}

function extractFinding(findings: unknown): string | null {
  if (!Array.isArray(findings) || findings.length === 0) return null;
  const first = findings[0] as Record<string, unknown>;
  return String(first.detail ?? first.reason ?? first.kind ?? "").slice(0, 220) || null;
}

function pillStatus(s: string | undefined): string {
  if (!s) return "pending";
  if (s === "done" || s === "completed" || s === "passed") return "done";
  if (s === "failed" || s === "error" || s === "blocked") return "failed";
  if (s === "running" || s === "in-progress" || s === "in_progress" || s === "queued") return "running";
  return "pending";
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
