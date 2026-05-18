// AI Factory · Build agents — index + per-agent detail.

import { useEffect, useState } from "react";
import { getFactorySupabase } from "../../lib/factorySupabase";
import { navigate, type Route } from "../../shell/route";

interface AgentDef {
  id: string;
  name: string;
  desc: string;
  what: string[];
  reads: string[];
  writes: string[];
}

const AGENTS: AgentDef[] = [
  {
    id: "planner",
    name: "Planner",
    desc: "Opus 4.7 — turns an accepted proposal into an AubosBuildPlan.",
    what: ["Reads the architect's Template A from onboarding_canvas_states",
           "Combines with chat history + scrape intel",
           "Emits a typed AubosBuildPlan that all dev agents execute against"],
    reads: ["companies", "onboarding_canvas_states", "onboarding_chat_messages", "company_intel"],
    writes: ["planner_outputs", "client_journey_events"],
  },
  {
    id: "backend-dev",
    name: "Backend dev",
    desc: "Schemas, edge functions, integrations. Writes to the customer's per-tenant Supabase.",
    what: ["Pulls integration shells matching architect's required_integrations",
           "Generates per-tenant migrations and edge functions",
           "Pushes to the customer's Supabase project (Mode B)"],
    reads: ["planner_outputs", "customer_secrets"],
    writes: ["dev_agent_runs"],
  },
  {
    id: "frontend-dev",
    name: "Frontend dev",
    desc: "Per-tenant white-labelled UI bundle.",
    what: ["Builds the customer-facing UI bundle from a base template",
           "Bakes the customer's CLIENT_CONFIG_JSON at build time",
           "Outputs a static bundle deployed to the customer's domain"],
    reads: ["planner_outputs", "companies"],
    writes: ["dev_agent_runs"],
  },
  {
    id: "vps-dev",
    name: "VPS dev",
    desc: "Provisions a DigitalOcean droplet + installs OpenClaw + Claude Code.",
    what: ["Spins up a $12/mo droplet via aubos-tenant-builder",
           "Runs cloud-init: Claude Code, OpenClaw, NemoClaw, nginx, systemd units",
           "Pushes the customer's bundle + secrets onto the box"],
    reads: ["planner_outputs", "customer_secrets"],
    writes: ["dev_agent_runs", "tenants"],
  },
  {
    id: "code-critic",
    name: "Code critic",
    desc: "Reviews patches before they hit a sandbox. Confidence ≥ 80 only.",
    what: ["Code-review pass on every diff produced by backend/frontend devs",
           "Flags security issues, style violations, missing tests",
           "Blocks merge if confidence < 80"],
    reads: ["dev_agent_runs"],
    writes: ["dev_agent_runs (review nodes)"],
  },
  {
    id: "visual-a11y",
    name: "Visual + a11y critic",
    desc: "Playwright screenshots + axe-core checks on the per-tenant UI.",
    what: ["Loads the deployed UI in a Playwright browser",
           "Captures screenshots for layout regression",
           "Runs axe-core for WCAG/accessibility violations"],
    reads: ["tenants"],
    writes: ["dev_agent_runs (visual nodes)"],
  },
];

interface RunCount { agent_id: string; running: number; done: number; failed: number; }

export function BuildAgentsPage({ route }: { route: Route }): JSX.Element {
  if (route.id) {
    const def = AGENTS.find((a) => a.id === route.id);
    if (!def) {
      return (
        <div className="shell-content-narrow">
          <button type="button" className="btn btn-ghost" onClick={() => navigate({ dept: "factory", section: "build-agents" })} style={{ marginBottom: 16 }}>
            ← All build agents
          </button>
          <div className="empty"><strong>Unknown agent</strong><p>{route.id}</p></div>
        </div>
      );
    }
    return <BuildAgentDetail def={def} />;
  }
  return <BuildAgentsIndex />;
}

function BuildAgentsIndex(): JSX.Element {
  const [counts, setCounts] = useState<Record<string, RunCount>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = getFactorySupabase();
      // Best-effort aggregate. If columns differ, falls back to zeros.
      const { data } = await sb
        .from("dev_agent_runs")
        .select("agent_id, status")
        .limit(2000);
      if (cancelled) return;
      const acc: Record<string, RunCount> = {};
      for (const r of (data ?? []) as Array<{ agent_id: string; status: string }>) {
        const id = r.agent_id ?? "unknown";
        acc[id] ??= { agent_id: id, running: 0, done: 0, failed: 0 };
        if (r.status === "running" || r.status === "queued") acc[id].running++;
        else if (r.status === "done" || r.status === "completed" || r.status === "passed") acc[id].done++;
        else if (r.status === "failed") acc[id].failed++;
      }
      setCounts(acc);
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="shell-content-wide">
      <div className="page-header">
        <h1 className="page-title">Build agents</h1>
        <p className="page-subtitle">
          The dev pipeline. Runs after a customer accepts their Cleo proposal,
          delivering the actual deployed tool. Click any agent for what it does,
          recent runs, and inputs/outputs.
        </p>
      </div>
      <div className="niche-grid">
        {AGENTS.map((a) => {
          const c = counts[a.id];
          return (
            <button
              key={a.id}
              type="button"
              className="niche-card niche-card-clickable"
              onClick={() => navigate({ dept: "factory", section: "build-agents", id: a.id })}
            >
              <div className="niche-card-name">{a.name}</div>
              <div className="niche-card-slug">{a.id}</div>
              <p style={{ margin: "10px 0 14px", fontSize: "0.82rem", color: "var(--text-dim)", lineHeight: 1.5 }}>{a.desc}</p>
              <div className="niche-card-stats">
                <div className="niche-card-stat"><strong>{c?.running ?? 0}</strong><span>running</span></div>
                <div className="niche-card-stat"><strong>{c?.done ?? 0}</strong><span>done</span></div>
                <div className="niche-card-stat"><strong>{c?.failed ?? 0}</strong><span>failed</span></div>
              </div>
              <div className="niche-card-foot">open agent →</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BuildAgentDetail({ def }: { def: AgentDef }): JSX.Element {
  const [runs, setRuns] = useState<any[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = getFactorySupabase();
      const { data } = await sb
        .from("dev_agent_runs")
        .select("*")
        .eq("agent_id", def.id)
        .order("started_at", { ascending: false })
        .limit(50);
      if (cancelled) return;
      setRuns((data ?? []) as any[]);
    })();
    return () => { cancelled = true; };
  }, [def.id]);

  return (
    <div className="shell-content-wide">
      <button type="button" className="btn btn-ghost" onClick={() => navigate({ dept: "factory", section: "build-agents" })} style={{ marginBottom: 16 }}>
        ← All build agents
      </button>
      <div className="page-header">
        <h1 className="page-title">{def.name}</h1>
        <p className="page-subtitle">{def.desc}</p>
      </div>

      <section style={{ marginBottom: 32 }}>
        <h2 className="section-title">What it does</h2>
        <ul className="detail-list">
          {def.what.map((w, i) => <li key={i}>· {w}</li>)}
        </ul>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 className="section-title">Inputs / outputs</h2>
        <div className="detail-field">
          <div className="detail-field-label">reads</div>
          <div className="detail-field-value">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {def.reads.map((r) => <span key={r} className="pill muted"><span className="pill-dot" />{r}</span>)}
            </div>
          </div>
        </div>
        <div className="detail-field">
          <div className="detail-field-label">writes</div>
          <div className="detail-field-value">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {def.writes.map((w) => <span key={w} className="pill done"><span className="pill-dot" />{w}</span>)}
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="section-title">Recent runs</h2>
        {runs === null ? (
          <div className="empty"><p>Loading…</p></div>
        ) : runs.length === 0 ? (
          <div className="empty">
            <strong>No runs yet</strong>
            <p>This agent hasn't been triggered for any customer.</p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Customer</th><th>Status</th><th>Started</th><th>Duration</th></tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const dur = r.started_at && r.completed_at
                  ? new Date(r.completed_at).getTime() - new Date(r.started_at).getTime()
                  : null;
                return (
                  <tr key={r.id} className="clickable" onClick={() => r.company_id && navigate({ dept: "cleo", section: "customers", id: r.company_id, sub: "build" })}>
                    <td className="mono">{r.company_id?.slice(0, 8) ?? "—"}</td>
                    <td><span className={`pill ${pillFor(r.status)}`}><span className="pill-dot" />{r.status ?? "—"}</span></td>
                    <td className="dim">{r.started_at ? new Date(r.started_at).toLocaleString() : "—"}</td>
                    <td className="dim">{dur ? `${(dur / 1000).toFixed(1)}s` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function pillFor(s: string): string {
  if (s === "done" || s === "completed") return "done";
  if (s === "running" || s === "queued") return "running";
  if (s === "failed") return "failed";
  return "muted";
}
