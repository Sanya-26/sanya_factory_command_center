// Product · Main dashboard
// Overall business health + financial metrics + 3 product cards.

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

interface FinancialRow {
  niche: string;
  live_count: number;
  in_flight_count: number;
  churned_count: number;
  mrr_usd: number;
  avg_acv_usd: number;
}

const VARIATIONS = [
  { slug: "cleo-for-pools", label: "Cleo for Pools" },
  { slug: "gameday-model", label: "Gameday Model" },
  { slug: "real-estate-model", label: "Real Estate Model" },
];

export function ProductHomePage(): JSX.Element {
  const [financials, setFinancials] = useState<FinancialRow[] | null>(null);
  const [healthByNiche, setHealthByNiche] = useState<Record<string, HealthStatus>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = getFactorySupabase();
      try {
        const { data: fin, error: finErr } = await sb
          .from("v_financial_summary")
          .select("*");
        if (finErr) throw finErr;
        if (cancelled) return;
        setFinancials((fin ?? []) as FinancialRow[]);

        // Per-niche worst-status rollup.
        const { data: comps } = await sb
          .from("companies")
          .select("id, niche");
        if (cancelled) return;
        const companyIds = (comps ?? []).map((c: { id: string }) => c.id);
        const health = await fetchAccountHealth(companyIds);
        const byNiche: Record<string, HealthStatus[]> = {};
        for (const c of comps ?? []) {
          const niche = (c as { niche: string | null }).niche ?? "unknown";
          const row = health.find((h) => h.company_id === (c as { id: string }).id);
          if (!row) continue;
          (byNiche[niche] = byNiche[niche] || []).push(row.status);
        }
        const rolled: Record<string, HealthStatus> = {};
        for (const [n, statuses] of Object.entries(byNiche)) rolled[n] = worstStatus(statuses);
        if (!cancelled) setHealthByNiche(rolled);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const overall = worstStatus(Object.values(healthByNiche));
  const totalMrr = (financials ?? []).reduce((s, r) => s + Number(r.mrr_usd || 0), 0);
  const totalLive = (financials ?? []).reduce((s, r) => s + Number(r.live_count || 0), 0);
  const totalInFlight = (financials ?? []).reduce((s, r) => s + Number(r.in_flight_count || 0), 0);

  return (
    <div className="product-home" style={{ padding: 24, display: "grid", gap: 24 }}>
      {error ? <div className="error-bar">{error}</div> : null}

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16 }}>
        <StatTile label="Overall business health" valueColor={STATUS_COLOR[overall]} value={STATUS_LABEL[overall]} />
        <StatTile label="MRR (signed/sent contracts)" value={`$${totalMrr.toLocaleString()}`} />
        <StatTile label="Live customers" value={String(totalLive)} />
        <StatTile label="In flight" value={String(totalInFlight)} />
      </section>

      <section>
        <h2 style={{ marginBottom: 12 }}>Product variations</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {VARIATIONS.map((v) => {
            const fin = financials?.find((f) => f.niche === v.slug);
            const status = healthByNiche[v.slug] ?? "green";
            return (
              <button
                key={v.slug}
                type="button"
                className="product-card"
                onClick={() => navigate({ dept: "product", section: v.slug })}
                style={{
                  textAlign: "left",
                  background: "white",
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  padding: 20,
                  cursor: "pointer",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 16,
                    right: 16,
                    width: 12,
                    height: 12,
                    borderRadius: 999,
                    background: STATUS_COLOR[status],
                  }}
                  title={`Health: ${STATUS_LABEL[status]}`}
                />
                <h3 style={{ margin: 0, marginBottom: 8 }}>{v.label}</h3>
                <p style={{ color: "#6b7280", margin: 0, fontSize: 13 }}>
                  {fin
                    ? `${fin.live_count} live · ${fin.in_flight_count} in flight · $${Number(fin.mrr_usd || 0).toLocaleString()} MRR`
                    : "No customers yet"}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h2 style={{ marginBottom: 12 }}>Financial summary by niche</h2>
        <table className="data-table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e5e7eb", textAlign: "left", color: "#6b7280" }}>
              <th style={{ padding: 8 }}>Niche</th>
              <th style={{ padding: 8 }}>Live</th>
              <th style={{ padding: 8 }}>In flight</th>
              <th style={{ padding: 8 }}>Churned</th>
              <th style={{ padding: 8 }}>MRR</th>
              <th style={{ padding: 8 }}>Avg ACV</th>
            </tr>
          </thead>
          <tbody>
            {(financials ?? []).map((r) => (
              <tr key={r.niche} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: 8 }}>{r.niche}</td>
                <td style={{ padding: 8 }}>{r.live_count}</td>
                <td style={{ padding: 8 }}>{r.in_flight_count}</td>
                <td style={{ padding: 8 }}>{r.churned_count}</td>
                <td style={{ padding: 8 }}>${Number(r.mrr_usd || 0).toLocaleString()}</td>
                <td style={{ padding: 8 }}>${Number(r.avg_acv_usd || 0).toLocaleString()}</td>
              </tr>
            ))}
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
