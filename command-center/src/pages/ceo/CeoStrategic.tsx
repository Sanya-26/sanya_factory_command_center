// CEO Strategic — expanded per-line comparison.

import { useEffect, useState } from "react";
import { getFactorySupabase } from "../../lib/factorySupabase";
import { StrategicLineCard } from "../../components/StrategicLineCard";
import { computeStrategic, type StrategicCardData, type KpiInputs } from "../../lib/ceo-data";

const VARIATIONS = [
  { slug: "cleo-for-pools", label: "Cleo for Pools" },
  { slug: "gameday-model", label: "Gameday Model" },
  { slug: "real-estate-model", label: "Real Estate Model" },
];

export function CeoStrategicPage(): JSX.Element {
  const [strategic, setStrategic] = useState<StrategicCardData[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = getFactorySupabase();
      const [{ data: fin }, { data: events }, { data: comps }, { data: kpiRow }] = await Promise.all([
        sb.from("v_financial_summary").select("*"),
        sb.from("client_journey_events").select("company_id, event_kind, at"),
        sb.from("companies").select("id, niche"),
        sb.from("ceo_kpi_inputs").select("*").order("month", { ascending: false }).limit(1),
      ]);
      if (cancelled) return;
      const k = ((kpiRow ?? []) as KpiInputs[])[0] ?? null;
      const nicheById = new Map<string, string>();
      for (const c of (comps ?? []) as Array<{ id: string; niche: string }>) nicheById.set(c.id, c.niche);
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
      setStrategic(VARIATIONS.map((v) => {
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
      }));
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ padding: 24, display: "grid", gap: 16 }}>
      <header>
        <h1 style={{ margin: 0 }}>Strategic comparison</h1>
        <p style={{ color: "#9ca3af", margin: "4px 0 0", fontSize: 13 }}>Which product line to invest in, hold, or reassess.</p>
      </header>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {strategic.map((s) => <StrategicLineCard key={s.niche_slug} data={s} compact={false} />)}
      </div>
    </div>
  );
}
