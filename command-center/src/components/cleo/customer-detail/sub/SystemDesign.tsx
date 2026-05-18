// SystemDesign — visualizes the architect's layered design_doc per build_run
// as a HORIZONTAL FLOWCHART. Each layer is a clickable node in a left-to-right
// flow that follows the natural request path: UI → API → Cache → Integrations →
// Data → Cleo → Observability → Deploy. Clicking a node expands a detail panel
// below the flow showing what was actually built for that layer.

import { useState } from "react";

type DesignRow = {
  id: string;
  build_run_id: string;
  design_doc: any;
  status: string;
  cost_usd: number;
  duration_ms: number;
  model: string;
  generated_at: string;
};

// Canonical request-flow order: customer touches UI, request enters API,
// passes through cache, may call integrations / read data / hit Cleo,
// observability watches everything, all running on the deploy substrate.
const FLOW_NODES: Array<{ key: string; label: string; icon: string; blurb: string }> = [
  { key: "ui_layer",           label: "UI",           icon: "▢", blurb: "Customer-facing routes + brand tokens" },
  { key: "api_layer",          label: "API",          icon: "⇄", blurb: "HTTP endpoints + auth model" },
  { key: "caching_layer",      label: "Cache",        icon: "↻", blurb: "Redis rate limits + idempotency" },
  { key: "integration_layer",  label: "Integrations", icon: "⇆", blurb: "External vendors + webhooks" },
  { key: "data_layer",         label: "Data",         icon: "▤", blurb: "Postgres schemas + indexes + RLS" },
  { key: "cleo_chatbot_layer", label: "Cleo",         icon: "✦", blurb: "RAG + per-tenant commissioning" },
  { key: "observability",      label: "Observe",      icon: "◉", blurb: "Logs / traces / metrics / alerts" },
  { key: "deploy_topology",    label: "Deploy",       icon: "▣", blurb: "VPS / containers / harness" },
];

export function SystemDesignSection({ designs }: { designs: DesignRow[] }): JSX.Element {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  if (!designs.length) {
    return (
      <section className="cd-section">
        <h2>System Architect</h2>
        <div className="cd-empty">No architecture generated yet — runs after PM + planner + tool-resolver pass.</div>
      </section>
    );
  }
  const latest = designs[0];
  const doc = latest.design_doc ?? {};
  const populated = FLOW_NODES.filter((n) => doc[n.key] && Object.keys(doc[n.key]).length > 0);
  // Auto-select first populated layer if user hasn't picked one yet.
  const selected = activeKey ?? populated[0]?.key ?? null;
  return (
    <section className="cd-section">
      <h2>System Architect</h2>
      <div className="sd-header">
        <span className={`cd-status-pill ${latest.status === "generated" ? "done" : latest.status === "rejected" ? "failed" : "pending"}`}>
          {latest.status}
        </span>
        <span className="dim">build_run {latest.build_run_id.slice(0, 8)}…</span>
        <span className="dim">{new Date(latest.generated_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
        <span className="dim">{populated.length}/8 layers</span>
        <span className="dim">${(latest.cost_usd ?? 0).toFixed(2)}</span>
        <span className="dim">{((latest.duration_ms ?? 0) / 1000).toFixed(0)}s</span>
        <span className="dim">{latest.model}</span>
      </div>

      {doc.summary && (
        <div className="sd-summary">
          <strong>Summary</strong>
          <p>{doc.summary}</p>
        </div>
      )}

      <div className="sd-flow">
        <div className="sd-flow-rail">
          {FLOW_NODES.map((n, i) => {
            const payload = doc[n.key];
            const isEmpty = !payload || (typeof payload === "object" && Object.keys(payload).length === 0);
            const isActive = selected === n.key;
            return (
              <div className="sd-flow-stop" key={n.key}>
                <button
                  type="button"
                  className={`sd-node ${isActive ? "is-active" : ""} ${isEmpty ? "is-empty" : ""}`}
                  onClick={() => setActiveKey(n.key)}
                  disabled={isEmpty}
                  title={isEmpty ? `${n.label} — empty (architect did not populate this layer)` : `${n.label} — ${n.blurb}`}
                >
                  <span className="sd-node-icon" aria-hidden>{n.icon}</span>
                  <span className="sd-node-label">{n.label}</span>
                  <span className="sd-node-blurb">{n.blurb}</span>
                  <span className={`sd-node-pip ${isEmpty ? "is-empty" : "is-ok"}`} />
                </button>
                {i < FLOW_NODES.length - 1 && <span className="sd-flow-arrow" aria-hidden>→</span>}
              </div>
            );
          })}
        </div>
        <div className="sd-flow-panel">
          {selected ? (
            <>
              <div className="sd-flow-panel-head">
                <strong>{FLOW_NODES.find((n) => n.key === selected)?.label}</strong>
                <span className="dim">{selected}</span>
              </div>
              {doc[selected] && Object.keys(doc[selected]).length > 0
                ? <LayerBody layerKey={selected} payload={doc[selected]} />
                : <div className="cd-empty">This layer is empty in the current design — see open questions below.</div>}
            </>
          ) : (
            <div className="cd-empty">Click any node above to inspect what the architect built for that layer.</div>
          )}
        </div>
      </div>

      {Array.isArray(doc.hard_design_decisions) && doc.hard_design_decisions.length > 0 && (
        <div className="sd-block">
          <h3>Hard design decisions ({doc.hard_design_decisions.length})</h3>
          <ol className="sd-list">
            {doc.hard_design_decisions.map((d: any, i: number) => (
              <li key={i}>
                <strong>{d.decision}</strong>
                <div className="dim">{d.rationale}</div>
                {Array.isArray(d.alternatives_considered) && d.alternatives_considered.length > 0 && (
                  <div className="sd-alt">alternatives: {d.alternatives_considered.join(" · ")}</div>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {Array.isArray(doc.open_questions) && doc.open_questions.length > 0 && (
        <div className="sd-block">
          <h3>Open questions ({doc.open_questions.length})</h3>
          <ul className="sd-list">
            {doc.open_questions.map((q: any, i: number) => (
              <li key={i}>
                <span className={`sd-who sd-who-${q.who_answers}`}>{q.who_answers}</span>
                <span>{q.question}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {Array.isArray(doc.per_ticket_overlays) && doc.per_ticket_overlays.length > 0 && (
        <div className="sd-block">
          <h3>Per-ticket overlays ({doc.per_ticket_overlays.length})</h3>
          <ul className="sd-list">
            {doc.per_ticket_overlays.map((t: any, i: number) => (
              <li key={i}>
                <strong>{t.ticket_id}</strong> · {t.design_notes}
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="sd-raw">
        <summary>raw design_doc JSON</summary>
        <pre>{JSON.stringify(doc, null, 2)}</pre>
      </details>
    </section>
  );
}


function LayerBody({ layerKey, payload }: { layerKey: string; payload: any }): JSX.Element {
  switch (layerKey) {
    case "ui_layer": return <UiLayerBody p={payload} />;
    case "deploy_topology": return <DeployTopologyBody p={payload} />;
    case "integration_layer": return <IntegrationLayerBody p={payload} />;
    case "cleo_chatbot_layer": return <CleoLayerBody p={payload} />;
    case "api_layer": return <ApiLayerBody p={payload} />;
    case "caching_layer": return <CachingLayerBody p={payload} />;
    case "observability": return <ObservabilityBody p={payload} />;
    case "data_layer": return <DataLayerBody p={payload} />;
    default: return <pre className="sd-pre">{JSON.stringify(payload, null, 2)}</pre>;
  }
}

function UiLayerBody({ p }: { p: any }): JSX.Element {
  return (
    <div className="sd-layer-body">
      {p.framework && <div><strong>Framework</strong> {p.framework}</div>}
      {p.design_system && <div><strong>Design system</strong> {p.design_system}</div>}
      {p.brand_anchors && (
        <div className="sd-brand">
          <strong>Brand anchors</strong>
          <div className="sd-brand-swatches">
            {p.brand_anchors.primary_color && <span className="sd-swatch" style={{ background: p.brand_anchors.primary_color }} title={`primary ${p.brand_anchors.primary_color}`}>{p.brand_anchors.primary_color}</span>}
            {p.brand_anchors.secondary_color && <span className="sd-swatch" style={{ background: p.brand_anchors.secondary_color, color: "#000" }} title={`secondary ${p.brand_anchors.secondary_color}`}>{p.brand_anchors.secondary_color}</span>}
            {p.brand_anchors.accent_color && <span className="sd-swatch" style={{ background: p.brand_anchors.accent_color }} title={`accent ${p.brand_anchors.accent_color}`}>{p.brand_anchors.accent_color}</span>}
          </div>
          {p.brand_anchors.voice_descriptors && <div className="dim">voice: {p.brand_anchors.voice_descriptors.join(" · ")}</div>}
          {p.brand_anchors.source && <div className="dim">source: {p.brand_anchors.source}</div>}
        </div>
      )}
      {Array.isArray(p.routes) && (
        <div>
          <strong>Routes ({p.routes.length})</strong>
          <table className="sd-table">
            <thead><tr><th>path</th><th>auth</th><th>purpose</th></tr></thead>
            <tbody>
              {p.routes.map((r: any, i: number) => (
                <tr key={i}>
                  <td className="mono">{r.path}</td>
                  <td className="dim">{r.auth}</td>
                  <td>{r.page_purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {Array.isArray(p.shared_shells) && p.shared_shells.length > 0 && (
        <div className="dim"><strong>Shared shells:</strong> {p.shared_shells.map((s: any) => s.name).join(" · ")}</div>
      )}
    </div>
  );
}

function DeployTopologyBody({ p }: { p: any }): JSX.Element {
  return (
    <div className="sd-layer-body">
      {p.tenant_url && <div><strong>URL</strong> <code>{p.tenant_url}</code></div>}
      {p.data_residency && <div><strong>Data residency</strong> {p.data_residency}</div>}
      {p.harness_role && <div><strong>Harness role</strong> {p.harness_role}</div>}
      {p.secret_storage && <div><strong>Secret storage</strong> {p.secret_storage}</div>}
      {p.scaling && <div><strong>Scaling</strong> {p.scaling}</div>}
      {p.reverse_proxy && (
        <div>
          <strong>Reverse proxy ({p.reverse_proxy.engine})</strong>
          {Array.isArray(p.reverse_proxy.routes) && (
            <table className="sd-table">
              <thead><tr><th>match</th><th>upstream</th></tr></thead>
              <tbody>
                {p.reverse_proxy.routes.map((r: any, i: number) => (
                  <tr key={i}><td className="mono">{r.match}</td><td className="mono dim">{r.upstream}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {Array.isArray(p.containers) && (
        <div>
          <strong>Containers ({p.containers.length})</strong>
          <table className="sd-table">
            <thead><tr><th>name</th><th>port</th><th>purpose</th></tr></thead>
            <tbody>
              {p.containers.map((c: any, i: number) => (
                <tr key={i}>
                  <td>{c.name}</td>
                  <td className="dim">{c.port ?? "—"}</td>
                  <td>{c.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function IntegrationLayerBody({ p }: { p: any }): JSX.Element {
  if (!Array.isArray(p.integrations)) return <pre className="sd-pre">{JSON.stringify(p, null, 2)}</pre>;
  return (
    <div className="sd-layer-body">
      <table className="sd-table">
        <thead><tr><th>provider</th><th>scopes</th><th>retry</th><th>webhook</th></tr></thead>
        <tbody>
          {p.integrations.map((i: any, idx: number) => (
            <tr key={idx}>
              <td><strong>{i.provider}</strong></td>
              <td className="dim">{(i.oauth_scopes ?? []).slice(0, 3).join(", ")}</td>
              <td className="dim">{i.retry_policy ? String(i.retry_policy).slice(0, 80) : "—"}</td>
              <td className="dim">{(i.webhook_endpoints ?? []).length} endpoint(s)</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CleoLayerBody({ p }: { p: any }): JSX.Element {
  const c = p.commissioning ?? {};
  return (
    <div className="sd-layer-body">
      {p.vector_store && <div><strong>Vector store</strong> {p.vector_store} dim={p.embedding_dim} model={p.embedding_model}</div>}
      {Array.isArray(p.kb_tables) && (
        <div className="dim"><strong>KB tables:</strong> {p.kb_tables.map((t: any) => t.name).join(" · ")}</div>
      )}
      {p.safety_classifier && (
        <div><strong>Safety classifier</strong> · table={p.safety_classifier.rules_table} · {(p.safety_classifier.triggers ?? []).length} triggers</div>
      )}
      {Object.keys(c).length > 0 && (
        <div className="sd-commission">
          <h4>cleo-setup commissioning spec</h4>
          {Array.isArray(c.persona_voice_markers) && c.persona_voice_markers.length > 0 && (
            <div>
              <strong>Voice markers</strong>
              <ul>{c.persona_voice_markers.slice(0, 6).map((v: string, i: number) => <li key={i}>{v}</li>)}</ul>
            </div>
          )}
          {Array.isArray(c.mandatory_skills_for_tenant) && (
            <div>
              <strong>Mandatory skills ({c.mandatory_skills_for_tenant.length})</strong>
              <ul>{c.mandatory_skills_for_tenant.slice(0, 12).map((s: any, i: number) => <li key={i}><code>{s.slug}</code> — <span className="dim">{s.why}</span></li>)}</ul>
            </div>
          )}
          {Array.isArray(c.per_task_routing_rules) && (
            <div>
              <strong>Per-task routing ({c.per_task_routing_rules.length})</strong>
              <table className="sd-table">
                <thead><tr><th>task</th><th>primary</th><th>fallback</th><th>byok</th></tr></thead>
                <tbody>
                  {c.per_task_routing_rules.map((r: any, i: number) => (
                    <tr key={i}>
                      <td>{r.task_kind}</td>
                      <td className="mono">{r.primary_model}</td>
                      <td className="mono dim">{r.fallback_model ?? "—"}</td>
                      <td className="mono dim">{r.byok_key_ref ? String(r.byok_key_ref).split(".").pop() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {Array.isArray(c.byok_keys_required) && c.byok_keys_required.length > 0 && (
            <div className="dim"><strong>BYOK keys:</strong> {c.byok_keys_required.map((k: any) => k.key_name ?? k).join(" · ")}</div>
          )}
          {Array.isArray(c.forbidden_topics) && c.forbidden_topics.length > 0 && (
            <div>
              <strong>Forbidden topics</strong>
              <ul>{c.forbidden_topics.map((t: string, i: number) => <li key={i}>{t}</li>)}</ul>
            </div>
          )}
          {c.coworker_mode_defaults && (
            <div>
              <strong>Coworker mode</strong> · {c.coworker_mode_defaults.active_hours} · default={c.coworker_mode_defaults.autonomy_default}
              {Array.isArray(c.coworker_mode_defaults.autonomy_overrides_by_capability) && c.coworker_mode_defaults.autonomy_overrides_by_capability.length > 0 && (
                <table className="sd-table">
                  <thead><tr><th>capability</th><th>autonomy</th><th>reason</th></tr></thead>
                  <tbody>
                    {c.coworker_mode_defaults.autonomy_overrides_by_capability.map((o: any, i: number) => (
                      <tr key={i}><td className="mono">{o.capability}</td><td><strong>{o.autonomy}</strong></td><td className="dim">{o.reason}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ApiLayerBody({ p }: { p: any }): JSX.Element {
  if (!Array.isArray(p.endpoints)) return <pre className="sd-pre">{JSON.stringify(p, null, 2)}</pre>;
  return (
    <div className="sd-layer-body">
      <table className="sd-table">
        <thead><tr><th>method</th><th>path</th><th>auth</th><th>brief</th></tr></thead>
        <tbody>
          {p.endpoints.map((e: any, i: number) => (
            <tr key={i}>
              <td className="mono">{e.method}</td>
              <td className="mono">{e.path}</td>
              <td className="dim">{e.auth}</td>
              <td className="dim">{(e.brief ?? "").slice(0, 80)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CachingLayerBody({ p }: { p: any }): JSX.Element {
  if (!Array.isArray(p.redis_usage)) return <pre className="sd-pre">{JSON.stringify(p, null, 2)}</pre>;
  return (
    <div className="sd-layer-body">
      <table className="sd-table">
        <thead><tr><th>use case</th><th>key</th><th>ttl</th></tr></thead>
        <tbody>
          {p.redis_usage.map((u: any, i: number) => (
            <tr key={i}>
              <td>{u.use_case}</td>
              <td className="mono dim">{u.key_template}</td>
              <td className="dim">{u.ttl_seconds ? `${u.ttl_seconds}s` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ObservabilityBody({ p }: { p: any }): JSX.Element {
  return (
    <div className="sd-layer-body">
      {p.logging_strategy && <div><strong>Logging</strong> {p.logging_strategy}</div>}
      {p.tracing_strategy && <div><strong>Tracing</strong> {p.tracing_strategy}</div>}
      {p.metrics_strategy && <div><strong>Metrics</strong> {p.metrics_strategy}</div>}
      {p.alerting_strategy && <div><strong>Alerting</strong> {p.alerting_strategy}</div>}
    </div>
  );
}

function DataLayerBody({ p }: { p: any }): JSX.Element {
  return (
    <div className="sd-layer-body">
      {p.tenant_isolation_strategy && <div><strong>Tenant isolation</strong> {p.tenant_isolation_strategy}</div>}
      {Array.isArray(p.schemas) && p.schemas.length > 0 && (
        <div className="dim"><strong>Schemas:</strong> {p.schemas.map((s: any) => s.name).join(" · ")}</div>
      )}
      {Array.isArray(p.tables) && p.tables.length > 0 && (
        <div>
          <strong>Tables ({p.tables.length})</strong>
          <table className="sd-table">
            <thead><tr><th>schema.name</th><th>purpose</th></tr></thead>
            <tbody>
              {p.tables.map((t: any, i: number) => (
                <tr key={i}><td className="mono">{t.schema ? `${t.schema}.${t.name}` : t.name}</td><td className="dim">{t.purpose}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {Array.isArray(p.indexes) && p.indexes.length > 0 && (
        <div>
          <strong>Indexes ({p.indexes.length})</strong>
          <table className="sd-table">
            <thead><tr><th>table</th><th>type</th><th>columns</th><th>reason</th></tr></thead>
            <tbody>
              {p.indexes.map((idx: any, i: number) => (
                <tr key={i}>
                  <td className="mono">{idx.table}</td>
                  <td><strong>{idx.type}</strong></td>
                  <td className="mono dim">{(idx.columns ?? []).join(", ")}</td>
                  <td className="dim">{(idx.reason ?? "").slice(0, 80)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
