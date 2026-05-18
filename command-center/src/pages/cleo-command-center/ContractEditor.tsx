// ContractEditor.tsx — Phase 3Q · Ops-side editor for the generated contract.
//
// Reads contract_drafts row by company_id. Lets ops:
//   • adjust monthly_usd (custom-tier negotiation)
//   • toggle individual clauses
//   • rich-text edit the contract_md (with a live HTML preview)
//   • approve → status='approved' (ready for e-sign)
//   • send → triggers tools/esign integration (placeholder hooked in 3Q's
//     backend integration spec). For now this UI just flips status='sent'.

import { useCallback, useEffect, useMemo, useState } from "react";
import { getFactorySupabase } from "../../lib/factorySupabase";

interface Clause {
  id: string;
  label: string;
  body_md: string;
  enabled: boolean;
  jurisdiction_only?: string[]; // e.g. ['EU','UK']
}

interface ContractRow {
  id: string;
  company_id: string;
  build_run_id: string | null;
  tenant_slug: string | null;
  monthly_usd: number;
  tier_slug: string | null;
  contract_md: string;
  clauses: Clause[];
  jurisdiction: string | null;
  status: "draft" | "ops-review" | "approved" | "sent" | "signed" | "rejected" | "archived";
  reviewed_at: string | null;
  sent_at: string | null;
  signed_at: string | null;
  signature_url: string | null;
  cost_usd: number | null;
  generated_at: string;
  updated_at: string;
}

interface Company {
  id: string;
  name: string;
}

export function ContractEditor({
  companyId,
  onBack,
}: {
  companyId: string;
  onBack: () => void;
}): JSX.Element {
  const [company, setCompany] = useState<Company | null>(null);
  const [contract, setContract] = useState<ContractRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const sb = getFactorySupabase();
    const [{ data: c }, { data: d, error: dErr }] = await Promise.all([
      sb.from("companies").select("id, name").eq("id", companyId).maybeSingle(),
      sb
        .from("contract_drafts")
        .select(
          "id, company_id, build_run_id, tenant_slug, monthly_usd, tier_slug, contract_md, clauses, jurisdiction, status, reviewed_at, sent_at, signed_at, signature_url, cost_usd, generated_at, updated_at",
        )
        .eq("company_id", companyId)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (dErr) setError(dErr.message);
    setCompany((c ?? null) as Company | null);
    setContract((d ?? null) as ContractRow | null);
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const update = (patch: Partial<ContractRow>) => {
    setContract((c) => (c ? { ...c, ...patch } : c));
    setDirty(true);
  };

  const toggleClause = (clauseId: string) => {
    if (!contract) return;
    const next = contract.clauses.map((cl) =>
      cl.id === clauseId ? { ...cl, enabled: !cl.enabled } : cl,
    );
    update({ clauses: next });
  };

  const save = async () => {
    if (!contract || !dirty) return;
    setSaving(true);
    const { error: err } = await getFactorySupabase()
      .from("contract_drafts")
      .update({
        monthly_usd: contract.monthly_usd,
        contract_md: contract.contract_md,
        clauses: contract.clauses,
        jurisdiction: contract.jurisdiction,
        updated_at: new Date().toISOString(),
      })
      .eq("id", contract.id);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDirty(false);
  };

  const transition = async (status: ContractRow["status"]) => {
    if (!contract) return;
    const patch: Partial<ContractRow> = { status };
    if (status === "approved") patch.reviewed_at = new Date().toISOString();
    if (status === "sent") patch.sent_at = new Date().toISOString();
    const { error: err } = await getFactorySupabase()
      .from("contract_drafts")
      .update(patch)
      .eq("id", contract.id);
    if (err) {
      setError(err.message);
      return;
    }
    setContract({ ...contract, ...patch } as ContractRow);
  };

  if (loading) return <div className="empty"><strong>Loading contract…</strong></div>;
  if (error) return <div className="error-box">{error}</div>;
  if (!contract) {
    return (
      <div className="empty">
        <strong>No contract draft yet.</strong>
        <p>The contract-writer agent runs after the pitchdeck succeeds. Check back once the build completes.</p>
        <button className="btn-ghost" type="button" onClick={onBack}>← Back</button>
      </div>
    );
  }

  return (
    <div className="shell-content-wide contract-editor">
      <header className="page-header">
        <div>
          <button className="btn-ghost" type="button" onClick={onBack}>← Back to project</button>
          <h1 className="page-header-title">{company?.name ?? "Contract"} · contract</h1>
          <p className="page-header-sub">
            status <strong>{contract.status}</strong>
            {contract.tier_slug ? <> · tier {contract.tier_slug}</> : null}
            {contract.jurisdiction ? <> · jurisdiction {contract.jurisdiction}</> : null}
            {contract.cost_usd ? <> · cost ${contract.cost_usd.toFixed(2)}</> : null}
          </p>
        </div>
        <div className="contract-actions">
          <button
            className="btn-primary"
            type="button"
            disabled={!dirty || saving}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : dirty ? "Save draft" : "Saved"}
          </button>
          {contract.status !== "approved" && contract.status !== "sent" && contract.status !== "signed" && (
            <button
              className="btn-primary"
              type="button"
              disabled={dirty || saving}
              onClick={() => void transition("approved")}
            >
              Approve
            </button>
          )}
          {contract.status === "approved" && (
            <button className="btn-primary" type="button" onClick={() => void transition("sent")}>
              Send for e-sign
            </button>
          )}
          {contract.status === "signed" && contract.signature_url && (
            <a className="btn-ghost" href={contract.signature_url} target="_blank" rel="noreferrer">
              Open signature
            </a>
          )}
        </div>
      </header>

      <div className="contract-grid">
        <aside className="contract-sidebar">
          <section className="contract-side-section">
            <h4>Pricing</h4>
            <label>
              Monthly amount (USD)
              <input
                type="number"
                step="1"
                min="0"
                value={contract.monthly_usd}
                onChange={(e) => update({ monthly_usd: Number(e.target.value) })}
              />
            </label>
          </section>

          <section className="contract-side-section">
            <h4>Clauses</h4>
            <ul className="contract-clauses">
              {contract.clauses.map((cl) => (
                <li key={cl.id} className={`contract-clause ${cl.enabled ? "on" : "off"}`}>
                  <label>
                    <input
                      type="checkbox"
                      checked={cl.enabled}
                      onChange={() => toggleClause(cl.id)}
                    />
                    <strong>{cl.label}</strong>
                    {cl.jurisdiction_only && cl.jurisdiction_only.length > 0 ? (
                      <small> · {cl.jurisdiction_only.join(", ")}</small>
                    ) : null}
                  </label>
                </li>
              ))}
              {contract.clauses.length === 0 ? (
                <li className="contract-clause-empty">No structured clauses — edit the markdown directly.</li>
              ) : null}
            </ul>
          </section>

          <section className="contract-side-section">
            <h4>Jurisdiction</h4>
            <input
              type="text"
              value={contract.jurisdiction ?? ""}
              onChange={(e) => update({ jurisdiction: e.target.value })}
              placeholder="US-CA · UK · EU · …"
            />
          </section>
        </aside>

        <main className="contract-edit-pane">
          <textarea
            className="contract-md-edit"
            value={contract.contract_md}
            onChange={(e) => update({ contract_md: e.target.value })}
            rows={32}
            placeholder="Contract content in markdown — Cleo writes a first draft; edit before sending."
          />
          <ContractPreview md={contract.contract_md} amount={contract.monthly_usd} clauses={contract.clauses} />
        </main>
      </div>
    </div>
  );
}

function ContractPreview({
  md,
  amount,
  clauses,
}: {
  md: string;
  amount: number;
  clauses: Clause[];
}): JSX.Element {
  // Inject the amount + enabled clauses at preview time. This mirrors what
  // the contract-writer agent does at render time, so ops sees the final
  // shape before sending.
  const rendered = useMemo(() => {
    const enabledClauseBlock = clauses
      .filter((cl) => cl.enabled)
      .map((cl) => `### ${cl.label}\n\n${cl.body_md}`)
      .join("\n\n");
    return md
      .replace(/\{\{monthly_usd\}\}/g, `$${amount}`)
      .replace(/\{\{clauses\}\}/g, enabledClauseBlock);
  }, [md, amount, clauses]);
  return (
    <aside className="contract-preview">
      <h4>Preview</h4>
      <pre>{rendered}</pre>
    </aside>
  );
}
