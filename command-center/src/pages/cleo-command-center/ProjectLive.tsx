// Cleo's Command Center — single-project live view.
//
// Three columns:
//   left   — live business map (xyflow, hue-grouped, reuses BusinessMap)
//   center — step ladder: intake → council → planner → dev agents → QC → deploy
//   right  — per-agent panels: current status, last action, artifact count, cost
// Bottom — live journey-events stream (last 20 events, real-time).

import { useEffect, useState, useCallback, useMemo } from "react";
import { getFactorySupabase } from "../../lib/factorySupabase";
import { BusinessMap } from "../../components/BusinessMap";
import { navigate } from "../../shell/route";

interface CompanyRow {
  id: string;
  name: string;
  home_website: string | null;
  brand_colors: { primary?: string; accent?: string } | null;
  brand_intelligence: { logo_url?: string } | null;
}
interface CanvasSnapshot {
  nodes: any[];
  edges: any[];
  business_type?: string | null;
  architect_output?: unknown;
}
interface CouncilRow {
  id: string;
  agent: string;
  round: number;
  status: string;
  started_at: string;
  completed_at: string | null;
}
interface PackageRow {
  id: string;
  status: string;
  received_at: string;
  updated_at: string;
  snapshot_canvas: CanvasSnapshot | null;
}
interface BuildRunRow {
  id: string;
  package_id: string;
  kind: string;
  status: string;
  total_cost_usd: number | null;
  started_at: string;
  completed_at: string | null;
}
interface DevAgentRunRow {
  id: string;
  build_run_id: string;
  agent_id: string;
  status: "running" | "passed" | "failed";
  capabilities_assigned: any[];
  started_at: string;
  completed_at: string | null;
  cost_usd: number | null;
  output_artifact_path: string | null;
  errors: any[];
}
interface JourneyRow {
  id: string;
  event_kind: string;
  actor: string;
  at: string;
  payload: Record<string, any>;
}
interface TenantRow {
  slug: string;
  status: string;
}

// Council DB slot names → Phase 3A Business Council display labels.
const COUNCIL_LABEL: Record<string, string> = {
  scrapper: "Sales Engineer",
  capability: "AI Automation Engineer",
  mastermind: "CEO",
  architect: "CTO",
  "gap-analyst": "Business Admin",
};

type LadderStage = {
  id: string;
  label: string;
  status: "pending" | "running" | "passed" | "failed";
  detail?: string;
};

export function ProjectLive({
  companyId,
  onBack,
}: {
  companyId: string;
  onBack: () => void;
}): JSX.Element {
  const [company, setCompany] = useState<CompanyRow | null>(null);
  const [canvas, setCanvas] = useState<CanvasSnapshot | null>(null);
  const [council, setCouncil] = useState<CouncilRow[]>([]);
  const [pkg, setPkg] = useState<PackageRow | null>(null);
  const [builds, setBuilds] = useState<BuildRunRow[]>([]);
  const [devRuns, setDevRuns] = useState<DevAgentRunRow[]>([]);
  const [events, setEvents] = useState<JourneyRow[]>([]);
  const [tenant, setTenant] = useState<TenantRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const sb = getFactorySupabase();
    // Note: onboarding_canvas_states lives on the Cleo Supabase project, not
    // factory. We read the canvas snapshot from cleo_packages.snapshot_canvas
    // (factory-side, populated by accept-proposal) instead.
    const [
      { data: c, error: cErr },
      { data: cn },
      { data: pkgs },
      { data: ev },
      { data: tn },
    ] = await Promise.all([
      sb.from("companies").select("id, name, home_website, brand_colors, brand_intelligence").eq("id", companyId).maybeSingle(),
      sb.from("council_outputs").select("id, agent, round, status, started_at, completed_at").eq("company_id", companyId).order("round").order("started_at"),
      sb.from("cleo_packages").select("id, status, received_at, updated_at, snapshot_canvas").eq("company_id", companyId).order("updated_at", { ascending: false }).limit(1),
      sb.from("client_journey_events").select("id, event_kind, actor, at, payload").eq("company_id", companyId).order("at", { ascending: false }).limit(40),
      sb.from("tenants").select("slug, status").eq("company_id", companyId).maybeSingle(),
    ]);
    if (cErr) { setError(cErr.message); return; }
    setCompany(c as CompanyRow | null);
    setCouncil((cn ?? []) as CouncilRow[]);
    setEvents((ev ?? []) as JourneyRow[]);
    setTenant(tn as TenantRow | null);
    const latestPkg = ((pkgs ?? []) as PackageRow[])[0] ?? null;
    setPkg(latestPkg);
    setCanvas(latestPkg?.snapshot_canvas ?? null);

    if (latestPkg) {
      const { data: br } = await sb.from("build_runs").select("*").eq("package_id", latestPkg.id).order("started_at");
      const buildRuns = (br ?? []) as BuildRunRow[];
      setBuilds(buildRuns);
      if (buildRuns.length > 0) {
        const ids = buildRuns.map((b) => b.id);
        const { data: dr } = await sb.from("dev_agent_runs").select("*").in("build_run_id", ids).order("started_at");
        setDevRuns((dr ?? []) as DevAgentRunRow[]);
      } else {
        setDevRuns([]);
      }
    } else {
      setBuilds([]); setDevRuns([]);
    }
  }, [companyId]);

  useEffect(() => {
    void reload();
    const sb = getFactorySupabase();
    const debounced = debounce(reload, 400);
    const ch = sb
      .channel(`cleo-cc-live-${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "council_outputs", filter: `company_id=eq.${companyId}` }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "cleo_packages", filter: `company_id=eq.${companyId}` }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "build_runs" }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "dev_agent_runs" }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "client_journey_events", filter: `company_id=eq.${companyId}` }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "tenants", filter: `company_id=eq.${companyId}` }, debounced)
      .subscribe();
    return () => { void sb.removeChannel(ch); };
  }, [companyId, reload]);

  const ladder = useMemo(() => buildLadder({ canvas, council, pkg, builds, devRuns, tenant }), [canvas, council, pkg, builds, devRuns, tenant]);
  const totalCost = builds.reduce((s, b) => s + (b.total_cost_usd ?? 0), 0) + devRuns.reduce((s, d) => s + (d.cost_usd ?? 0), 0);
  const activeAgents = devRuns.filter((d) => d.status === "running");

  if (!company) {
    return (
      <div className="shell-content-wide">
        <button type="button" className="btn btn-ghost" onClick={onBack}>← Command Center</button>
        <div className="empty">{error ?? "Loading…"}</div>
      </div>
    );
  }

  return (
    <div className="shell-content-wide cleo-cc-live">
      <header className="cleo-cc-live-head">
        <div>
          <button type="button" className="btn btn-ghost" onClick={onBack}>← Command Center</button>
          <h1 className="page-header-title">{company.name}</h1>
          <p className="page-header-sub">{company.home_website ?? "—"}</p>
        </div>
        <div className="cleo-cc-kpis">
          <div className="cleo-cc-kpi">
            <strong>{activeAgents.length}</strong>
            <span>agents working</span>
          </div>
          <div className="cleo-cc-kpi">
            <strong>${totalCost.toFixed(2)}</strong>
            <span>spent</span>
          </div>
          <div className="cleo-cc-kpi">
            <strong>{devRuns.length}</strong>
            <span>dev runs</span>
          </div>
          <div className="cleo-cc-kpi">
            <strong>{pkg?.status ?? "—"}</strong>
            <span>stage</span>
          </div>
        </div>
        <div className="cleo-cc-deliverables">
          <button
            type="button"
            className="btn-ghost"
            onClick={() =>
              navigate({ dept: "cleo", section: "command-center", id: company.id, sub: "pitchdeck" })
            }
          >
            Pitchdeck →
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={() =>
              navigate({ dept: "cleo", section: "command-center", id: company.id, sub: "contract" })
            }
          >
            Contract →
          </button>
        </div>
      </header>

      <div className="cleo-cc-live-body">
        {/* Left: business map */}
        <section className="cleo-cc-live-map">
          <header className="cleo-cc-section-head">
            <strong>Business map</strong>
            <small>{canvas?.nodes?.length ?? 0} nodes · {canvas?.edges?.length ?? 0} edges</small>
          </header>
          <div className="cleo-cc-live-map-canvas">
            {canvas && canvas.nodes?.length ? (
              <BusinessMap nodes={canvas.nodes} edges={canvas.edges} showMinimap={false} />
            ) : (
              <div className="empty"><small>Map will appear once Cleo's intake produces nodes.</small></div>
            )}
          </div>
        </section>

        {/* Center: step ladder */}
        <section className="cleo-cc-live-ladder">
          <header className="cleo-cc-section-head"><strong>Pipeline</strong></header>
          <ol className="cleo-cc-ladder">
            {ladder.map((stage) => (
              <li key={stage.id} className={`cleo-cc-ladder-item status-${stage.status}`}>
                <span className="cleo-cc-ladder-dot" />
                <div>
                  <strong>{stage.label}</strong>
                  {stage.detail ? <small>{stage.detail}</small> : null}
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Right: agent panels */}
        <section className="cleo-cc-live-agents">
          <header className="cleo-cc-section-head"><strong>Agents</strong></header>
          {devRuns.length === 0 && council.length === 0 ? (
            <div className="empty"><small>No agent runs yet.</small></div>
          ) : (
            <div className="cleo-cc-agents-list">
              {council.map((c) => (
                <AgentPanel
                  key={`council-${c.id}`}
                  name={COUNCIL_LABEL[c.agent] ?? c.agent}
                  role="council"
                  status={c.status}
                  startedAt={c.started_at}
                  completedAt={c.completed_at}
                  meta={`round ${c.round}`}
                />
              ))}
              {devRuns.map((d) => (
                <AgentPanel
                  key={`dev-${d.id}`}
                  name={d.agent_id}
                  role="dev"
                  status={d.status}
                  startedAt={d.started_at}
                  completedAt={d.completed_at}
                  meta={
                    d.cost_usd
                      ? `$${d.cost_usd.toFixed(2)} · ${Array.isArray(d.capabilities_assigned) ? d.capabilities_assigned.length : 0} caps`
                      : `${Array.isArray(d.capabilities_assigned) ? d.capabilities_assigned.length : 0} caps`
                  }
                  errors={d.errors}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Bottom: live journey-events stream */}
      <section className="cleo-cc-live-stream">
        <header className="cleo-cc-section-head">
          <strong>Live event stream</strong>
          <small>{events.length} most recent</small>
        </header>
        <ol className="cleo-cc-stream">
          {events.slice(0, 20).map((e) => (
            <li key={e.id} className="cleo-cc-stream-item">
              <span className="cleo-cc-stream-time">{formatTime(e.at)}</span>
              <span className={`pill pill-${actorTone(e.actor)}`}>{e.actor}</span>
              <span className="cleo-cc-stream-kind">{e.event_kind}</span>
              <span className="cleo-cc-stream-payload">{summarizePayload(e.payload)}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function AgentPanel({
  name,
  role,
  status,
  startedAt,
  completedAt,
  meta,
  errors,
}: {
  name: string;
  role: "council" | "dev";
  status: string;
  startedAt: string;
  completedAt: string | null;
  meta?: string;
  errors?: any[];
}): JSX.Element {
  const tone =
    status === "running" ? "amber" :
    status === "passed" || status === "done" || status === "approved" ? "green" :
    status === "failed" || status === "revise" ? "red" : "muted";
  return (
    <div className="cleo-cc-agent-panel">
      <header>
        <strong>{name}</strong>
        <span className={`pill pill-${tone}`}>{status}</span>
      </header>
      <small className="cleo-cc-agent-panel-meta">
        <span>{role}</span>
        {meta ? <><span>·</span><span>{meta}</span></> : null}
        <span>·</span>
        <span>{completedAt ? formatDuration(startedAt, completedAt) : "running"}</span>
      </small>
      {errors && errors.length > 0 ? (
        <div className="cleo-cc-agent-panel-err">
          {(errors[0] as { message?: string; code?: string }).message ??
            (errors[0] as { code?: string }).code ?? "error"}
        </div>
      ) : null}
    </div>
  );
}

function buildLadder(input: {
  canvas: CanvasSnapshot | null;
  council: CouncilRow[];
  pkg: PackageRow | null;
  builds: BuildRunRow[];
  devRuns: DevAgentRunRow[];
  tenant: TenantRow | null;
}): LadderStage[] {
  const stages: LadderStage[] = [];

  // 1. Intake
  stages.push({
    id: "intake",
    label: "Intake",
    status: input.canvas?.nodes?.length ? "passed" : input.canvas ? "running" : "pending",
    detail: input.canvas ? `${input.canvas.nodes?.length ?? 0} nodes` : undefined,
  });

  // 2. Council
  const councilDone = input.council.length > 0 && input.council.every((c) => c.status === "done");
  const councilRunning = input.council.some((c) => c.status === "running");
  stages.push({
    id: "council",
    label: "Council",
    status: councilDone ? "passed" : councilRunning ? "running" : input.council.length ? "failed" : "pending",
    detail: input.council.length > 0 ? `${input.council.length} agent runs` : undefined,
  });

  // 3. Proposal accepted
  stages.push({
    id: "proposal",
    label: "Proposal accepted",
    status: input.pkg ? "passed" : "pending",
    detail: input.pkg ? `package ${input.pkg.id.slice(0, 8)}` : undefined,
  });

  // 4. Planner
  const plannerRun = input.builds.find((b) => b.kind === "planning");
  stages.push({
    id: "planner",
    label: "Planner",
    status: plannerRun
      ? plannerRun.status === "passed"
        ? "passed"
        : plannerRun.status === "failed"
          ? "failed"
          : "running"
      : "pending",
    detail: plannerRun?.total_cost_usd ? `$${plannerRun.total_cost_usd.toFixed(2)}` : undefined,
  });

  // 5. Dev agents
  const devTotalCost = input.devRuns.reduce((s, d) => s + (d.cost_usd ?? 0), 0);
  const allDevPassed = input.devRuns.length > 0 && input.devRuns.every((d) => d.status === "passed");
  const anyRunning = input.devRuns.some((d) => d.status === "running");
  stages.push({
    id: "build",
    label: "Build (dev agents)",
    status: allDevPassed ? "passed" : anyRunning ? "running" : input.devRuns.length ? "failed" : "pending",
    detail: input.devRuns.length ? `${input.devRuns.length} runs · $${devTotalCost.toFixed(2)}` : undefined,
  });

  // 6. QC (placeholder — Phase 3G will populate)
  stages.push({
    id: "qc",
    label: "AI QC",
    status: "pending",
  });

  // 7. Manual audit (placeholder — Phase 3H)
  stages.push({
    id: "audit",
    label: "Manual audit",
    status: "pending",
  });

  // 8. Deploy
  stages.push({
    id: "deploy",
    label: "Deploy",
    status: input.tenant?.status === "active" ? "passed" :
            input.tenant?.status === "provisioning" ? "running" : "pending",
    detail: input.tenant?.slug,
  });

  return stages;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDuration(startISO: string, endISO: string): string {
  const ms = new Date(endISO).getTime() - new Date(startISO).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function actorTone(actor: string): string {
  if (actor === "customer") return "blue";
  if (actor === "cleo" || actor === "onboarding-cleo") return "purple";
  if (actor === "planner") return "amber";
  if (actor === "dev-agent") return "amber";
  if (actor === "ops-user") return "green";
  return "muted";
}

function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): T {
  let t: ReturnType<typeof setTimeout> | null = null;
  return ((...args: Parameters<T>) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  }) as T;
}

function summarizePayload(p: Record<string, any> | null): string {
  if (!p || typeof p !== "object") return "";
  const keys = ["agentId", "verdict", "round", "status", "model", "costUsd"];
  const bits: string[] = [];
  for (const k of keys) {
    if (p[k] !== undefined) bits.push(`${k}=${typeof p[k] === "number" ? p[k] : String(p[k])}`);
  }
  return bits.join(" · ");
}
