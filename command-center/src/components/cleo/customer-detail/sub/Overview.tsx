// Overview — single linear narrative.
//
// One column, top to bottom: each stage in the customer's lifecycle as a
// self-contained card with its own status, timing, key facts, and a
// "open <tab>" link. Stats live INSIDE the relevant stage, not in a
// separate dashboard widget.

import type {
  CustomerDetailContext,
  CustomerDetailStatuses,
  CustomerSubTab,
  StageStatus,
} from "../CustomerDetailLayout";

interface StageCard {
  id: string;
  num: number;
  label: string;
  status: StageStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  facts: Array<{ k: string; v: string | number }>;
  body?: string;
  linkTab?: CustomerSubTab;
  linkLabel?: string;
}

export function OverviewPage({
  ctx,
  statuses,
  onChangeTab,
}: {
  ctx: CustomerDetailContext;
  statuses: CustomerDetailStatuses;
  onChangeTab: (t: CustomerSubTab) => void;
}): JSX.Element {
  const stages = buildStages(ctx, statuses);

  return (
    <div className="cd-page cd-overview">
      <ol className="cd-flow">
        {stages.map((s, i) => (
          <li key={s.id} className={`cd-flow-step status-${s.status}`}>
            <div className="cd-flow-rail" aria-hidden>
              <span className={`cd-flow-marker ${s.status}`} />
              {i < stages.length - 1 ? <span className="cd-flow-line" /> : null}
            </div>
            <div className="cd-flow-card">
              <div className="cd-flow-card-head">
                <div className="cd-flow-card-title">
                  <span className="cd-flow-num">{String(s.num).padStart(2, "0")}</span>
                  <strong>{s.label}</strong>
                </div>
                <span className={`cd-flow-status ${s.status}`}>{statusLabel(s.status)}</span>
              </div>
              {s.body ? <p className="cd-flow-body">{s.body}</p> : null}
              {s.facts.length > 0 ? (
                <dl className="cd-flow-facts">
                  {s.facts.map((f) => (
                    <div key={f.k} className="cd-flow-fact">
                      <dt>{f.k}</dt>
                      <dd>{f.v}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              <div className="cd-flow-foot">
                <span className="cd-flow-time">
                  {s.startedAt ? `started ${fmtTime(s.startedAt)}` : ""}
                  {s.completedAt ? ` · finished ${fmtTime(s.completedAt)}` : ""}
                  {s.durationMs ? ` · ${fmtDuration(s.durationMs)}` : ""}
                </span>
                {s.linkTab ? (
                  <button type="button" className="cd-flow-link" onClick={() => onChangeTab(s.linkTab!)}>
                    {s.linkLabel ?? `Open ${s.label.toLowerCase()}`} →
                  </button>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function buildStages(
  ctx: CustomerDetailContext,
  statuses: CustomerDetailStatuses,
): StageCard[] {
  const stages: StageCard[] = [];
  let n = 1;

  // 1. Signed up
  stages.push({
    id: "signup",
    num: n++,
    label: "Signed up",
    status: ctx.company ? "done" : "pending",
    completedAt: ctx.company?.created_at,
    facts: [
      ctx.company?.referral_code
        ? { k: "code", v: ctx.company.referral_code }
        : null,
      ctx.company?.invited_by
        ? { k: "invited by", v: ctx.company.invited_by }
        : null,
      ctx.company?.email ? { k: "email", v: ctx.company.email } : null,
    ].filter(Boolean) as Array<{ k: string; v: string }>,
    body: ctx.company
      ? `Account created via ${ctx.company.signup_source ?? "invite"}.`
      : undefined,
  });

  // 2. Deep scrape
  const intel = ctx.intel;
  const stack = (intel?.tech_stack ?? {}) as Record<string, any>;
  const channels = (intel?.sales_channels ?? []) as Array<any>;
  const intelFacts: Array<{ k: string; v: string | number }> = intel ? [
    { k: "pages", v: intel.pages_crawled ?? 0 },
    { k: "products", v: (intel.products ?? []).length },
    { k: "services", v: (intel.services ?? []).length },
    { k: "team", v: (intel.team ?? []).length },
    { k: "socials", v: (intel.social_links ?? []).length },
    stack.ecommerce_platform && stack.ecommerce_platform !== "unknown"
      ? { k: "platform", v: stack.ecommerce_platform }
      : null,
    channels.length > 0 ? { k: "channels", v: channels.length } : null,
  ].filter(Boolean) as Array<{ k: string; v: string | number }> : [];
  stages.push({
    id: "intel",
    num: n++,
    label: "Deep scrape",
    status: statuses.intel,
    startedAt: intel?.scrape_started_at,
    completedAt: intel?.scrape_completed_at,
    durationMs:
      intel?.scrape_started_at && intel?.scrape_completed_at
        ? new Date(intel.scrape_completed_at).getTime() -
          new Date(intel.scrape_started_at).getTime()
        : undefined,
    body: intel?.summary ?? undefined,
    facts: intelFacts,
    linkTab: "intel",
    linkLabel: "View stack, channels, products",
  });

  // 3. Cleo conversation
  const lastMsg = ctx.chatMessages[ctx.chatMessages.length - 1];
  stages.push({
    id: "chat",
    num: n++,
    label: "Cleo onboarding",
    status: statuses.chat,
    startedAt: ctx.chatMessages[0]?.created_at,
    body: lastMsg ? `Last: "${truncate(lastMsg.content, 140)}"` : undefined,
    facts: ctx.chatMessages.length > 0
      ? [
          { k: "messages", v: ctx.chatMessages.length },
          { k: "from customer", v: ctx.chatMessages.filter((m: any) => m.role === "user").length },
          { k: "from cleo", v: ctx.chatMessages.filter((m: any) => m.role === "assistant").length },
        ]
      : [],
    linkTab: "chat",
    linkLabel: "Open transcript",
  });

  // 4. Council
  const councilFirst = ctx.council.find((r: any) => r.agent === "scrapper" && r.round === 1);
  const councilLast = [...ctx.council].sort(
    (a: any, b: any) =>
      new Date(b.completed_at ?? b.started_at).getTime() -
      new Date(a.completed_at ?? a.started_at).getTime(),
  )[0];
  const gapApproved = ctx.council.find(
    (r: any) => r.agent === "gap-analyst" && r.output?.verdict === "approved",
  );
  const totalRounds = Math.max(
    ...ctx.council.map((r: any) => r.round ?? 1),
    1,
  );
  stages.push({
    id: "council",
    num: n++,
    label: "5-agent council",
    status: statuses.council,
    startedAt: councilFirst?.started_at,
    completedAt: councilLast?.completed_at,
    durationMs:
      councilFirst?.started_at && councilLast?.completed_at
        ? new Date(councilLast.completed_at).getTime() -
          new Date(councilFirst.started_at).getTime()
        : undefined,
    body: gapApproved?.output?.one_line_summary,
    facts: ctx.council.length > 0
      ? [
          { k: "agents done", v: ctx.council.filter((r: any) => r.status === "done").length },
          { k: "rounds", v: totalRounds },
          { k: "verdict", v: gapApproved ? "approved" : "—" },
        ]
      : [],
    linkTab: "council",
    linkLabel: "View agent outputs",
  });

  // 5. Proposal canvas
  const canvas = ctx.canvas;
  const canvasNodes = canvas?.nodes?.length ?? 0;
  const aiNodes = (canvas?.nodes ?? []).filter((x: any) => x.data?.automation === "ai").length;
  const userNodes = (canvas?.nodes ?? []).filter((x: any) => x.data?.automation === "user-action").length;
  const totalSavings = (canvas?.nodes ?? []).reduce(
    (sum: number, x: any) => sum + (x.data?.estimated_monthly_saving_usd ?? 0),
    0,
  );
  stages.push({
    id: "canvas",
    num: n++,
    label: "Proposal canvas",
    status: canvas?.status === "sent-to-aubos" ? "done" : statuses.canvas,
    facts: canvasNodes > 0
      ? [
          { k: "nodes", v: canvasNodes },
          { k: "edges", v: (canvas?.edges ?? []).length },
          { k: "AI", v: aiNodes },
          { k: "human", v: userNodes },
          totalSavings > 0 ? { k: "$ saved/mo", v: `$${Math.round(totalSavings)}` } : null,
        ].filter(Boolean) as Array<{ k: string; v: string | number }>
      : [],
    body:
      canvas?.status === "sent-to-aubos"
        ? "Proposal accepted by the customer. Build pipeline kicked off."
        : undefined,
    linkTab: "canvas",
    linkLabel: "View business map",
  });

  // 6. Integrations
  const required = (canvas?.nodes ?? []).filter((x: any) => x.kind === "integration").length;
  const connected = ctx.secrets.filter((s: any) => s.status === "connected").length;
  stages.push({
    id: "integrations",
    num: n++,
    label: "Integrations",
    status: statuses.integrations,
    facts: required > 0 || connected > 0
      ? [
          { k: "required", v: required },
          { k: "connected", v: connected },
        ]
      : [],
    body:
      required > 0 && connected < required
        ? `Customer needs to connect ${required - connected} more.`
        : undefined,
    linkTab: "integrations",
    linkLabel: "View integration status",
  });

  // 7. Build
  const latestBuild = ctx.buildRuns[0];
  stages.push({
    id: "build",
    num: n++,
    label: "Build pipeline",
    status: statuses.build,
    startedAt: latestBuild?.started_at ?? latestBuild?.created_at,
    completedAt: latestBuild?.completed_at,
    facts: latestBuild
      ? [
          { k: "agent runs", v: ctx.devAgentRuns.length },
          { k: "plans", v: ctx.plannerOutputs.length },
        ]
      : [],
    body: !latestBuild ? "Will start once the proposal is accepted." : undefined,
    linkTab: "build",
    linkLabel: "Open build pipeline",
  });

  // 8. Tenant
  const tenant = ctx.tenant;
  stages.push({
    id: "tenant",
    num: n++,
    label: "Tenant live",
    status: statuses.tenant,
    completedAt: tenant?.created_at,
    body: !tenant ? "VPS not provisioned yet." : undefined,
    facts: tenant
      ? [
          { k: "ip", v: tenant.vps_ip ?? "—" },
          { k: "region", v: tenant.region ?? "—" },
          { k: "status", v: tenant.status ?? "—" },
        ]
      : [],
    linkTab: "tenant",
    linkLabel: "Open tenant ops",
  });

  return stages;
}

function statusLabel(s: StageStatus): string {
  return { done: "Done", running: "Running", pending: "Waiting", failed: "Failed", skipped: "Skipped" }[s];
}
function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(0)}s`;
  const m = s / 60;
  if (m < 60) return `${m.toFixed(1)}m`;
  return `${(m / 60).toFixed(1)}h`;
}
function truncate(s: string, n: number): string {
  if (!s) return "";
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}
