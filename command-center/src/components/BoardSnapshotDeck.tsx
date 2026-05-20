// 8-slide board snapshot deck — CEO-flavored sibling of ProposalDeck.

import { useEffect, useState } from "react";
import { getFactorySupabase } from "../lib/factorySupabase";
import { fetchAccountHealth } from "../lib/health-score";

interface DeckData {
  monthLabel: string;
  mrr: number;
  liveCount: number;
  runwayMonths: number;
  customersThisMonth: Array<{ name: string; monthly: number; signedAt: string }>;
  atRisk: Array<{ name: string; reason: string }>;
  lines: Array<{ label: string; mrr: number; live: number; growthPct: number; rec: string }>;
  headcount: number;
  payroll: number;
  burn: number;
  openReqs: Array<{ title: string; manager: string }>;
}

const ACCENT = ["#1d4ed8", "#0e7490", "#10b981", "#dc2626", "#7c3aed", "#f59e0b", "#0891b2", "#16a34a"];

export function BoardSnapshotDeck({ embedded = true }: { embedded?: boolean }): JSX.Element {
  const [data, setData] = useState<DeckData | null>(null);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = getFactorySupabase();
      const [{ data: pending }, { data: fin }, { data: comps }, { data: kpiRow }, { data: stages }] = await Promise.all([
        sb.from("v_ceo_contracts_pending").select("*"),
        sb.from("v_financial_summary").select("*"),
        sb.from("companies").select("id, name, niche"),
        sb.from("ceo_kpi_inputs").select("*").order("month", { ascending: false }).limit(1),
        sb.from("project_lifecycle_stage_runs").select("project_id, stage_slug"),
      ]);
      if (cancelled) return;
      const kpi = ((kpiRow ?? []) as Array<{ headcount: number; payroll_usd: number; monthly_burn_usd: number; cash_balance_usd: number; open_requisitions: Array<{ title: string; manager: string }>; line_allocations: Record<string, number> }>)[0];
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const monthLabel = startOfMonth.toLocaleDateString(undefined, { year: "numeric", month: "long" });
      const customersThisMonth = ((pending ?? []) as Array<{ company_name: string; monthly_usd: number; ceo_signed_at: string | null; queue_bucket: string }>)
        .filter((r) => r.queue_bucket === "signed" && r.ceo_signed_at && new Date(r.ceo_signed_at) >= startOfMonth)
        .map((r) => ({ name: r.company_name, monthly: Number(r.monthly_usd), signedAt: r.ceo_signed_at! }));

      const mrr = ((fin ?? []) as Array<{ mrr_usd: number }>).reduce((s, r) => s + Number(r.mrr_usd || 0), 0);
      const live = new Set<string>();
      for (const s of (stages ?? []) as Array<{ project_id: string; stage_slug: string }>) {
        if (s.stage_slug === "live") live.add(s.project_id);
      }

      const health = await fetchAccountHealth();
      const nameById = new Map<string, string>();
      for (const c of (comps ?? []) as Array<{ id: string; name: string; niche: string | null }>) nameById.set(c.id, c.name);
      const atRisk = health
        .filter((h) => h.status === "red" && live.has(h.company_id))
        .map((h) => ({ name: nameById.get(h.company_id) ?? h.company_id, reason: "Red > 7 days" }));

      const NICHES = [
        { slug: "cleo-for-pools", label: "Cleo for Pools" },
        { slug: "gameday-model", label: "Gameday Model" },
        { slug: "real-estate-model", label: "Real Estate Model" },
      ];
      const lines = NICHES.map((n) => {
        const f = (fin ?? []).find((r) => (r as { niche: string }).niche === n.slug) as { mrr_usd?: number; live_count?: number } | undefined;
        return {
          label: n.label,
          mrr: Number(f?.mrr_usd ?? 0),
          live: Number(f?.live_count ?? 0),
          growthPct: 0,
          rec: "Hold",
        };
      });

      setData({
        monthLabel,
        mrr,
        liveCount: live.size,
        runwayMonths: kpi && kpi.monthly_burn_usd > 0 ? Math.round(kpi.cash_balance_usd / kpi.monthly_burn_usd) : 0,
        customersThisMonth,
        atRisk,
        lines,
        headcount: kpi?.headcount ?? 0,
        payroll: kpi?.payroll_usd ?? 0,
        burn: kpi?.monthly_burn_usd ?? 0,
        openReqs: kpi?.open_requisitions ?? [],
      });
    })();
    return () => { cancelled = true; };
  }, []);

  if (!data) return <p style={{ color: "#9ca3af", padding: 16 }}>Loading snapshot…</p>;

  const slides = [
    <Cover key="cover" month={data.monthLabel} />,
    <Headline key="head" data={data} />,
    <CustomersWon key="won" rows={data.customersThisMonth} month={data.monthLabel} />,
    <AtRiskSlide key="risk" rows={data.atRisk} />,
    <LineScorecard key="lines" lines={data.lines} />,
    <CashSlide key="cash" data={data} />,
    <Asks key="asks" />,
    <Next30 key="next" />,
  ];

  const cur = slides[idx];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 12, minHeight: embedded ? 460 : 600, padding: 32, position: "relative", color: "#111827" }}>
        {cur}
        <div style={{ position: "absolute", bottom: 8, left: 16, right: 16, color: "#9ca3af", fontSize: 10, display: "flex", justifyContent: "space-between", borderTop: "1px solid #f3f4f6", paddingTop: 6 }}>
          <span>AUBOS · Board snapshot · {data.monthLabel}</span>
          <span>Prepared by Ouadie</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <button type="button" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} className="btn-ghost" style={{ fontSize: 13 }}>← Prev</button>
        <div style={{ display: "flex", gap: 4 }}>
          {slides.map((_, i) => (
            <button key={i} type="button" onClick={() => setIdx(i)} aria-label={`Slide ${i + 1}`} style={{ width: idx === i ? 22 : 8, height: 8, borderRadius: 4, background: idx === i ? ACCENT[idx] : "#d1d5db", border: "none", cursor: "pointer", padding: 0 }} />
          ))}
        </div>
        <button type="button" onClick={() => setIdx((i) => Math.min(slides.length - 1, i + 1))} disabled={idx === slides.length - 1} className="btn-ghost" style={{ fontSize: 13 }}>Next →</button>
      </div>
      <div style={{ textAlign: "center", color: "#9ca3af", fontSize: 12 }}>
        Slide {idx + 1} / {slides.length}
      </div>
    </div>
  );
}

function Cover({ month }: { month: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", height: "100%", textAlign: "center", gap: 16, minHeight: 380 }}>
      <div style={{ fontSize: 11, letterSpacing: 2, color: "#6b7280", textTransform: "uppercase" }}>AUBOS</div>
      <div style={{ fontSize: 44, fontWeight: 700 }}>Board Snapshot</div>
      <div style={{ fontSize: 16, color: "#6b7280" }}>{month}</div>
      <div style={{ marginTop: 32, padding: "10px 22px", background: ACCENT[0], color: "white", borderRadius: 999, fontSize: 12, fontWeight: 600, letterSpacing: 1 }}>PREPARED BY OUADIE</div>
    </div>
  );
}

function Headline({ data }: { data: DeckData }) {
  return (
    <SlideShell heading="Headline numbers" accent={ACCENT[1]}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, marginTop: 12 }}>
        <BigStat label="MRR" value={`$${data.mrr.toLocaleString()}`} />
        <BigStat label="Live customers" value={String(data.liveCount)} />
        <BigStat label="Runway" value={`${data.runwayMonths} mo`} muted />
        <BigStat label="MoM growth" value="+9%" muted />
      </div>
    </SlideShell>
  );
}

function CustomersWon({ rows, month }: { rows: Array<{ name: string; monthly: number; signedAt: string }>; month: string }) {
  return (
    <SlideShell heading={`Customers won — ${month}`} accent={ACCENT[2]}>
      {rows.length === 0 ? (
        <p style={{ color: "#9ca3af", fontStyle: "italic" }}>No customers signed this month yet.</p>
      ) : (
        <ul style={{ paddingLeft: 0, listStyle: "none", marginTop: 8 }}>
          {rows.map((r, i) => (
            <li key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: i > 0 ? "1px solid #f3f4f6" : "none" }}>
              <span style={{ fontWeight: 500 }}>{r.name}</span>
              <span style={{ color: "#10b981", fontWeight: 600 }}>${r.monthly.toLocaleString()}/mo</span>
            </li>
          ))}
        </ul>
      )}
    </SlideShell>
  );
}

function AtRiskSlide({ rows }: { rows: Array<{ name: string; reason: string }> }) {
  return (
    <SlideShell heading="Customers at risk" accent={ACCENT[3]}>
      {rows.length === 0 ? (
        <p style={{ color: "#10b981", fontWeight: 500 }}>✓ No red accounts this month.</p>
      ) : (
        <ul style={{ paddingLeft: 16, marginTop: 8 }}>
          {rows.map((r, i) => (
            <li key={i} style={{ marginBottom: 6 }}>
              <strong>{r.name}</strong> <span style={{ color: "#6b7280" }}>— {r.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </SlideShell>
  );
}

function LineScorecard({ lines }: { lines: Array<{ label: string; mrr: number; live: number; growthPct: number; rec: string }> }) {
  return (
    <SlideShell heading="Per-product-line scorecard" accent={ACCENT[4]}>
      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12, fontSize: 13 }}>
        <thead>
          <tr style={{ color: "#6b7280", textAlign: "left", fontSize: 11 }}>
            <th style={{ padding: 6 }}>Line</th>
            <th style={{ padding: 6 }}>MRR</th>
            <th style={{ padding: 6 }}>Live</th>
            <th style={{ padding: 6 }}>30d growth</th>
            <th style={{ padding: 6 }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} style={{ borderTop: "1px solid #f3f4f6" }}>
              <td style={{ padding: 6, fontWeight: 600 }}>{l.label}</td>
              <td style={{ padding: 6 }}>${l.mrr.toLocaleString()}</td>
              <td style={{ padding: 6 }}>{l.live}</td>
              <td style={{ padding: 6 }}>{l.growthPct >= 0 ? "+" : ""}{l.growthPct}%</td>
              <td style={{ padding: 6 }}>{l.rec}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </SlideShell>
  );
}

function CashSlide({ data }: { data: DeckData }) {
  return (
    <SlideShell heading="Cash & burn" accent={ACCENT[5]}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, marginTop: 12 }}>
        <BigStat label="Headcount" value={String(data.headcount)} muted />
        <BigStat label="Payroll / mo" value={`$${data.payroll.toLocaleString()}`} muted />
        <BigStat label="Total burn" value={`$${data.burn.toLocaleString()}/mo`} muted />
        <BigStat label="Runway" value={`${data.runwayMonths} mo`} muted />
      </div>
      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, color: "#6b7280", marginBottom: 6 }}>Open requisitions</div>
        {data.openReqs.length === 0 ? (
          <p style={{ color: "#9ca3af", margin: 0 }}>None.</p>
        ) : (
          <ul style={{ paddingLeft: 16, margin: 0 }}>
            {data.openReqs.map((r, i) => <li key={i}>{r.title} <span style={{ color: "#9ca3af" }}>({r.manager})</span></li>)}
          </ul>
        )}
      </div>
    </SlideShell>
  );
}

function Asks() {
  return (
    <SlideShell heading="Strategic asks of the board" accent={ACCENT[6]}>
      <ul style={{ paddingLeft: 16, marginTop: 12, lineHeight: 1.7 }}>
        <li>Intros to 2–3 enterprise pool franchises (cleo-for-pools)</li>
        <li>Feedback on premium tier pricing ($2,495/mo) for Gameday Model</li>
        <li>Press &amp; PR strategy for first 10 live customers in real-estate</li>
      </ul>
      <p style={{ color: "#9ca3af", fontSize: 11, marginTop: 12 }}>(Placeholder — edit in /#ceo/board before exporting.)</p>
    </SlideShell>
  );
}

function Next30() {
  return (
    <SlideShell heading="The next 30 days" accent={ACCENT[7]}>
      <ol style={{ paddingLeft: 18, marginTop: 12, lineHeight: 1.7, fontSize: 14 }}>
        <li><strong>Close 4 more contracts</strong> across the 3 lines.</li>
        <li><strong>Ship Triage Agent v2</strong> with auto-prioritization of customer-impact issues.</li>
        <li><strong>First fundraising conversations</strong> with 3 strategic investors.</li>
      </ol>
      <p style={{ color: "#9ca3af", fontSize: 11, marginTop: 12 }}>(Placeholder — edit before exporting.)</p>
    </SlideShell>
  );
}

function SlideShell({ heading, accent, children }: { heading: string; accent: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span style={{ width: 6, height: 24, background: accent, borderRadius: 4 }} />
        <h2 style={{ margin: 0, fontSize: 22 }}>{heading}</h2>
      </div>
      <div style={{ marginTop: 6 }}>{children}</div>
    </div>
  );
}

function BigStat({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div style={{ background: muted ? "#f9fafb" : "#eff6ff", border: `1px solid ${muted ? "#e5e7eb" : "#93c5fd"}`, borderRadius: 10, padding: 16 }}>
      <div style={{ color: "#6b7280", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}{muted ? " · MOCK" : ""}</div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4 }}>{value}</div>
    </div>
  );
}
