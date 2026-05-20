// Product · Per-variation customer table grouped by 3 PRD phases.

import { useEffect, useState } from "react";
import { getFactorySupabase } from "../../lib/factorySupabase";
import { navigate } from "../../shell/route";
import {
  fetchAccountHealth,
  STATUS_COLOR,
  type HealthStatus,
} from "../../lib/health-score";
import { phaseFor, labelFor, PHASE_TITLE, type ProductPhase } from "../../lib/stage-labels";

interface CompanyRow {
  id: string;
  name: string;
  stage_slug: string | null;
  flag_count: number;
  health: HealthStatus;
}

export function ProductVariationPage({ niche }: { niche: string }): JSX.Element {
  const [rows, setRows] = useState<CompanyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = getFactorySupabase();
      try {
        const { data: comps, error: cErr } = await sb
          .from("companies")
          .select("id, name")
          .eq("niche", niche);
        if (cErr) throw cErr;
        const companyIds = (comps ?? []).map((c: { id: string }) => c.id);

        // Stage per company: latest project_lifecycle_stage_runs in non-terminal status.
        const { data: stages } = await sb
          .from("project_lifecycle_stage_runs")
          .select("project_id, stage_slug, status, updated_at")
          .in("project_id", companyIds)
          .order("updated_at", { ascending: false });

        // Flag counts.
        const { data: flagCounts } = await sb
          .from("customer_flags")
          .select("company_id, status")
          .in("company_id", companyIds)
          .eq("status", "open");

        const health = await fetchAccountHealth(companyIds);
        if (cancelled) return;

        const stageByCompany: Record<string, string> = {};
        for (const s of stages ?? []) {
          const cid = (s as { project_id: string }).project_id;
          if (!stageByCompany[cid]) stageByCompany[cid] = (s as { stage_slug: string }).stage_slug;
        }
        const flagByCompany: Record<string, number> = {};
        for (const f of flagCounts ?? []) {
          const cid = (f as { company_id: string }).company_id;
          flagByCompany[cid] = (flagByCompany[cid] || 0) + 1;
        }

        const out: CompanyRow[] = (comps ?? []).map((c: { id: string; name: string }) => ({
          id: c.id,
          name: c.name,
          stage_slug: stageByCompany[c.id] ?? null,
          flag_count: flagByCompany[c.id] ?? 0,
          health: (health.find((h) => h.company_id === c.id)?.status ?? "green") as HealthStatus,
        }));
        setRows(out);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      }
    })();
    return () => { cancelled = true; };
  }, [niche]);

  const grouped: Record<ProductPhase, CompanyRow[]> = {
    phase1: [], phase2: [], phase3: [], live: [],
  };
  for (const r of rows ?? []) grouped[phaseFor(r.stage_slug)].push(r);

  return (
    <div style={{ padding: 24, display: "grid", gap: 24 }}>
      {error ? <div className="error-bar">{error}</div> : null}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>{titleFor(niche)}</h1>
        <button
          type="button"
          className="btn"
          onClick={() => navigate({ dept: "product", section: niche, id: "flags" })}
        >
          View all flags →
        </button>
      </header>

      {(["phase1", "phase2", "phase3", "live"] as ProductPhase[]).map((ph) => (
        <PhaseSection
          key={ph}
          phase={ph}
          rows={grouped[ph]}
          niche={niche}
        />
      ))}
    </div>
  );
}

function PhaseSection({
  phase,
  rows,
  niche,
}: {
  phase: ProductPhase;
  rows: CompanyRow[];
  niche: string;
}): JSX.Element {
  return (
    <section>
      <h2 style={{ marginBottom: 8 }}>{PHASE_TITLE[phase]} <span style={{ color: "#9ca3af", fontWeight: 400, fontSize: 14 }}>({rows.length})</span></h2>
      {rows.length === 0 ? (
        <p style={{ color: "#9ca3af", fontStyle: "italic" }}>No customers in this phase.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", background: "white", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
          <thead>
            <tr style={{ background: "#f9fafb", textAlign: "left", color: "#6b7280", fontSize: 12 }}>
              <th style={{ padding: 10 }}>Customer</th>
              <th style={{ padding: 10 }}>Status</th>
              <th style={{ padding: 10 }}>Flags</th>
              <th style={{ padding: 10 }}>Health</th>
              <th style={{ padding: 10 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                <td style={{ padding: 10 }}>
                  <button
                    type="button"
                    className="link"
                    onClick={() => navigate({ dept: "product", section: niche, id: "customer", sub: r.id })}
                    style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", padding: 0 }}
                  >
                    {r.name}
                  </button>
                </td>
                <td style={{ padding: 10 }}>{labelFor(r.stage_slug)}</td>
                <td style={{ padding: 10 }}>
                  {r.flag_count > 0 ? (
                    <span style={{ background: "#fee2e2", color: "#b91c1c", padding: "2px 8px", borderRadius: 999, fontSize: 12 }}>
                      {r.flag_count}
                    </span>
                  ) : "—"}
                </td>
                <td style={{ padding: 10 }}>
                  <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 999, background: STATUS_COLOR[r.health] }} />
                </td>
                <td style={{ padding: 10 }}>
                  <PhaseActions phase={phase} niche={niche} companyId={r.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function PhaseActions({ phase, niche, companyId }: { phase: ProductPhase; niche: string; companyId: string }): JSX.Element {
  const goto = (sub?: string) =>
    navigate({ dept: "product", section: niche, id: "customer", sub: companyId });
  const linkBtn = (label: string) => (
    <button
      key={label}
      type="button"
      onClick={() => goto()}
      style={{ marginRight: 6, padding: "4px 10px", fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 6, background: "white", cursor: "pointer" }}
    >
      {label}
    </button>
  );
  if (phase === "phase1") return <>{["Map", "Synopsis", "Proposal", "Contract"].map(linkBtn)}</>;
  if (phase === "phase2") return <>{["Production link", "Integrations", "Credentials", "QC sign-off"].map(linkBtn)}</>;
  if (phase === "phase3") return <>{["Open audit"].map(linkBtn)}</>;
  return <>{["Health", "Issues", "Flags"].map(linkBtn)}</>;
}

function titleFor(slug: string): string {
  return slug
    .split("-")
    .map((s) => s[0]?.toUpperCase() + s.slice(1))
    .join(" ");
}
