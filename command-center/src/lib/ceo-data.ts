// Pure functions that compute CEO dashboard numbers + insights.

export interface KpiInputs {
  monthly_burn_usd: number;
  payroll_usd: number;
  headcount: number;
  cash_balance_usd: number;
  mrr_target_usd: number;
  line_allocations: Record<string, number>;
  open_requisitions: Array<{ title: string; manager: string; comp_band?: string }>;
}

export interface CeoKpis {
  mrr: number;
  momGrowthPct: number | null;
  liveCustomers: number;
  netNewMtd: number;
  runwayMonths: number;
  burnPerMo: number;
}

export interface NorthStar {
  status: "green" | "yellow" | "red";
  sentence: string;
  subSentence?: string;
}

export function computeNorthStar(args: {
  mrr: number;
  mrrTarget: number;
  awaitingSignature: number;
  daysBehind: number;
}): NorthStar {
  const { mrr, mrrTarget, awaitingSignature, daysBehind } = args;
  const ratio = mrrTarget > 0 ? mrr / mrrTarget : 0;
  const status: "green" | "yellow" | "red" =
    ratio >= 0.95 ? "green" : ratio >= 0.7 ? "yellow" : "red";
  const onTrackStr =
    ratio >= 0.95
      ? `On track for $${mrrTarget.toLocaleString()} MRR by EOQ.`
      : ratio >= 0.7
      ? `On track for $${mrrTarget.toLocaleString()} MRR by EOQ · ${daysBehind}d behind plan.`
      : `Off track. $${mrr.toLocaleString()} of $${mrrTarget.toLocaleString()} target · ${daysBehind}d behind plan.`;
  const deals = awaitingSignature > 0
    ? ` ${awaitingSignature} deal${awaitingSignature === 1 ? "" : "s"} await${awaitingSignature === 1 ? "s" : ""} your signature.`
    : "";
  return {
    status,
    sentence: `${onTrackStr}${deals}`,
    subSentence: ratio < 0.95 && awaitingSignature > 0 ? "Signing the awaiting contracts closes the gap fastest." : undefined,
  };
}

export function kpiInsight(args: {
  label: string;
  mrr: number;
  mrrTarget: number;
  liveCount: number;
  newestLive: string | null;
  netNewMtd: number;
  awaitingSignature: number;
  runwayMonths: number;
}): Record<string, string> {
  const { mrr, mrrTarget, liveCount, newestLive, netNewMtd, awaitingSignature, runwayMonths } = args;
  return {
    mrr: `$${(mrrTarget - mrr).toLocaleString()} gap to target. ${awaitingSignature} deal${awaitingSignature === 1 ? "" : "s"} pending your signature would close it.`,
    growth: `MoM growth derived from contract snapshots — populates with real numbers as more months are signed.`,
    live: `${liveCount} live${newestLive ? ` (newest: ${newestLive})` : ""}. ${netNewMtd} new live this month.`,
    netNew: `${netNewMtd} customer${netNewMtd === 1 ? "" : "s"} went live this month. Track velocity vs. burn.`,
    runway: `${runwayMonths} months at current burn. Below 9 → start fundraising conversations. Below 6 → urgent.`,
    burn: `Current monthly burn. Watch when burn grows faster than MRR — that's the runway-shortening combo.`,
  };
}

export interface StrategicCardData {
  niche_slug: string;
  niche_label: string;
  mrr: number;
  growth30dPct: number;
  liveCount: number;
  inFlightCount: number;
  burnAllocation: number;
  cac: number;
  ltv: number;
  paybackMonths: number;
  recommendation: "invest" | "hold" | "reassess";
  recommendationReason: string;
}

export function computeStrategic(args: {
  niche_slug: string;
  niche_label: string;
  mrr: number;
  growth30dPct: number;
  liveCount: number;
  inFlightCount: number;
  burnAllocation: number;
}): StrategicCardData {
  const { mrr, growth30dPct, burnAllocation, liveCount } = args;
  const ltv = liveCount > 0 ? Math.round((mrr / liveCount) * 18) : 0;
  const cac = burnAllocation > 0 ? Math.round(burnAllocation / Math.max(1, liveCount + 1)) : 0;
  const paybackMonths = cac > 0 && mrr > 0 ? Math.round((cac / (mrr / Math.max(1, liveCount))) * 10) / 10 : 0;
  let recommendation: "invest" | "hold" | "reassess";
  let reason: string;
  if (growth30dPct > 30 && mrr > burnAllocation * 0.5) {
    recommendation = "invest";
    reason = `Growing ${growth30dPct}% and MRR is covering >50% of allocated burn. Double down.`;
  } else if (growth30dPct < 0 || (mrr > 0 && mrr < burnAllocation * 0.3)) {
    recommendation = "reassess";
    reason = growth30dPct < 0
      ? `Declining ${Math.abs(growth30dPct)}% — investigate before adding capacity.`
      : `MRR <30% of burn allocation. Either grow faster or cut spend.`;
  } else {
    recommendation = "hold";
    reason = `Steady. Keep the current investment until signal sharpens.`;
  }
  return {
    ...args,
    cac,
    ltv,
    paybackMonths,
    recommendation,
    recommendationReason: reason,
  };
}
