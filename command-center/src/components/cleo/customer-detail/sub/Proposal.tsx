// Proposal — admin's view of the Proposal Council outputs for one customer.
// §9 Group F: each agent's output is now editable inline. Edits save on
// blur (debounced 800 ms) as proposal_edits rows at kind='field';
// newest-applied edit wins on reload via applied_at DESC. Layer 2/3
// (canvas node editor + agent re-run) explicitly deferred.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getFactorySupabase } from "../../../../lib/factorySupabase";
import type { CustomerDetailContext } from "../CustomerDetailLayout";

interface PropRow {
  id: string;
  agent: string;
  round: number;
  status: "queued" | "running" | "done" | "failed" | "revise";
  model: string | null;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: string | number | null;
  output: any | null;
  started_at: string;
  completed_at: string | null;
}

interface EditRow {
  id: string;
  proposal_output_id: string | null;
  kind: string;
  edits: any;
  applied_at: string;
}

const AGENT_ORDER = [
  "business-architect",
  "researcher",
  "business-scrapper",
  "process-architect",
  "pitch-proposal-writer",
] as const;

const DEBOUNCE_MS = 800;

export function ProposalPage({ ctx }: { ctx: CustomerDetailContext }): JSX.Element {
  const [rows, setRows] = useState<PropRow[]>([]);
  const [edits, setEdits] = useState<Record<string, EditRow>>({}); // keyed by proposal_output_id
  const [error, setError] = useState<string | null>(null);
  const [firing, setFiring] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({}); // current textarea value per output id
  const [savedAt, setSavedAt] = useState<Record<string, number>>({}); // last successful save ts per output id
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const reload = useCallback(async () => {
    setError(null);
    const sb = getFactorySupabase();
    const [{ data: outputData, error: outErr }, { data: editData, error: editErr }] = await Promise.all([
      sb.from("proposal_council_outputs")
        .select("id, agent, round, status, model, tokens_in, tokens_out, cost_usd, output, started_at, completed_at")
        .eq("company_id", ctx.companyId)
        .order("started_at", { ascending: true }),
      sb.from("proposal_edits")
        .select("id, proposal_output_id, kind, edits, applied_at")
        .eq("company_id", ctx.companyId)
        .eq("kind", "field")
        .order("applied_at", { ascending: false }),
    ]);
    if (outErr) { setError(outErr.message); return; }
    if (editErr) { setError(editErr.message); return; }
    const outs = (outputData ?? []) as PropRow[];
    setRows(outs);
    // Newest-wins: iterate edits DESC and keep the first entry per
    // proposal_output_id; older edits stay in the table as audit trail.
    const latestByOutput: Record<string, EditRow> = {};
    for (const e of (editData ?? []) as EditRow[]) {
      if (!e.proposal_output_id) continue;
      if (!latestByOutput[e.proposal_output_id]) latestByOutput[e.proposal_output_id] = e;
    }
    setEdits(latestByOutput);
  }, [ctx.companyId]);

  useEffect(() => {
    void reload();
    const sb = getFactorySupabase();
    const ch = sb.channel(`proposal-${ctx.companyId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "proposal_council_outputs",
        filter: `company_id=eq.${ctx.companyId}`,
      }, () => void reload())
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "proposal_edits",
        filter: `company_id=eq.${ctx.companyId}`,
      }, () => void reload())
      .subscribe();
    return () => { void sb.removeChannel(ch); };
  }, [ctx.companyId, reload]);

  // Clean up pending debounce timers on unmount.
  useEffect(() => {
    return () => {
      for (const t of Object.values(timersRef.current)) clearTimeout(t);
    };
  }, []);

  const fireProposal = async () => {
    setFiring(true);
    setError(null);
    try {
      const sb = getFactorySupabase();
      const { data: session } = await sb.auth.getSession();
      const jwt = session.session?.access_token;
      const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
      const res = await fetch(`${base}/functions/v1/proposal-council-run`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ company_id: ctx.companyId }),
      });
      if (!res.ok) setError(`Fire failed: ${(await res.text()).slice(0, 200)}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setFiring(false);
    }
  };

  /** Initial textarea value for a row: latest edit text OR pretty-printed output. */
  const initialTextFor = useCallback((r: PropRow): string => {
    const e = edits[r.id];
    if (e && typeof e.edits === "object" && e.edits && typeof (e.edits as { text?: string }).text === "string") {
      return (e.edits as { text: string }).text;
    }
    return r.output ? JSON.stringify(r.output, null, 2) : "";
  }, [edits]);

  /** Persist an edit. Debounced via per-row setTimeout. */
  const scheduleSave = useCallback((outputId: string, text: string) => {
    const existing = timersRef.current[outputId];
    if (existing) clearTimeout(existing);
    timersRef.current[outputId] = setTimeout(async () => {
      delete timersRef.current[outputId];
      try {
        const sb = getFactorySupabase();
        const { data: session } = await sb.auth.getSession();
        const userId = session.session?.user?.id ?? null;
        const { error: insErr } = await sb.from("proposal_edits").insert({
          company_id: ctx.companyId,
          proposal_output_id: outputId,
          kind: "field",
          edits: { text },
          applied_by: userId,
        });
        if (insErr) {
          setError(`Save failed: ${insErr.message}`);
          return;
        }
        setSavedAt((m) => ({ ...m, [outputId]: Date.now() }));
      } catch (e) {
        setError((e as Error).message);
      }
    }, DEBOUNCE_MS);
  }, [ctx.companyId]);

  const onBlur = (outputId: string) => {
    const text = drafts[outputId];
    if (text == null) return; // never edited
    scheduleSave(outputId, text);
  };

  const byAgent: Record<string, PropRow | undefined> = useMemo(() => {
    const out: Record<string, PropRow | undefined> = {};
    for (const r of rows) {
      if (!out[r.agent] || r.round > (out[r.agent]?.round ?? 0)) out[r.agent] = r;
    }
    return out;
  }, [rows]);
  const totalCost = rows.reduce((s, r) => s + (typeof r.cost_usd === "number" ? r.cost_usd : Number(r.cost_usd) || 0), 0);

  return (
    <div className="proposal-page">
      <div className="proposal-page-head">
        <div>
          <h2 className="page-title">Proposal Council</h2>
          <p className="page-subtitle">
            5 GPT-5.5 Pro agents · {rows.length} run{rows.length === 1 ? "" : "s"} ·
            ~${totalCost.toFixed(2)} total cost (billed to client's ChatGPT Pro) · edits autosave on blur
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void fireProposal()}
          disabled={firing}
        >
          {firing ? "Firing…" : "Generate proposal"}
        </button>
      </div>

      {error ? <div className="empty">{error}</div> : null}

      <div className="proposal-edit-list">
        {AGENT_ORDER.map((slug) => {
          const r = byAgent[slug];
          if (!r) {
            return (
              <section key={slug} className="proposal-edit-row empty-row">
                <header>
                  <strong>{slug}</strong>
                  <span className="pill muted"><span className="pill-dot" />not run</span>
                </header>
              </section>
            );
          }
          const edited = Boolean(edits[r.id]);
          const lastSavedTs = savedAt[r.id];
          const draftValue = drafts[r.id] ?? initialTextFor(r);
          return (
            <section key={slug} className="proposal-edit-row">
              <header>
                <div>
                  <strong>{slug}</strong>
                  <span className={`pill ${pillFor(r.status)}`} style={{ marginLeft: 8 }}>
                    <span className="pill-dot" />{r.status}
                  </span>
                </div>
                <div className="dim mono" style={{ fontSize: 12 }}>
                  {r.model ?? "—"} · {(r.tokens_in ?? 0)} in / {(r.tokens_out ?? 0)} out · ${Number(r.cost_usd ?? 0).toFixed(3)}
                  {edited ? <span style={{ marginLeft: 8 }}>· edited</span> : null}
                  {lastSavedTs ? <span style={{ marginLeft: 8 }}>· saved {fmtTimeAgo(lastSavedTs)}</span> : null}
                </div>
              </header>
              <textarea
                className="proposal-edit-textarea mono"
                value={draftValue}
                onChange={(e) => setDrafts((m) => ({ ...m, [r.id]: e.target.value }))}
                onBlur={() => onBlur(r.id)}
                spellCheck={false}
                rows={16}
                placeholder={r.output ? "" : "Agent has no output yet."}
              />
            </section>
          );
        })}
      </div>
    </div>
  );
}

function pillFor(s: string): string {
  if (s === "done") return "done";
  if (s === "running" || s === "queued") return "running";
  if (s === "failed") return "failed";
  return "muted";
}

function fmtTimeAgo(ts: number): string {
  const sec = Math.round((Date.now() - ts) / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  return new Date(ts).toLocaleTimeString();
}
