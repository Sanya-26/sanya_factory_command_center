// Canvas — visual renderer of the customer's business map (Architect's
// Template A). Read-only; click a node to inspect it on the right rail.

import { useState } from "react";
import type { CustomerDetailContext } from "../CustomerDetailLayout";
import { BusinessMap } from "../../../BusinessMap";

interface CanvasNodeShape {
  id: string;
  kind: string;
  label: string;
  subLabel?: string;
  data?: Record<string, any>;
}

export function CanvasPage({ ctx }: { ctx: CustomerDetailContext }): JSX.Element {
  const c = ctx.canvas;
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!c || !Array.isArray(c.nodes) || c.nodes.length === 0) {
    return (
      <div className="cd-page">
        <div className="page-header">
          <h1 className="page-title">Business canvas</h1>
          <p className="page-subtitle">No canvas yet. Customer hasn't seen the proposal.</p>
        </div>
      </div>
    );
  }

  const nodes = c.nodes as CanvasNodeShape[];
  const edges = c.edges as any[];
  const aiCount = nodes.filter((n) => n.data?.automation === "ai").length;
  const userCount = nodes.filter((n) => n.data?.automation === "user-action").length;
  const intCount = nodes.filter((n) => n.kind === "integration").length;
  const totalSavings = nodes.reduce((s, n) => s + (n.data?.estimated_monthly_saving_usd ?? 0), 0);
  const selected = selectedId ? nodes.find((n) => n.id === selectedId) ?? null : null;

  return (
    <div className="cd-page cd-canvas-page">
      <div className="page-header row">
        <div>
          <h1 className="page-title">Business canvas</h1>
          <p className="page-subtitle">
            {nodes.length} nodes · {edges.length} edges · {aiCount} AI · {userCount} human ·
            {totalSavings > 0 ? ` $${Math.round(totalSavings)}/mo est. savings · ` : " "}
            {intCount} integrations · status <strong>{c.status}</strong>
          </p>
        </div>
      </div>

      <div className="canvas-layout">
        <div className="canvas-stage">
          <BusinessMap
            nodes={nodes}
            edges={edges}
            onNodeClick={(id) => setSelectedId(id)}
          />
        </div>

        <aside className="canvas-side">
          <div className="canvas-side-head">
            <strong>{selected ? "Node" : "Click a node"}</strong>
            {selected ? (
              <button type="button" onClick={() => setSelectedId(null)} className="btn btn-ghost" style={{ padding: "2px 8px" }}>×</button>
            ) : null}
          </div>
          {selected ? (
            <NodeDetail node={selected} />
          ) : (
            <p className="canvas-side-hint">
              Click a node on the map to see its automation status, AUBOS components, process explanation, and estimated cost saved.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}

function NodeDetail({ node }: { node: CanvasNodeShape }): JSX.Element {
  const d = (node.data ?? {}) as Record<string, any>;
  return (
    <div className="canvas-side-body">
      <div className="canvas-side-section">
        <div className="canvas-side-label">name</div>
        <div className="canvas-side-value">{node.label}</div>
      </div>
      <div className="canvas-side-section">
        <div className="canvas-side-label">kind</div>
        <div className="canvas-side-value mono">{node.kind}</div>
      </div>
      {d.automation ? (
        <div className="canvas-side-section">
          <div className="canvas-side-label">automation</div>
          <span className={`pill ${d.automation === "ai" ? "done" : "warn"}`}>
            <span className="pill-dot" />
            {d.automation === "ai" ? "AI handles this" : "Human required"}
          </span>
        </div>
      ) : null}
      {d.process_explanation ? (
        <div className="canvas-side-section">
          <div className="canvas-side-label">what we do</div>
          <p className="canvas-side-prose">{d.process_explanation}</p>
        </div>
      ) : null}
      {Array.isArray(d.aubos_components) && d.aubos_components.length > 0 ? (
        <div className="canvas-side-section">
          <div className="canvas-side-label">AUBOS components</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {(d.aubos_components as string[]).map((c) => <span key={c} className="pill muted"><span className="pill-dot" />{c}</span>)}
          </div>
        </div>
      ) : null}
      {typeof d.estimated_monthly_saving_usd === "number" && d.estimated_monthly_saving_usd > 0 ? (
        <div className="canvas-side-section">
          <div className="canvas-side-label">est. monthly saving</div>
          <div className="canvas-side-value" style={{ color: "var(--green)" }}>${Math.round(d.estimated_monthly_saving_usd)}</div>
        </div>
      ) : null}
    </div>
  );
}
