// Product · Main dashboard
// Order (round 3): KPI · PM widgets · Product lines · Charts row · Calendar widget.
// Financial summary table removed (duplicated the line cards).

import { useEffect, useState } from "react";
import { getFactorySupabase } from "../../lib/factorySupabase";
import { navigate } from "../../shell/route";
import {
  fetchAccountHealth,
  worstStatus,
  type HealthStatus,
  STATUS_COLOR,
  STATUS_LABEL,
} from "../../lib/health-score";
import { PhaseFunnel } from "../../components/charts/PhaseFunnel";
import { MrrByNicheBar } from "../../components/charts/MrrByNicheBar";
import { Sparkline } from "../../components/charts/Sparkline";
import { SkeletonBox } from "../../components/charts/LoadingSkeleton";
import { phaseFor } from "../../lib/stage-labels";
import { ChartCard } from "../../components/ChartCard";
import { AtRiskList } from "../../components/AtRiskList";
import { CalendarWidget } from "../../components/CalendarWidget";
import { KpiTile } from "../../components/KpiTile";
import { MondayBoardSummaryWidget } from "../../components/MondayBoardSummaryWidget";
import {
  overallHealthInsight,
  mrrInsight,
  liveInsight,
  inFlightInsight,
  variationInsight,
  type VariationInsight,
} from "../../lib/insights";

interface FinancialRow {
  niche: string;
  live_count: number;
  in_flight_count: number;
  churned_count: number;
  mrr_usd: number;
  avg_acv_usd: number;
}

const VARIATIONS = [
  { slug: "cleo-for-pools", label: "Cleo for Pools", color: "#3b82f6" },
  { slug: "gameday-model", label: "Gameday Model", color: "#10b981" },
  { slug: "real-estate-model", label: "Real Estate Model", color: "#f59e0b" },
];

const PHASE_DESC: Record<string, string> = {
  Sign: "Customer signed up; we're mapping their business and writing a proposal.",
  Build: "The AI Factory is producing their tools and wiring integrations.",
  Audit: "Sanya is reviewing the deployed tenant against the client-value checklist.",
  Live: "Customer is using their tool in production.",
};

export function ProductHomePage(): JSX.Element {
  const [financials, setFinancials] = useState<FinancialRow[] | null>(null);
  const [healthByNiche, setHealthByNiche] = useState<Record<string, HealthStatus>>({});
  const [phaseData, setPhaseData] = useState<Array<{ phase: string; [key: string]: number | string }>>([]);
  const [variationSparks, setVariationSparks] = useState<Record<string, number[]>>({});
  const [insights, setInsights] = useState<{
    health: string;
    mrr: string;
    live: string;
    inFlight: string;
    variation: Record<string, VariationInsight>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = getFactorySupabase();
      try {
        const { data: fin, error: finErr } = await sb.from("v_financial_summary").select("*");
        if (finErr) throw finErr;
        const { data: comps } = await sb.from("companies").select("id, niche");
        const { data: stages } = await sb.from("project_lifecycle_stage_runs").select("project_id, stage_slug");
        const { data: events } = await sb.from("client_journey_events").select("company_id, event_kind, at");
        if (cancelled) return;
        setFinancials(((fin ?? []) as FinancialRow[]).filter((r) => VARIATIONS.some((v) => v.slug === r.niche)));

        const companyIds = ((comps ?? []) as Array<{ id: string }>).map((c) => c.id);
        const health = await fetchAccountHealth(companyIds);
        const byNiche: Record<string, HealthStatus[]> = {};
        for (const c of (comps ?? []) as Array<{ id: string; niche: string | null }>) {
          const niche = c.niche ?? "unknown";
          const row = health.find((h) => h.company_id === c.id);
          if (!row) continue;
          (byNiche[niche] = byNiche[niche] || []).push(row.status);
        }
        const rolled: Record<string, HealthStatus> = {};
        for (const [n, statuses] of Object.entries(byNiche)) rolled[n] = worstStatus(statuses);
        if (cancelled) return;
        setHealthByNiche(rolled);

        // Phase funnel
        const stageByCompany: Record<string, string> = {};
        for (const s of (stages ?? []) as Array<{ project_id: string; stage_slug: string }>) {
          stageByCompany[s.project_id] = s.stage_slug;
        }
        const PHASE_LABELS: Record<string, string> = { phase1: "Sign", phase2: "Build", phase3: "Audit", live: "Live" };
        const buckets: Record<string, Record<string, number>> = { phase1: {}, phase2: {}, phase3: {}, live: {} };
        for (const c of (comps ?? []) as Array<{ id: string; niche: string | null }>) {
          const ph = phaseFor(stageByCompany[c.id]);
          const niche = c.niche ?? "unknown";
          buckets[ph][niche] = (buckets[ph][niche] || 0) + 1;
        }
        const phRows = (["phase1", "phase2", "phase3", "live"] as const).map((ph) => {
          const row: { phase: string; [key: string]: number | string } = { phase: PHASE_LABELS[ph] };
          for (const v of VARIATIONS) row[v.slug] = buckets[ph][v.slug] || 0;
          return row;
        });
        setPhaseData(phRows);

        // Sparklines: signups by week per niche
        const sparks: Record<string, number[]> = {};
        const now = Date.now();
        const weekMs = 7 * 86400_000;
        for (const v of VARIATIONS) sparks[v.slug] = Array.from({ length: 12 }, () => 0);
        const companyToNiche: Record<string, string> = {};
        for (const c of (comps ?? []) as Array<{ id: string; niche: string }>) companyToNiche[c.id] = c.niche;
        for (const e of (events ?? []) as Array<{ company_id: string; event_kind: string; at: string }>) {
          if (e.event_kind !== "signup") continue;
          const wkAgo = Math.floor((now - new Date(e.at).getTime()) / weekMs);
          if (wkAgo < 0 || wkAgo >= 12) continue;
          const niche = companyToNiche[e.company_id];
          if (!niche || !sparks[niche]) continue;
          sparks[niche][11 - wkAgo] += 1;
        }
        setVariationSparks(sparks);

        // Build insights
        const redNames: string[] = [];
        const yellowNames: string[] = [];
        for (const c of (comps ?? []) as Array<{ id: string; niche: string | null }>) {
          const h = health.find((x) => x.company_id === c.id);
          if (!h) continue;
          const cName = (comps as Array<{ id: string; niche: string | null }>).find((cc) => cc.id === c.id);
          // Pull name from comps[*]
          const fullComp = await Promise.resolve(cName);
          if (h.status === "red" && fullComp) redNames.push((fullComp as { id: string; niche: string | null }).id);
          if (h.status === "yellow") yellowNames.push(c.id);
        }
        // Map ids → names
        const { data: compsNamed } = await sb.from("companies").select("id, name");
        const nameById: Record<string, string> = {};
        for (const c of (compsNamed ?? []) as Array<{ id: string; name: string }>) nameById[c.id] = c.name;
        const redNamesPretty = redNames.map((id) => nameById[id] ?? id);
        const yellowNamesPretty = yellowNames.map((id) => nameById[id] ?? id);

        const overallStatus = worstStatus(Object.values(rolled));
        const healthText = overallHealthInsight({ redNames: redNamesPretty, yellowNames: yellowNamesPretty, overall: overallStatus });

        const mrrTotal = ((fin ?? []) as FinancialRow[]).reduce((s, r) => s + Number(r.mrr_usd || 0), 0);
        // Find newest live: most recent onboarding_complete event tied to a live company
        const liveCompanies = new Set<string>();
        for (const s of (stages ?? []) as Array<{ project_id: string; stage_slug: string }>) {
          if (s.stage_slug === "live") liveCompanies.add(s.project_id);
        }
        const liveCompletes = ((events ?? []) as Array<{ company_id: string; event_kind: string; at: string }>)
          .filter((e) => e.event_kind === "onboarding_complete" && liveCompanies.has(e.company_id))
          .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
        const newestLive = liveCompletes[0] ? nameById[liveCompletes[0].company_id] : null;

        // Find oldest audit
        const auditByProject = new Map<string, string | null>();
        for (const s of (stages ?? []) as Array<{ project_id: string; stage_slug: string; started_at?: string | null }>) {
          if (s.stage_slug === "sanya-audit" && !auditByProject.has(s.project_id)) {
            auditByProject.set(s.project_id, (s as { started_at?: string | null }).started_at ?? null);
          }
        }
        let oldestAuditName: string | null = null;
        let oldestAuditDays: number | undefined;
        const auditAges = Array.from(auditByProject.entries())
          .map(([id, start]) => ({ id, days: start ? (Date.now() - new Date(start).getTime()) / 86400_000 : 0 }))
          .sort((a, b) => b.days - a.days);
        if (auditAges.length > 0) {
          oldestAuditName = nameById[auditAges[0].id] ?? null;
          oldestAuditDays = Math.round(auditAges[0].days);
        }

        const liveCount = liveCompanies.size;
        const auditCount = auditByProject.size;
        const totalCustomers = (comps ?? []).length;
        const inFlightCount = totalCustomers - liveCount;

        // Phase counts for inFlight insight
        const stageByCompanyAll: Record<string, string> = {};
        for (const s of (stages ?? []) as Array<{ project_id: string; stage_slug: string }>) {
          if (!stageByCompanyAll[s.project_id]) stageByCompanyAll[s.project_id] = s.stage_slug;
        }
        const PHASE1 = new Set(["intake", "council", "proposal", "proposing", "awaiting-approval", "needs-info"]);
        const PHASE2 = new Set(["queued", "planning", "building", "deployed"]);
        let p1 = 0, p2 = 0, p3 = 0;
        for (const c of (comps ?? []) as Array<{ id: string }>) {
          const stg = stageByCompanyAll[c.id] ?? "intake";
          if (PHASE1.has(stg)) p1++;
          else if (PHASE2.has(stg)) p2++;
          else if (stg === "sanya-audit") p3++;
        }

        const variationInsights: Record<string, VariationInsight> = {};
        for (const v of VARIATIONS) {
          variationInsights[v.slug] = variationInsight({
            variationLabel: v.label,
            weeklySignups: sparks[v.slug] ?? [],
            liveCount: ((fin ?? []) as FinancialRow[]).find((r) => r.niche === v.slug)?.live_count ?? 0,
          });
        }

        setInsights({
          health: healthText,
          mrr: mrrInsight({ totalMrr: mrrTotal, thisMonthDelta: 1495, newLiveCustomerName: newestLive }),
          live: liveInsight({ liveCount, newestLiveName: newestLive, auditCount }),
          inFlight: inFlightInsight({
            inFlight: inFlightCount,
            byPhase: { phase1: p1, phase2: p2, phase3: p3 },
            oldestAuditName: oldestAuditName ?? undefined,
            oldestAuditDays,
          }),
          variation: variationInsights,
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      }
    })();
    return () => { cancelled = true; };
  }, [refreshTick]);

  const overall = worstStatus(Object.values(healthByNiche));
  const totalMrr = (financials ?? []).reduce((s, r) => s + Number(r.mrr_usd || 0), 0);
  const totalLive = (financials ?? []).reduce((s, r) => s + Number(r.live_count || 0), 0);
  const totalInFlight = (financials ?? []).reduce((s, r) => s + Number(r.in_flight_count || 0), 0);
  const loading = financials === null && error === null;

  return (
    <div style={{ padding: 24, display: "grid", gap: 20 }}>
      {error ? (
        <div style={{ background: "#fee2e2", color: "#b91c1c", padding: 10, borderRadius: 6, fontSize: 13 }}>{error}</div>
      ) : null}

      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0 }}>Product overview</h1>
          <p style={{ color: "#9ca3af", margin: "4px 0 0", fontSize: 13 }}>
            Aggregated health, pipeline, and revenue across all product lines.
          </p>
        </div>
        <button type="button" className="btn" onClick={() => setRefreshTick((t) => t + 1)} style={{ padding: "6px 12px", fontSize: 12 }}>
          ↻ Refresh
        </button>
      </header>

      {/* KPI tiles with insight tooltips */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        <KpiTile label="Overall business health" valueColor={STATUS_COLOR[overall]} value={STATUS_LABEL[overall]} insight={insights?.health} />
        <KpiTile label="MRR (signed contracts)" value={`$${totalMrr.toLocaleString()}`} insight={insights?.mrr} />
        <KpiTile label="Live customers" value={String(totalLive)} insight={insights?.live} />
        <KpiTile label="In flight" value={String(totalInFlight)} insight={insights?.inFlight} />
      </section>

      {/* PM widgets (moved above product lines per round-3 feedback) */}
      <PmWidgets />

      {/* Monday board summary */}
      <section>
        <h2 style={{ marginBottom: 12, fontSize: 16 }}>Monday sprints</h2>
        <MondayBoardSummaryWidget boardId="18403740335" />
      </section>

      {/* Product lines */}
      <section>
        <h2 style={{ marginBottom: 12, fontSize: 16 }}>Product lines</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {VARIATIONS.map((v) => {
            const fin = financials?.find((f) => f.niche === v.slug);
            const status = healthByNiche[v.slug] ?? "green";
            const spark = variationSparks[v.slug] ?? [];
            const vi = insights?.variation[v.slug];
            return (
              <ProductLineCard
                key={v.slug}
                slug={v.slug}
                label={v.label}
                color={v.color}
                healthStatus={status}
                fin={fin}
                spark={spark}
                insight={vi}
              />
            );
          })}
        </div>
      </section>

      {/* Charts row (all wrapped in ChartCard with ?-info popover) */}
      <section style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr 1fr", gap: 16 }}>
        <ChartCard
          title="At-risk accounts"
          whatThisIs="Every live account flagged yellow or red, with the specific reason."
          whatToDo="Open the riskiest one and clear the root cause."
        >
          <AtRiskList maxRows={5} fallbackDept="product" />
        </ChartCard>

        <ChartCard
          title="Phase funnel"
          whatThisIs="Count of customers in each phase of the journey, stacked by product line."
          whatToDo="If Audit ≫ Build, you're the bottleneck. If Build ≫ Live, the Factory is."
        >
          {loading ? <SkeletonBox height={220} /> : (
            <PhaseFunnel data={phaseData} niches={VARIATIONS} descriptions={PHASE_DESC} />
          )}
        </ChartCard>

        <ChartCard
          title="MRR by line"
          whatThisIs="Monthly recurring revenue from signed/sent contracts per product line."
          whatToDo="Compare to ACV. High MRR + low ACV = volume play; opposite = enterprise."
        >
          {loading ? <SkeletonBox height={220} /> : (
            <MrrByNicheBar
              data={(financials ?? []).map((r) => ({ niche: nicheLabel(r.niche), mrr_usd: Number(r.mrr_usd || 0) }))}
            />
          )}
        </ChartCard>
      </section>

      {/* Calendar widget */}
      <ChartCard
        title="This week's customer calls"
        whatThisIs="Upcoming scheduled customer calls over the next 7 days, with Meet links."
        whatToDo="Click Meet ↗ to join. Skim agendas Monday morning to prep."
      >
        <CalendarWidget />
      </ChartCard>
    </div>
  );
}

function ProductLineCard({
  slug,
  label,
  color,
  healthStatus,
  fin,
  spark,
  insight,
}: {
  slug: string;
  label: string;
  color: string;
  healthStatus: HealthStatus;
  fin?: FinancialRow;
  spark: number[];
  insight?: VariationInsight;
}): JSX.Element {
  const [hover, setHover] = useState(false);
  const trendArrow = insight?.trend.dir === "up" ? "↑" : insight?.trend.dir === "down" ? "↓" : "→";
  const trendColor = insight?.trend.dir === "up" ? "#10b981" : insight?.trend.dir === "down" ? "#ef4444" : "#9ca3af";
  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        type="button"
        onClick={() => navigate({ dept: "product", section: slug })}
        style={{
          width: "100%",
          textAlign: "left",
          background: "white",
          color: "#111827",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 16,
          cursor: "pointer",
          display: "grid",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, fontSize: 16, color: "#111827" }}>{label}</h3>
          <span
            style={{ width: 10, height: 10, borderRadius: 999, background: STATUS_COLOR[healthStatus] }}
            title={`Health: ${STATUS_LABEL[healthStatus]}`}
          />
        </div>
        <p style={{ color: "#6b7280", margin: 0, fontSize: 12 }}>
          {fin
            ? `${fin.live_count} live · ${fin.in_flight_count} in flight · $${Number(fin.mrr_usd || 0).toLocaleString()} MRR`
            : "No customers yet"}
        </p>
        <Sparkline data={spark.length === 12 ? spark : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]} color={color} height={32} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
          <span style={{ color: "#9ca3af" }}>Signups · last 12 weeks</span>
          <span style={{ color: trendColor, fontWeight: 600 }}>
            {trendArrow} {insight?.trend.dir === "flat" ? "flat" : `${insight?.trend.pct ?? 0}%`}
          </span>
        </div>
      </button>
      {insight?.tooltip && hover ? (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            top: -10,
            left: 16,
            right: 16,
            transform: "translateY(-100%)",
            background: "#1f2937",
            color: "white",
            padding: "10px 12px",
            borderRadius: 8,
            fontSize: 12,
            lineHeight: 1.5,
            zIndex: 30,
            boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
          }}
        >
          {insight.tooltip}
          <span
            aria-hidden
            style={{ position: "absolute", bottom: -6, left: 24, width: 12, height: 12, background: "#1f2937", transform: "rotate(45deg)" }}
          />
        </div>
      ) : null}
    </div>
  );
}

function nicheLabel(slug: string): string {
  const v = VARIATIONS.find((x) => x.slug === slug);
  return v?.label ?? slug;
}

// ─── PM widgets (audit queue + top flagged + avg time to live) ──────────────
interface AuditQueueRow { id: string; name: string; niche: string; days: number }
interface TopIssue { id: string; title: string; flag_count: number; customer_count: number; priority_score: number }

function PmWidgets(): JSX.Element {
  const [audit, setAudit] = useState<AuditQueueRow[]>([]);
  const [topIssues, setTopIssues] = useState<TopIssue[]>([]);
  const [ttl, setTtl] = useState<Array<{ niche: string; days: number }>>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = getFactorySupabase();
      const { data: stages } = await sb
        .from("project_lifecycle_stage_runs")
        .select("project_id, stage_slug, started_at, updated_at")
        .order("updated_at", { ascending: false });
      const latest = new Map<string, { stage_slug: string; started_at: string | null }>();
      for (const s of (stages ?? []) as Array<{ project_id: string; stage_slug: string; started_at: string | null }>) {
        if (!latest.has(s.project_id)) latest.set(s.project_id, s);
      }
      const auditIds = Array.from(latest.entries()).filter(([, v]) => v.stage_slug === "sanya-audit").map(([id]) => id);
      const { data: comps } = await sb.from("companies").select("id, name, niche").in("id", auditIds);
      const queue: AuditQueueRow[] = ((comps ?? []) as Array<{ id: string; name: string; niche: string }>).map((c) => {
        const start = latest.get(c.id)?.started_at;
        const days = start ? Math.max(0, Math.round((Date.now() - new Date(start).getTime()) / 86400_000)) : 0;
        return { id: c.id, name: c.name, niche: c.niche, days };
      }).sort((a, b) => b.days - a.days);
      if (!cancelled) setAudit(queue);

      const { data: issues } = await sb.from("v_issues_with_flag_stats").select("id, title, flag_count, customer_count, priority_score, status").order("priority_score", { ascending: false }).limit(10);
      if (!cancelled) setTopIssues(((issues ?? []) as Array<TopIssue & { status: string }>).filter((i) => !["done", "wontfix"].includes((i as { status: string }).status)).slice(0, 5));

      const { data: evs } = await sb.from("client_journey_events").select("company_id, event_kind, at");
      const { data: compAll } = await sb.from("companies").select("id, niche");
      const nicheById: Record<string, string> = {};
      for (const c of (compAll ?? []) as Array<{ id: string; niche: string }>) nicheById[c.id] = c.niche;
      const signups: Record<string, string> = {};
      const lives: Record<string, string> = {};
      for (const e of (evs ?? []) as Array<{ company_id: string; event_kind: string; at: string }>) {
        if (e.event_kind === "signup" && !signups[e.company_id]) signups[e.company_id] = e.at;
        if ((e.event_kind === "onboarding_complete" || e.event_kind === "live_announced") && !lives[e.company_id]) lives[e.company_id] = e.at;
      }
      const byNiche = new Map<string, { sum: number; n: number }>();
      for (const [cid, signupAt] of Object.entries(signups)) {
        const liveAt = lives[cid];
        if (!liveAt) continue;
        const days = (new Date(liveAt).getTime() - new Date(signupAt).getTime()) / 86400_000;
        if (days <= 0) continue;
        const niche = nicheById[cid] ?? "unknown";
        const b = byNiche.get(niche) ?? { sum: 0, n: 0 };
        b.sum += days; b.n += 1;
        byNiche.set(niche, b);
      }
      const ttlRows = Array.from(byNiche.entries()).map(([niche, b]) => ({
        niche: nicheLabel(niche),
        days: b.n > 0 ? Math.round(b.sum / b.n) : 0,
      })).sort((a, b) => a.days - b.days);
      if (!cancelled) setTtl(ttlRows);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
      <ChartCard
        title="My audit queue"
        whatThisIs="Accounts at the sanya-audit stage waiting on your verdict."
        whatToDo="Clear oldest first; > 3d is a customer-experience risk."
      >
        {audit.length === 0 ? (
          <p style={{ color: "#10b981", fontWeight: 500, margin: 0, fontSize: 13 }}>Nothing in your queue 🎉</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 13 }}>
            {audit.map((a) => (
              <li key={a.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid #f3f4f6" }}>
                <button type="button" onClick={() => navigate({ dept: "product", section: a.niche, id: "customer", sub: a.id })} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", padding: 0, fontSize: 13, textAlign: "left" }}>
                  {a.name}
                </button>
                <span style={{ color: a.days >= 3 ? "#ef4444" : "#9ca3af", fontSize: 12 }}>{a.days}d</span>
              </li>
            ))}
          </ul>
        )}
      </ChartCard>

      <ChartCard
        title="Top flagged issues this week"
        whatThisIs="Open issues ranked by flag count and distinct customers affected."
        whatToDo="Assign the top-priority one to a tech engineer immediately."
      >
        {topIssues.length === 0 ? (
          <p style={{ color: "#9ca3af", fontStyle: "italic", margin: 0, fontSize: 13 }}>No flagged issues this week.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 13 }}>
            {topIssues.map((i) => (
              <li key={i.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid #f3f4f6", gap: 8 }}>
                <button type="button" onClick={() => navigate({ dept: "product", section: "issues" })} style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", padding: 0, fontSize: 13, textAlign: "left", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {i.title}
                </button>
                <span style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                  <span style={{ background: "#fee2e2", color: "#b91c1c", padding: "1px 6px", borderRadius: 999, fontSize: 11 }} title="flag count">{i.flag_count}🚩</span>
                  <span style={{ background: "#dbeafe", color: "#1e40af", padding: "1px 6px", borderRadius: 999, fontSize: 11 }} title="customer count">{i.customer_count}👥</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </ChartCard>

      <ChartCard
        title="Avg time to live"
        whatThisIs="Average days from signup → onboarding complete, per product line."
        whatToDo="If > 30d, find the bottleneck in Phase 1 or 2."
      >
        {ttl.length === 0 ? (
          <p style={{ color: "#9ca3af", fontStyle: "italic", margin: 0, fontSize: 13 }}>Not enough completed journeys yet.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 13 }}>
            {ttl.map((r) => (
              <li key={r.niche} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: "1px solid #f3f4f6" }}>
                <span>{r.niche}</span>
                <span style={{ fontWeight: 600, color: r.days > 45 ? "#ef4444" : r.days > 30 ? "#f59e0b" : "#10b981" }}>{r.days} days</span>
              </li>
            ))}
          </ul>
        )}
      </ChartCard>
    </section>
  );
}
