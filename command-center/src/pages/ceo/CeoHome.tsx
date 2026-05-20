// CEO Home — the dashboard Ouadie opens every morning.

import { useEffect, useState } from "react";
import { getFactorySupabase } from "../../lib/factorySupabase";
import { navigate } from "../../shell/route";
import { KpiTile } from "../../components/KpiTile";
import { ChartCard } from "../../components/ChartCard";
import { MockBadge } from "../../components/MockBadge";
import { CeoDecisionQueue } from "../../components/CeoDecisionQueue";
import { WinsFeed } from "../../components/WinsFeed";
import { StrategicLineCard } from "../../components/StrategicLineCard";
import { computeNorthStar, computeStrategic, kpiInsight, type KpiInputs, type StrategicCardData } from "../../lib/ceo-data";

const VARIATIONS = [
  { slug: "cleo-for-pools", label: "Cleo for Pools" },
  { slug: "gameday-model", label: "Gameday Model" },
  { slug: "real-estate-model", label: "Real Estate Model" },
];

export function CeoHomePage({ userId }: { userId: string }): JSX.Element {
  const [mrr, setMrr] = useState(0);
  const [liveCount, setLiveCount] = useState(0);
  const [netNewMtd, setNetNewMtd] = useState(0);
  const [awaitingSignature, setAwaitingSignature] = useState(0);
  const [newestLive, setNewestLive] = useState<string | null>(null);
  const [kpi, setKpi] = useState<KpiInputs | null>(null);
  const [strategic, setStrategic] = useState<StrategicCardData[]>([]);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = getFactorySupabase();
      const [{ data: fin }, { data: pending }, { data: stages }, { data: events }, { data: comps }, { data: kpiRow }] = await Promise.all([
        sb.from("v_financial_summary").select("*"),
        sb.from("v_ceo_contracts_pending").select("*"),
        sb.from("project_lifecycle_stage_runs").select("project_id, stage_slug, updated_at, completed_at").order("updated_at", { ascending: false }),
        sb.from("client_journey_events").select("company_id, event_kind, at"),
        sb.from("companies").select("id, name, niche"),
        sb.from("ceo_kpi_inputs").select("*").order("month", { ascending: false }).limit(1),
      ]);
      if (cancelled) return;

      // MRR + live + netNew
      const mrrSum = ((fin ?? []) as Array<{ mrr_usd: number }>).reduce((s, r) => s + Number(r.mrr_usd || 0), 0);
      setMrr(mrrSum);
      const live = new Set<string>();
      for (const s of (stages ?? []) as Array<{ project_id: string; stage_slug: string }>) {
        if (s.stage_slug === "live") live.add(s.project_id);
      }
      setLiveCount(live.size);

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const completes = ((events ?? []) as Array<{ company_id: string; event_kind: string; at: string }>)
        .filter((e) => e.event_kind === "onboarding_complete" && new Date(e.at) >= startOfMonth);
      setNetNewMtd(completes.length);

      const nameById = new Map<string, string>();
      const nicheById = new Map<string, string | null>();
      for (const c of (comps ?? []) as Array<{ id: string; name: string; niche: string | null }>) {
        nameById.set(c.id, c.name);
        nicheById.set(c.id, c.niche);
      }
      const newestComplete = ((events ?? []) as Array<{ company_id: string; event_kind: string; at: string }>)
        .filter((e) => e.event_kind === "onboarding_complete")
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())[0];
      setNewestLive(newestComplete ? nameById.get(newestComplete.company_id) ?? null : null);

      const await_sig = ((pending ?? []) as Array<{ queue_bucket: string }>).filter((r) => r.queue_bucket === "awaiting_ceo_signature").length;
      setAwaitingSignature(await_sig);

      const k = ((kpiRow ?? []) as KpiInputs[])[0] ?? null;
      setKpi(k);

      // Strategic cards
      const signupBuckets = new Map<string, { last30: number; prev30: number }>();
      for (const e of (events ?? []) as Array<{ company_id: string; event_kind: string; at: string }>) {
        if (e.event_kind !== "signup") continue;
        const niche = nicheById.get(e.company_id);
        if (!niche) continue;
        const daysAgo = (Date.now() - new Date(e.at).getTime()) / 86400_000;
        const b = signupBuckets.get(niche) ?? { last30: 0, prev30: 0 };
        if (daysAgo <= 30) b.last30 += 1;
        else if (daysAgo <= 60) b.prev30 += 1;
        signupBuckets.set(niche, b);
      }
      const finByNiche = new Map((fin ?? []).map((r) => [(r as { niche: string }).niche, r as { live_count: number; in_flight_count: number; mrr_usd: number }]));
      const cards: StrategicCardData[] = VARIATIONS.map((v) => {
        const f = finByNiche.get(v.slug);
        const b = signupBuckets.get(v.slug) ?? { last30: 0, prev30: 0 };
        const growth = b.prev30 > 0 ? Math.round(((b.last30 - b.prev30) / b.prev30) * 100) : (b.last30 > 0 ? 100 : 0);
        return computeStrategic({
          niche_slug: v.slug,
          niche_label: v.label,
          mrr: Number(f?.mrr_usd ?? 0),
          growth30dPct: growth,
          liveCount: Number(f?.live_count ?? 0),
          inFlightCount: Number(f?.in_flight_count ?? 0),
          burnAllocation: Number(k?.line_allocations?.[v.slug] ?? 0),
        });
      });
      setStrategic(cards);
    })();
    return () => { cancelled = true; };
  }, [refresh]);

  const burn = kpi?.monthly_burn_usd ?? 0;
  const cash = kpi?.cash_balance_usd ?? 0;
  const runwayMonths = burn > 0 ? Math.round(cash / burn) : 0;
  const target = kpi?.mrr_target_usd ?? 25000;
  const northStar = computeNorthStar({ mrr, mrrTarget: target, awaitingSignature, daysBehind: 2 });
  const insights = kpiInsight({
    label: "all",
    mrr,
    mrrTarget: target,
    liveCount,
    newestLive,
    netNewMtd,
    awaitingSignature,
    runwayMonths,
  });

  return (
    <div style={{ padding: 24, display: "grid", gap: 20 }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0 }}>Executive overview</h1>
          <p style={{ color: "#9ca3af", margin: "4px 0 0", fontSize: 13 }}>Revenue, runway, and the decisions only you can make.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn-ghost" onClick={() => navigate({ dept: "ceo", section: "board" })} style={{ padding: "6px 12px", fontSize: 12 }}>
            ▤ Board snapshot
          </button>
          <button type="button" className="btn" onClick={() => setRefresh((t) => t + 1)} style={{ padding: "6px 12px", fontSize: 12 }}>
            ↻ Refresh
          </button>
        </div>
      </header>

      {/* North star */}
      <div style={{
        background: "linear-gradient(135deg, #1d4ed8 0%, #6d28d9 100%)",
        color: "white",
        borderRadius: 14,
        padding: 24,
        display: "flex",
        alignItems: "center",
        gap: 20,
      }}>
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: 999,
            background: northStar.status === "green" ? "#10b981" : northStar.status === "yellow" ? "#f59e0b" : "#ef4444",
            boxShadow: "0 0 0 6px rgba(255,255,255,0.15)",
            flexShrink: 0,
          }}
        />
        <div>
          <div style={{ fontSize: 11, letterSpacing: 1.5, opacity: 0.7, textTransform: "uppercase", marginBottom: 6 }}>
            Are we winning?
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, lineHeight: 1.4 }}>{northStar.sentence}</div>
          {northStar.subSentence ? (
            <div style={{ marginTop: 6, fontSize: 13, opacity: 0.85 }}>{northStar.subSentence}</div>
          ) : null}
        </div>
      </div>

      {/* KPI tiles */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12 }}>
        <KpiTile label="MRR" value={`$${mrr.toLocaleString()}`} insight={insights.mrr} />
        <KpiTile label={<>MoM growth <MockBadge size="xs" /></>} value="+9%" insight={insights.growth} />
        <KpiTile label="Live customers" value={String(liveCount)} insight={insights.live} />
        <KpiTile label="Net new (MTD)" value={String(netNewMtd)} insight={insights.netNew} />
        <KpiTile label={<>Runway <MockBadge size="xs" /></>} value={`${runwayMonths} mo`} insight={insights.runway} />
        <KpiTile label={<>Burn / mo <MockBadge size="xs" /></>} value={`$${burn.toLocaleString()}`} insight={insights.burn} />
      </section>

      {/* Main grid: Decision queue (2fr) + right rail (1fr) */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <CeoDecisionQueue userId={userId} onChange={() => setRefresh((t) => t + 1)} />
        <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
          <ChartCard
            title="Wins · last 30 days"
            whatThisIs="Customers you've signed in the last 30 days."
            whatToDo="Use this for the next investor email or board update."
          >
            <WinsFeed />
          </ChartCard>
          <ChartCard
            title={<>People &amp; cash <MockBadge size="xs" /></>}
            whatThisIs="Headcount, payroll, total burn, and runway based on your most recent inputs."
            whatToDo="Below 9 months runway, start fundraising conversations now."
          >
            <PeopleCashCard kpi={kpi} runwayMonths={runwayMonths} />
          </ChartCard>
        </div>
      </div>

      {/* Strategic comparison */}
      <section>
        <h2 style={{ marginBottom: 12, fontSize: 16 }}>Strategic comparison</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {strategic.map((s) => (
            <StrategicLineCard key={s.niche_slug} data={s} />
          ))}
        </div>
      </section>
    </div>
  );
}

function PeopleCashCard({ kpi, runwayMonths }: { kpi: KpiInputs | null; runwayMonths: number }) {
  if (!kpi) return <p style={{ color: "#9ca3af", margin: 0, fontStyle: "italic", fontSize: 13 }}>No inputs yet — visit Cash & people.</p>;
  return (
    <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
      <Row label="Headcount" value={String(kpi.headcount)} />
      <Row label="Payroll / mo" value={`$${kpi.payroll_usd.toLocaleString()}`} />
      <Row label="Other burn" value={`$${(kpi.monthly_burn_usd - kpi.payroll_usd).toLocaleString()}`} />
      <Row label="Cash balance" value={`$${kpi.cash_balance_usd.toLocaleString()}`} />
      <Row label="Runway" value={`${runwayMonths} mo`} valueColor={runwayMonths < 9 ? "#ef4444" : runwayMonths < 14 ? "#f59e0b" : "#10b981"} />
      {kpi.open_requisitions.length > 0 ? (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #f3f4f6" }}>
          <div style={{ color: "#6b7280", fontSize: 11, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>Open requisitions</div>
          {kpi.open_requisitions.map((r, i) => (
            <div key={i} style={{ fontSize: 12, color: "#1f2937" }}>
              · {r.title} <span style={{ color: "#9ca3af" }}>({r.manager})</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span style={{ color: "#6b7280" }}>{label}</span>
      <span style={{ fontWeight: 600, color: valueColor ?? "#111827" }}>{value}</span>
    </div>
  );
}
