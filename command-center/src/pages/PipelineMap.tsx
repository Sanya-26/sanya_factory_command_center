// Shared pipeline visualizer used by BOTH:
//   - /cleo/workflow   → Cleo's pre-build workflow (intake + council + proposal)
//   - /factory/pipeline → AI Factory's build pipeline (plan + build + QC + deploy)
//
// One component, two pipeline definitions. Status colors / customer chips /
// per-node cost all driven from live polled data — different views into the
// same factory state, scoped to the relevant phases per dept.

import { useEffect, useMemo, useState } from "react";
import { getFactorySupabase } from "../lib/factorySupabase";

// ─── Pipeline definitions ────────────────────────────────────────────────────

export type Phase = {
  id: string;
  label: string;
  agents: Agent[];
};

type Agent = {
  slug: string;
  label: string;
  model?: string;
};

// ─── Shared build-engine phases (SAME agent_ids run in both pipelines) ────
// Planning, dev agents, QC, security, deploy — these are the FACTORY MACHINERY.
// Cleo's pipeline uses them. The AI Factory's pipeline uses them.
// The agent_ids match dev_agent_runs.agent_id 1:1 so the live status data
// populates BOTH views simultaneously.

const PLANNING: Phase = {
  id: "planning",
  label: "Planning",
  agents: [
    { slug: "planner",          label: "Planner",          model: "claude-opus-4-7" },
    { slug: "tool-resolver",    label: "Tool Resolver" },
    { slug: "system-architect", label: "System Architect", model: "claude-opus-4-7" },
    { slug: "business-council", label: "Business Council", model: "claude-opus-4-7" },
    { slug: "pm",               label: "Project Manager",  model: "claude-sonnet-4-6" },
  ],
};

const DEV_AGENTS: Phase = {
  id: "build",
  label: "Dev Agents",
  agents: [
    { slug: "backend-dev",        label: "Backend dev",    model: "claude-opus-4-7" },
    { slug: "frontend-dev",       label: "Frontend dev",   model: "gpt-5-codex" },
    { slug: "integrations-dev",   label: "Integrations",   model: "claude-opus-4-7" },
    { slug: "vps-dev",            label: "VPS dev",        model: "claude-opus-4-7" },
    { slug: "payments-specialist",label: "Payments",       model: "claude-opus-4-7" },
    { slug: "finance-ops",        label: "Finance ops",    model: "claude-opus-4-7" },
    { slug: "compliance-officer", label: "Compliance",     model: "claude-opus-4-7" },
    { slug: "sre-engineer",       label: "SRE",            model: "claude-opus-4-7" },
    { slug: "data-engineer",      label: "Data",           model: "claude-opus-4-7" },
    { slug: "marketing-engineer", label: "Marketing",      model: "claude-sonnet-4-6" },
    { slug: "sales-engineer",     label: "Sales",          model: "claude-sonnet-4-6" },
    { slug: "support-engineer",   label: "Support",        model: "claude-sonnet-4-6" },
    { slug: "people-ops-engineer",label: "People ops",     model: "claude-sonnet-4-6" },
    { slug: "ai-workflow-engineer",label:"AI workflow",    model: "claude-opus-4-7" },
    { slug: "pm-engineer",        label: "PM engineer",    model: "claude-sonnet-4-6" },
    { slug: "content-engineer",   label: "Content",        model: "claude-sonnet-4-6" },
    { slug: "code-critic",        label: "Code critic",    model: "claude-sonnet-4-6" },
    { slug: "visual-critic",      label: "Visual critic",  model: "gpt-5-codex" },
    { slug: "a11y-critic",        label: "A11y critic",    model: "gpt-5-codex" },
  ],
};

const QC: Phase = {
  id: "qc",
  label: "QC + Gap loop",
  agents: [
    { slug: "ai-qc",                       label: "AI QC",                model: "claude-sonnet-4-6" },
    { slug: "content-qc",                  label: "Content QC",           model: "claude-sonnet-4-6" },
    { slug: "spec-adherence",              label: "Spec adherence",       model: "claude-sonnet-4-6" },
    { slug: "pre-build-compliance-scout",  label: "Compliance scout",     model: "claude-opus-4-7" },
    { slug: "content-platform-compliance", label: "Platform compliance",  model: "claude-sonnet-4-6" },
    { slug: "e2e-auditor",                 label: "E2E auditor",          model: "gpt-5-codex" },
    { slug: "sync-validator",              label: "Sync validator" },
    { slug: "memory-agent",                label: "Memory agent",         model: "claude-haiku-4-5" },
  ],
};

const SECURITY: Phase = {
  id: "security",
  label: "Security + Load",
  agents: [
    { slug: "security-pentest",  label: "Pentest (OWASP)" },
    { slug: "dep-vuln-scan",     label: "Dep-vuln scan" },
    { slug: "secret-scan",       label: "Secret scan" },
    { slug: "load-test",         label: "Load test (k6)" },
  ],
};

const DEPLOY: Phase = {
  id: "deploy",
  label: "Deploy",
  agents: [
    { slug: "supabase-provisioner", label: "Supabase project" },
    { slug: "do-provisioner",       label: "DO droplet" },
    { slug: "cloudflare-deployer",  label: "CF Pages" },
    { slug: "tenant-deploy",        label: "Tenant deploy" },
    { slug: "harness-up",           label: "Harness boot" },
    { slug: "sdk-install",          label: "Tool install" },
    { slug: "desktop-smoke",        label: "Desktop test" },
  ],
};

// ─── CLEO pipeline ─────────────────────────────────────────────────────────
// The full lifecycle of the Cleo PRODUCT for a customer: their intake +
// council critique + proposal + the shared build engine + Cleo-specific live
// runtime (daily briefing, customer chats, the 12 playbooks firing).
// This pipeline ONLY fires when someone is being onboarded as a Cleo customer.

export const CLEO_PIPELINE: Phase[] = [
  {
    id: "intake",
    label: "1 · Intake",
    agents: [
      { slug: "cleo-onboarding",  label: "Cleo · Intake chat", model: "claude-opus-4-7" },
      { slug: "voice-stt",        label: "Deepgram STT" },
      { slug: "doc-extractor",    label: "Doc extractor" },
      { slug: "scrape-deep",      label: "Site deep-scrape" },
      { slug: "scrape-social",    label: "Social scrape" },
    ],
  },
  {
    id: "intake-council",
    label: "2 · Intake Council",
    agents: [
      { slug: "scrapper",     label: "Scrapper",    model: "claude-opus-4-7" },
      { slug: "capability",   label: "Capability",  model: "claude-opus-4-7" },
      { slug: "mastermind",   label: "Mastermind",  model: "claude-opus-4-7" },
      { slug: "architect-r1", label: "Architect",   model: "claude-opus-4-7" },
      { slug: "gap-analyst",  label: "Gap-Analyst", model: "claude-opus-4-7" },
    ],
  },
  {
    id: "proposal",
    label: "3 · Proposal Council",
    agents: [
      { slug: "business-architect", label: "Business Architect", model: "gpt-5" },
      { slug: "researcher",         label: "Researcher",          model: "gpt-5" },
      { slug: "business-scrapper",  label: "Biz Scrapper",        model: "gpt-5" },
      { slug: "process-architect",  label: "Process Architect",   model: "gpt-5" },
      { slug: "pitch-writer",       label: "Pitch Writer",        model: "gpt-5" },
    ],
  },
  {
    id: "approval",
    label: "4 · Approval",
    agents: [
      { slug: "ops-review",       label: "Ops review" },
      { slug: "customer-accept",  label: "Customer accept" },
      { slug: "meeting",          label: "Meeting booked" },
      { slug: "byok-collected",   label: "BYOK keys collected" },
    ],
  },
  // ─── Shared build engine (5-9) ───────────────────────────────────────────
  { ...PLANNING, label: "5 · Planning" },
  { ...DEV_AGENTS, label: "6 · Dev Agents" },
  { ...QC, label: "7 · QC + Gap loop" },
  { ...SECURITY, label: "8 · Security + Load" },
  { ...DEPLOY, label: "9 · Deploy" },
  // ─── Cleo-specific live runtime ──────────────────────────────────────────
  {
    id: "cleo-live",
    label: "10 · Cleo live",
    agents: [
      { slug: "daily-briefing",    label: "Daily briefing cron" },
      { slug: "customer-chats",    label: "Customer chats",    model: "claude-sonnet-4-6" },
      { slug: "playbook-firing",   label: "Playbooks firing" },
      { slug: "weekly-rollup",     label: "Weekly value report" },
      { slug: "global-brain-sync", label: "Global brain sync" },
    ],
  },
];

// ─── AI Factory pipeline ───────────────────────────────────────────────────
// Builds anything that ISN'T Cleo. No intake/council surface — the work
// starts from a charter (spec submitted by ops or a customer's deployed
// Cleo). The build engine itself is identical.

export const FACTORY_PIPELINE: Phase[] = [
  {
    id: "charter",
    label: "1 · Build charter",
    agents: [
      { slug: "charter-author",  label: "Charter author", model: "claude-opus-4-7" },
      { slug: "spec-frozen",     label: "Spec frozen" },
      { slug: "budget-cap",      label: "Budget cap set" },
    ],
  },
  // ─── Shared build engine (2-6) ───────────────────────────────────────────
  { ...PLANNING, label: "2 · Planning" },
  { ...DEV_AGENTS, label: "3 · Dev Agents" },
  { ...QC, label: "4 · QC + Gap loop" },
  { ...SECURITY, label: "5 · Security + Load" },
  { ...DEPLOY, label: "6 · Deploy" },
  // ─── Factory-side live ops (factory-meta watches the whole fleet) ────────
  {
    id: "ops",
    label: "7 · Live ops",
    agents: [
      { slug: "fleet-health",     label: "Fleet health" },
      { slug: "fleet-alerter",    label: "Alerter (30s)" },
      { slug: "fleet-upgrader",   label: "Canary upgrades" },
      { slug: "factory-meta",     label: "Factory-meta",      model: "claude-opus-4-7" },
      { slug: "prompt-engineer",  label: "Prompt-engineer",   model: "claude-sonnet-4-6" },
    ],
  },
];

// ─── Status data shape ──────────────────────────────────────────────────────

type AgentStatus = {
  status: "idle" | "running" | "done" | "failed" | "queued" | "ship-with-flag";
  lastRunAt?: string;
  costUsd?: number;
  runCount?: number;
};

type Customer = { id: string; name: string; phase?: string };

// Which package-statuses map to "in this dept's flow"
const CLEO_PHASES = new Set(["queued", "in-review", "planning", "proposing", "awaiting-approval", "released-for-client"]);
const FACTORY_PHASES = new Set(["accepted", "building", "testing", "live"]);

// ─── The component ──────────────────────────────────────────────────────────

export function PipelineMapPage(props: {
  dept: "cleo" | "factory";
}): JSX.Element {
  const phases = props.dept === "cleo" ? CLEO_PIPELINE : FACTORY_PIPELINE;
  const title = props.dept === "cleo" ? "Cleo workflow" : "AI Factory pipeline";
  const subtitle = props.dept === "cleo"
    ? "Pre-build: intake → council critique → proposal generation → approval. Green pulse = an agent is running right now."
    : "Post-accept: planning → 19 dev specialists → QC + 5-round gap loop → 3-target deploy → live customer.";

  const [statuses, setStatuses] = useState<Record<string, AgentStatus>>({});
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const sb = getFactorySupabase();

      const [
        { data: devs },
        { data: brs },
        { data: pkgs },
        { data: cos },
        { data: resolutions },
        { data: archDocs },
        { data: charters },
        { data: opsEvents },
      ] = await Promise.all([
        sb.from("dev_agent_runs").select("agent_id, status, started_at, completed_at, cost_usd, errors").order("started_at", { ascending: false }).limit(500),
        sb.from("build_runs").select("id, kind, status, started_at, total_cost_usd, package_id").order("started_at", { ascending: false }).limit(200),
        sb.from("cleo_packages").select("id, company_id, status, updated_at").order("updated_at", { ascending: false }).limit(50),
        sb.from("companies").select("id, name").order("created_at", { ascending: false }).limit(50),
        // Pipeline stages that don't write to dev_agent_runs or build_runs:
        //  - tool-resolver writes rows to tool_resolutions
        //  - system-architect writes to system_design_docs
        //  - project-manager writes to build_charters
        // Each one's "done" state is "rows exist for the most-recent planning build_run".
        sb.from("tool_resolutions").select("build_run_id, resolution, resolved_at").order("resolved_at", { ascending: false }).limit(500),
        sb.from("system_design_docs").select("package_id, generated_at, cost_usd").order("generated_at", { ascending: false }).limit(100),
        sb.from("build_charters").select("package_id, generated_at, cost_usd").order("generated_at", { ascending: false }).limit(100),
        // tenant_ops_events from dispatch-build-to-vps instrumentation
        sb.from("tenant_ops_events").select("company_id, kind, severity, payload, ts").order("ts", { ascending: false }).limit(300),
      ]);
      if (cancelled) return;

      // Build agent-status map
      const s: Record<string, AgentStatus> = {};
      const accept = (slot: string, runStatus: string, started?: string, cost?: number, verdict?: string | null) => {
        const cur = s[slot] ?? { status: "idle" as const, costUsd: 0, runCount: 0 };
        const c = (cur.costUsd ?? 0) + (cost ?? 0);
        const n = (cur.runCount ?? 0) + 1;
        if (runStatus === "running" && cur.status !== "running") {
          s[slot] = { status: "running", lastRunAt: started, costUsd: c, runCount: n };
        } else if (cur.status === "idle") {
          // Map failed+verdict='ship-with-flag' to its own state (amber, not red).
          const effectiveStatus: AgentStatus["status"] =
            runStatus === "failed" && verdict === "ship-with-flag"
              ? "ship-with-flag"
              : (({ passed: "done", completed: "done", done: "done", failed: "failed", queued: "queued" } as Record<string, AgentStatus["status"]>)[runStatus] ?? "idle");
          s[slot] = { status: effectiveStatus, lastRunAt: started, costUsd: c, runCount: n };
        } else {
          s[slot] = { ...cur, costUsd: c, runCount: n };
        }
      };
      for (const d of (devs ?? []) as Array<{ agent_id: string; status: string; started_at?: string; cost_usd?: number; errors?: Array<{ verdict?: string }> }>) {
        const verdict = Array.isArray(d.errors) && d.errors[0]?.verdict ? String(d.errors[0].verdict) : null;
        accept(d.agent_id, d.status, d.started_at, d.cost_usd, verdict);
      }
      for (const b of (brs ?? []) as Array<{ kind: string; status: string; started_at?: string; total_cost_usd?: number }>) {
        const map: Record<string, string> = { planning: "planner", "ai-qc": "ai-qc", "content-qc": "content-qc", "e2e-audit": "e2e-auditor", deploy: "tenant-deploy", test: "ai-qc" };
        const slot = map[b.kind];
        if (slot) accept(slot, b.status, b.started_at, b.total_cost_usd);
      }

      // Tool-resolver: if any rows exist, mark it done. Use newest row's resolved_at.
      if (Array.isArray(resolutions) && resolutions.length > 0) {
        accept("tool-resolver", "passed", (resolutions[0] as any).resolved_at, 0);
      }
      // System architect: rows in system_design_docs (+ cost from sum)
      if (Array.isArray(archDocs) && archDocs.length > 0) {
        const totalCost = (archDocs as any[]).reduce((acc, r) => acc + (Number(r.cost_usd) || 0), 0);
        accept("system-architect", "passed", (archDocs[0] as any).generated_at, totalCost);
      }
      // Project manager: rows in build_charters
      if (Array.isArray(charters) && charters.length > 0) {
        const totalCost = (charters as any[]).reduce((acc, r) => acc + (Number(r.cost_usd) || 0), 0);
        accept("pm", "passed", (charters[0] as any).generated_at, totalCost);
      }

      // Dispatch / deploy events from tenant_ops_events (my instrumentation)
      // map to deploy-column slugs: supabase-provisioner, do-provisioner,
      // cloudflare-deployer, tenant-deploy, harness-bootstrap, sdk-install.
      for (const e of (opsEvents ?? []) as Array<{ kind: string; severity: string; payload: any; ts: string }>) {
        if (!e.payload?.step) continue;
        const step = String(e.payload.step);
        // Map raw step names to pipeline node slugs
        const slotMap: Record<string, string> = {
          "supabase-provision": "supabase-provisioner",
          "apply-migration":    "supabase-provisioner",
          "do-provision":       "do-provisioner",
          "cloudflare-deploy":  "cloudflare-deployer",
          "tenant-deploy":      "tenant-deploy",
          "harness-bootstrap":  "harness-up",
          "sdk-install":        "sdk-install",
          "emit-customer-config": "tenant-deploy",  // bucket into tenant-deploy
        };
        // Find slot by prefix match (the step names sometimes have a suffix detail)
        let slot: string | null = null;
        for (const [key, val] of Object.entries(slotMap)) {
          if (step.startsWith(key)) { slot = val; break; }
        }
        if (!slot) continue;
        const runStatus = e.kind === "dispatch.done" ? "passed" : e.kind === "dispatch.failed" ? "failed" : "running";
        accept(slot, runStatus, e.ts, 0);
      }

      setStatuses(s);

      // Customer chips. For the AI Factory pipeline we ALSO include any
      // customer with currently-running dev_agent_runs or recent build_runs,
      // even if their cleo_packages.status is "awaiting-approval". The build
      // engine is what this view is about — show any customer the engine is
      // actively touching.
      const pkgByCompany: Record<string, { status: string }> = {};
      for (const p of (pkgs ?? []) as Array<{ company_id: string; status: string }>) {
        pkgByCompany[p.company_id] ??= { status: p.status };
      }

      // Companies with RUNNING dev-agents right now (factory engine active).
      const activeCompanyIds = new Set<string>();
      if (props.dept === "factory") {
        for (const d of (devs ?? []) as Array<{ status: string; build_run_id?: string }>) {
          if (d.status === "running") {
            // We can't directly join here without an extra query; the chip
            // strip is best-effort. Use a fall-through: if ANY dev agent is
            // running we show ALL companies that have packages — preferable
            // to "no customers" when the engine is clearly busy.
            // (A future tightening: query build_runs.package_id → cleo_packages.company_id.)
            // For now mark a sentinel that "engine is active":
          }
        }
      }
      const anyRunningDev = ((devs ?? []) as Array<{ status: string }>).some((d) => d.status === "running");

      const customerList: Customer[] = ((cos ?? []) as Array<{ id: string; name: string }>)
        .map((c) => {
          const pkg = pkgByCompany[c.id];
          const status = pkg?.status;
          if (!status) return { id: c.id, name: c.name, phase: "intake" };
          return { id: c.id, name: c.name, phase: derivePhase(status) };
        })
        .filter((c) => {
          if (props.dept === "cleo") return !c.phase || ["intake", "council", "proposal", "approval"].includes(c.phase ?? "");
          // factory: show any customer in build phase OR (any customer with a
          // package) when the engine is actively running. Otherwise show none.
          if (["planning", "build", "live"].includes(c.phase ?? "")) return true;
          return anyRunningDev && Boolean(pkgByCompany[c.id]);
        });
      setCustomers(customerList);
    };
    tick();
    const iv = setInterval(tick, 4000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [props.dept]);

  const totalRunning = Object.values(statuses).filter((s) => s.status === "running").length;
  const totalDone    = Object.values(statuses).filter((s) => s.status === "done").length;
  const totalFailed  = Object.values(statuses).filter((s) => s.status === "failed").length;
  const totalFlagged = Object.values(statuses).filter((s) => s.status === "ship-with-flag").length;
  const totalCost    = useMemo(() => Object.values(statuses).reduce((acc, s) => acc + (s.costUsd ?? 0), 0), [statuses]);

  // "Now running" banner — find the most-recent running agent (by lastRunAt)
  // so we always foreground ONE thing that's actively happening on the factory.
  const nowRunning = useMemo(() => {
    let pick: { slug: string; label: string; phase: string; lastRunAt?: string; costUsd?: number } | null = null;
    for (const phase of phases) {
      for (const a of phase.agents) {
        const st = statuses[a.slug];
        if (st?.status === "running") {
          if (!pick || (st.lastRunAt && pick.lastRunAt && st.lastRunAt > pick.lastRunAt)) {
            pick = { slug: a.slug, label: a.label, phase: phase.label, lastRunAt: st.lastRunAt, costUsd: st.costUsd };
          }
        }
      }
    }
    return pick;
  }, [phases, statuses]);

  // Tick every second so the elapsed-time on the "now running" banner counts up.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  const elapsedLabel = (iso?: string): string => {
    if (!iso) return "";
    const s = Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 1000));
    const m = Math.floor(s / 60); const r = s % 60;
    return m > 0 ? `${m}m ${r}s` : `${s}s`;
  };

  return (
    <div className="shell-content-wide pipeline-map">
      <div className="page-header">
        <div>
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">{subtitle}</p>
        </div>
        <div className="pipeline-kpis">
          <div className="pipeline-kpi pipeline-kpi--running"><strong>{totalRunning}</strong><span>running</span></div>
          <div className="pipeline-kpi pipeline-kpi--done"><strong>{totalDone}</strong><span>done</span></div>
          <div className="pipeline-kpi pipeline-kpi--flagged"><strong>{totalFlagged}</strong><span>ship-with-flag</span></div>
          <div className="pipeline-kpi pipeline-kpi--failed"><strong>{totalFailed}</strong><span>failed</span></div>
          <div className="pipeline-kpi"><strong>${totalCost.toFixed(2)}</strong><span>spent</span></div>
        </div>
      </div>

      {/* "Now running" banner — sits between page header and the chip strip.
          Hidden when nothing is actively running. */}
      {nowRunning ? (
        <div className="pipeline-now-running">
          <span className="pipeline-spinner" aria-hidden="true" />
          <span className="pipeline-now-label">RUNNING NOW</span>
          <strong className="pipeline-now-agent">{nowRunning.label}</strong>
          <span className="pipeline-now-phase">in {nowRunning.phase}</span>
          {nowRunning.lastRunAt ? (
            <span className="pipeline-now-elapsed">· {elapsedLabel(nowRunning.lastRunAt)} elapsed</span>
          ) : null}
          {totalRunning > 1 ? (
            <span className="pipeline-now-others">+ {totalRunning - 1} other{totalRunning > 2 ? "s" : ""}</span>
          ) : null}
        </div>
      ) : (
        <div className="pipeline-now-running pipeline-now-running--idle">
          <span className="pipeline-spinner pipeline-spinner--idle" aria-hidden="true" />
          <span className="pipeline-now-label">IDLE</span>
          <span className="pipeline-now-agent">no agents running</span>
        </div>
      )}

      <div className="pipeline-customers">
        <span className="pipeline-customers-label">Customers in flow</span>
        {customers.length === 0 ? (
          <span className="dim">no customers in this {props.dept === "cleo" ? "pre-build" : "build"} phase right now</span>
        ) : customers.map((c) => (
          <button
            key={c.id}
            className={`pipeline-chip pipeline-chip--${c.phase ?? "intake"} ${selectedCustomerId === c.id ? "active" : ""}`}
            onClick={() => setSelectedCustomerId(selectedCustomerId === c.id ? null : c.id)}
          >
            {c.name} <small>{c.phase ?? "intake"}</small>
          </button>
        ))}
      </div>

      <div className="pipeline-flow">
        {phases.map((phase, idx) => (
          <div key={phase.id} className="pipeline-phase">
            <header className="pipeline-phase-head">{phase.label}</header>
            <div className="pipeline-phase-body">
              {phase.agents.map((a) => {
                const st = statuses[a.slug];
                const cls = `pipeline-node pipeline-node--${st?.status ?? "idle"} ${activeAgent === a.slug ? "active" : ""}`;
                return (
                  <button key={a.slug} className={cls} onClick={() => setActiveAgent(activeAgent === a.slug ? null : a.slug)} title={a.model ? `model: ${a.model}` : a.label}>
                    <span className="pipeline-node-dot" />
                    <span className="pipeline-node-label">{a.label}</span>
                    {a.model ? <span className="pipeline-node-model">{a.model.replace("claude-", "").replace(/-+/g, " ").replace("gpt-", "gpt-")}</span> : null}
                    {st?.costUsd && st.costUsd > 0 ? <span className="pipeline-node-cost">${st.costUsd.toFixed(2)}</span> : null}
                  </button>
                );
              })}
            </div>
            {idx < phases.length - 1 ? <div className="pipeline-arrow">→</div> : null}
          </div>
        ))}
      </div>

      {activeAgent ? (
        <div className="pipeline-drawer">
          <header>
            <strong>{activeAgent}</strong>
            <span className="dim">  ·  {statuses[activeAgent]?.status ?? "idle"}</span>
            {statuses[activeAgent]?.runCount ? <span className="dim">  ·  {statuses[activeAgent]!.runCount} runs</span> : null}
            {statuses[activeAgent]?.costUsd ? <span className="dim">  ·  ${statuses[activeAgent]!.costUsd!.toFixed(4)}</span> : null}
            {statuses[activeAgent]?.lastRunAt ? <span className="dim">  ·  last {new Date(statuses[activeAgent]!.lastRunAt!).toLocaleString()}</span> : null}
            <button className="pipeline-close" onClick={() => setActiveAgent(null)}>close</button>
          </header>
        </div>
      ) : null}
    </div>
  );
}

function derivePhase(status?: string): string {
  if (!status) return "intake";
  if (status === "queued" || status === "in-review") return "council";
  if (status === "planning" || status === "proposing") return "council";
  if (status === "awaiting-approval" || status === "released-for-client") return "approval";
  if (status === "accepted" || status === "building" || status === "testing") return "build";
  if (status === "live") return "live";
  return "intake";
}
