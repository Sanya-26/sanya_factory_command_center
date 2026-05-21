// 8-slide board snapshot deck — editorial redesign (NYT/FT pitch deck aesthetic).
// 16:9 fixed aspect ratio, serif headings, generous whitespace, restrained accent palette.

import { useEffect, useState } from "react";
import { getFactorySupabase } from "../lib/factorySupabase";
import { fetchAccountHealth } from "../lib/health-score";

interface DeckData {
  monthLabel: string;
  mrr: number;
  liveCount: number;
  runwayMonths: number;
  customersThisMonth: Array<{ name: string; monthly: number; signedAt: string; niche?: string }>;
  atRisk: Array<{ name: string; reason: string }>;
  lines: Array<{ label: string; mrr: number; live: number; growthPct: number; rec: "Invest" | "Hold" | "Reassess" }>;
  headcount: number;
  payroll: number;
  burn: number;
  openReqs: Array<{ title: string; manager: string }>;
}

const FONT_SERIF = "Georgia, 'Times New Roman', serif";

// Restrained accent palette — one per slide (deep slate, claret, forest, navy, violet, amber, teal, graphite).
const ACCENTS = ["#0f172a", "#0f172a", "#14532d", "#7f1d1d", "#581c87", "#1e3a8a", "#134e4a", "#1f2937"];

const SECTIONS = [
  "Cover",
  "Headline numbers",
  "Customers won",
  "Customers at risk",
  "Per-line scorecard",
  "Cash & burn",
  "Strategic asks",
  "The next 30 days",
];

export function BoardSnapshotDeck({ embedded = true }: { embedded?: boolean }): JSX.Element {
  const [data, setData] = useState<DeckData | null>(null);
  const [idx, setIdx] = useState(0);
  const [present, setPresent] = useState(false);

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
      const kpi = ((kpiRow ?? []) as Array<{ headcount: number; payroll_usd: number; monthly_burn_usd: number; cash_balance_usd: number; open_requisitions: Array<{ title: string; manager: string }> }>)[0];
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const monthLabel = startOfMonth.toLocaleDateString(undefined, { year: "numeric", month: "long" });
      const compsById = new Map<string, { name: string; niche: string | null }>();
      for (const c of (comps ?? []) as Array<{ id: string; name: string; niche: string | null }>) compsById.set(c.id, { name: c.name, niche: c.niche });

      const customersThisMonth = ((pending ?? []) as Array<{ company_id: string; company_name: string; monthly_usd: number; ceo_signed_at: string | null; queue_bucket: string }>)
        .filter((r) => r.queue_bucket === "signed" && r.ceo_signed_at && new Date(r.ceo_signed_at) >= startOfMonth)
        .map((r) => ({
          name: r.company_name,
          monthly: Number(r.monthly_usd),
          signedAt: r.ceo_signed_at!,
          niche: compsById.get(r.company_id)?.niche ?? undefined,
        }));

      const mrr = ((fin ?? []) as Array<{ mrr_usd: number }>).reduce((s, r) => s + Number(r.mrr_usd || 0), 0);
      const live = new Set<string>();
      for (const s of (stages ?? []) as Array<{ project_id: string; stage_slug: string }>) {
        if (s.stage_slug === "live") live.add(s.project_id);
      }

      const health = await fetchAccountHealth();
      const atRisk = health
        .filter((h) => (h.status === "red" || h.status === "yellow") && live.has(h.company_id))
        .map((h) => ({
          name: compsById.get(h.company_id)?.name ?? h.company_id,
          reason: h.status === "red" ? "Red — needs immediate attention" : "Yellow — investigate this week",
        }));

      const NICHES = [
        { slug: "cleo-for-pools", label: "Cleo for Pools" },
        { slug: "gameday-model", label: "Gameday Model" },
        { slug: "real-estate-model", label: "Real Estate Model" },
      ];
      const lines = NICHES.map((n) => {
        const f = (fin ?? []).find((r) => (r as { niche: string }).niche === n.slug) as { mrr_usd?: number; live_count?: number } | undefined;
        const mrrLine = Number(f?.mrr_usd ?? 0);
        const liveLine = Number(f?.live_count ?? 0);
        const rec: "Invest" | "Hold" | "Reassess" =
          mrrLine > 3000 ? "Invest" :
          mrrLine > 0 ? "Hold" :
          "Reassess";
        return { label: n.label, mrr: mrrLine, live: liveLine, growthPct: 0, rec };
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

  useEffect(() => {
    if (!present) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setPresent(false); return; }
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); setIdx((i) => Math.min(SECTIONS.length - 1, i + 1)); }
      if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [present]);

  if (!data) return <p style={{ color: "#9ca3af", padding: 16 }}>Loading snapshot…</p>;

  const slideEls = [
    <Cover key="cover" month={data.monthLabel} />,
    <Headline key="head" data={data} />,
    <CustomersWon key="won" rows={data.customersThisMonth} month={data.monthLabel} />,
    <AtRiskSlide key="risk" rows={data.atRisk} />,
    <LineScorecard key="lines" lines={data.lines} />,
    <CashSlide key="cash" data={data} />,
    <Asks key="asks" />,
    <Next30 key="next" />,
  ];

  // Frame: 16:9 aspect ratio, white card, hairline borders, chrome.
  const frame = (
    <div
      style={{
        background: "white",
        color: "#0f172a",
        border: present ? "none" : "1px solid #e5e7eb",
        borderRadius: present ? 0 : 6,
        width: "100%",
        aspectRatio: "16 / 9",
        position: "relative",
        overflow: "hidden",
        boxShadow: present ? "none" : "0 1px 0 rgba(15,23,42,0.04)",
      }}
    >
      <div style={{ position: "absolute", top: 28, left: 56, fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "#94a3b8" }}>
        {SECTIONS[idx]}
      </div>
      <div style={{ position: "absolute", inset: 0, padding: "76px 64px 56px 64px", display: "flex", flexDirection: "column" }}>
        {slideEls[idx]}
      </div>
      <div style={{ position: "absolute", bottom: 22, left: 56, fontSize: 9, letterSpacing: 3, textTransform: "uppercase", color: "#94a3b8" }}>
        AUBOS
      </div>
      <div style={{ position: "absolute", bottom: 22, right: 56, fontSize: 9, letterSpacing: 2, color: "#94a3b8" }}>
        {String(idx + 1).padStart(2, "0")} / {String(SECTIONS.length).padStart(2, "0")}
      </div>
    </div>
  );

  if (present) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "#0f172a", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
        <div style={{ width: "min(96vw, calc(96vh * 16 / 9))" }}>{frame}</div>
        <button
          type="button"
          onClick={() => setPresent(false)}
          style={{ position: "fixed", top: 16, right: 16, background: "transparent", border: "1px solid #475569", color: "#cbd5e1", padding: "6px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer" }}
        >
          Exit (Esc)
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ minHeight: embedded ? 460 : 600 }}>{frame}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <button type="button" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} className="btn-ghost" style={{ fontSize: 13 }}>← Prev</button>
        <div style={{ display: "flex", gap: 4 }}>
          {slideEls.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              aria-label={`Slide ${i + 1}`}
              title={SECTIONS[i]}
              style={{ width: idx === i ? 22 : 8, height: 8, borderRadius: 4, background: idx === i ? ACCENTS[i] : "#d1d5db", border: "none", cursor: "pointer", padding: 0 }}
            />
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => setPresent(true)} style={{ padding: "6px 14px", background: "#0f172a", color: "white", border: "none", borderRadius: 6, fontSize: 13, cursor: "pointer" }}>▶ Present</button>
          <button type="button" onClick={() => setIdx((i) => Math.min(slideEls.length - 1, i + 1))} disabled={idx === slideEls.length - 1} className="btn-ghost" style={{ fontSize: 13 }}>Next →</button>
        </div>
      </div>
      <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 11, letterSpacing: 1 }}>
        Slide {idx + 1} of {slideEls.length} · {SECTIONS[idx]}
      </div>
    </div>
  );
}

// ---------- Slide 1: Cover ----------
function Cover({ month }: { month: string }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: ACCENTS[0], color: "white", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 96px" }}>
      <div style={{ fontSize: 10, letterSpacing: 4, textTransform: "uppercase", color: "#94a3b8", marginBottom: 18 }}>AUBOS · Operating review</div>
      <div style={{ fontSize: 72, fontFamily: FONT_SERIF, fontWeight: 400, lineHeight: 1.05, letterSpacing: -1 }}>Board Snapshot.</div>
      <div style={{ width: 64, height: 2, background: "#f59e0b", margin: "32px 0" }} />
      <div style={{ fontSize: 22, fontFamily: FONT_SERIF, fontStyle: "italic", color: "#e2e8f0" }}>{month}</div>
      <div style={{ marginTop: 28, fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#94a3b8" }}>Prepared by Ouadie</div>
    </div>
  );
}

// ---------- Slide 2: Headline numbers ----------
function Headline({ data }: { data: DeckData }) {
  return (
    <SlideBody heading="The numbers." accent={ACCENTS[1]}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 0, marginTop: 18, columnGap: 56, rowGap: 32 }}>
        <Statline label="MRR" value={`$${data.mrr.toLocaleString()}`} sub="Recurring, signed contracts." />
        <Statline label="Live customers" value={String(data.liveCount)} sub="Tenants in production today." />
        <Statline label="Runway" value={`${data.runwayMonths} mo`} sub="At current burn." mock />
        <Statline label="MoM growth" value="+9%" sub="Net new logos vs prior month." mock />
      </div>
    </SlideBody>
  );
}

// ---------- Slide 3: Customers won ----------
function CustomersWon({ rows, month }: { rows: Array<{ name: string; monthly: number; signedAt: string; niche?: string }>; month: string }) {
  return (
    <SlideBody heading={`Customers won.`} kicker={month} accent={ACCENTS[2]}>
      {rows.length === 0 ? (
        <p style={{ color: "#94a3b8", fontStyle: "italic", fontFamily: FONT_SERIF, fontSize: 18, marginTop: 12 }}>No customers signed this month yet.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
          {rows.map((r, i) => (
            <li key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "baseline", padding: "14px 0", borderTop: i === 0 ? "1px solid #e2e8f0" : "1px solid #f1f5f9" }}>
              <div>
                <div style={{ fontFamily: FONT_SERIF, fontSize: 22, fontWeight: 500 }}>{r.name}</div>
                <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "#94a3b8", marginTop: 2 }}>{r.niche ?? "—"}</div>
              </div>
              <div style={{ fontFamily: FONT_SERIF, fontSize: 22, color: ACCENTS[2] }}>${r.monthly.toLocaleString()}<span style={{ fontSize: 11, color: "#94a3b8", letterSpacing: 1, marginLeft: 4 }}>/MO</span></div>
            </li>
          ))}
        </ul>
      )}
    </SlideBody>
  );
}

// ---------- Slide 4: At risk ----------
function AtRiskSlide({ rows }: { rows: Array<{ name: string; reason: string }> }) {
  return (
    <SlideBody heading="Customers at risk." accent={ACCENTS[3]}>
      {rows.length === 0 ? (
        <p style={{ color: ACCENTS[2], fontFamily: FONT_SERIF, fontStyle: "italic", fontSize: 20, marginTop: 12 }}>No accounts in yellow or red this month.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
          {rows.map((r, i) => (
            <li key={i} style={{ borderLeft: `2px solid ${ACCENTS[3]}`, paddingLeft: 18, marginBottom: 18 }}>
              <div style={{ fontFamily: FONT_SERIF, fontSize: 22, fontWeight: 500 }}>{r.name}</div>
              <div style={{ fontFamily: FONT_SERIF, fontStyle: "italic", color: "#475569", fontSize: 14, marginTop: 2 }}>{r.reason}</div>
            </li>
          ))}
        </ul>
      )}
    </SlideBody>
  );
}

// ---------- Slide 5: Per-line scorecard ----------
function LineScorecard({ lines }: { lines: Array<{ label: string; mrr: number; live: number; growthPct: number; rec: "Invest" | "Hold" | "Reassess" }> }) {
  return (
    <SlideBody heading="By the product line." accent={ACCENTS[4]}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 32, marginTop: 18 }}>
        {lines.map((l, i) => (
          <div key={i} style={{ borderTop: "1px solid #e2e8f0", paddingTop: 16 }}>
            <div style={{ fontFamily: FONT_SERIF, fontSize: 22, fontWeight: 500, lineHeight: 1.15, minHeight: 52 }}>{l.label}</div>
            <Metric label="MRR" value={`$${l.mrr.toLocaleString()}`} />
            <Metric label="Live" value={String(l.live)} />
            <Metric label="30d growth" value={`${l.growthPct >= 0 ? "+" : ""}${l.growthPct}%`} mock />
            <div style={{ marginTop: 18, paddingTop: 12, borderTop: "1px solid #f1f5f9", fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: ACCENTS[4] }}>
              → {l.rec}
            </div>
          </div>
        ))}
      </div>
    </SlideBody>
  );
}

// ---------- Slide 6: Cash & burn ----------
function CashSlide({ data }: { data: DeckData }) {
  return (
    <SlideBody heading="Cash & burn." accent={ACCENTS[5]}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 0, marginTop: 16, columnGap: 56, rowGap: 24 }}>
        <Statline label="Headcount" value={String(data.headcount)} mock />
        <Statline label="Payroll / mo" value={`$${data.payroll.toLocaleString()}`} mock />
        <Statline label="Total burn" value={`$${data.burn.toLocaleString()}`} sub="Per month, all-in." mock />
        <Statline label="Runway" value={`${data.runwayMonths} mo`} sub="At current burn." mock />
      </div>
      {data.openReqs.length > 0 ? (
        <div style={{ marginTop: 28, paddingTop: 16, borderTop: "1px solid #e2e8f0" }}>
          <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#94a3b8", marginBottom: 8 }}>Open requisitions</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
            {data.openReqs.map((r, i) => (
              <li key={i} style={{ fontFamily: FONT_SERIF, fontStyle: "italic", fontSize: 14, color: "#475569" }}>
                {r.title} <span style={{ color: "#94a3b8" }}>— {r.manager}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </SlideBody>
  );
}

// ---------- Slide 7: Strategic asks ----------
function Asks() {
  return (
    <SlideBody heading="Strategic asks." accent={ACCENTS[6]}>
      <ul style={{ listStyle: "none", padding: 0, margin: "16px 0 0", display: "grid", gap: 22 }}>
        <li style={{ fontFamily: FONT_SERIF, fontSize: 22, lineHeight: 1.4, color: "#0f172a" }}>
          “Intros to 2–3 enterprise pool franchises.”
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "#94a3b8", marginTop: 6 }}>— Cleo for Pools</div>
        </li>
        <li style={{ fontFamily: FONT_SERIF, fontSize: 22, lineHeight: 1.4, color: "#0f172a" }}>
          “Feedback on premium tier pricing ($2,495/mo) for Gameday Model.”
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "#94a3b8", marginTop: 6 }}>— Gameday Model</div>
        </li>
        <li style={{ fontFamily: FONT_SERIF, fontSize: 22, lineHeight: 1.4, color: "#0f172a" }}>
          “Press &amp; PR strategy for the first 10 live real-estate customers.”
          <div style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "#94a3b8", marginTop: 6 }}>— Real Estate Model</div>
        </li>
      </ul>
    </SlideBody>
  );
}

// ---------- Slide 8: Next 30 ----------
function Next30() {
  return (
    <SlideBody heading="The next 30 days." accent={ACCENTS[7]}>
      <div style={{ display: "grid", gap: 24, marginTop: 16 }}>
        <Commitment num="01" text="Close four more contracts across the three lines." />
        <Commitment num="02" text="Ship Triage Agent v2 with auto-prioritization of customer-impact issues." />
        <Commitment num="03" text="Open first fundraising conversations with three strategic investors." />
      </div>
    </SlideBody>
  );
}

// ---------- Slide shell ----------
function SlideBody({ heading, kicker, accent, children }: { heading: string; kicker?: string; accent: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {kicker ? (
        <div style={{ fontFamily: FONT_SERIF, fontSize: 13, fontStyle: "italic", color: "#475569", marginBottom: 6 }}>{kicker}</div>
      ) : null}
      <h2 style={{
        margin: 0,
        fontFamily: FONT_SERIF,
        fontWeight: 400,
        fontSize: 48,
        letterSpacing: -0.5,
        color: accent,
        lineHeight: 1.05,
      }}>{heading}</h2>
      <div style={{ width: 48, height: 2, background: accent, marginTop: 14, marginBottom: 4, opacity: 0.6 }} />
      <div style={{ flex: 1, overflow: "auto", paddingRight: 8 }}>{children}</div>
    </div>
  );
}

// ---------- Reusable pieces ----------
function Statline({ label, value, sub, mock }: { label: string; value: string; sub?: string; mock?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: "#94a3b8" }}>
        {label}{mock ? " · mock" : ""}
      </div>
      <div style={{ fontFamily: FONT_SERIF, fontSize: 60, fontWeight: 400, lineHeight: 1, marginTop: 6, color: "#0f172a", letterSpacing: -1 }}>
        {value}
      </div>
      {sub ? (
        <div style={{ fontFamily: FONT_SERIF, fontStyle: "italic", color: "#64748b", fontSize: 13, marginTop: 8 }}>{sub}</div>
      ) : null}
    </div>
  );
}

function Metric({ label, value, mock }: { label: string; value: string; mock?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
      <span style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: "#94a3b8" }}>{label}{mock ? " · mock" : ""}</span>
      <span style={{ fontFamily: FONT_SERIF, fontSize: 22, color: "#0f172a" }}>{value}</span>
    </div>
  );
}

function Commitment({ num, text }: { num: string; text: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 24, alignItems: "baseline" }}>
      <span style={{ fontFamily: FONT_SERIF, fontSize: 36, color: "#94a3b8", fontStyle: "italic" }}>{num}</span>
      <span style={{ fontFamily: FONT_SERIF, fontSize: 22, color: "#0f172a", lineHeight: 1.45 }}>{text}</span>
    </div>
  );
}
