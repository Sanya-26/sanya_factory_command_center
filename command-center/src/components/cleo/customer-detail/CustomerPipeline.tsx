// CustomerPipeline — vertical timeline view of every stage in the AUBOS
// pipeline for a single customer. Each stage shows status + a tight summary;
// clicking expands the existing sub-page component inline for the full data.

import { useState, useEffect } from "react";
import type { CustomerDetailContext, CustomerDetailStatuses, StageStatus } from "./CustomerDetailLayout";
import { IntelPage } from "./sub/Intel";
import { ChatPage } from "./sub/Chat";
import { CanvasPage } from "./sub/Canvas";
import { CouncilPage } from "./sub/Council";
import { ProposalPage } from "./sub/Proposal";
import { IntegrationsPage } from "./sub/Integrations";
import { BuildPage } from "./sub/Build";
import { TenantPage } from "./sub/Tenant";

interface PipelineStage {
  id: string;
  label: string;
  summary: (ctx: CustomerDetailContext) => string;
  status: (ctx: CustomerDetailContext, statuses: CustomerDetailStatuses) => StageStatus;
  Body: ((props: { ctx: CustomerDetailContext }) => JSX.Element) | null;
}

const STAGES: PipelineStage[] = [
  {
    id: "signup",
    label: "Signup",
    summary: (c) => {
      if (!c.company) return "—";
      const days = c.company.created_at ? daysAgo(c.company.created_at) : "?";
      return `${c.company.name ?? "—"} · joined ${days} via ${c.company.signup_source ?? "unknown"}`;
    },
    status: (c) => (c.company ? "done" : "pending"),
    Body: SignupBody,
  },
  {
    id: "scrape",
    label: "Website scrape",
    summary: (c) => {
      if (!c.intel) return "no scrape yet";
      const s = c.intel.scrape_status;
      const pages = c.intel.pages_crawled ?? 0;
      if (s === "done") return `${pages} page(s) crawled · brand_voice + products + tech_stack populated`;
      if (s === "scraping" || s === "running") return "in progress…";
      if (s === "failed") return `failed: ${c.intel.scrape_error ?? "unknown error"}`;
      return s ?? "pending";
    },
    status: (_c, s) => s.intel,
    Body: ({ ctx }) => <IntelPage ctx={ctx} />,
  },
  {
    id: "onboarding",
    label: "Cleo onboarding (chat + canvas)",
    summary: (c) => {
      const nodes = c.canvas?.nodes?.length ?? 0;
      const edges = c.canvas?.edges?.length ?? 0;
      const msgs = c.chatMessages.length;
      if (!nodes && !msgs) return "not started";
      return `${nodes} nodes · ${edges} edges · ${msgs} chat msgs · status=${c.canvas?.status ?? "in-progress"}`;
    },
    status: (_c, s) => (s.canvas === "pending" && s.chat === "pending" ? "pending" : s.canvas),
    Body: OnboardingBody,
  },
  {
    id: "intake-council",
    label: "Intake council (7 agents)",
    summary: (c) => {
      if (!c.council.length) return "not run yet";
      const byAgent: Record<string, number> = {};
      for (const r of c.council) byAgent[r.agent] = Math.max(byAgent[r.agent] ?? 0, r.round);
      const totalRounds = Math.max(...Object.values(byAgent));
      return `${c.council.length} runs · ${Object.keys(byAgent).length} agents · max round ${totalRounds}`;
    },
    status: (_c, s) => s.council,
    Body: ({ ctx }) => <CouncilPage ctx={ctx} />,
  },
  {
    id: "proposal-council",
    label: "Proposal council (6 agents) — pitch deck + leader verdict",
    summary: (c) => {
      const finalized = c.journeyEvents.some((e) => e.event_kind === "proposal-council-completed");
      const shipFlag = c.journeyEvents.some((e) => e.event_kind === "proposal-council-ship-with-flag");
      if (shipFlag) return "ship-with-flag (leader requested revision)";
      if (finalized) return "ship-ready · leader approved";
      return "not run yet or in flight";
    },
    status: (c) => {
      const finalized = c.journeyEvents.some((e) => e.event_kind === "proposal-council-completed");
      const shipFlag = c.journeyEvents.some((e) => e.event_kind === "proposal-council-ship-with-flag");
      if (finalized) return "done";
      if (shipFlag) return "running";
      return "pending";
    },
    Body: ({ ctx }) => <ProposalPage ctx={ctx} />,
  },
  {
    id: "accept-proposal",
    label: "Customer accepts proposal",
    summary: (c) => {
      const accepted = c.journeyEvents.some((e) => e.event_kind === "customer-accepted-proposal");
      return accepted ? "customer clicked Accept" : "awaiting customer action";
    },
    status: (c) => {
      const accepted = c.journeyEvents.some((e) => e.event_kind === "customer-accepted-proposal");
      return accepted ? "done" : "pending";
    },
    Body: null,
  },
  {
    id: "integrations",
    label: "Customer connects integrations",
    summary: (c) => {
      const connected = c.secrets.filter((s) => s.status === "connected").length;
      const total = c.secrets.length;
      return total ? `${connected} / ${total} connected` : "none yet";
    },
    status: (_c, s) => s.integrations,
    Body: ({ ctx }) => <IntegrationsPage ctx={ctx} />,
  },
  {
    id: "build",
    label: "Build (planner → architect → requirements → business ops → controls → TPM → dev-agents → QC)",
    summary: (c) => {
      if (!c.buildRuns.length) return "not started";
      const latest = c.buildRuns[0];
      return `${c.buildRuns.length} build run(s) · ${c.devAgentRuns.length} dev-agent runs · latest=${latest.status}`;
    },
    status: (_c, s) => s.build,
    Body: ({ ctx }) => <BuildPage ctx={ctx} />,
  },
  {
    id: "tenant",
    label: "Tenant live",
    summary: (c) => {
      if (!c.tenant) return "no tenant yet";
      return `${c.tenant.slug}.aubos.ai · status=${c.tenant.status}`;
    },
    status: (_c, s) => s.tenant,
    Body: ({ ctx }) => <TenantPage ctx={ctx} />,
  },
];

const PILL_TOKEN: Record<StageStatus, { color: string; bg: string; border: string; label: string }> = {
  done:    { color: "var(--green)",  bg: "var(--green-bg)",  border: "var(--green-border)",  label: "DONE" },
  running: { color: "var(--amber)",  bg: "var(--amber-bg)",  border: "var(--amber-border)",  label: "RUNNING" },
  pending: { color: "var(--text-muted)", bg: "var(--glass-bg)", border: "var(--glass-border)", label: "PENDING" },
  failed:  { color: "var(--red)",    bg: "var(--red-bg)",    border: "var(--red-border)",    label: "FAILED" },
  skipped: { color: "var(--text-faint)", bg: "var(--glass-bg)", border: "var(--glass-border)", label: "SKIPPED" },
};

export function CustomerPipeline({ ctx, statuses }: { ctx: CustomerDetailContext; statuses: CustomerDetailStatuses }): JSX.Element {
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const focus = STAGES.find((s) => {
      const st = s.status(ctx, statuses);
      return st === "running" || st === "failed";
    });
    if (focus && expanded === null) setExpanded(focus.id);
  }, [ctx, statuses, expanded]);

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1200 }}>
      <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14, fontFamily: "var(--font-mono)" }}>
        Pipeline · {STAGES.length} stages
      </div>
      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 8 }}>
        {/* Vertical timeline rail */}
        <div aria-hidden style={{ position: "absolute", left: 13, top: 22, bottom: 22, width: 1, background: "var(--glass-border)" }} />
        {STAGES.map((stage, idx) => {
          const status = stage.status(ctx, statuses);
          const summary = stage.summary(ctx);
          const isOpen = expanded === stage.id;
          const canExpand = stage.Body !== null;
          const pill = PILL_TOKEN[status];
          return (
            <div key={stage.id} style={{ position: "relative", paddingLeft: 36 }}>
              {/* Timeline dot */}
              <div aria-hidden style={{
                position: "absolute",
                left: 7,
                top: 16,
                width: 13,
                height: 13,
                borderRadius: 99,
                background: status === "done" ? pill.color : status === "running" ? pill.color : status === "failed" ? pill.color : "var(--bg-deep)",
                border: `2px solid ${pill.border}`,
                boxShadow: status === "running" ? "0 0 12px " + pill.color : status === "done" ? "0 0 8px " + pill.color + "44" : "none",
                zIndex: 1,
              }} />

              <div style={{
                background: "var(--bg-surface)",
                backdropFilter: "var(--glass-blur)",
                WebkitBackdropFilter: "var(--glass-blur)",
                border: `1px solid ${isOpen ? pill.border : "var(--glass-border)"}`,
                borderRadius: 8,
                overflow: "hidden",
                boxShadow: isOpen ? "var(--glass-shadow-soft)" : "none",
                transition: "border 0.15s, box-shadow 0.15s",
              }}>
                <button
                  type="button"
                  onClick={() => canExpand && setExpanded(isOpen ? null : stage.id)}
                  disabled={!canExpand}
                  style={{
                    width: "100%",
                    padding: "13px 16px",
                    background: "transparent",
                    border: "none",
                    textAlign: "left",
                    cursor: canExpand ? "pointer" : "default",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    color: "var(--text)",
                    font: "inherit",
                  }}
                >
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-faint)", width: 18, textAlign: "right" }}>{String(idx + 1).padStart(2, "0")}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--text)", marginBottom: 2, letterSpacing: "-0.005em" }}>{stage.label}</div>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{summary}</div>
                  </div>
                  <span style={{
                    background: pill.bg,
                    color: pill.color,
                    border: `1px solid ${pill.border}`,
                    padding: "3px 9px",
                    borderRadius: 99,
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    flexShrink: 0,
                    fontFamily: "var(--font-mono)",
                  }}>
                    {pill.label}
                  </span>
                  {canExpand ? (
                    <span style={{ color: "var(--text-faint)", fontSize: 14, width: 14, textAlign: "center" }}>{isOpen ? "−" : "+"}</span>
                  ) : null}
                </button>
                {canExpand && isOpen ? (
                  <div style={{ borderTop: "1px solid var(--glass-border)", padding: 0, background: "rgba(255,255,255,0.015)" }}>
                    {stage.Body ? <stage.Body ctx={ctx} /> : null}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function daysAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const d = Math.floor(ms / 86400000);
  if (d === 0) return "today";
  if (d === 1) return "1 day ago";
  if (d < 30) return `${d} days ago`;
  return `${Math.floor(d / 30)} mo ago`;
}

function SignupBody({ ctx }: { ctx: CustomerDetailContext }) {
  return (
    <div style={{ padding: 18, fontSize: "var(--text-sm)", color: "var(--text)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {[
            ["Name", ctx.company?.name],
            ["Website", ctx.company?.home_website],
            ["Email", ctx.company?.email],
            ["Niche", ctx.company?.niche],
            ["Industry", ctx.company?.industry],
            ["Referral code", ctx.company?.referral_code],
            ["Signup source", ctx.company?.signup_source],
            ["Created", ctx.company?.created_at],
          ].map(([k, v]) => (
            <tr key={k as string} style={{ borderBottom: "1px solid var(--glass-border)" }}>
              <td style={{ padding: "7px 8px", color: "var(--text-muted)", width: 150, fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{k}</td>
              <td style={{ padding: "7px 8px", color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)" }}>{v ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {ctx.journeyEvents.length > 0 ? (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: "var(--font-mono)" }}>Journey events ({ctx.journeyEvents.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {ctx.journeyEvents.map((e) => (
              <div key={e.id} style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-dim)", padding: "3px 0" }}>
                <span style={{ color: "var(--text-faint)" }}>{e.created_at?.slice(11, 19)}</span>
                {" "}<span style={{ color: "var(--accent)" }}>{e.event_kind}</span>
                {" "}<span style={{ color: "var(--text-faint)" }}>by {e.actor ?? "system"}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OnboardingBody({ ctx }: { ctx: CustomerDetailContext }) {
  return (
    <div>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--glass-border)", fontSize: "var(--text-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--font-mono)" }}>
        Canvas
      </div>
      <CanvasPage ctx={ctx} />
      <div style={{ padding: "14px 18px", borderTop: "1px solid var(--glass-border)", borderBottom: "1px solid var(--glass-border)", fontSize: "var(--text-xs)", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "var(--font-mono)" }}>
        Conversation with Cleo
      </div>
      <ChatPage ctx={ctx} />
    </div>
  );
}
