// Council — per-agent breakdown of the 5-persona Business Council run.

import { useState } from "react";
import type { CustomerDetailContext } from "../CustomerDetailLayout";

// Slot order = execution order. Slot names are kept for DB compat with prior
// council runs; the displayed labels reflect the Phase 3A persona swap.
const AGENT_ORDER = ["scrapper", "capability", "mastermind", "architect", "gap-analyst"];

const AGENT_LABEL: Record<string, string> = {
  scrapper: "Sales Engineer",
  capability: "AI Automation Engineer",
  mastermind: "CEO",
  architect: "CTO",
  "gap-analyst": "Business Admin",
};

const AGENT_BLURB: Record<string, string> = {
  scrapper: "Competitive intel + what wins deals in the niche",
  capability: "What's actually autonomous vs. automation theatre",
  mastermind: "Growth + market positioning of the autonomous business",
  architect: "Technical viability + assembles the canonical map",
  "gap-analyst": "Ops/legal/compliance critique — finds the boring fatal gaps",
};

export function CouncilPage({ ctx }: { ctx: CustomerDetailContext }): JSX.Element {
  const [expanded, setExpanded] = useState<string | null>(null);
  const grouped = AGENT_ORDER.map((agent) => ({
    agent,
    rows: ctx.council
      .filter((r: any) => r.agent === agent)
      .sort((a: any, b: any) => (a.round ?? 1) - (b.round ?? 1)),
  }));

  if (ctx.council.length === 0) {
    return (
      <div className="cd-page">
        <header className="cd-page-head">
          <h1>5-agent council</h1>
          <p>Council hasn't run yet. Triggered automatically once deep-scrape completes.</p>
        </header>
      </div>
    );
  }

  return (
    <div className="cd-page cd-council">
      <header className="cd-page-head">
        <h1>Business Council · 5 personas</h1>
        <p>Pipeline: Sales Engineer → (AI Automation Engineer + CEO in parallel) → CTO → Business Admin critique → CTO revises (up to 3 rounds).</p>
      </header>

      <div className="cd-council-grid">
        {grouped.map(({ agent, rows }) => (
          <section key={agent} className="cd-agent-block">
            <header>
              <strong>{AGENT_LABEL[agent] ?? agent}</strong>
              <span className="dim">{rows.length} round{rows.length === 1 ? "" : "s"}</span>
            </header>
            <p className="cd-agent-blurb">{AGENT_BLURB[agent] ?? ""}</p>
            {rows.length === 0 ? (
              <div className="dim cd-agent-empty">not run</div>
            ) : (
              <ul>
                {rows.map((r: any) => {
                  const dur =
                    r.completed_at && r.started_at
                      ? new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()
                      : null;
                  const expandKey = `${agent}-${r.round}`;
                  const isOpen = expanded === expandKey;
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        className={`cd-agent-row cd-agent-row-${r.status}`}
                        onClick={() => setExpanded(isOpen ? null : expandKey)}
                      >
                        <span className={`cd-status-dot ${pillStatus(r.status)}`} />
                        <span className="cd-agent-round">round {r.round}</span>
                        <span className="cd-agent-status">{r.status}</span>
                        {dur ? <span className="dim cd-agent-dur">{(dur / 1000).toFixed(1)}s</span> : null}
                        {agent === "gap-analyst" && r.output?.verdict ? (
                          <span className={`cd-verdict cd-verdict-${r.output.verdict}`}>{r.output.verdict}</span>
                        ) : null}
                        <span className="cd-agent-toggle">{isOpen ? "−" : "+"}</span>
                      </button>
                      {isOpen ? (
                        <div className="cd-agent-payload">
                          {agent === "gap-analyst" && r.output?.scores ? (
                            <div className="cd-scores">
                              {Object.entries(r.output.scores).map(([k, v]) => (
                                <div key={k} className="cd-score">
                                  <span className="cd-score-label">{k}</span>
                                  <span className={`cd-score-value ${(v as number) >= 70 ? "ok" : "low"}`}>{String(v)}</span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                          {r.output?.one_line_summary ? (
                            <p className="cd-summary">{r.output.one_line_summary}</p>
                          ) : null}
                          {r.feedback_for_architect ? (
                            <div className="cd-feedback">
                              <strong>Feedback for CTO:</strong>
                              <p>{r.feedback_for_architect}</p>
                            </div>
                          ) : null}
                          <details className="cd-agent-raw">
                            <summary>raw output</summary>
                            <pre>{JSON.stringify(r.output, null, 2)}</pre>
                          </details>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function pillStatus(s: string): string {
  if (s === "done") return "done";
  if (s === "failed") return "failed";
  if (s === "running" || s === "queued") return "running";
  if (s === "revise") return "running";
  return "pending";
}
