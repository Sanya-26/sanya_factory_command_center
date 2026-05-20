// Product · Per-customer detail with 3-phase panel + audit decision buttons.

import { useEffect, useState } from "react";
import { getFactorySupabase } from "../../lib/factorySupabase";
import { navigate } from "../../shell/route";
import { labelFor, phaseFor } from "../../lib/stage-labels";
import { STATUS_COLOR, type HealthStatus } from "../../lib/health-score";

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
  const [decisionState, setDecisionState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [decisionError, setDecisionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = getFactorySupabase();
      const [{ data: c }, { data: stages }, { data: hRows }, { data: chk }] = await Promise.all([
        sb.from("companies").select("id, name, email, niche").eq("id", companyId).maybeSingle(),
        sb.from("project_lifecycle_stage_runs").select("stage_slug, status, started_at, completed_at").eq("project_id", companyId).order("updated_at", { ascending: false }).limit(1),
        sb.from("v_account_health").select("status").eq("company_id", companyId).maybeSingle(),
        sb.from("audit_checklists").select("id, items").eq("company_id", companyId).eq("is_current", true).maybeSingle(),
      ]);
      if (cancelled) return;
      setCompany((c ?? null) as Company | null);
      setStage(((stages ?? [])[0] ?? null) as StageRun | null);
      if (hRows) setHealth((hRows as { status: HealthStatus }).status);
      if (chk) setChecklist(chk as { id: string; items: ChecklistItem[] });
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  const currentPhase = phaseFor(stage?.stage_slug);

  return (
    <div style={{ padding: 24, display: "grid", gap: 16, maxWidth: 960 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button type="button" className="btn-ghost" onClick={() => navigate({ dept: "product", section: niche })}>
          ← Back
        </button>
        <h1 style={{ margin: 0 }}>{company?.name ?? "—"}</h1>
        <span style={{ background: "#f3f4f6", padding: "2px 8px", borderRadius: 4, fontSize: 12 }}>
          {labelFor(stage?.stage_slug)}
        </span>
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 999, background: STATUS_COLOR[health] }} />
          Health
        </span>
      </header>

      <Panel
        title="Phase 1 — Map → Contract Signed"
        active={currentPhase === "phase1"}
      >
        <ActionRow label="Map" onClick={() => alert("Map viewer (renders onboarding_canvas_states.canvas_json) — wire next")} />
        <ActionRow label="Synopsis" onClick={() => alert("Synopsis viewer (proposal_artifacts.kind='synopsis') — wire next")} />
        <ActionRow
          label="Proposal"
          onClick={() => alert("Proposal viewer + Send via email")}
          secondaryLabel="Send proposal"
          onSecondary={() => sendEmail({ companyId, template: "proposal_send", to: company?.email })}
        />
        <ActionRow
          label="Contract"
          onClick={() => navigate({ dept: "cleo", section: "command-center", id: companyId, sub: "contract" })}
          secondaryLabel="Send contract"
          onSecondary={() => sendEmail({ companyId, template: "contract_send", to: company?.email })}
        />
        <ActionRow
          label="Schedule call"
          secondaryLabel="Send invite"
          onSecondary={() => sendEmail({ companyId, template: "schedule_call", to: company?.email })}
        />
      </Panel>

      <Panel title="Phase 2 — Factory producing → Integrations" active={currentPhase === "phase2"}>
        <ActionRow label="Production link" onClick={() => alert("opens tenant_runtimes.tenant_customer_ui_url")} />
        <ActionRow label="Integrations list" onClick={() => navigate({ dept: "cleo", section: "customers", id: companyId, sub: "integrations" })} />
        <ActionRow
          label="Account credentials"
          onClick={() => alert("View credentials (from customer_secrets / tenant_runtimes)")}
          secondaryLabel="Email credentials"
          onSecondary={() => sendEmail({ companyId, template: "credentials_send", to: company?.email })}
        />
        <ActionRow label="QC sign-off" onClick={() => alert("Reads cleo_self_tests for tenant — signer + timestamp")} />
      </Panel>

      <Panel title="Phase 3 — Audit (Sanya)" active={currentPhase === "phase3"}>
        {!checklist ? (
          <p style={{ color: "#9ca3af", fontStyle: "italic" }}>No checklist generated yet. Reaches this phase once tenant deploys.</p>
        ) : (
          <Checklist
            checklist={checklist}
            onChange={(items) => setChecklist({ ...checklist, items })}
          />
        )}
        <DecisionButtons
          companyId={companyId}
          userId={userId}
          state={decisionState}
          error={decisionError}
          onState={(s, e) => { setDecisionState(s); setDecisionError(e ?? null); }}
        />
      </Panel>

      <Panel title="Live" active={currentPhase === "live"}>
        <p style={{ color: "#6b7280", margin: 0 }}>
          Health: <strong style={{ color: STATUS_COLOR[health] }}>{health.toUpperCase()}</strong>. View flags, issues, latest audit findings.
        </p>
        <ActionRow label="Open issues" onClick={() => navigate({ dept: "product", section: "issues" })} />
        <ActionRow label="View flags" onClick={() => navigate({ dept: "product", section: niche, id: "flags" })} />
      </Panel>
    </div>
  );
}

function Panel({ title, active, children }: { title: string; active: boolean; children: React.ReactNode }) {
  return (
    <section style={{
      background: "white",
      border: "1px solid #e5e7eb",
      borderLeft: active ? "4px solid #2563eb" : "1px solid #e5e7eb",
      borderRadius: 8,
      padding: 16,
    }}>
      <h2 style={{ margin: 0, marginBottom: 12, fontSize: 16 }}>{title}</h2>
      <div style={{ display: "grid", gap: 8 }}>{children}</div>
    </section>
  );
}

function ActionRow({
  label, onClick, secondaryLabel, onSecondary,
}: {
  label: string;
  onClick?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #f3f4f6", paddingBottom: 8 }}>
      <button type="button" onClick={onClick} disabled={!onClick} style={{ background: "none", border: "none", color: onClick ? "#2563eb" : "#9ca3af", cursor: onClick ? "pointer" : "default", padding: 0, fontSize: 14 }}>
        {label}
      </button>
      {onSecondary ? (
        <button type="button" onClick={onSecondary} style={{ padding: "4px 10px", fontSize: 12, border: "1px solid #e5e7eb", borderRadius: 6, background: "white", cursor: "pointer" }}>
          {secondaryLabel}
        </button>
      ) : null}
    </div>
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
  return (
    <div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ textAlign: "left", color: "#6b7280" }}>
            <th style={{ padding: 6 }}>Check</th>
            <th style={{ padding: 6 }}>Expected</th>
            <th style={{ padding: 6, width: 110 }}>Status</th>
            <th style={{ padding: 6 }}>Note</th>
          </tr>
        </thead>
        <tbody>
          {checklist.items.map((it, i) => (
            <tr key={it.id ?? i} style={{ borderTop: "1px solid #f3f4f6" }}>
              <td style={{ padding: 6 }}>{it.label}</td>
              <td style={{ padding: 6, color: "#6b7280" }}>{it.expected ?? "—"}</td>
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
                  style={{ width: "100%" }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn" onClick={() => void save()} style={{ marginTop: 8 }}>
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
      // For 'approve', advance lifecycle stage_run to 'live'.
      if (decision === "approve") {
        await sb
          .from("project_lifecycle_stage_runs")
          .update({ status: "completed", completed_at: new Date().toISOString() })
          .eq("project_id", companyId)
          .eq("stage_slug", "sanya-audit");
      }
      // For 'bugs' or 'disapprove', insert notifications.
      if (decision === "bugs") {
        await sb.from("notifications").insert({
          recipient_user_id: userId,
          kind: "audit-bugs-high-priority",
          severity: "warning",
          title: "Sanya flagged bugs — high priority",
          body: notes ?? "",
          related_company_id: companyId,
        });
      }
      if (decision === "disapprove") {
        await sb.from("notifications").insert({
          recipient_user_id: userId,
          kind: "audit-disapproved",
          severity: "error",
          title: "Sanya disapproved — fundamental issue",
          body: notes ?? "",
          related_company_id: companyId,
        });
      }
      onState("saved");
    } catch (e) {
      onState("error", e instanceof Error ? e.message : "Unknown error");
    }
  }
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
      <button
        type="button"
        onClick={() => void decide("approve")}
        disabled={state === "saving"}
        style={{ padding: "6px 14px", background: "#10b981", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}
      >
        ✓ Approve
      </button>
      <button
        type="button"
        onClick={() => {
          const n = window.prompt("Describe the bugs (will assign to tech team via tech_issues):");
          if (n !== null) void decide("bugs", n);
        }}
        disabled={state === "saving"}
        style={{ padding: "6px 14px", background: "#f59e0b", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}
      >
        ✕ Bugs
      </button>
      <button
        type="button"
        onClick={() => {
          const n = window.prompt("Explain the fundamental issue (notifies CEO + CTO):");
          if (n !== null) void decide("disapprove", n);
        }}
        disabled={state === "saving"}
        style={{ padding: "6px 14px", background: "#ef4444", color: "white", border: "none", borderRadius: 6, cursor: "pointer" }}
      >
        ⌫ Disapprove
      </button>
      <span style={{ color: state === "error" ? "#ef4444" : "#10b981", fontSize: 13, marginLeft: 8, alignSelf: "center" }}>
        {state === "saved" ? "saved" : state === "error" ? error : state === "saving" ? "saving…" : ""}
      </span>
    </div>
  );
}

async function sendEmail({
  companyId,
  template,
  to,
}: {
  companyId: string;
  template: string;
  to: string | null | undefined;
}) {
  if (!to) {
    alert("No email on file for this company.");
    return;
  }
  if (!window.confirm(`Send "${template}" email to ${to}?`)) return;
  const sb = getFactorySupabase();
  await sb.from("outbound_emails").insert({
    company_id: companyId,
    recipient_email: to,
    template,
    payload: {},
    status: "queued",
  });
  alert(`Queued. Edge function emails/send will pick it up.`);
}
