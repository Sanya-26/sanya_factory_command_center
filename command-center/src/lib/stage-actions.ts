// Stage-aware status labels + action-button enablement.
// Single source of truth for what Sanya sees per `project_lifecycle_stage_runs.stage_slug`.
// Used by ProductVariation rows + ProductCustomerDetail panels.

export type PhaseAction =
  | "map"
  | "synopsis"
  | "proposal"
  | "schedule_call"
  | "contract"
  | "production_link"
  | "integrations"
  | "credentials"
  | "qc_signoff"          // info-only; "enabled" means render the chip
  | "health"
  | "issues"
  | "flags";

export interface StageMeta {
  status_label: string;           // single-sentence customer-facing-ish status
  enabled: Partial<Record<PhaseAction, boolean>>;
  next_prereq: Partial<Record<PhaseAction, string>>;  // tooltip on disabled
}

const STAGE: Record<string, StageMeta> = {
  intake: {
    status_label: "Map creating…",
    enabled: { map: false, synopsis: false, proposal: false, contract: false, schedule_call: false },
    next_prereq: {
      map: "available once the map is created",
      synopsis: "available after the map is created",
      proposal: "available once the proposal is drafted",
      contract: "available after the proposal is accepted",
      schedule_call: "available when the proposal is ready",
    },
  },
  council: {
    status_label: "Map created — drafting proposal",
    enabled: { map: true, synopsis: true, proposal: false, contract: false, schedule_call: false },
    next_prereq: {
      proposal: "available once the proposal is drafted",
      contract: "available after the proposal is accepted",
      schedule_call: "available when the proposal is ready",
    },
  },
  proposal: {
    status_label: "Ready for call",
    enabled: { map: true, synopsis: true, proposal: true, contract: false, schedule_call: true },
    next_prereq: {
      contract: "available after the proposal is accepted",
    },
  },
  proposing: {
    status_label: "Proposal sent — awaiting client",
    enabled: { map: true, synopsis: true, proposal: true, contract: false, schedule_call: false },
    next_prereq: {
      contract: "available after the proposal is accepted",
      schedule_call: "proposal already sent",
    },
  },
  "awaiting-approval": {
    status_label: "Contract pending signature",
    enabled: { map: true, synopsis: true, proposal: true, contract: true, schedule_call: false },
    next_prereq: {},
  },
  // Phase 2
  queued: {
    status_label: "Factory queued the build",
    enabled: { production_link: false, integrations: false, credentials: false, qc_signoff: false },
    next_prereq: {
      production_link: "available once the tenant is deployed",
      integrations: "available once the tenant is deployed",
      credentials: "available once the tenant is deployed",
    },
  },
  planning: {
    status_label: "Factory planning the build",
    enabled: { production_link: false, integrations: false, credentials: false, qc_signoff: false },
    next_prereq: {
      production_link: "available once the tenant is deployed",
    },
  },
  building: {
    status_label: "Factory producing tools…",
    enabled: { production_link: false, integrations: false, credentials: false, qc_signoff: false },
    next_prereq: {
      production_link: "available once the tenant is deployed",
    },
  },
  deployed: {
    status_label: "Credentials + integrations ready",
    enabled: { production_link: true, integrations: true, credentials: true, qc_signoff: true },
    next_prereq: {},
  },
  // Phase 3
  "sanya-audit": {
    status_label: "Audit by Sanya in progress",
    enabled: { map: true, synopsis: true, proposal: true, contract: true, production_link: true, integrations: true, credentials: true, qc_signoff: true },
    next_prereq: {},
  },
  // Phase 4
  live: {
    status_label: "Live",
    enabled: { map: true, synopsis: true, proposal: true, contract: true, production_link: true, integrations: true, credentials: true, qc_signoff: true, health: true, issues: true, flags: true },
    next_prereq: {},
  },
  paused: {
    status_label: "Paused",
    enabled: { map: true, synopsis: true, proposal: true, contract: true, production_link: true, integrations: true, credentials: true, qc_signoff: true, health: true, issues: true, flags: true },
    next_prereq: {},
  },
  "needs-info": {
    status_label: "Needs info from customer",
    enabled: { map: true, synopsis: true },
    next_prereq: {
      proposal: "blocked — needs info from customer",
    },
  },
};

const DEFAULT: StageMeta = {
  status_label: "Unknown",
  enabled: {},
  next_prereq: {},
};

export function stageMeta(stage_slug: string | null | undefined): StageMeta {
  if (!stage_slug) return DEFAULT;
  return STAGE[stage_slug] ?? DEFAULT;
}

export function isActionEnabled(stage_slug: string | null | undefined, action: PhaseAction): boolean {
  return !!stageMeta(stage_slug).enabled[action];
}

export function prereqMessage(stage_slug: string | null | undefined, action: PhaseAction): string | undefined {
  return stageMeta(stage_slug).next_prereq[action];
}
