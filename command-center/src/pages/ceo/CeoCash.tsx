// CEO Cash — editable mock burn / runway inputs.

import { useEffect, useState } from "react";
import { getFactorySupabase } from "../../lib/factorySupabase";
import { MockBadge } from "../../components/MockBadge";
import { inputStyle } from "../../lib/ui-styles";
import type { KpiInputs } from "../../lib/ceo-data";

export function CeoCashPage(): JSX.Element {
  const [kpi, setKpi] = useState<(KpiInputs & { id: string }) | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = getFactorySupabase();
      const { data } = await sb.from("ceo_kpi_inputs").select("*").order("month", { ascending: false }).limit(1);
      if (!cancelled) setKpi(((data ?? []) as Array<KpiInputs & { id: string }>)[0] ?? null);
    })();
    return () => { cancelled = true; };
  }, []);

  function patch<K extends keyof KpiInputs>(k: K, v: KpiInputs[K]) {
    if (!kpi) return;
    setKpi({ ...kpi, [k]: v });
  }

  async function save() {
    if (!kpi) return;
    const sb = getFactorySupabase();
    await sb.from("ceo_kpi_inputs").update({
      monthly_burn_usd: kpi.monthly_burn_usd,
      payroll_usd: kpi.payroll_usd,
      headcount: kpi.headcount,
      cash_balance_usd: kpi.cash_balance_usd,
      mrr_target_usd: kpi.mrr_target_usd,
    }).eq("id", kpi.id);
    alert("Saved.");
  }

  if (!kpi) return <div style={{ padding: 24 }}><p>Loading…</p></div>;

  const runwayMonths = kpi.monthly_burn_usd > 0 ? Math.round(kpi.cash_balance_usd / kpi.monthly_burn_usd) : 0;

  return (
    <div style={{ padding: 24, display: "grid", gap: 16, maxWidth: 720 }}>
      <header>
        <h1 style={{ margin: 0 }}>Cash &amp; people <MockBadge /></h1>
        <p style={{ color: "#9ca3af", margin: "4px 0 0", fontSize: 13 }}>Adjust inputs to watch runway in real time.</p>
      </header>

      <div style={{ background: "white", color: "#111827", border: "1px solid #e5e7eb", borderRadius: 12, padding: 20, display: "grid", gap: 12 }}>
        <Field label="Headcount">
          <input type="number" value={kpi.headcount} onChange={(e) => patch("headcount", Number(e.target.value))} style={inputStyle} />
        </Field>
        <Field label="Payroll / mo ($)">
          <input type="number" value={kpi.payroll_usd} onChange={(e) => patch("payroll_usd", Number(e.target.value))} style={inputStyle} />
        </Field>
        <Field label="Total monthly burn ($)">
          <input type="number" value={kpi.monthly_burn_usd} onChange={(e) => patch("monthly_burn_usd", Number(e.target.value))} style={inputStyle} />
        </Field>
        <Field label="Cash balance ($)">
          <input type="number" value={kpi.cash_balance_usd} onChange={(e) => patch("cash_balance_usd", Number(e.target.value))} style={inputStyle} />
        </Field>
        <Field label="MRR target this Q ($)">
          <input type="number" value={kpi.mrr_target_usd} onChange={(e) => patch("mrr_target_usd", Number(e.target.value))} style={inputStyle} />
        </Field>

        <div style={{ marginTop: 8, padding: 14, background: "#f3f4f6", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#6b7280", fontSize: 13 }}>Computed runway</span>
          <span style={{ fontSize: 22, fontWeight: 700, color: runwayMonths < 9 ? "#ef4444" : runwayMonths < 14 ? "#f59e0b" : "#10b981" }}>
            {runwayMonths} months
          </span>
        </div>

        <button type="button" onClick={() => void save()} className="btn" style={{ padding: "8px 16px", alignSelf: "flex-start" }}>Save inputs</button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", color: "#6b7280", fontSize: 12, marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}
