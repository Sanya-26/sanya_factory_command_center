// CustomerDetailLayout — single-customer view.
//
// Top: customer hero + horizontal tab bar.
// Body: one focused page at a time, full-width.
//
// URL: #command-center/<companyId>/<tab>

import { useEffect, useMemo, useState } from "react";
import { getFactorySupabase } from "../../../lib/factorySupabase";
import { OverviewPage } from "./sub/Overview";
import { IntelPage } from "./sub/Intel";
import { CanvasPage } from "./sub/Canvas";
import { ChatPage } from "./sub/Chat";
import { CouncilPage } from "./sub/Council";
import { ProposalPage } from "./sub/Proposal";
import { IntegrationsPage } from "./sub/Integrations";
import { BuildPage } from "./sub/Build";
import { TenantPage } from "./sub/Tenant";
import { PreviewPage } from "./sub/Preview";

export type CustomerSubTab =
  | "overview"
  | "intel"
  | "canvas"
  | "chat"
  | "council"
  | "proposal"
  | "preview"
  | "integrations"
  | "build"
  | "tenant";

const TABS: Array<{ id: CustomerSubTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "intel", label: "Intel" },
  { id: "chat", label: "Conversation" },
  { id: "canvas", label: "Canvas" },
  { id: "council", label: "Council" },
  { id: "proposal", label: "Proposal" },
  { id: "preview", label: "Preview as customer" },
  { id: "integrations", label: "Integrations" },
  { id: "build", label: "Build" },
  { id: "tenant", label: "Tenant" },
];

export interface CustomerDetailContext {
  companyId: string;
  company: any | null;
  intel: any | null;
  canvas: any | null;
  council: any[];
  chatMessages: any[];
  secrets: any[];
  buildRuns: any[];
  plannerOutputs: any[];
  devAgentRuns: any[];
  ticketQueue: any[];
  buildLanes: any[];
  tenant: any | null;
  tenantActions: any[];
  tenantCosts: any[];
  journeyEvents: any[];
}

export type StageStatus = "done" | "running" | "pending" | "failed" | "skipped";
export type CustomerDetailStatuses = Record<CustomerSubTab, StageStatus>;

export function CustomerDetailLayout({
  companyId,
  subTab,
  onChangeTab,
  onBack,
}: {
  companyId: string;
  subTab: CustomerSubTab;
  onChangeTab: (t: CustomerSubTab) => void;
  onBack: () => void;
}): JSX.Element {
  const [ctx, setCtx] = useState<CustomerDetailContext | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const sb = getFactorySupabase();
    const reload = async () => {
      setError(null);
      try {
        const [
          companyR, intelR, canvasR, councilR, chatR, secretsR,
          packagesR, tenantR, journeyR,
        ] = await Promise.all([
          sb.from("companies")
            .select("id, name, home_website, email, invited_by, referral_code, signup_source, industry, niche, created_at")
            .eq("id", companyId).maybeSingle(),
          sb.from("company_intel").select("*").eq("company_id", companyId).maybeSingle(),
          sb.from("onboarding_canvas_states").select("*").eq("company_id", companyId).maybeSingle(),
          sb.from("council_outputs").select("*").eq("company_id", companyId).order("started_at", { ascending: true }),
          sb.from("onboarding_chat_messages").select("*").eq("company_id", companyId).order("created_at", { ascending: true }).limit(500),
          sb.from("customer_secrets").select("*").eq("company_id", companyId),
          sb.from("cleo_packages").select("id, company_id, status, received_at, updated_at").eq("company_id", companyId).order("received_at", { ascending: false }).limit(20),
          sb.from("tenants").select("*").eq("company_id", companyId).maybeSingle(),
          sb.from("client_journey_events").select("*").eq("company_id", companyId).order("created_at", { ascending: true }).limit(200),
        ]);
        let tenantActions: any[] = [];
        let tenantCosts: any[] = [];
        const tenantSlug = tenantR.data?.slug as string | undefined;
        if (tenantSlug) {
          const [tenantActionsR, tenantCostsR] = await Promise.all([
            sb.from("tenant_actions").select("*").eq("tenant_slug", tenantSlug).order("executed_at", { ascending: false }).limit(20),
            sb.from("tenant_daily_costs").select("*").eq("tenant_slug", tenantSlug).order("day", { ascending: false }).limit(14),
          ]);
          if (tenantActionsR.error) throw tenantActionsR.error;
          if (tenantCostsR.error) throw tenantCostsR.error;
          tenantActions = (tenantActionsR.data ?? []) as any[];
          tenantCosts = (tenantCostsR.data ?? []) as any[];
        }
        const packageIds = ((packagesR.data ?? []) as Array<{ id: string }>).map((p) => p.id);
        let buildRuns: any[] = [];
        let plannerOutputs: any[] = [];
        let devAgentRuns: any[] = [];
        let ticketQueue: any[] = [];
        let buildLanes: any[] = [];
        if (packageIds.length > 0) {
          const buildRunsR = await sb
            .from("build_runs")
            .select("*")
            .in("package_id", packageIds)
            .order("started_at", { ascending: false })
            .limit(10);
          if (buildRunsR.error) throw buildRunsR.error;
          buildRuns = (buildRunsR.data ?? []) as any[];

          const buildIds = buildRuns.map((r) => r.id).filter(Boolean);
          if (buildIds.length > 0) {
            const [plannerR, devR, ticketsR, lanesR] = await Promise.all([
              sb.from("planner_outputs").select("*").in("build_run_id", buildIds).order("generated_at", { ascending: false }).limit(10),
              sb.from("dev_agent_runs").select("*").in("build_run_id", buildIds).order("started_at", { ascending: false }).limit(50),
              sb.from("ticket_queue")
                .select("build_run_id,ticket_id,status,rank,layer,module,depends_on,blocked_by_external,estimated_dev_slots,rationale,retry_count,claimed_by,claimed_at,completed_at,findings,cost_usd,duration_ms,created_at,updated_at")
                .in("build_run_id", buildIds)
                .order("rank", { ascending: true }),
              sb.from("factory_build_lanes")
                .select("build_run_id,ticket_id,lane_key,visible_agent_id,visible_agent_name,dev_slot,primary_engine,secondary_engine,lane_mode,task_layer,task_module,budget_usd,status,rationale,created_at,updated_at,completed_at")
                .in("build_run_id", buildIds)
                .order("updated_at", { ascending: false })
                .limit(200),
            ]);
            if (plannerR.error) throw plannerR.error;
            if (devR.error) throw devR.error;
            if (ticketsR.error) throw ticketsR.error;
            if (lanesR.error) throw lanesR.error;
            plannerOutputs = (plannerR.data ?? []) as any[];
            devAgentRuns = (devR.data ?? []) as any[];
            ticketQueue = (ticketsR.data ?? []) as any[];
            buildLanes = (lanesR.data ?? []) as any[];
          }
        }
        if (cancelled) return;
        setCtx({
          companyId,
          company: companyR.data ?? null,
          intel: intelR.data ?? null,
          canvas: canvasR.data ?? null,
          council: (councilR.data ?? []) as any[],
          chatMessages: (chatR.data ?? []) as any[],
          secrets: (secretsR.data ?? []) as any[],
          buildRuns,
          plannerOutputs,
          devAgentRuns,
          ticketQueue,
          buildLanes,
          tenant: tenantR.data ?? null,
          tenantActions,
          tenantCosts,
          journeyEvents: (journeyR.data ?? []) as any[],
        });
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    };
    void reload();
    const ch = sb
      .channel(`customer-detail-${companyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "company_intel", filter: `company_id=eq.${companyId}` }, () => void reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "onboarding_canvas_states", filter: `company_id=eq.${companyId}` }, () => void reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "council_outputs", filter: `company_id=eq.${companyId}` }, () => void reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "customer_secrets", filter: `company_id=eq.${companyId}` }, () => void reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "cleo_packages", filter: `company_id=eq.${companyId}` }, () => void reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "build_runs" }, () => void reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "planner_outputs" }, () => void reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "dev_agent_runs" }, () => void reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "ticket_queue" }, () => void reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "factory_build_lanes" }, () => void reload())
      .subscribe();
    return () => { cancelled = true; void sb.removeChannel(ch); };
  }, [companyId]);

  const statuses: CustomerDetailStatuses = useMemo(() => deriveStatuses(ctx), [ctx]);
  const progress = useMemo(() => deriveProgress(ctx, statuses), [ctx, statuses]);

  if (error) {
    return <div className="cd-shell"><div className="cd-error">{error}</div></div>;
  }
  if (!ctx) {
    return <div className="cd-shell"><div className="cd-loading">loading customer…</div></div>;
  }

  return (
    <div className="cd-shell">
      {/* Hero — minimal, customer name is the only thing that's loud */}
      <header className="cd-hero">
        <button type="button" className="cd-hero-back" onClick={onBack} aria-label="Back">
          ←
        </button>
        <div className="cd-hero-main">
          <h1>{ctx.company?.name ?? "—"}</h1>
          <div className="cd-hero-meta">
            {ctx.company?.home_website ? (
              <a href={ctx.company.home_website} target="_blank" rel="noreferrer noopener">
                {stripHttp(ctx.company.home_website)}
              </a>
            ) : <span className="dim">no website</span>}
            <span className="dim">·</span>
            <span className="dim">
              {progress.completed} of {progress.total} stages · {progress.label}
            </span>
          </div>
        </div>
        <div className="cd-hero-progress" aria-hidden>
          <span className="cd-hero-progress-bar" style={{ width: `${(progress.completed / progress.total) * 100}%` }} />
        </div>
      </header>

      {/* Tabs — flat, horizontal, status-dot inline */}
      <nav className="cd-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={subTab === t.id}
            onClick={() => onChangeTab(t.id)}
            className={`cd-tab ${subTab === t.id ? "active" : ""}`}
          >
            <span className={`cd-tab-dot ${statuses[t.id]}`} />
            <span className="cd-tab-label">{t.label}</span>
          </button>
        ))}
      </nav>

      <main className="cd-content">
        {subTab === "overview" && <OverviewPage ctx={ctx} statuses={statuses} onChangeTab={onChangeTab} />}
        {subTab === "intel" && <IntelPage ctx={ctx} />}
        {subTab === "chat" && <ChatPage ctx={ctx} />}
        {subTab === "canvas" && <CanvasPage ctx={ctx} />}
        {subTab === "council" && <CouncilPage ctx={ctx} />}
        {subTab === "proposal" && <ProposalPage ctx={ctx} />}
        {subTab === "preview" && <PreviewPage ctx={ctx} />}
        {subTab === "integrations" && <IntegrationsPage ctx={ctx} />}
        {subTab === "build" && <BuildPage ctx={ctx} />}
        {subTab === "tenant" && <TenantPage ctx={ctx} />}
      </main>
    </div>
  );
}

function stripHttp(u: string): string { return u.replace(/^https?:\/\/(www\.)?/, ""); }

function deriveStatuses(ctx: CustomerDetailContext | null): CustomerDetailStatuses {
  const empty: CustomerDetailStatuses = {
    overview: "done", intel: "pending", chat: "pending", canvas: "pending",
    council: "pending", proposal: "pending", preview: "pending",
    integrations: "pending", build: "pending", tenant: "pending",
  };
  if (!ctx) return empty;
  const s = { ...empty };
  // Preview is a derived read-only view; it's "done" the moment a canvas exists.
  if (ctx.canvas && (ctx.canvas.nodes?.length ?? 0) > 0) s.preview = "done";
  if (ctx.intel) {
    s.intel = ctx.intel.scrape_status === "done" ? "done"
      : ctx.intel.scrape_status === "failed" ? "failed"
      : ctx.intel.scrape_status === "scraping" ? "running"
      : "pending";
  }
  if (ctx.chatMessages.length > 0) s.chat = "done";
  if (ctx.canvas && (ctx.canvas.nodes?.length ?? 0) > 0) {
    s.canvas = ctx.canvas.status === "sent-to-aubos" ? "done"
      : (ctx.canvas.nodes ?? []).some((n: any) => n.data?.automation) ? "done"
      : "running";
  }
  if (ctx.council.length > 0) {
    const failed = ctx.council.some((r) => r.status === "failed");
    const running = ctx.council.some((r) => r.status === "running" || r.status === "queued");
    const allDone = ["scrapper", "capability", "mastermind", "architect", "gap-analyst"]
      .every((a) => ctx.council.some((r) => r.agent === a && r.status === "done"));
    s.council = failed ? "failed" : running ? "running" : allDone ? "done" : "running";
  }
  if (ctx.secrets.some((sec) => sec.status === "connected")) s.integrations = "done";
  if (ctx.buildRuns.length > 0) {
    const latest = ctx.buildRuns[0];
    s.build = latest.status === "done" || latest.status === "completed" || latest.status === "passed" ? "done"
      : latest.status === "failed" ? "failed" : "running";
  }
  if (ctx.tenant) {
    s.tenant = ctx.tenant.status === "live" ? "done"
      : ctx.tenant.status === "failed" ? "failed" : "running";
  }
  return s;
}

function deriveProgress(
  _ctx: CustomerDetailContext | null,
  st: CustomerDetailStatuses,
): { completed: number; total: number; label: string } {
  const order: CustomerSubTab[] = ["intel", "chat", "canvas", "council", "integrations", "build", "tenant"];
  let completed = 0;
  let currentLabel = "Awaiting first action";
  for (const k of order) {
    if (st[k] === "done") {
      completed++;
      currentLabel = TABS.find((t) => t.id === k)?.label ?? k;
    } else if (st[k] === "running") {
      currentLabel = `Running · ${TABS.find((t) => t.id === k)?.label ?? k}`;
      break;
    } else if (st[k] === "failed") {
      currentLabel = `Failed at ${TABS.find((t) => t.id === k)?.label ?? k}`;
      break;
    } else {
      break;
    }
  }
  return { completed, total: order.length, label: currentLabel };
}
