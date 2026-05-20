// Product · Per-variation customer table grouped by 3 PRD phases + charts.

import { useEffect, useMemo, useState } from "react";
import { getFactorySupabase } from "../../lib/factorySupabase";
import { navigate } from "../../shell/route";
import {
  fetchAccountHealth,
  STATUS_COLOR,
  type HealthStatus,
} from "../../lib/health-score";
import { phaseFor, labelFor, PHASE_TITLE, type ProductPhase } from "../../lib/stage-labels";
import { StatusDonut } from "../../components/charts/StatusDonut";
import { PhaseFunnel } from "../../components/charts/PhaseFunnel";
import { SkeletonBox } from "../../components/charts/LoadingSkeleton";

interface CompanyRow {
  id: string;
  name: string;
  stage_slug: string | null;
  flag_count: number;
  health: HealthStatus;
}

const PHASE_COLOR: Record<ProductPhase, string> = {
  phase1: "#8b5cf6",
  phase2: "#3b82f6",
  phase3: "#f59e0b",
  live: "#10b981",
};

export function ProductVariationPage({ niche }: { niche: string }): JSX.Element {
  const [rows, setRows] = useState<CompanyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

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
        const companyIds = ((comps ?? []) as Array<{ id: string }>).map((c) => c.id);

        const { data: stages } = await sb
          .from("project_lifecycle_stage_runs")
          .select("project_id, stage_slug, updated_at")
          .in("project_id", companyIds)
          .order("updated_at", { ascending: false });

        const { data: flagCounts } = await sb
          .from("customer_flags")
          .select("company_id, status")
          .in("company_id", companyIds)
          .eq("status", "open");

        const health = await fetchAccountHealth(companyIds);
        if (cancelled) return;

        const stageByCompany: Record<string, string> = {};
        for (const s of (stages ?? []) as Array<{ project_id: string; stage_slug: string }>) {
          if (!stageByCompany[s.project_id]) stageByCompany[s.project_id] = s.stage_slug;
        }
        const flagByCompany: Record<string, number> = {};
        for (const f of (flagCounts ?? []) as Array<{ company_id: string }>) {
          flagByCompany[f.company_id] = (flagByCompany[f.company_id] || 0) + 1;
        }

        const out: CompanyRow[] = ((comps ?? []) as Array<{ id: string; name: string }>).map((c) => ({
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

  const grouped: Record<ProductPhase, CompanyRow[]> = useMemo(() => {
    const g: Record<ProductPhase, CompanyRow[]> = { phase1: [], phase2: [], phase3: [], live: [] };
    if (!rows) return g;
    const filtered = rows.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));
    for (const r of filtered) g[phaseFor(r.stage_slug)].push(r);
    return g;
  }, [rows, search]);

  const phaseCounts = useMemo(() => ({
    phase1: grouped.phase1.length,
    phase2: grouped.phase2.length,
    phase3: grouped.phase3.length,
    live: grouped.live.length,
  }), [grouped]);

  const healthCounts = useMemo(() => {
    const c = { green: 0, yellow: 0, red: 0 };
    for (const r of rows ?? []) c[r.health] += 1;
    return c;
  }, [rows]);

  const loading = rows === null && error === null;

  return (
    <div style={{ padding: 24, display: "grid", gap: 20 }}>
      {error ? (
        <div style={{ background: "#fee2e2", color: "#b91c1c", padding: 10, borderRadius: 6, fontSize: 13 }}>
          {error}
        </div>
      ) : null}
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>{titleFor(niche)}</h1>
          <p style={{ color: "#9ca3af", margin: "4px 0 0", fontSize: 13 }}>
            {rows ? `${rows.length} total customer${rows.length === 1 ? "" : "s"}` : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="search"
            placeholder="Search customers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ padding: "6px 10px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 13 }}
          />
          <button
            type="button"
            className="btn"
            onClick={() => navigate({ dept: "product", section: niche, id: "flags" })}
          >
            View all flags →
          </button>
        </div>
      </header>

      {/* Top charts */}
      <section style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
        {loading ? <SkeletonBox height={220} /> : (
          <PhaseFunnel
            data={[
              { phase: "Sign", count: phaseCounts.phase1 },
              { phase: "Build", count: phaseCounts.phase2 },
              { phase: "Audit", count: phaseCounts.phase3 },
              { phase: "Live", count: phaseCounts.live },
            ]}
            niches={[{ slug: "count", label: titleFor(niche), color: PHASE_COLOR.phase2 }]}
          />
        )}
        {loading ? <SkeletonBox height={220} /> : (
          <StatusDonut
            title="Health"
            slices={[
              { label: "Green", value: healthCounts.green, color: "#10b981" },
              { label: "Yellow", value: healthCounts.yellow, color: "#f59e0b" },
              { label: "Red", value: healthCounts.red, color: "#ef4444" },
            ]}
            height={170}
          />
        )}
      </section>

      {/* Per-phase tables */}
      {(["phase1", "phase2", "phase3", "live"] as ProductPhase[]).map((ph) => (
        <PhaseSection key={ph} phase={ph} rows={grouped[ph]} niche={niche} />
      ))}

      {!loading && rows && rows.length === 0 ? (
        <div style={{ background: "white", border: "1px dashed #d1d5db", borderRadius: 12, padding: 32, textAlign: "center", color: "#6b7280" }}>
          <p style={{ margin: 0 }}>No customers under this variation yet.</p>
        </div>
      ) : null}
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
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: PHASE_COLOR[phase], display: "inline-block" }} />
        <h2 style={{ margin: 0, fontSize: 15 }}>{PHASE_TITLE[phase]}</h2>
        <span style={{ color: "#9ca3af", fontSize: 13 }}>({rows.length})</span>
      </div>
      {rows.length === 0 ? (
        <p style={{ color: "#9ca3af", fontStyle: "italic", fontSize: 13, margin: "0 0 8px" }}>No customers in this phase.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", background: "white", color: "#111827", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
          <thead>
            <tr style={{ background: "#f9fafb", textAlign: "left", color: "#6b7280", fontSize: 12 }}>
              <th style={{ padding: 10 }}>Customer</th>
              <th style={{ padding: 10 }}>Status</th>
              <th style={{ padding: 10 }}>Flags</th>
              <th style={{ padding: 10, width: 30 }}>Health</th>
              <th style={{ padding: 10 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                <td style={{ padding: 10 }}>
                  <button
                    type="button"
                    onClick={() => navigate({ dept: "product", section: niche, id: "customer", sub: r.id })}
                    style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", padding: 0, fontSize: 14 }}
                  >
                    {r.name}
                  </button>
                </td>
                <td style={{ padding: 10, fontSize: 13 }}>{labelFor(r.stage_slug)}</td>
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
  const goto = () =>
    navigate({ dept: "product", section: niche, id: "customer", sub: companyId });
  const btn = (label: string) => (
    <button
      key={label}
      type="button"
      onClick={goto}
      style={{ marginRight: 6, padding: "4px 10px", fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 6, background: "white", cursor: "pointer" }}
    >
      {label}
    </button>
  );
  if (phase === "phase1") return <>{["Map", "Synopsis", "Proposal", "Contract"].map(btn)}</>;
  if (phase === "phase2") return <>{["Production link", "Integrations", "Credentials", "QC sign-off"].map(btn)}</>;
  if (phase === "phase3") return <>{["Open audit"].map(btn)}</>;
  return <>{["Health", "Issues", "Flags"].map(btn)}</>;
}

function titleFor(slug: string): string {
  return slug.split("-").map((s) => s[0]?.toUpperCase() + s.slice(1)).join(" ");
}
