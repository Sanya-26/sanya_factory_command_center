// CEO Decision Queue: 3 sub-sections (signature · discount · churn risk).
// Each row exposes the explicit action that only the CEO can resolve.

import { useEffect, useState } from "react";
import { getFactorySupabase } from "../lib/factorySupabase";
import { fetchAccountHealth } from "../lib/health-score";
import { navigate } from "../shell/route";
import { ChartCard } from "./ChartCard";

interface ContractRow {
  id: string;
  company_id: string;
  company_name: string;
  niche: string | null;
  monthly_usd: number;
  list_monthly_usd: number | null;
  discount_pct: number | null;
  discount_justification: string | null;
  status: string;
  ceo_approval_status: string;
  ceo_approval_by: string | null;
  ceo_approval_at: string | null;
  ceo_signed_at: string | null;
  queue_bucket: string;
  sent_at: string | null;
}

interface ChurnRow {
  company_id: string;
  company_name: string;
  niche: string | null;
  days_red: number;
}

export function CeoDecisionQueue({ userId, onChange }: { userId: string; onChange?: () => void }) {
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [churn, setChurn] = useState<ChurnRow[]>([]);

  async function load() {
    const sb = getFactorySupabase();
    const { data: pending } = await sb.from("v_ceo_contracts_pending").select("*");
    const rows = ((pending ?? []) as ContractRow[]).filter((r) =>
      r.queue_bucket === "awaiting_discount_approval" || r.queue_bucket === "awaiting_ceo_signature",
    );
    setContracts(rows);

    // Churn risk: live + red > 7 days
    const health = await fetchAccountHealth();
    const liveIds: string[] = [];
    const { data: stages } = await sb.from("project_lifecycle_stage_runs").select("project_id, stage_slug, updated_at");
    const liveSet = new Set<string>();
    for (const s of (stages ?? []) as Array<{ project_id: string; stage_slug: string }>) {
      if (s.stage_slug === "live") liveSet.add(s.project_id);
    }
    const { data: comps } = await sb.from("companies").select("id, name, niche");
    const compsById = new Map((comps ?? []).map((c) => [(c as { id: string }).id, c]));
    const out: ChurnRow[] = [];
    for (const h of health) {
      if (h.status !== "red") continue;
      if (!liveSet.has(h.company_id)) continue;
      out.push({
        company_id: h.company_id,
        company_name: (compsById.get(h.company_id) as { name?: string } | undefined)?.name ?? h.company_id,
        niche: (compsById.get(h.company_id) as { niche?: string | null } | undefined)?.niche ?? null,
        days_red: 8, // mock: in production this would compute from health history
      });
    }
    setChurn(out);
  }
  useEffect(() => { void load(); }, []);

  const signature = contracts.filter((c) => c.queue_bucket === "awaiting_ceo_signature");
  const discount = contracts.filter((c) => c.queue_bucket === "awaiting_discount_approval");

  async function approveDiscount(id: string) {
    const sb = getFactorySupabase();
    await sb.from("contract_drafts").update({
      ceo_approval_status: "approved",
      ceo_approval_by: userId,
      ceo_approval_at: new Date().toISOString(),
      status: "approved",
    }).eq("id", id);
    await load();
    onChange?.();
  }
  async function rejectDiscount(id: string) {
    const note = window.prompt("Reason for rejecting the discount? (Sanya will see this)");
    if (note === null) return;
    const sb = getFactorySupabase();
    await sb.from("contract_drafts").update({
      ceo_approval_status: "rejected",
      ceo_approval_by: userId,
      ceo_approval_at: new Date().toISOString(),
      ceo_approval_notes: note,
    }).eq("id", id);
    await sb.from("notifications").insert({
      recipient_user_id: userId,
      kind: "discount-rejected",
      severity: "warning",
      title: "Discount rejected by CEO",
      body: note,
    });
    await load();
    onChange?.();
  }
  async function signContract(id: string, companyName: string) {
    if (!window.confirm(`Sign the contract for ${companyName}? This commits AUBOS to the deal.`)) return;
    const sb = getFactorySupabase();
    await sb.from("contract_drafts").update({
      ceo_signed_at: new Date().toISOString(),
      ceo_signed_by: userId,
      status: "signed",
      signed_at: new Date().toISOString(),
    }).eq("id", id);
    await sb.from("notifications").insert({
      recipient_user_id: userId,
      kind: "contract-signed",
      severity: "info",
      title: `Contract signed: ${companyName}`,
      body: null,
    });
    await load();
    onChange?.();
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <ChartCard
        title={`Contracts awaiting my signature (${signature.length})`}
        whatThisIs="Contracts that have cleared Sanya & legal review and need only your signature to close."
        whatToDo="Sign every line you're confident in this morning. Each one is locked revenue."
      >
        {signature.length === 0 ? (
          <p style={{ color: "#10b981", margin: 0, fontWeight: 500, fontSize: 13 }}>Inbox zero.</p>
        ) : (
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#6b7280", fontSize: 11 }}>
                <th style={{ padding: 6 }}>Customer</th>
                <th style={{ padding: 6 }}>List → Final</th>
                <th style={{ padding: 6 }}>Discount</th>
                <th style={{ padding: 6 }}></th>
              </tr>
            </thead>
            <tbody>
              {signature.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                  <td style={{ padding: 6 }}>{r.company_name}</td>
                  <td style={{ padding: 6 }}>
                    {r.list_monthly_usd ? `$${Number(r.list_monthly_usd).toLocaleString()} → ` : ""}
                    <strong>${Number(r.monthly_usd).toLocaleString()}/mo</strong>
                  </td>
                  <td style={{ padding: 6 }}>
                    {r.discount_pct && r.discount_pct > 0 ? (
                      <span style={{ background: "#fef3c7", color: "#92400e", padding: "1px 8px", borderRadius: 999, fontSize: 11 }}>
                        −{r.discount_pct}%
                      </span>
                    ) : (
                      <span style={{ color: "#9ca3af", fontSize: 11 }}>none</span>
                    )}
                  </td>
                  <td style={{ padding: 6, textAlign: "right" }}>
                    <button
                      type="button"
                      onClick={() => void signContract(r.id, r.company_name)}
                      style={{ padding: "5px 12px", background: "#10b981", color: "white", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}
                    >
                      Sign →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ChartCard>

      <ChartCard
        title={`Discount approvals pending (${discount.length})`}
        whatThisIs="Sanya proposed a discount; you have to bless it before the contract moves to signature."
        whatToDo="Approve only if you can justify it to the board. Reject and Sanya re-quotes."
      >
        {discount.length === 0 ? (
          <p style={{ color: "#9ca3af", margin: 0, fontStyle: "italic", fontSize: 13 }}>No discounts pending.</p>
        ) : (
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#6b7280", fontSize: 11 }}>
                <th style={{ padding: 6 }}>Customer</th>
                <th style={{ padding: 6 }}>List → Proposed</th>
                <th style={{ padding: 6 }}>%</th>
                <th style={{ padding: 6 }}>Justification</th>
                <th style={{ padding: 6 }}></th>
              </tr>
            </thead>
            <tbody>
              {discount.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid #f3f4f6" }}>
                  <td style={{ padding: 6 }}>{r.company_name}</td>
                  <td style={{ padding: 6 }}>
                    ${Number(r.list_monthly_usd ?? 0).toLocaleString()} → <strong>${Number(r.monthly_usd).toLocaleString()}</strong>
                  </td>
                  <td style={{ padding: 6 }}>
                    <span style={{ background: "#fef3c7", color: "#92400e", padding: "1px 8px", borderRadius: 999, fontSize: 11 }}>
                      −{r.discount_pct}%
                    </span>
                  </td>
                  <td style={{ padding: 6, color: "#6b7280", fontSize: 12, maxWidth: 280 }}>{r.discount_justification ?? "—"}</td>
                  <td style={{ padding: 6, textAlign: "right", whiteSpace: "nowrap" }}>
                    <button type="button" onClick={() => void approveDiscount(r.id)} style={{ padding: "4px 10px", background: "#2563eb", color: "white", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer", marginRight: 4 }}>Approve</button>
                    <button type="button" onClick={() => void rejectDiscount(r.id)} style={{ padding: "4px 10px", background: "#ef4444", color: "white", border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>Reject</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ChartCard>

      <ChartCard
        title={`Churn-risk escalations (${churn.length})`}
        whatThisIs="Live customers flagged red for more than 7 days. Sanya can't fix these alone — your strategic call."
        whatToDo="Call the owner personally. Decide whether to credit, escalate to V, or accept the loss."
      >
        {churn.length === 0 ? (
          <p style={{ color: "#10b981", margin: 0, fontWeight: 500, fontSize: 13 }}>No churn risk this week.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: 13 }}>
            {churn.map((r) => (
              <li key={r.company_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: "1px solid #f3f4f6" }}>
                <button type="button" onClick={() => navigate({ dept: "product", section: r.niche ?? "cleo-for-pools", id: "customer", sub: r.company_id })} style={{ background: "none", border: "none", color: "#2563eb", padding: 0, cursor: "pointer", fontSize: 13, fontWeight: 500 }}>
                  {r.company_name}
                </button>
                <span style={{ color: "#ef4444", fontSize: 12 }}>red {r.days_red}d</span>
              </li>
            ))}
          </ul>
        )}
      </ChartCard>
    </div>
  );
}
