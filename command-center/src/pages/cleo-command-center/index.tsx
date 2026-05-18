// Cleo's Command Center — multi-project live dashboard.
//
// Top-level ops view: every customer currently moving through the factory,
// what stage they're in, which agents are working, total cost so far.
// Click a card → live project drill-in (./ProjectLive.tsx).
//
// Realtime-subscribed to companies + cleo_packages + dev_agent_runs + tenants.

import { useEffect, useState, useCallback, useMemo } from "react";
import { getFactorySupabase } from "../../lib/factorySupabase";
import { navigate, type Route } from "../../shell/route";
import { ProjectLive } from "./ProjectLive";
import { PitchdeckEditor } from "./PitchdeckEditor";
import { ContractEditor } from "./ContractEditor";

interface Company {
  id: string;
  name: string;
  home_website: string | null;
  industry: string | null;
  niche: string | null;
  brand_colors: { primary?: string; accent?: string } | null;
  brand_intelligence: { logo_url?: string } | null;
  created_at: string;
}
interface Intel {
  company_id: string;
  scrape_status: string;
  summary: string | null;
}
interface CleoPackage {
  id: string;
  company_id: string;
  status: string;
  received_at: string;
  updated_at: string;
}
interface BuildRun {
  id: string;
  package_id: string;
  kind: string;
  status: string;
  total_cost_usd: number | null;
  started_at: string;
  completed_at: string | null;
}
interface DevAgentRun {
  id: string;
  build_run_id: string;
  agent_id: string;
  status: "running" | "passed" | "failed";
  cost_usd: number | null;
  started_at: string;
  completed_at: string | null;
}
interface Tenant {
  slug: string;
  company_id: string;
  status: string;
}

type Stage =
  | "intake"
  | "council"
  | "proposal"
  | "queued"
  | "planning"
  | "building"
  | "proposing"
  | "awaiting-approval"
  | "deployed"
  | "live"
  | "paused"
  | "needs-info";

interface Project {
  company: Company;
  intel?: Intel;
  package?: CleoPackage;
  builds: BuildRun[];
  devRuns: DevAgentRun[];
  tenant?: Tenant;
  stage: Stage;
  costSoFar: number;
  agentsRunning: string[];
  lastActivityAt: string;
}

const STAGE_ORDER: Stage[] = [
  "intake", "council", "proposal", "queued", "planning", "building",
  "proposing", "awaiting-approval", "deployed", "live", "needs-info", "paused",
];

const STAGE_LABEL: Record<Stage, string> = {
  intake: "Intake",
  council: "Council",
  proposal: "Proposal",
  queued: "Queued",
  planning: "Planning",
  building: "Building",
  proposing: "Proposing",
  "awaiting-approval": "Awaiting approval",
  deployed: "Deployed",
  live: "Live",
  paused: "Paused",
  "needs-info": "Needs info",
};

const STAGE_TONE: Record<Stage, string> = {
  intake: "muted",
  council: "blue",
  proposal: "purple",
  queued: "muted",
  planning: "amber",
  building: "amber",
  proposing: "purple",
  "awaiting-approval": "amber",
  deployed: "green",
  live: "green",
  paused: "muted",
  "needs-info": "red",
};

export function CleoCommandCenterPage({ route }: { route: Route }): JSX.Element {
  // Drill-ins. URL shape:
  //   #cleo/command-center                            → dashboard
  //   #cleo/command-center/<companyId>                → project live view
  //   #cleo/command-center/<companyId>/pitchdeck      → pitchdeck editor
  //   #cleo/command-center/<companyId>/contract       → contract editor
  if (route.id) {
    const backToProject = () =>
      navigate({ dept: "cleo", section: "command-center", id: route.id });
    if (route.sub === "pitchdeck") {
      return <PitchdeckEditor companyId={route.id} onBack={backToProject} />;
    }
    if (route.sub === "contract") {
      return <ContractEditor companyId={route.id} onBack={backToProject} />;
    }
    return (
      <ProjectLive
        companyId={route.id}
        onBack={() => navigate({ dept: "cleo", section: "command-center" })}
      />
    );
  }

  return <CommandCenterDashboard />;
}

function CommandCenterDashboard(): JSX.Element {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<"all" | "active" | "live">("active");

  const reload = useCallback(async () => {
    setError(null);
    const sb = getFactorySupabase();

    // 1. Load the top 50 companies first.
    const { data: companies, error: cErr } = await sb
      .from("companies")
      .select("id, name, home_website, industry, niche, brand_colors, brand_intelligence, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (cErr) { setError(cErr.message); setLoading(false); return; }
    const companyIds = (companies ?? []).map((c) => (c as Company).id);
    if (companyIds.length === 0) { setProjects([]); setLoading(false); return; }

    // 2. Scope all secondary queries to those company ids only.
    const [
      { data: intelRows },
      { data: pkgRows },
      { data: tenantRows },
    ] = await Promise.all([
      sb.from("company_intel").select("company_id, scrape_status, summary").in("company_id", companyIds),
      sb.from("cleo_packages").select("id, company_id, status, received_at, updated_at").in("company_id", companyIds),
      sb.from("tenants").select("slug, company_id, status").in("company_id", companyIds),
    ]);
    const pkgIds = (pkgRows ?? []).map((p) => (p as CleoPackage).id);
    const [
      { data: buildRows },
    ] = await Promise.all([
      pkgIds.length
        ? sb.from("build_runs").select("id, package_id, kind, status, total_cost_usd, started_at, completed_at").in("package_id", pkgIds)
        : Promise.resolve({ data: [] as BuildRun[] }),
    ]);
    const buildIds = (buildRows ?? []).map((b) => (b as BuildRun).id);
    const { data: devRows } = buildIds.length
      ? await sb.from("dev_agent_runs").select("id, build_run_id, agent_id, status, cost_usd, started_at, completed_at").in("build_run_id", buildIds)
      : { data: [] as DevAgentRun[] };

    const intelByCompany: Record<string, Intel> = {};
    for (const i of (intelRows ?? []) as Intel[]) intelByCompany[i.company_id] = i;

    const pkgByCompany: Record<string, CleoPackage> = {};
    for (const p of (pkgRows ?? []) as CleoPackage[]) {
      // Most recent package per company.
      const existing = pkgByCompany[p.company_id];
      if (!existing || (p.updated_at > existing.updated_at)) {
        pkgByCompany[p.company_id] = p;
      }
    }

    const buildsByPackage: Record<string, BuildRun[]> = {};
    for (const b of (buildRows ?? []) as BuildRun[]) {
      (buildsByPackage[b.package_id] ??= []).push(b);
    }

    const devByBuild: Record<string, DevAgentRun[]> = {};
    for (const d of (devRows ?? []) as DevAgentRun[]) {
      (devByBuild[d.build_run_id] ??= []).push(d);
    }

    const tenantByCompany: Record<string, Tenant> = {};
    for (const t of (tenantRows ?? []) as Tenant[]) tenantByCompany[t.company_id] = t;

    const out: Project[] = (companies ?? []).map((co) => {
      const c = co as Company;
      const intel = intelByCompany[c.id];
      const pkg = pkgByCompany[c.id];
      const builds = pkg ? (buildsByPackage[pkg.id] ?? []) : [];
      const devRuns = builds.flatMap((b) => devByBuild[b.id] ?? []);
      const tenant = tenantByCompany[c.id];

      const stage = deriveStage({ intel, pkg, builds, devRuns, tenant });
      const costSoFar =
        builds.reduce((s, b) => s + (b.total_cost_usd ?? 0), 0) +
        devRuns.reduce((s, d) => s + (d.cost_usd ?? 0), 0);
      const agentsRunning = devRuns.filter((d) => d.status === "running").map((d) => d.agent_id);
      const lastActivityAt = [
        c.created_at,
        pkg?.updated_at,
        ...builds.map((b) => b.completed_at ?? b.started_at),
        ...devRuns.map((d) => d.completed_at ?? d.started_at),
      ].filter(Boolean).sort().reverse()[0] ?? c.created_at;

      return { company: c, intel, package: pkg, builds, devRuns, tenant, stage, costSoFar, agentsRunning, lastActivityAt };
    });

    setProjects(out);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
    const sb = getFactorySupabase();
    // Debounce realtime reloads — burst journey-event traffic from active
    // builds can fire dozens of events/second; we only need one reload per
    // settled-burst window.
    let t: ReturnType<typeof setTimeout> | null = null;
    const debounced = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => void reload(), 600);
    };
    const ch = sb
      .channel("cleo-cc-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "companies" }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "company_intel" }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "cleo_packages" }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "build_runs" }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "dev_agent_runs" }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "tenants" }, debounced)
      .subscribe();
    return () => {
      if (t) clearTimeout(t);
      void sb.removeChannel(ch);
    };
  }, [reload]);

  const filtered = useMemo(() => {
    return projects
      .filter((p) => {
        if (stageFilter === "all") return true;
        if (stageFilter === "live") return p.stage === "live" || p.stage === "deployed";
        // "active" = anything in flight, not live, not yet started intake-only
        return !["live", "deployed", "paused"].includes(p.stage);
      })
      .sort((a, b) => {
        // Stage priority — building/planning at top, intake last.
        const sa = STAGE_ORDER.indexOf(a.stage);
        const sb = STAGE_ORDER.indexOf(b.stage);
        if (sa !== sb) return sa - sb;
        // Within same stage, most-recent activity first.
        return b.lastActivityAt.localeCompare(a.lastActivityAt);
      });
  }, [projects, stageFilter]);

  const totalCost = useMemo(
    () => filtered.reduce((s, p) => s + p.costSoFar, 0),
    [filtered],
  );
  const totalActiveAgents = useMemo(
    () => filtered.reduce((s, p) => s + p.agentsRunning.length, 0),
    [filtered],
  );

  return (
    <div className="shell-content-wide cleo-cc-page">
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Cleo's Command Center</h1>
          <p className="page-header-sub">
            Live ops view across every project the factory is touching right now.
          </p>
        </div>
        <div className="cleo-cc-kpis">
          <div className="cleo-cc-kpi">
            <strong>{filtered.length}</strong>
            <span>projects</span>
          </div>
          <div className="cleo-cc-kpi">
            <strong>{totalActiveAgents}</strong>
            <span>agents working</span>
          </div>
          <div className="cleo-cc-kpi">
            <strong>${totalCost.toFixed(2)}</strong>
            <span>spent</span>
          </div>
        </div>
      </div>

      <div className="cleo-cc-filters">
        {(["active", "all", "live"] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={`pill ${stageFilter === f ? "pill-active" : ""}`}
            onClick={() => setStageFilter(f)}
          >
            {f === "active" ? "In flight" : f === "live" ? "Live tenants" : "Everything"}
          </button>
        ))}
      </div>

      {error ? <div className="error-box">{error}</div> : null}
      {loading ? (
        <div className="empty"><strong>Loading projects…</strong></div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <strong>No active projects.</strong>
          <p>When customers sign up + accept proposals, they'll appear here in real-time.</p>
        </div>
      ) : (
        <div className="cleo-cc-grid">
          {filtered.map((p) => (
            <ProjectCard
              key={p.company.id}
              project={p}
              onOpen={() =>
                navigate({ dept: "cleo", section: "command-center", id: p.company.id })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({
  project,
  onOpen,
}: {
  project: Project;
  onOpen: () => void;
}): JSX.Element {
  const p = project;
  const logo = p.company.brand_intelligence?.logo_url;
  const tone = STAGE_TONE[p.stage];
  const elapsed = formatElapsed(p.lastActivityAt);

  return (
    <button type="button" className="cleo-cc-card" onClick={onOpen}>
      <header className="cleo-cc-card-head">
        <div className="cleo-cc-card-brand">
          {logo ? (
            <img src={logo} alt="" className="cleo-cc-card-logo" />
          ) : (
            <div className="cleo-cc-card-logo cleo-cc-card-logo-fallback">
              {p.company.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <strong>{p.company.name}</strong>
            <small>{p.company.home_website ?? p.company.industry ?? "—"}</small>
          </div>
        </div>
        <span className={`pill pill-${tone}`}>{STAGE_LABEL[p.stage]}</span>
      </header>

      {p.intel?.summary ? (
        <p className="cleo-cc-card-summary">{p.intel.summary}</p>
      ) : null}

      <footer className="cleo-cc-card-foot">
        <div className="cleo-cc-card-agents">
          {p.agentsRunning.length > 0 ? (
            <>
              <span className="cleo-cc-pulse" />
              <span>{p.agentsRunning.join(" · ")}</span>
            </>
          ) : (
            <span className="cleo-cc-card-agents-idle">no agents running</span>
          )}
        </div>
        <div className="cleo-cc-card-meta">
          <span>${p.costSoFar.toFixed(2)}</span>
          <span>·</span>
          <span>{elapsed}</span>
        </div>
      </footer>
    </button>
  );
}

function deriveStage(input: {
  intel?: Intel;
  pkg?: CleoPackage;
  builds: BuildRun[];
  devRuns: DevAgentRun[];
  tenant?: Tenant;
}): Stage {
  // Tenant-derived states first (they outrank package status once provisioned).
  if (input.tenant) {
    if (input.tenant.status === "active") return "live";
    if (input.tenant.status === "paused") return "paused";
    if (input.tenant.status === "provisioning") return "deployed";
  }
  const pkg = input.pkg;
  if (!pkg) {
    if (input.intel?.scrape_status === "done") return "council";
    return "intake";
  }
  // Real cleo_packages.status enum (per 0008_factory_cleo_pipeline.sql):
  // queued | in-review | planning | proposing | awaiting-approval | building |
  // testing | live | rejected | needs-info
  const s = pkg.status;
  if (s === "queued") return "queued";
  if (s === "in-review") return "proposal";
  if (s === "planning") {
    return input.devRuns.length > 0 ? "building" : "planning";
  }
  if (s === "building") return "building";
  if (s === "testing") return "building";
  if (s === "proposing") return "proposing";
  if (s === "awaiting-approval") return "awaiting-approval";
  if (s === "live") return "live";
  if (s === "rejected") return "paused";
  if (s === "needs-info") return "needs-info";
  return "intake";
}

function formatElapsed(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}
