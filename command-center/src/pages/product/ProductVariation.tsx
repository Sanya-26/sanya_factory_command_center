// Product · Per-niche customer table with stage-aware actions + popups.

import { useEffect, useMemo, useState } from "react";
import { getFactorySupabase } from "../../lib/factorySupabase";
import { navigate } from "../../shell/route";
import {
  fetchAccountHealth,
  STATUS_COLOR,
  type HealthStatus,
} from "../../lib/health-score";
import { phaseFor, PHASE_TITLE, type ProductPhase } from "../../lib/stage-labels";
import { isActionEnabled, prereqMessage, stageMeta, type PhaseAction } from "../../lib/stage-actions";
import { PhaseFunnel } from "../../components/charts/PhaseFunnel";
import { SkeletonBox } from "../../components/charts/LoadingSkeleton";
import { ChartCard } from "../../components/ChartCard";
import { AtRiskList } from "../../components/AtRiskList";
import { MapPopup, SynopsisPopup, ProposalPopup } from "../../components/product-popups";
import { ScheduleCallPopup } from "../../components/schedule-call-popup";

interface CompanyRow {
  id: string;
  name: string;
  email: string | null;
  stage_slug: string | null;
  flag_count: number;
  issue_count: number;
  health: HealthStatus;
}

const PHASE_COLOR: Record<ProductPhase, string> = {
  phase1: "#8b5cf6",
  phase2: "#3b82f6",
  phase3: "#f59e0b",
  live: "#10b981",
};

const PHASE_DESC: Record<ProductPhase, string> = {
  phase1: "Customer signed up; we're mapping their business and writing a proposal.",
  phase2: "The AI Factory is producing their tools and wiring integrations.",
  phase3: "Sanya is reviewing the deployed tenant against the client-value checklist.",
  live: "Customer is using their tool in production.",
};

const PHASE_LABEL_DESC: Record<string, string> = {
  Sign: PHASE_DESC.phase1,
  Build: PHASE_DESC.phase2,
  Audit: PHASE_DESC.phase3,
  Live: PHASE_DESC.live,
};

type PopupKind = "map" | "synopsis" | "proposal" | "schedule" | null;

export function ProductVariationPage({ niche }: { niche: string }): JSX.Element {
  const [rows, setRows] = useState<CompanyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [popup, setPopup] = useState<{ kind: PopupKind; companyId: string; companyName: string; email: string | null }>({ kind: null, companyId: "", companyName: "", email: null });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = getFactorySupabase();
      try {
        const { data: comps, error: cErr } = await sb
          .from("companies")
          .select("id, name, email")
          .eq("niche", niche);
        if (cErr) throw cErr;
        const companyIds = ((comps ?? []) as Array<{ id: string }>).map((c) => c.id);

        const { data: stages } = await sb
          .from("project_lifecycle_stage_runs")
          .select("project_id, stage_slug, updated_at")
          .in("project_id", companyIds)
          .order("updated_at", { ascending: false });

        const { data: openFlags } = await sb
          .from("customer_flags")
          .select("company_id")
          .in("company_id", companyIds)
          .eq("status", "open");

        const { data: openIssues } = await sb
          .from("tech_issues")
          .select("company_id, status")
          .in("company_id", companyIds);

        const health = await fetchAccountHealth(companyIds);
        if (cancelled) return;

        const stageByCompany: Record<string, string> = {};
        for (const s of (stages ?? []) as Array<{ project_id: string; stage_slug: string }>) {
          if (!stageByCompany[s.project_id]) stageByCompany[s.project_id] = s.stage_slug;
        }
        const flagByCompany: Record<string, number> = {};
        for (const f of (openFlags ?? []) as Array<{ company_id: string }>) {
          flagByCompany[f.company_id] = (flagByCompany[f.company_id] || 0) + 1;
        }
        const issueByCompany: Record<string, number> = {};
        for (const i of (openIssues ?? []) as Array<{ company_id: string; status: string }>) {
          if (i.company_id && !["done", "wontfix"].includes(i.status)) {
            issueByCompany[i.company_id] = (issueByCompany[i.company_id] || 0) + 1;
          }
        }

        const out: CompanyRow[] = ((comps ?? []) as Array<{ id: string; name: string; email: string | null }>).map((c) => ({
          id: c.id,
          name: c.name,
          email: c.email,
          stage_slug: stageByCompany[c.id] ?? null,
          flag_count: flagByCompany[c.id] ?? 0,
          issue_count: issueByCompany[c.id] ?? 0,
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

  const loading = rows === null && error === null;

  const openPopup = (kind: PopupKind, r: CompanyRow) => setPopup({ kind, companyId: r.id, companyName: r.name, email: r.email });
  const closePopup = () => setPopup((p) => ({ ...p, kind: null }));

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

      <section style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
        <ChartCard
          title="Phase funnel"
          whatThisIs="Count of customers in each phase of the journey for this product line."
          whatToDo="If Audit ≫ Build, you're the bottleneck. If Build ≫ Live, the Factory is."
        >
          {loading ? <SkeletonBox height={220} /> : (
            <PhaseFunnel
              data={[
                { phase: "Sign", count: phaseCounts.phase1 },
                { phase: "Build", count: phaseCounts.phase2 },
                { phase: "Audit", count: phaseCounts.phase3 },
                { phase: "Live", count: phaseCounts.live },
              ]}
              niches={[{ slug: "count", label: titleFor(niche), color: PHASE_COLOR.phase2 }]}
              descriptions={PHASE_LABEL_DESC}
            />
          )}
        </ChartCard>
        <ChartCard
          title="At-risk accounts"
          whatThisIs="Every account in this line flagged yellow or red, with the specific reason."
          whatToDo="Open the riskiest one and clear the root cause."
        >
          <AtRiskList nicheFilter={niche} maxRows={6} fallbackDept="product" />
        </ChartCard>
      </section>

      {(["phase1", "phase2", "phase3", "live"] as ProductPhase[]).map((ph) => (
        <PhaseSection key={ph} phase={ph} rows={grouped[ph]} niche={niche} onPopup={openPopup} />
      ))}

      {!loading && rows && rows.length === 0 ? (
        <div style={{ background: "white", color: "#111827", border: "1px dashed #d1d5db", borderRadius: 12, padding: 32, textAlign: "center" }}>
          <p style={{ margin: 0 }}>No customers under this product line yet.</p>
        </div>
      ) : null}

      <MapPopup open={popup.kind === "map"} onClose={closePopup} companyId={popup.companyId} companyName={popup.companyName} fullPageHref={`#product/${niche}/customer/${popup.companyId}/map`} />
      <SynopsisPopup open={popup.kind === "synopsis"} onClose={closePopup} companyId={popup.companyId} companyName={popup.companyName} fullPageHref={`#product/${niche}/customer/${popup.companyId}/synopsis`} />
      <ProposalPopup open={popup.kind === "proposal"} onClose={closePopup} companyId={popup.companyId} companyName={popup.companyName} fullPageHref={`#product/${niche}/customer/${popup.companyId}/proposal`} />
      <ScheduleCallPopup open={popup.kind === "schedule"} onClose={closePopup} companyId={popup.companyId} companyName={popup.companyName} customerEmail={popup.email} />
    </div>
  );
}

function PhaseSection({
  phase,
  rows,
  niche,
  onPopup,
}: {
  phase: ProductPhase;
  rows: CompanyRow[];
  niche: string;
  onPopup: (kind: PopupKind, r: CompanyRow) => void;
}): JSX.Element {
  return (
    <section>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: PHASE_COLOR[phase], display: "inline-block" }} />
        <h2 style={{ margin: 0, fontSize: 15 }}>{PHASE_TITLE[phase]}</h2>
        <span style={{ color: "#9ca3af", fontSize: 13 }}>({rows.length})</span>
      </div>
      <p style={{ color: "#9ca3af", fontSize: 12, margin: "0 0 8px", paddingLeft: 16 }}>{PHASE_DESC[phase]}</p>
      {rows.length === 0 ? (
        <p style={{ color: "#9ca3af", fontStyle: "italic", fontSize: 13, margin: "0 0 8px" }}>No customers in this phase.</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", background: "white", color: "#111827", border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
          <thead>
            <tr style={{ background: "#f9fafb", textAlign: "left", color: "#6b7280", fontSize: 12 }}>
              <th style={{ padding: 10 }}>Customer</th>
              <th style={{ padding: 10 }}>Status</th>
              {phase === "live" ? (
                <>
                  <th style={{ padding: 10, width: 80 }}>Health</th>
                  <th style={{ padding: 10, width: 80 }}>Issues</th>
                  <th style={{ padding: 10, width: 80 }}>Flags</th>
                </>
              ) : (
                <>
                  <th style={{ padding: 10, width: 60 }}>Flags</th>
                  <th style={{ padding: 10, width: 50 }}>Health</th>
                  <th style={{ padding: 10 }}>Quick actions</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                <td style={{ padding: 10 }}>
                  <button
                    type="button"
                    onClick={() => navigate({ dept: "product", section: niche, id: "customer", sub: r.id })}
                    style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", padding: 0, fontSize: 14, fontWeight: 500 }}
                  >
                    {r.name}
                  </button>
                </td>
                <td style={{ padding: 10, fontSize: 13 }}>{stageMeta(r.stage_slug).status_label}</td>
                {phase === "live" ? (
                  <>
                    <td style={{ padding: 10 }}>
                      <ClickCount onClick={() => navigate({ dept: "product", section: niche, id: "customer", sub: r.id })} icon={<span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 999, background: STATUS_COLOR[r.health], marginRight: 6, verticalAlign: "middle" }} />} text={healthScoreText(r.health)} />
                    </td>
                    <td style={{ padding: 10 }}>
                      <ClickCount onClick={() => navigate({ dept: "product", section: "issues" })} text={`${r.issue_count} issue${r.issue_count === 1 ? "" : "s"}`} muted={r.issue_count === 0} />
                    </td>
                    <td style={{ padding: 10 }}>
                      <ClickCount onClick={() => navigate({ dept: "product", section: niche, id: "flags" })} text={`${r.flag_count} flag${r.flag_count === 1 ? "" : "s"}`} muted={r.flag_count === 0} />
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{ padding: 10 }}>
                      {r.flag_count > 0 ? (
                        <span style={{ background: "#fee2e2", color: "#b91c1c", padding: "2px 8px", borderRadius: 999, fontSize: 12 }}>{r.flag_count}</span>
                      ) : "—"}
                    </td>
                    <td style={{ padding: 10 }}>
                      <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 999, background: STATUS_COLOR[r.health] }} />
                    </td>
                    <td style={{ padding: 10 }}>
                      <PhaseActions phase={phase} row={r} onPopup={onPopup} niche={niche} />
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function ClickCount({ onClick, text, icon, muted }: { onClick: () => void; text: string; icon?: React.ReactNode; muted?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        color: muted ? "#9ca3af" : "#2563eb",
        cursor: "pointer",
        padding: 0,
        fontSize: 13,
      }}
    >
      {icon}{text}
    </button>
  );
}

function healthScoreText(s: HealthStatus): string {
  if (s === "green") return "Green";
  if (s === "yellow") return "Yellow";
  return "Red";
}

function PhaseActions({
  phase,
  row,
  onPopup,
  niche,
}: {
  phase: ProductPhase;
  row: CompanyRow;
  onPopup: (kind: PopupKind, r: CompanyRow) => void;
  niche: string;
}): JSX.Element {
  const actionDefs: Array<{ action: PhaseAction; label: string; onClick: () => void }> = phase === "phase1"
    ? [
        { action: "map", label: "Map", onClick: () => onPopup("map", row) },
        { action: "synopsis", label: "Synopsis", onClick: () => onPopup("synopsis", row) },
        { action: "proposal", label: "Proposal", onClick: () => onPopup("proposal", row) },
        { action: "schedule_call", label: "Schedule call", onClick: () => onPopup("schedule", row) },
        { action: "contract", label: "Contract", onClick: () => navigate({ dept: "cleo", section: "command-center", id: row.id, sub: "contract" }) },
      ]
    : phase === "phase2"
    ? [
        { action: "production_link", label: "Production link", onClick: () => alert("Open production link") },
        { action: "integrations", label: "Integrations", onClick: () => navigate({ dept: "cleo", section: "customers", id: row.id, sub: "integrations" }) },
        { action: "credentials", label: "Credentials", onClick: () => alert("View credentials") },
      ]
    : phase === "phase3"
    ? [
        { action: "map", label: "Open audit", onClick: () => navigate({ dept: "product", section: niche, id: "customer", sub: row.id }) },
      ]
    : [];

  return (
    <>
      {actionDefs.map((a) => {
        const enabled = a.action === "map" && phase === "phase3" ? true : isActionEnabled(row.stage_slug, a.action);
        const prereq = !enabled ? prereqMessage(row.stage_slug, a.action) : undefined;
        return (
          <button
            key={a.label}
            type="button"
            onClick={enabled ? a.onClick : undefined}
            disabled={!enabled}
            title={prereq}
            style={{
              marginRight: 6,
              padding: "4px 10px",
              fontSize: 12,
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              background: enabled ? "white" : "#f9fafb",
              color: enabled ? "#111827" : "#9ca3af",
              cursor: enabled ? "pointer" : "not-allowed",
            }}
          >
            {a.label}
          </button>
        );
      })}
      {phase === "phase2" ? (
        <Phase2QcChip stage={row.stage_slug} />
      ) : null}
    </>
  );
}

function Phase2QcChip({ stage }: { stage: string | null }) {
  if (stage === "deployed") {
    return (
      <span style={{ marginLeft: 6, padding: "4px 10px", fontSize: 12, background: "#d1fae5", color: "#065f46", borderRadius: 6 }}>
        ✓ QC passed by Mitanshi
      </span>
    );
  }
  return (
    <span style={{ marginLeft: 6, padding: "4px 10px", fontSize: 12, background: "#fef3c7", color: "#92400e", borderRadius: 6 }}>
      QC in progress
    </span>
  );
}

function titleFor(slug: string): string {
  return slug.split("-").map((s) => s[0]?.toUpperCase() + s.slice(1)).join(" ");
}
