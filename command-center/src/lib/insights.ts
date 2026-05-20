// Compute KPI / variation-card insights from the mock or live data.
// Goal: each tile/card carries one short, useful sentence.

import type { HealthStatus } from "./health-score";

export function overallHealthInsight(args: {
  redNames: string[];
  yellowNames: string[];
  overall: HealthStatus;
}): string {
  const { redNames, yellowNames, overall } = args;
  if (overall === "red") {
    return `${redNames.length} account${redNames.length === 1 ? "" : "s"} red right now — ${redNames.slice(0, 2).join(", ")}${redNames.length > 2 ? "…" : ""}. Open the riskiest one first.`;
  }
  if (overall === "yellow") {
    const ys = yellowNames.length;
    return `${ys} account${ys === 1 ? "" : "s"} yellow${ys ? ` — ${yellowNames.slice(0, 2).join(", ")}${ys > 2 ? "…" : ""}` : ""}. None red yet, but watch the highest-flag count this week.`;
  }
  return `All live accounts green. Spend cycles on building new flow, not patching live ones.`;
}

export function mrrInsight(args: {
  totalMrr: number;
  thisMonthDelta: number;
  newLiveCustomerName?: string | null;
}): string {
  if (args.thisMonthDelta > 0 && args.newLiveCustomerName) {
    return `+$${args.thisMonthDelta.toLocaleString()} this month from ${args.newLiveCustomerName} going live. Standard tier ($1,495) is ~67% of revenue.`;
  }
  if (args.totalMrr === 0) {
    return `No live contracts yet — MRR begins when the first audit passes.`;
  }
  return `Standard tier ($1,495) is the most common; premium tier converts ~22% of qualified leads.`;
}

export function liveInsight(args: {
  liveCount: number;
  newestLiveName?: string | null;
  auditCount: number;
}): string {
  if (args.liveCount === 0) return `Nothing live yet. ${args.auditCount} in audit — your next promotion comes from there.`;
  const newest = args.newestLiveName ? ` (newest: ${args.newestLiveName})` : "";
  return `${args.liveCount} live${newest}. ${args.auditCount} more in audit awaiting your verdict.`;
}

export function inFlightInsight(args: {
  inFlight: number;
  byPhase: { phase1: number; phase2: number; phase3: number };
  oldestAuditName?: string | null;
  oldestAuditDays?: number;
}): string {
  const { byPhase, oldestAuditName, oldestAuditDays } = args;
  const parts: string[] = [];
  parts.push(`${byPhase.phase1} in Phase 1, ${byPhase.phase2} in Build, ${byPhase.phase3} in audit.`);
  if (oldestAuditName && oldestAuditDays !== undefined) {
    parts.push(`${oldestAuditName} has been in audit ${oldestAuditDays}d — the oldest.`);
  }
  return parts.join(" ");
}

export interface VariationInsight {
  caption: string;
  trend: { dir: "up" | "down" | "flat"; pct: number };
  tooltip: string;
}

export function variationInsight(args: {
  variationLabel: string;
  weeklySignups: number[]; // length 12, oldest first
  liveCount: number;
}): VariationInsight {
  const first6 = args.weeklySignups.slice(0, 6).reduce((s, x) => s + x, 0);
  const last6 = args.weeklySignups.slice(6).reduce((s, x) => s + x, 0);
  let dir: "up" | "down" | "flat" = "flat";
  let pct = 0;
  if (first6 === 0 && last6 === 0) {
    dir = "flat";
    pct = 0;
  } else if (first6 === 0) {
    dir = "up";
    pct = 100;
  } else {
    pct = Math.round(((last6 - first6) / first6) * 100);
    if (pct > 10) dir = "up";
    else if (pct < -10) dir = "down";
    else dir = "flat";
  }
  let tooltip = "";
  if (last6 > first6 + 1) {
    tooltip = `${args.variationLabel} is growing — ${last6} signups in the last 6 weeks vs ${first6} before.`;
  } else if (last6 < first6 - 1) {
    tooltip = `${args.variationLabel} is slowing — only ${last6} signups in the last 6 weeks vs ${first6} before.`;
  } else if (last6 === 0 && first6 === 0) {
    tooltip = `${args.variationLabel} just started — no signups yet.`;
  } else {
    tooltip = `${args.variationLabel} is roughly flat — ${last6} signups recently, similar to before.`;
  }
  if (args.liveCount === 0) tooltip += " No live customers yet.";
  return { caption: "Signups · last 12 weeks", trend: { dir, pct: Math.abs(pct) }, tooltip };
}
