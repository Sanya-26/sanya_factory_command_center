// Preview — what the customer sees during onboarding (proposal banner +
// read-only business map). §9 Group F.
//
// This is the admin's "preview as customer" surface. It mirrors the
// proposal banner + map layout from
// apps/customer-ui/src/pages/customer/Onboarding.tsx (lines ~628–734)
// minus the chat input, the Accept button, and any auth hooks. Both
// surfaces read the same `onboarding_canvas_states` JSON shape, so they
// stay visually aligned without sharing a package.

import type { CustomerDetailContext } from "../CustomerDetailLayout";
import { BusinessMap } from "../../../BusinessMap";

interface CanvasNode {
  id: string;
  kind: string;
  label: string;
  subLabel?: string;
  data?: Record<string, any>;
}

export function PreviewPage({ ctx }: { ctx: CustomerDetailContext }): JSX.Element {
  const c = ctx.canvas;
  if (!c || !Array.isArray(c.nodes) || c.nodes.length === 0) {
    return (
      <div className="cd-page">
        <div className="page-header">
          <h1 className="page-title">Preview as customer</h1>
          <p className="page-subtitle">No canvas yet — the customer has not been shown a proposal.</p>
        </div>
      </div>
    );
  }

  const nodes = c.nodes as CanvasNode[];
  const edges = c.edges as any[];
  const proposalMode = nodes.some((n) => n.data?.automation);
  const automatableCount = nodes.filter((n) => n.data?.automation === "ai").length;
  const userActionCount = nodes.filter((n) => n.data?.automation === "user-action").length;
  const integrationNodes = nodes.filter((n) => n.kind === "integration");
  const totalSavingPerMonth = nodes.reduce((sum, n) => {
    const v = n.data?.estimated_monthly_saving_usd;
    return sum + (typeof v === "number" ? v : 0);
  }, 0);

  return (
    <div className="cd-page">
      <div className="page-header">
        <h1 className="page-title">Preview as customer</h1>
        <p className="page-subtitle">
          Read-only view of {ctx.company?.name ?? "the customer"}'s onboarding canvas.
          Chat input and Accept button are intentionally hidden here.
        </p>
      </div>

      {proposalMode ? (
        <div className="cd-preview-banner">
          <div className="cd-preview-banner-stats">
            <span><strong>{automatableCount}</strong> automated</span>
            <span><strong>{userActionCount}</strong> human</span>
            <span><strong>{integrationNodes.length}</strong> integrations</span>
            {totalSavingPerMonth > 0 ? (
              <span><strong>${Math.round(totalSavingPerMonth).toLocaleString()}</strong>/mo est. saving</span>
            ) : null}
          </div>
          <span className="cd-preview-banner-note">
            This is the proposal the customer would see today.
          </span>
        </div>
      ) : (
        <div className="cd-preview-banner">
          <span className="cd-preview-banner-note">
            Canvas captured during the conversation. Proposal automation tags have not been applied yet.
          </span>
        </div>
      )}

      <div className="canvas-layout">
        <div className="canvas-stage">
          <BusinessMap
            nodes={nodes}
            edges={edges}
            onNodeClick={() => {/* read-only: ignore */}}
          />
        </div>
      </div>
    </div>
  );
}
