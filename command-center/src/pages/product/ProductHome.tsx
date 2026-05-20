// Product · Main dashboard
// Overall business health + financial metrics + 3 product cards + charts.

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
import { StatusDonut } from "../../components/charts/StatusDonut";
import { PhaseFunnel } from "../../components/charts/PhaseFunnel";
import { MrrByNicheBar } from "../../components/charts/MrrByNicheBar";
import { Sparkline } from "../../components/charts/Sparkline";
import { SkeletonBox } from "../../components/charts/LoadingSkeleton";
import { phaseFor } from "../../lib/stage-labels";

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

export function ProductHomePage(): JSX.Element {
  const [financials, setFinancials] = useState<FinancialRow[] | null>(null);
  const [healthByNiche, setHealthByNiche] = useState<Record<string, HealthStatus>>({});
  const [healthCounts, setHealthCounts] = useState<{ green: number; yellow: number; red: number }>({ green: 0, yellow: 0, red: 0 });
  const [phaseData, setPhaseData] = useState<Array<{ phase: string; [key: string]: number | string }>>([]);
  const [variationSparks, setVariationSparks] = useState<Record<string, number[]>>({});
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
        const totalCounts = { green: 0, yellow: 0, red: 0 };
        for (const c of (comps ?? []) as Array<{ id: string; niche: string | null }>) {
          const niche = c.niche ?? "unknown";
          const row = health.find((h) => h.company_id === c.id);
          if (!row) continue;
          (byNiche[niche] = byNiche[niche] || []).push(row.status);
          totalCounts[row.status] += 1;
        }
        const rolled: Record<string, HealthStatus> = {};
        for (const [n, statuses] of Object.entries(byNiche)) rolled[n] = worstStatus(statuses);
        if (cancelled) return;
        setHealthByNiche(rolled);
        setHealthCounts(totalCounts);

        // Phase funnel data: rows = phases, columns = niches.
        const stageByCompany: Record<string, string> = {};
        for (const s of (stages ?? []) as Array<{ project_id: string; stage_slug: string }>) {
          stageByCompany[s.project_id] = s.stage_slug;
        }
        const PHASE_LABELS: Record<string, string> = { phase1: "Sign", phase2: "Build", phase3: "Audit", live: "Live" };
        const buckets: Record<string, Record<string, number>> = {
          phase1: {}, phase2: {}, phase3: {}, live: {},
        };
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

        // Sparklines: signups by week per niche (last 12 weeks).
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
        <div style={{ background: "#fee2e2", color: "#b91c1c", padding: 10, borderRadius: 6, fontSize: 13 }}>
          {error}
        </div>
      ) : null}

      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0 }}>Product overview</h1>
          <p style={{ color: "#9ca3af", margin: "4px 0 0", fontSize: 13 }}>
            Aggregated health, pipeline, and revenue across all product variations.
          </p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => setRefreshTick((t) => t + 1)}
          style={{ padding: "6px 12px", fontSize: 12 }}
        >
          ↻ Refresh
        </button>
      </header>

      {/* KPI tiles */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        <StatTile label="Overall business health" valueColor={STATUS_COLOR[overall]} value={STATUS_LABEL[overall]} />
        <StatTile label="MRR (signed contracts)" value={`$${totalMrr.toLocaleString()}`} />
        <StatTile label="Live customers" value={String(totalLive)} />
        <StatTile label="In flight" value={String(totalInFlight)} />
      </section>

      {/* Charts row */}
      <section style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr 1fr", gap: 16 }}>
        {loading ? <SkeletonBox height={220} /> : (
          <StatusDonut
            title="Account health"
            slices={[
              { label: "Green", value: healthCounts.green, color: "#10b981" },
              { label: "Yellow", value: healthCounts.yellow, color: "#f59e0b" },
              { label: "Red", value: healthCounts.red, color: "#ef4444" },
            ]}
            height={170}
          />
        )}
        {loading ? <SkeletonBox height={220} /> : (
          <PhaseFunnel data={phaseData} niches={VARIATIONS} />
        )}
        {loading ? <SkeletonBox height={220} /> : (
          <MrrByNicheBar
            data={(financials ?? []).map((r) => ({ niche: nicheLabel(r.niche), mrr_usd: Number(r.mrr_usd || 0) }))}
          />
        )}
      </section>

      {/* Variation cards */}
      <section>
        <h2 style={{ marginBottom: 12, fontSize: 16 }}>Product variations</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {VARIATIONS.map((v) => {
            const fin = financials?.find((f) => f.niche === v.slug);
            const status = healthByNiche[v.slug] ?? "green";
            const spark = variationSparks[v.slug] ?? [];
            return (
              <button
                key={v.slug}
                type="button"
                onClick={() => navigate({ dept: "product", section: v.slug })}
                style={{
                  textAlign: "left",
                  background: "white",
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  padding: 16,
                  cursor: "pointer",
                  position: "relative",
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <h3 style={{ margin: 0, fontSize: 15 }}>{v.label}</h3>
                  <span
                    style={{ width: 10, height: 10, borderRadius: 999, background: STATUS_COLOR[status] }}
                    title={`Health: ${STATUS_LABEL[status]}`}
                  />
                </div>
                <p style={{ color: "#6b7280", margin: 0, fontSize: 12 }}>
                  {fin
                    ? `${fin.live_count} live · ${fin.in_flight_count} in flight · $${Number(fin.mrr_usd || 0).toLocaleString()} MRR`
                    : "No customers yet"}
                </p>
                <Sparkline data={spark.length === 12 ? spark : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]} color={v.color} height={32} />
              </button>
            );
          })}
        </div>
      </section>

      {/* Financial table */}
      <section>
        <h2 style={{ marginBottom: 12, fontSize: 16 }}>Financial summary</h2>
        <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", background: "white", color: "#111827", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
          <thead>
            <tr style={{ background: "#f9fafb", textAlign: "left", color: "#6b7280", fontSize: 12 }}>
              <th style={{ padding: 10 }}>Niche</th>
              <th style={{ padding: 10 }}>Live</th>
              <th style={{ padding: 10 }}>In flight</th>
              <th style={{ padding: 10 }}>Churned</th>
              <th style={{ padding: 10 }}>MRR</th>
              <th style={{ padding: 10 }}>Avg ACV</th>
            </tr>
          </thead>
          <tbody>
            {(financials ?? []).map((r) => (
              <tr key={r.niche} style={{ borderTop: "1px solid #f3f4f6" }}>
                <td style={{ padding: 10 }}>{nicheLabel(r.niche)}</td>
                <td style={{ padding: 10 }}>{r.live_count}</td>
                <td style={{ padding: 10 }}>{r.in_flight_count}</td>
                <td style={{ padding: 10 }}>{r.churned_count}</td>
                <td style={{ padding: 10 }}>${Number(r.mrr_usd || 0).toLocaleString()}</td>
                <td style={{ padding: 10 }}>${Number(r.avg_acv_usd || 0).toLocaleString()}</td>
              </tr>
            ))}
            {!loading && (financials ?? []).length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 16, textAlign: "center", color: "#9ca3af" }}>No niches yet.</td></tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function StatTile({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
      <div style={{ color: "#6b7280", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 600, marginTop: 4, color: valueColor }}>{value}</div>
    </div>
  );
}

function nicheLabel(slug: string): string {
  const v = VARIATIONS.find((x) => x.slug === slug);
  return v?.label ?? slug;
}
