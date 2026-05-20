// Mapping from the existing 12-stage `project_lifecycle_stage_runs.stage_slug`
// vocabulary onto the 3 PRD-defined phases shown in the Product view.
// See docs/PRD-product-view.md §5.

export type ProductPhase = "phase1" | "phase2" | "phase3" | "live";

export const PHASE_TITLE: Record<ProductPhase, string> = {
  phase1: "Phase 1 — Sign",
  phase2: "Phase 2 — Build",
  phase3: "Phase 3 — Audit",
  live: "Live",
};

const PHASE_BY_STAGE: Record<string, ProductPhase> = {
  intake: "phase1",
  council: "phase1",
  proposal: "phase1",
  "awaiting-approval": "phase1",
  proposing: "phase1",
  queued: "phase2",
  planning: "phase2",
  building: "phase2",
  deployed: "phase2",
  "sanya-audit": "phase3",
  live: "live",
  paused: "live",
  "needs-info": "phase1",
};

// Customer-facing labels per stage (the PRD's "Map creating → Map created → …")
export const STAGE_LABEL: Record<string, string> = {
  intake: "Map creating",
  council: "Map created — proposal in progress",
  proposal: "Schedule call",
  proposing: "Proposal sent",
  "awaiting-approval": "Contract pending",
  queued: "Factory producing tool",
  planning: "Factory producing tool",
  building: "Factory producing tool",
  deployed: "Credentials & integrations",
  "sanya-audit": "Audit (Sanya)",
  live: "Live",
  paused: "Paused",
  "needs-info": "Needs info",
};

export function phaseFor(stageSlug: string | null | undefined): ProductPhase {
  if (!stageSlug) return "phase1";
  return PHASE_BY_STAGE[stageSlug] ?? "phase1";
}

export function labelFor(stageSlug: string | null | undefined): string {
  if (!stageSlug) return "—";
  return STAGE_LABEL[stageSlug] ?? stageSlug;
}
