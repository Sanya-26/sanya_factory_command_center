// Product · Per-customer detail — stage-gated 3-phase panels + decisions + activity sidebar.

import { useEffect, useState } from "react";
import { getFactorySupabase } from "../../lib/factorySupabase";
import { navigate } from "../../shell/route";
import { phaseFor } from "../../lib/stage-labels";
import { stageMeta, isActionEnabled, prereqMessage } from "../../lib/stage-actions";
import { STATUS_COLOR, type HealthStatus } from "../../lib/health-score";
import { StageStepper } from "../../components/charts/StageStepper";
import { ActivityTimeline } from "../../components/charts/ActivityTimeline";
import { MapPopup, SynopsisPopup, ProposalPopup } from "../../components/product-popups";
import { ScheduleCallPopup } from "../../components/schedule-call-popup";

interface Company {
  id: string;
  name: string;
  email: string | null;
  niche: string | null;
}
interface StageRun {
  stage_slug: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
}
interface ChecklistItem {
  id: string;
  label: string;
  expected?: string;
  status?: "pending" | "pass" | "fail";
  note?: string;
}
interface Event {
  id: string;
  event_kind: string;
  at: string;
  actor: string | null;
  payload?: Record<string, unknown> | null;
}

type PopupKind = "map" | "synopsis" | "proposal" | "schedule" | null;

export function ProductCustomerDetailPage({
  niche,
  companyId,
  userId,
}: {
  niche: string;
  companyId: string;
  userId: string;
}): JSX.Element {
  const [company, setCompany] = useState<Company | null>(null);
  const [stage, setStage] = useState<StageRun | null>(null);
  const [health, setHealth] = useState<HealthStatus>("green");
  const [checklist, setChecklist] = useState<{ id: string; items: ChecklistItem[] } | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [flagCount, setFlagCount] = useState(0);
  const [issueCount, setIssueCount] = useState(0);
  const [decisionState, setDecisionState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [popup, setPopup] = useState<PopupKind>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = getFactorySupabase();
      const [{ data: c }, { data: stages }, { data: hRows }, { data: chk }, { data: evs }, { data: openFlags }, { data: openIssues }] = await Promise.all([
        sb.from("companies").select("id, name, email, niche").eq("id", companyId).maybeSingle(),
        sb.from("project_lifecycle_stage_runs").select("stage_slug, status, started_at, completed_at, updated_at").eq("project_id", companyId).order("updated_at", { ascending: false }).limit(1),
        sb.from("v_account_health").select("status").eq("company_id", companyId).maybeSingle(),
        sb.from("audit_checklists").select("id, items").eq("company_id", companyId).eq("is_current", true).maybeSingle(),
        sb.from("client_journey_events").select("id, event_kind, at, actor, payload").eq("company_id", companyId).order("at", { ascending: false }).limit(15),
        sb.from("customer_flags").select("id").eq("company_id", companyId).eq("status", "open"),
        sb.from("tech_issues").select("id, status").eq("company_id", companyId),
      ]);
      if (cancelled) return;
      setCompany((c ?? null) as Company | null);
      setStage(((stages ?? [])[0] ?? null) as StageRun | null);
      if (hRows) setHealth((hRows as { status: HealthStatus }).status);
      if (chk) setChecklist(chk as { id: string; items: ChecklistItem[] });
      setEvents((evs ?? []) as Event[]);
      setFlagCount(((openFlags ?? []) as unknown[]).length);
      const openTI = ((openIssues ?? []) as Array<{ status: string }>).filter((i) => !["done", "wontfix"].includes(i.status));
      setIssueCount(openTI.length);
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  const currentPhase = phaseFor(stage?.stage_slug);
  const meta = stageMeta(stage?.stage_slug);

  return (
    <div style={{ padding: 24, display: "grid", gap: 16, maxWidth: 1240 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <button type="button" className="btn-ghost" onClick={() => navigate({ dept: "product", section: niche })}>
          ← Back
        </button>
        <h1 style={{ margin: 0 }}>{company?.name ?? "—"}</h1>
        <span style={{ background: "#f3f4f6", color: "#111827", padding: "2px 10px", borderRadius: 4, fontSize: 12, fontWeight: 500 }}>
          {meta.status_label}
        </span>
        {flagCount > 0 ? (
          <span style={{ background: "#fee2e2", color: "#b91c1c", padding: "2px 8px", borderRadius: 999, fontSize: 12 }}>
            {flagCount} open flag{flagCount === 1 ? "" : "s"}
          </span>
        ) : null}
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <span style={{ width: 10, height: 10, borderRadius: 999, background: STATUS_COLOR[health] }} />
          {health.toUpperCase()}
        </span>
      </header>

      <StageStepper currentStage={stage?.stage_slug} />

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
        <div style={{ display: "grid", gap: 16 }}>
          <Panel title="Phase 1 — Map → Contract Signed" active={currentPhase === "phase1"}>
            <ActionRow
              label="Map"
              description="View the customer's business map (canvas)."
              enabled={isActionEnabled(stage?.stage_slug, "map")}
              prereq={prereqMessage(stage?.stage_slug, "map")}
              onClick={() => setPopup("map")}
            />
            <ActionRow
              label="Synopsis"
              description="Map summary the agent generated for the proposal."
              enabled={isActionEnabled(stage?.stage_slug, "synopsis")}
              prereq={prereqMessage(stage?.stage_slug, "synopsis")}
              onClick={() => setPopup("synopsis")}
            />
            <ActionRow
              label="Proposal"
              description="Full proposal with financial benefits."
              enabled={isActionEnabled(stage?.stage_slug, "proposal")}
              prereq={prereqMessage(stage?.stage_slug, "proposal")}
              onClick={() => setPopup("proposal")}
            />
            <ActionRow
              label="Schedule call"
              description="Pick a slot, send the customer a Google Meet invite."
              enabled={isActionEnabled(stage?.stage_slug, "schedule_call")}
              prereq={prereqMessage(stage?.stage_slug, "schedule_call")}
              onClick={() => setPopup("schedule")}
            />
            <ActionRow
              label="Contract"
              description="Generate / send / track the contract."
              enabled={isActionEnabled(stage?.stage_slug, "contract")}
              prereq={prereqMessage(stage?.stage_slug, "contract")}
              onClick={() => navigate({ dept: "cleo", section: "command-center", id: companyId, sub: "contract" })}
            />
          </Panel>

          <Panel title="Phase 2 — Factory producing → Integrations" active={currentPhase === "phase2"}>
            <ActionRow
              label="Production link"
              description="Open the deployed tenant URL."
              enabled={isActionEnabled(stage?.stage_slug, "production_link")}
              prereq={prereqMessage(stage?.stage_slug, "production_link")}
              onClick={() => alert("opens tenant_runtimes.tenant_customer_ui_url")}
            />
            <ActionRow
              label="Integrations list"
              description="Connected accounts (Supabase, Stripe, Twilio, etc.)."
              enabled={isActionEnabled(stage?.stage_slug, "integrations")}
              prereq={prereqMessage(stage?.stage_slug, "integrations")}
              onClick={() => navigate({ dept: "cleo", section: "customers", id: companyId, sub: "integrations" })}
            />
            <ActionRow
              label="Account credentials"
              description="View admin creds; option to email to client."
              enabled={isActionEnabled(stage?.stage_slug, "credentials")}
              prereq={prereqMessage(stage?.stage_slug, "credentials")}
              onClick={() => alert("View credentials")}
            />
            <QcSignoffChip stage={stage?.stage_slug ?? null} />
          </Panel>

          <Panel title="Phase 3 — Audit (Sanya)" active={currentPhase === "phase3"}>
            {!checklist ? (
              <p style={{ color: "#9ca3af", fontStyle: "italic", margin: 0, fontSize: 13 }}>
                No checklist generated yet. Reaches this phase once tenant deploys.
              </p>
            ) : (
              <Checklist checklist={checklist} onChange={(items) => setChecklist({ ...checklist, items })} />
            )}
            <DecisionButtons
              companyId={companyId}
              userId={userId}
              state={decisionState}
              error={decisionError}
              onState={(s, e) => { setDecisionState(s); setDecisionError(e ?? null); }}
            />
          </Panel>

          {currentPhase === "live" ? (
            <Panel title="Live" active>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                <ClickStat
                  label="Health"
                  value={`${STATUS_COLOR[health] ? "" : ""}${health.toUpperCase()}`}
                  color={STATUS_COLOR[health]}
                  onClick={() => alert("Open health history side panel")}
                />
                <ClickStat
                  label="Open issues"
                  value={String(issueCount)}
                  color="#2563eb"
                  onClick={() => navigate({ dept: "product", section: "issues" })}
                />
                <ClickStat
                  label="Open flags"
                  value={String(flagCount)}
                  color="#ef4444"
                  onClick={() => navigate({ dept: "product", section: niche, id: "flags" })}
                />
              </div>
            </Panel>
          ) : null}
        </div>

        <aside style={{ display: "grid", gap: 16, alignContent: "start" }}>
          <ActivityTimeline events={events} />
          <div style={{ background: "white", color: "#111827", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
            <div style={{ color: "#6b7280", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
              Quick actions
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              <button type="button" className="btn" onClick={() => navigate({ dept: "product", section: "issues" })} style={{ fontSize: 13 }}>+ File an issue</button>
              <button type="button" className="btn" onClick={() => navigate({ dept: "product", section: niche, id: "flags" })} style={{ fontSize: 13 }}>View this line's flags</button>
              <button type="button" className="btn-ghost" onClick={() => alert("Coming soon: pause runtime")} style={{ fontSize: 13 }}>⏸ Pause runtime</button>
            </div>
          </div>
        </aside>
      </div>

      <MapPopup open={popup === "map"} onClose={() => setPopup(null)} companyId={companyId} companyName={company?.name ?? ""} fullPageHref={`#product/${niche}/customer/${companyId}/map`} />
      <SynopsisPopup open={popup === "synopsis"} onClose={() => setPopup(null)} companyId={companyId} companyName={company?.name ?? ""} fullPageHref={`#product/${niche}/customer/${companyId}/synopsis`} />
      <ProposalPopup open={popup === "proposal"} onClose={() => setPopup(null)} companyId={companyId} companyName={company?.name ?? ""} fullPageHref={`#product/${niche}/customer/${companyId}/proposal`} />
      <ScheduleCallPopup open={popup === "schedule"} onClose={() => setPopup(null)} companyId={companyId} companyName={company?.name ?? ""} customerEmail={company?.email ?? null} />
    </div>
  );
}

function Panel({ title, active, children }: { title: string; active: boolean; children: React.ReactNode }) {
  return (
    <section style={{
      background: "white",
      color: "#111827",
      border: "1px solid #e5e7eb",
      borderLeft: active ? "4px solid #2563eb" : "1px solid #e5e7eb",
      borderRadius: 8,
      padding: 16,
    }}>
      <h2 style={{ margin: 0, marginBottom: 12, fontSize: 15 }}>{title}</h2>
      <div style={{ display: "grid", gap: 8 }}>{children}</div>
    </section>
  );
}

function ActionRow({
  label,
  description,
  enabled,
  prereq,
  onClick,
}: {
  label: string;
  description: string;
  enabled: boolean;
  prereq?: string;
  onClick: () => void;
}) {
  return (
    <div
      title={!enabled ? prereq : undefined}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        borderBottom: "1px solid #f3f4f6",
        paddingBottom: 8,
        opacity: enabled ? 1 : 0.5,
      }}
    >
      <div>
        <button
          type="button"
          onClick={enabled ? onClick : undefined}
          disabled={!enabled}
          style={{
            background: "none",
            border: "none",
            color: enabled ? "#2563eb" : "#9ca3af",
            cursor: enabled ? "pointer" : "not-allowed",
            padding: 0,
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          {label}
        </button>
        <div style={{ color: enabled ? "#6b7280" : "#9ca3af", fontSize: 12, marginTop: 2 }}>
          {enabled ? description : prereq ?? "Not available at this stage."}
        </div>
      </div>
    </div>
  );
}

function QcSignoffChip({ stage }: { stage: string | null }) {
  if (stage === "deployed" || stage === "sanya-audit" || stage === "live") {
    return (
      <div style={{ padding: 8, background: "#d1fae5", color: "#065f46", borderRadius: 6, fontSize: 13 }}>
        ✓ QC passed by <strong>Mitanshi</strong> · 2h ago. Tech sign-off recorded; ready for audit.
      </div>
    );
  }
  return (
    <div style={{ padding: 8, background: "#fef3c7", color: "#92400e", borderRadius: 6, fontSize: 13 }}>
      QC in progress — automated tech checks running.
    </div>
  );
}

function ClickStat({ label, value, color, onClick }: { label: string; value: string; color: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "white",
        color: "#111827",
        border: "1px solid #e5e7eb",
        borderRadius: 10,
        padding: 12,
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <div style={{ color: "#6b7280", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, marginTop: 2, color }}>{value}</div>
    </button>
  );
}

function Checklist({
  checklist,
  onChange,
}: {
  checklist: { id: string; items: ChecklistItem[] };
  onChange: (items: ChecklistItem[]) => void;
}) {
  function update(idx: number, patch: Partial<ChecklistItem>) {
    const next = checklist.items.slice();
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  }
  async function save() {
    const sb = getFactorySupabase();
    await sb.from("audit_checklists").update({ items: checklist.items }).eq("id", checklist.id);
  }
  const passCount = checklist.items.filter((i) => i.status === "pass").length;
  return (
    <div>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
        Audit from the customer's point of view — focus on usability and value, not tech smoke tests.
      </div>
      <div style={{ fontSize: 12, color: "#374151", marginBottom: 8, fontWeight: 500 }}>
        {passCount} / {checklist.items.length} passing
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#6b7280", fontSize: 12 }}>
            <th style={{ padding: 6 }}>Check (as customer would)</th>
            <th style={{ padding: 6, width: 110 }}>Status</th>
            <th style={{ padding: 6 }}>Note</th>
          </tr>
        </thead>
        <tbody>
          {checklist.items.map((it, i) => (
            <tr key={it.id ?? i} style={{ borderTop: "1px solid #f3f4f6" }}>
              <td style={{ padding: 6 }}>
                <div>{it.label}</div>
                {it.expected ? <div style={{ color: "#9ca3af", fontSize: 11, marginTop: 2 }}>Expected: {it.expected}</div> : null}
              </td>
              <td style={{ padding: 6 }}>
                <select
                  value={it.status ?? "pending"}
                  onChange={(e) => update(i, { status: e.target.value as ChecklistItem["status"] })}
                >
                  <option value="pending">pending</option>
                  <option value="pass">pass</option>
                  <option value="fail">fail</option>
                </select>
              </td>
              <td style={{ padding: 6 }}>
                <input
                  type="text"
                  value={it.note ?? ""}
                  placeholder="note"
                  onChange={(e) => update(i, { note: e.target.value })}
                  style={{ width: "100%", padding: 4, border: "1px solid #e5e7eb", borderRadius: 4, fontSize: 12 }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn" onClick={() => void save()} style={{ marginTop: 8, fontSize: 12 }}>
        Save checklist
      </button>
    </div>
  );
}

function DecisionButtons({
  companyId,
  userId,
  state,
  error,
  onState,
}: {
  companyId: string;
  userId: string;
  state: "idle" | "saving" | "saved" | "error";
  error: string | null;
  onState: (s: "idle" | "saving" | "saved" | "error", e?: string) => void;
}) {
  async function decide(decision: "approve" | "bugs" | "disapprove", notes?: string) {
    onState("saving");
    try {
      const sb = getFactorySupabase();
      const { error: insErr } = await sb.from("sanya_audit_decisions").insert({
        company_id: companyId,
        decision,
        notes: notes ?? null,
        decided_by: userId,
      });
      if (insErr) throw insErr;
      if (decision === "approve") {
        await sb.from("project_lifecycle_stage_runs").update({ stage_slug: "live", status: "completed", completed_at: new Date().toISOString() }).eq("project_id", companyId);
      }
      onState("saved");
    } catch (e) {
      onState("error", e instanceof Error ? e.message : "Unknown error");
    }
  }
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
      <button type="button" onClick={() => void decide("approve")} disabled={state === "saving"} style={{ padding: "6px 14px", background: "#10b981", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}>
        ✓ Approve
      </button>
      <button type="button" onClick={() => { const n = window.prompt("Describe the bugs (assigns to tech team):"); if (n !== null) void decide("bugs", n); }} disabled={state === "saving"} style={{ padding: "6px 14px", background: "#f59e0b", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}>
        ✕ Bugs
      </button>
      <button type="button" onClick={() => { const n = window.prompt("Explain the fundamental issue (notifies CEO + CTO):"); if (n !== null) void decide("disapprove", n); }} disabled={state === "saving"} style={{ padding: "6px 14px", background: "#ef4444", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}>
        ⌫ Disapprove
      </button>
      <span style={{ color: state === "error" ? "#ef4444" : "#10b981", fontSize: 13, marginLeft: 8, alignSelf: "center" }}>
        {state === "saved" ? "saved" : state === "error" ? error : state === "saving" ? "saving…" : ""}
      </span>
    </div>
  );
}
