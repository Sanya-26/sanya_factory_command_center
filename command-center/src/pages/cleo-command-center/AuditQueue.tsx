// AuditQueue — ops inbox for manual-audit items inside Cleo's Command Center.
//
// Each row is one audit_requests entry (QC ship-with-flag, new tool, first
// deploy, compliance-flagged content). Ops user clicks → drawer with the QC
// findings + artifact path + diff → approves / rejects / sends back with
// comments. Approve unblocks the customer deploy; reject + revise routes back
// to the dev-agent dispatcher.

import { useEffect, useState, useCallback, useMemo } from "react";
import { getFactorySupabase } from "../../lib/factorySupabase";
import { navigate } from "../../shell/route";

interface AuditRow {
  id: string;
  kind: "qc-flagged" | "new-tool" | "first-deploy" | "compliance" | "content";
  dev_agent_run_id: string | null;
  qc_run_id: string | null;
  build_run_id: string | null;
  company_id: string | null;
  agent_id: string | null;
  reason: string;
  artifact_path: string | null;
  qc_findings_summary: Array<{
    severity: "critical" | "important" | "advisory";
    category: string;
    file?: string;
    issue: string;
  }>;
  status: "pending" | "in-review" | "approved" | "rejected" | "withdrawn";
  priority: "low" | "normal" | "high" | "critical";
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  verdict: "approve" | "reject" | "revise" | null;
  comments: string | null;
}

interface CompanyMini {
  id: string;
  name: string;
  home_website: string | null;
}

const KIND_TONE: Record<AuditRow["kind"], string> = {
  "qc-flagged": "amber",
  "new-tool": "purple",
  "first-deploy": "blue",
  compliance: "red",
  content: "muted",
};

const PRIORITY_TONE: Record<AuditRow["priority"], string> = {
  critical: "red",
  high: "amber",
  normal: "muted",
  low: "muted",
};

export function AuditQueuePage(): JSX.Element {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [companies, setCompanies] = useState<Record<string, CompanyMini>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [selected, setSelected] = useState<AuditRow | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    const sb = getFactorySupabase();
    const { data, error: err } = await sb
      .from("audit_requests")
      .select("*")
      .order("priority", { ascending: false })
      .order("requested_at", { ascending: false })
      .limit(50);
    if (err) { setError(err.message); setLoading(false); return; }
    setRows((data ?? []) as AuditRow[]);

    const cids = Array.from(new Set(((data ?? []) as AuditRow[]).map((r) => r.company_id).filter(Boolean) as string[]));
    if (cids.length) {
      const { data: comps } = await sb
        .from("companies")
        .select("id, name, home_website")
        .in("id", cids);
      const map: Record<string, CompanyMini> = {};
      for (const c of (comps ?? []) as CompanyMini[]) map[c.id] = c;
      setCompanies(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
    const sb = getFactorySupabase();
    let t: ReturnType<typeof setTimeout> | null = null;
    const debounced = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => void reload(), 500);
    };
    const ch = sb
      .channel("cleo-cc-audit-queue")
      .on("postgres_changes", { event: "*", schema: "public", table: "audit_requests" }, debounced)
      .subscribe();
    return () => {
      if (t) clearTimeout(t);
      void sb.removeChannel(ch);
    };
  }, [reload]);

  const filtered = useMemo(
    () => rows.filter((r) => filter === "all" || r.status === "pending" || r.status === "in-review"),
    [rows, filter],
  );
  const pendingCount = useMemo(() => rows.filter((r) => r.status === "pending").length, [rows]);

  return (
    <div className="shell-content-wide cleo-cc-page">
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Audit queue</h1>
          <p className="page-header-sub">
            Manual review for tools and artifacts the factory's automated QC couldn't approve on its own. Approving unblocks the customer's deploy.
          </p>
        </div>
        <div className="cleo-cc-kpis">
          <div className="cleo-cc-kpi">
            <strong>{pendingCount}</strong>
            <span>pending</span>
          </div>
          <div className="cleo-cc-kpi">
            <strong>{rows.length}</strong>
            <span>total</span>
          </div>
        </div>
      </div>

      <div className="cleo-cc-filters">
        {(["pending", "all"] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={`pill ${filter === f ? "pill-active" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f === "pending" ? "Needs my attention" : "Everything"}
          </button>
        ))}
      </div>

      {error ? <div className="error-box">{error}</div> : null}
      {loading ? (
        <div className="empty"><strong>Loading…</strong></div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <strong>Queue is empty.</strong>
          <p>Nothing requires your attention right now. New items appear here automatically when the factory's automated QC flags an artifact.</p>
        </div>
      ) : (
        <ul className="cleo-cc-audit-list">
          {filtered.map((r) => {
            const co = r.company_id ? companies[r.company_id] : null;
            return (
              <li key={r.id}>
                <button type="button" className="cleo-cc-audit-row" onClick={() => setSelected(r)}>
                  <div className="cleo-cc-audit-row-meta">
                    <span className={`pill pill-${PRIORITY_TONE[r.priority]}`}>{r.priority}</span>
                    <span className={`pill pill-${KIND_TONE[r.kind]}`}>{r.kind}</span>
                    {r.agent_id ? <span className="cleo-cc-audit-row-agent">{r.agent_id}</span> : null}
                  </div>
                  <div className="cleo-cc-audit-row-body">
                    <strong>{co?.name ?? "Unknown customer"}</strong>
                    <span className="cleo-cc-audit-row-reason">{r.reason.slice(0, 220)}{r.reason.length > 220 ? "…" : ""}</span>
                  </div>
                  <div className="cleo-cc-audit-row-foot">
                    <span>{r.qc_findings_summary.length} findings</span>
                    <span>·</span>
                    <span>{formatElapsed(r.requested_at)}</span>
                    {r.status !== "pending" ? (
                      <>
                        <span>·</span>
                        {r.verdict === "revise" && r.status === "in-review" ? (
                          <span className="pill pill-purple" title="Sent back to dev agent for another round">revised · awaiting dev</span>
                        ) : (
                          <span className={`pill pill-${r.status === "approved" ? "green" : r.status === "rejected" ? "red" : "muted"}`}>{r.status}</span>
                        )}
                      </>
                    ) : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selected ? (
        <AuditDrawer
          row={selected}
          company={selected.company_id ? companies[selected.company_id] ?? null : null}
          onClose={() => setSelected(null)}
          onActioned={() => { setSelected(null); void reload(); }}
        />
      ) : null}
    </div>
  );
}

function AuditDrawer({
  row,
  company,
  onClose,
  onActioned,
}: {
  row: AuditRow;
  company: CompanyMini | null;
  onClose: () => void;
  onActioned: () => void;
}): JSX.Element {
  const [verdict, setVerdict] = useState<"approve" | "reject" | "revise" | null>(null);
  const [comments, setComments] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!verdict) { setErr("Pick a verdict"); return; }
    if (verdict !== "approve" && !comments.trim()) {
      setErr("Comments required for reject/revise"); return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const sb = getFactorySupabase();
      const { data: { session } } = await sb.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not signed in");
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/audit-action`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        },
        body: JSON.stringify({
          audit_request_id: row.id,
          verdict,
          comments: comments.trim() || null,
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`${res.status}: ${txt.slice(0, 240)}`);
      }
      onActioned();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const goToCompany = () => {
    if (!row.company_id) return;
    onClose();
    navigate({ dept: "cleo", section: "command-center", id: row.company_id });
  };

  return (
    <>
      <div className="cleo-cc-drawer-backdrop" onClick={onClose} />
      <aside className="cleo-cc-drawer">
        <header className="cleo-cc-drawer-head">
          <div>
            <strong>{company?.name ?? "Unknown customer"}</strong>
            <small>{row.kind} · {row.agent_id ?? "—"} · requested {formatElapsed(row.requested_at)}</small>
          </div>
          <button type="button" className="cleo-cc-drawer-close" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="cleo-cc-drawer-body">
          <section>
            <h3>Why this needs review</h3>
            <p className="cleo-cc-audit-reason">{row.reason}</p>
            {row.company_id ? (
              <button type="button" className="btn btn-ghost" onClick={goToCompany}>
                Open project in Command Center →
              </button>
            ) : null}
          </section>

          {row.qc_findings_summary.length > 0 ? (
            <section>
              <h3>QC findings ({row.qc_findings_summary.length})</h3>
              <ul className="cleo-cc-audit-findings">
                {row.qc_findings_summary.map((f, i) => (
                  <li key={i}>
                    <span className={`pill pill-${f.severity === "critical" ? "red" : f.severity === "important" ? "amber" : "muted"}`}>{f.severity}</span>
                    <span className="cleo-cc-audit-finding-cat">{f.category}</span>
                    {f.file ? <span className="cleo-cc-audit-finding-file">{f.file}</span> : null}
                    <div className="cleo-cc-audit-finding-issue">{f.issue}</div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {row.artifact_path ? (
            <section>
              <h3>Artifact</h3>
              <code className="cleo-cc-audit-path">{row.artifact_path}</code>
            </section>
          ) : null}

          {row.status === "pending" || row.status === "in-review" ? (
            <section className="cleo-cc-audit-action">
              <h3>Your verdict</h3>
              <div className="cleo-cc-audit-verdicts">
                <button
                  type="button"
                  className={`btn ${verdict === "approve" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setVerdict("approve")}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className={`btn ${verdict === "revise" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setVerdict("revise")}
                >
                  Send back · revise
                </button>
                <button
                  type="button"
                  className={`btn ${verdict === "reject" ? "btn-primary" : "btn-ghost"}`}
                  onClick={() => setVerdict("reject")}
                >
                  Reject
                </button>
              </div>
              <textarea
                placeholder={verdict === "approve" ? "Optional note for the audit log…" : "Required: what should the dev agent change?"}
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                rows={5}
              />
              {err ? <div className="error-box">{err}</div> : null}
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void submit()}
                disabled={submitting || !verdict}
              >
                {submitting ? "Saving…" : `Submit ${verdict ?? "verdict"}`}
              </button>
            </section>
          ) : (
            <section>
              <h3>Already actioned</h3>
              <p>Verdict: <strong>{row.verdict}</strong> · {row.reviewed_at ? `at ${new Date(row.reviewed_at).toLocaleString()}` : ""}</p>
              {row.comments ? <p className="cleo-cc-audit-comments">{row.comments}</p> : null}
            </section>
          )}
        </div>
      </aside>
    </>
  );
}

function formatElapsed(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}
