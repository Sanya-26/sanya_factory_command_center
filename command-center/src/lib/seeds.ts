// Local-only seed fixtures backing the mock Supabase client.
// See docs/PRD-product-view.md §13.3 for the data shape.
//
// Every id below is a deterministic string so localStorage stays stable across
// resets. Real production data never touches this file.

const SANYA_ID = "171b0964-0273-4b74-8f71-0ca5c947f88a"; // real ops_user.id
const MITANSHI_ID = "u-mitanshi-0000-0000-0000-000000000001";
const ADAM_ID = "u-adam-0000-0000-0000-000000000002";
const V_ID = "u-v-cto-0000-0000-0000-000000000003";
const OUADIE_ID = "u-ouadie-ceo-0000-0000-0000-00000004";

const now = Date.now();
const ago = (days: number) => new Date(now - days * 86400_000).toISOString();

interface CompanySeed {
  id: string;
  name: string;
  niche: string;
  email: string;
  stage_slug: string;
  monthly_usd?: number;
  flags?: Array<{ severity: "low" | "medium" | "high" | "critical"; title: string; daysAgo: number; status?: "open" | "resolved" }>;
  events?: Array<{ event_kind: string; daysAgo: number; actor?: string; payload?: Record<string, unknown> }>;
  has_checklist?: boolean;
  has_decision?: "approve" | "bugs";
  active_issue?: { title: string; severity: "low" | "medium" | "high" | "critical"; priority: "normal" | "high" | "urgent"; assignee: string };
}

const COMPANIES_SEED: CompanySeed[] = [
  // ─── Cleo for Pools ────────────────────────────────────────────────
  // 3 live
  {
    id: "c-pool-live-01", name: "Crystal Clear Pools", niche: "cleo-for-pools",
    email: "ops@crystalclearpools.com", stage_slug: "live", monthly_usd: 1495,
    flags: [{ severity: "medium", title: "Lead form sometimes double-submits", daysAgo: 3, status: "open" }],
    events: [
      { event_kind: "onboarding_complete", daysAgo: 45, actor: "system" },
      { event_kind: "first_lead", daysAgo: 30, actor: "tenant_runtime" },
      { event_kind: "support_request", daysAgo: 3, actor: "customer", payload: { topic: "double-submit" } },
    ],
  },
  {
    id: "c-pool-live-02", name: "Lagoon Builders", niche: "cleo-for-pools",
    email: "hello@lagoonbuilders.com", stage_slug: "live", monthly_usd: 1995,
    events: [
      { event_kind: "onboarding_complete", daysAgo: 90, actor: "system" },
      { event_kind: "monthly_review_passed", daysAgo: 6, actor: "system" },
    ],
  },
  {
    id: "c-pool-live-03", name: "AquaArt Pools", niche: "cleo-for-pools",
    email: "team@aquaartpools.com", stage_slug: "live", monthly_usd: 995,
    flags: [
      { severity: "high", title: "Map renders broken on Safari mobile", daysAgo: 1, status: "open" },
      { severity: "low", title: "Logo color off by 5%", daysAgo: 14, status: "resolved" },
    ],
    events: [
      { event_kind: "onboarding_complete", daysAgo: 21, actor: "system" },
      { event_kind: "support_request", daysAgo: 1, actor: "customer" },
    ],
  },
  // 1 audit
  {
    id: "c-pool-audit-01", name: "Splash Masters", niche: "cleo-for-pools",
    email: "ops@splashmasters.com", stage_slug: "sanya-audit", monthly_usd: 1495,
    has_checklist: true,
    events: [
      { event_kind: "tenant_deployed", daysAgo: 2, actor: "factory" },
      { event_kind: "qc_checklist_generated", daysAgo: 1, actor: "qc_agent" },
    ],
  },
  // 2 build
  {
    id: "c-pool-build-01", name: "BlueWave Inc", niche: "cleo-for-pools",
    email: "founders@bluewave.com", stage_slug: "building", monthly_usd: 1295,
    active_issue: { title: "Hero image upload fails > 5MB", severity: "high", priority: "high", assignee: MITANSHI_ID },
    events: [
      { event_kind: "build_started", daysAgo: 5, actor: "factory" },
      { event_kind: "ticket_assigned", daysAgo: 1, actor: "sanya", payload: { ticket: "hero-upload" } },
    ],
  },
  {
    id: "c-pool-build-02", name: "Sunbelt Pools", niche: "cleo-for-pools",
    email: "hi@sunbeltpools.com", stage_slug: "deployed", monthly_usd: 1495,
    events: [
      { event_kind: "build_completed", daysAgo: 1, actor: "factory" },
      { event_kind: "tenant_deployed", daysAgo: 1, actor: "factory" },
    ],
  },
  // 4 sign
  {
    id: "c-pool-sign-01", name: "Backyard Oasis", niche: "cleo-for-pools",
    email: "owner@backyardoasis.com", stage_slug: "intake", monthly_usd: 1295,
    events: [{ event_kind: "signup", daysAgo: 0, actor: "customer" }],
  },
  {
    id: "c-pool-sign-02", name: "Cascade Pools", niche: "cleo-for-pools",
    email: "team@cascadepools.com", stage_slug: "council", monthly_usd: 1495,
    events: [
      { event_kind: "signup", daysAgo: 2, actor: "customer" },
      { event_kind: "council_started", daysAgo: 1, actor: "system" },
    ],
  },
  {
    id: "c-pool-sign-03", name: "Pacific Pools", niche: "cleo-for-pools",
    email: "ops@pacificpools.com", stage_slug: "proposal", monthly_usd: 1495,
    events: [
      { event_kind: "signup", daysAgo: 6, actor: "customer" },
      { event_kind: "council_complete", daysAgo: 4, actor: "system" },
      { event_kind: "proposal_drafted", daysAgo: 1, actor: "proposal_agent" },
    ],
  },
  {
    id: "c-pool-sign-04", name: "Desert Mirage Pools", niche: "cleo-for-pools",
    email: "info@desertmirage.com", stage_slug: "awaiting-approval", monthly_usd: 1295,
    flags: [{ severity: "medium", title: "Asked for warranty clarification", daysAgo: 2, status: "open" }],
    events: [
      { event_kind: "signup", daysAgo: 10, actor: "customer" },
      { event_kind: "proposal_sent", daysAgo: 3, actor: "sanya" },
      { event_kind: "contract_sent", daysAgo: 1, actor: "sanya" },
    ],
  },
  // ─── Gameday Model ────────────────────────────────────────────────
  {
    id: "c-game-live-01", name: "Touchdown Tech", niche: "gameday-model",
    email: "ceo@touchdowntech.com", stage_slug: "live", monthly_usd: 2495,
    events: [
      { event_kind: "onboarding_complete", daysAgo: 60, actor: "system" },
      { event_kind: "feature_request", daysAgo: 5, actor: "customer", payload: { topic: "live-scoring" } },
    ],
  },
  {
    id: "c-game-audit-01", name: "Stadium Stream", niche: "gameday-model",
    email: "hello@stadiumstream.com", stage_slug: "sanya-audit", monthly_usd: 1995,
    has_checklist: true, has_decision: "bugs",
    events: [
      { event_kind: "tenant_deployed", daysAgo: 4, actor: "factory" },
      { event_kind: "audit_bugs_filed", daysAgo: 1, actor: "sanya" },
    ],
  },
  {
    id: "c-game-build-01", name: "GameOn Analytics", niche: "gameday-model",
    email: "team@gameon.io", stage_slug: "planning", monthly_usd: 2295,
    active_issue: { title: "Spec ambiguity on stats schema", severity: "medium", priority: "normal", assignee: ADAM_ID },
    events: [
      { event_kind: "build_planning", daysAgo: 3, actor: "factory" },
    ],
  },
  {
    id: "c-game-sign-01", name: "PlayTracker", niche: "gameday-model",
    email: "founders@playtracker.com", stage_slug: "proposal", monthly_usd: 1795,
    events: [{ event_kind: "signup", daysAgo: 5, actor: "customer" }],
  },
  {
    id: "c-game-sign-02", name: "ScoreboardAI", niche: "gameday-model",
    email: "hi@scoreboardai.com", stage_slug: "intake", monthly_usd: 1995,
    events: [{ event_kind: "signup", daysAgo: 1, actor: "customer" }],
  },
  // ─── Real Estate Model ────────────────────────────────────────────
  {
    id: "c-re-build-01", name: "Listing Lens", niche: "real-estate-model",
    email: "team@listinglens.co", stage_slug: "queued", monthly_usd: 1795,
    events: [
      { event_kind: "signup", daysAgo: 8, actor: "customer" },
      { event_kind: "build_queued", daysAgo: 1, actor: "factory" },
    ],
  },
  {
    id: "c-re-sign-01", name: "HomeWise", niche: "real-estate-model",
    email: "ceo@homewise.io", stage_slug: "intake", monthly_usd: 1495,
    events: [{ event_kind: "signup", daysAgo: 2, actor: "customer" }],
  },
  {
    id: "c-re-sign-02", name: "PropTour AI", niche: "real-estate-model",
    email: "team@proptour.ai", stage_slug: "council", monthly_usd: 1995,
    events: [
      { event_kind: "signup", daysAgo: 4, actor: "customer" },
      { event_kind: "council_started", daysAgo: 2, actor: "system" },
    ],
  },
  {
    id: "c-re-sign-03", name: "RealAgent", niche: "real-estate-model",
    email: "ops@realagent.app", stage_slug: "proposal", monthly_usd: 1595,
    events: [
      { event_kind: "signup", daysAgo: 6, actor: "customer" },
      { event_kind: "proposal_drafted", daysAgo: 1, actor: "proposal_agent" },
    ],
  },
];

const opsUsers = [
  { user_id: SANYA_ID, role: "product_manager", slack_user_id: "U0SANYA" },
  { user_id: MITANSHI_ID, role: "tech", slack_user_id: "U0MITANSHI" },
  { user_id: ADAM_ID, role: "tech", slack_user_id: "U0ADAM" },
  { user_id: V_ID, role: "cto", slack_user_id: "U0V" },
  { user_id: OUADIE_ID, role: "ceo", slack_user_id: "U0OUADIE" },
];

const niches = [
  { niche_slug: "cleo-for-pools", display_name: "Cleo for Pools" },
  { niche_slug: "gameday-model", display_name: "Gameday Model" },
  { niche_slug: "real-estate-model", display_name: "Real Estate Model" },
];

// Build derived rows
const companies = COMPANIES_SEED.map((c) => ({
  id: c.id,
  name: c.name,
  niche: c.niche,
  email: c.email,
  monthly_usd: c.monthly_usd,
  created_at: ago(20),
}));

const stageRuns = COMPANIES_SEED.map((c, i) => ({
  id: `stage-${i}`,
  project_id: c.id,
  lifecycle_plan_id: `plan-${c.niche}`,
  stage_slug: c.stage_slug,
  order_index: 1,
  status: c.stage_slug === "live" ? "completed" : "active",
  updated_at: ago(1),
  started_at: ago(2),
  completed_at: c.stage_slug === "live" ? ago(1) : null,
}));

const customer_flags: any[] = [];
COMPANIES_SEED.forEach((c) => {
  (c.flags ?? []).forEach((f, fi) => {
    // Link to underlying issues by keyword match (mimics triage agent output).
    let linked_issue_id: string | null = null;
    const title = f.title.toLowerCase();
    if (title.includes("double-submit") || title.includes("duplicate")) linked_issue_id = "ti-double-submit";
    if (title.includes("mobile") || title.includes("safari")) linked_issue_id = "ti-mobile-perf";
    customer_flags.push({
      id: `flag-${c.id}-${fi}`,
      company_id: c.id,
      reported_at: ago(f.daysAgo),
      source: "manual",
      severity: f.severity,
      title: f.title,
      body: null,
      status: f.status ?? "open",
      resolved_at: f.status === "resolved" ? ago(Math.max(0, f.daysAgo - 1)) : null,
      created_at: ago(f.daysAgo),
      linked_issue_id,
      triaged_at: linked_issue_id ? ago(Math.max(0, f.daysAgo - 0.1)) : null,
      triaged_by: linked_issue_id ? "triage_agent:v1" : null,
    });
  });
});

const client_journey_events: any[] = [];
COMPANIES_SEED.forEach((c) => {
  (c.events ?? []).forEach((e, ei) => {
    client_journey_events.push({
      id: `evt-${c.id}-${ei}`,
      company_id: c.id,
      event_kind: e.event_kind,
      at: ago(e.daysAgo),
      created_at: ago(e.daysAgo),
      actor: e.actor ?? "system",
      payload: e.payload ?? {},
    });
  });
});

const audit_checklists: any[] = [];
COMPANIES_SEED.filter((c) => c.has_checklist).forEach((c) => {
  audit_checklists.push({
    id: `chk-${c.id}`,
    company_id: c.id,
    generated_at: ago(1),
    generated_by: "qc_agent:stub",
    is_current: true,
    signed_off_by: null,
    signed_off_at: null,
    items: [
      { id: "client-onboard", label: "Sign up as a brand-new customer end-to-end. Does it feel obvious without help?", expected: "Reach the home page logged in, no support needed", status: "pass" },
      { id: "client-quote", label: "Submit a real quote request as a homeowner", expected: "Form asks the right questions, returns a sensible estimate", status: "pass" },
      { id: "client-journeys", label: "Try the 3 most common journeys (browse → quote → schedule). Anything > 3 clicks?", expected: "All journeys under 3 clicks", status: "pending" },
      { id: "client-mobile", label: "Open the site on a phone. Is anything cramped or broken?", expected: "Readable, no horizontal scroll, taps work", status: "pending" },
      { id: "client-support", label: "Pretend to be a confused customer. Where does support live? Is it reachable?", expected: "Support link visible, contact form / chat works", status: "pending" },
      { id: "client-copy", label: "Read the home page copy out loud. Does it sound like Splash Masters or like a template?", expected: "Brand voice consistent, no Lorem-ipsum feel", status: "pending" },
      { id: "client-photos", label: "Check the photos. Are they from the real customer or stock?", expected: "Customer-supplied photos, not generic stock", status: "pending" },
      { id: "client-ai", label: "Try the AI receptionist (if enabled). Does it answer the top 3 FAQs correctly?", expected: "Correct hours, services, pricing range", status: "pending" },
      { id: "client-stress", label: "Try to break it: empty inputs, weird characters, double submits. Anything explode?", expected: "Graceful validation, no console errors", status: "pending" },
      { id: "client-gut", label: "Gut check: would you recommend this to a friend in this niche today?", expected: "Yes, with no caveats", status: "pending" },
    ],
  });
});

const tech_issues: any[] = [];
COMPANIES_SEED.forEach((c) => {
  if (c.active_issue) {
    tech_issues.push({
      id: `ti-${c.id}`,
      company_id: c.id,
      build_run_id: null,
      raised_by: SANYA_ID,
      assignee_id: c.active_issue.assignee,
      title: c.active_issue.title,
      description: null,
      severity: c.active_issue.severity,
      priority: c.active_issue.priority,
      status: "open",
      mirrored_alert_id: null,
      created_at: ago(1),
      updated_at: ago(1),
      closed_at: null,
    });
  }
});
// Issue assigned directly to V (CTO) to demonstrate delegation
tech_issues.push({
  id: "ti-cto-escalation",
  company_id: "c-game-audit-01",
  build_run_id: null,
  raised_by: SANYA_ID,
  assignee_id: V_ID,
  title: "Live-scoring data freshness > 30s — needs architectural decision",
  description: "Sanya flagged this during audit. Could be CDN cache, could be feed cadence. V to decide direction before assigning.",
  severity: "high",
  priority: "high",
  status: "open",
  mirrored_alert_id: null,
  created_at: ago(1),
  updated_at: ago(1),
  closed_at: null,
});

// Add an extra "done" issue for variety
tech_issues.push({
  id: "ti-done-01",
  company_id: "c-pool-live-01",
  raised_by: SANYA_ID,
  assignee_id: ADAM_ID,
  title: "Footer copyright year wrong",
  description: "Showed 2024 instead of current.",
  severity: "low",
  priority: "normal",
  status: "done",
  created_at: ago(14),
  updated_at: ago(13),
  closed_at: ago(13),
});

// ─── Flag-link issue: cross-customer pattern ───────────────────────────────
// A single underlying issue with many flags from many customers — demonstrates
// the triage agent's grouping and the priority score in the new Issues view.
tech_issues.push({
  id: "ti-mobile-perf",
  company_id: null,
  raised_by: SANYA_ID,
  assignee_id: null,
  title: "Site loads slowly on mobile (LCP > 4s)",
  description: "Multiple customers reporting slow first paint on mobile devices, especially over LTE.",
  severity: "high",
  priority: "high",
  status: "open",
  created_at: ago(3),
  updated_at: ago(1),
  closed_at: null,
});
tech_issues.push({
  id: "ti-double-submit",
  company_id: null,
  raised_by: SANYA_ID,
  assignee_id: MITANSHI_ID,
  title: "Lead form sometimes double-submits",
  description: "When a user clicks Submit rapidly, the form fires twice creating duplicate leads.",
  severity: "medium",
  priority: "normal",
  status: "in_progress",
  created_at: ago(5),
  updated_at: ago(1),
  closed_at: null,
});

// ─── Team Management seeds (Round-6) — one stuck + one stale + one never-started + 2 recently-closed ───
tech_issues.push({
  id: "ti-team-blocked-01",
  company_id: "c-pool-live-02",
  raised_by: SANYA_ID,
  assignee_id: MITANSHI_ID,
  title: "Stripe webhook signature mismatch on prod",
  description: "Blocked on Stripe support replying about the signing secret rotation.",
  severity: "high",
  priority: "high",
  status: "blocked",
  created_at: ago(6),
  updated_at: ago(2),
  closed_at: null,
});
tech_issues.push({
  id: "ti-team-stale-01",
  company_id: "c-pool-live-03",
  raised_by: SANYA_ID,
  assignee_id: ADAM_ID,
  title: "Migrate quote calculator to new pricing engine",
  description: "Started last week; no update since.",
  severity: "medium",
  priority: "normal",
  status: "in_progress",
  created_at: ago(10),
  updated_at: ago(7),
  closed_at: null,
});
tech_issues.push({
  id: "ti-team-neverstarted-01",
  company_id: "c-realestate-sign-02",
  raised_by: SANYA_ID,
  assignee_id: V_ID,
  title: "Pick a vector DB for listing similarity search",
  description: "Need a decision: pgvector vs. Pinecone vs. Qdrant. V to own.",
  severity: "medium",
  priority: "normal",
  status: "open",
  created_at: ago(9),
  updated_at: ago(9),
  closed_at: null,
});
tech_issues.push({
  id: "ti-team-done-recent-01",
  company_id: "c-pool-live-01",
  raised_by: SANYA_ID,
  assignee_id: MITANSHI_ID,
  title: "Fix favicon flashing on first paint",
  description: "Tiny CSP / preload fix.",
  severity: "low",
  priority: "normal",
  status: "done",
  created_at: ago(8),
  updated_at: ago(2),
  closed_at: ago(2),
});
tech_issues.push({
  id: "ti-team-done-recent-02",
  company_id: "c-game-live-01",
  raised_by: SANYA_ID,
  assignee_id: ADAM_ID,
  title: "Roster import — handle blank middle names",
  description: "CSV import crashed on optional middle-name column.",
  severity: "medium",
  priority: "normal",
  status: "done",
  created_at: ago(11),
  updated_at: ago(4),
  closed_at: ago(4),
});

// Cross-customer flags pointing at the same underlying issues
const extraFlags: any[] = [
  { company_id: "c-pool-live-01", linked_issue_id: "ti-double-submit", severity: "medium", title: "Lead form sometimes double-submits", daysAgo: 3, source: "support_email" },
  { company_id: "c-pool-live-01", linked_issue_id: "ti-mobile-perf", severity: "medium", title: "Site slow on my phone", daysAgo: 4, source: "chat" },
  { company_id: "c-pool-live-02", linked_issue_id: "ti-mobile-perf", severity: "high", title: "Phone visitors bouncing — page takes 5s", daysAgo: 2, source: "manual" },
  { company_id: "c-pool-live-03", linked_issue_id: "ti-mobile-perf", severity: "high", title: "Mobile lighthouse score 38", daysAgo: 1, source: "audit" },
  { company_id: "c-game-live-01", linked_issue_id: "ti-mobile-perf", severity: "medium", title: "Slow load on iPhone", daysAgo: 3, source: "support_email" },
  { company_id: "c-pool-live-02", linked_issue_id: "ti-double-submit", severity: "medium", title: "Duplicate leads in CRM", daysAgo: 4, source: "support_email" },
];
extraFlags.forEach((f, i) => {
  customer_flags.push({
    id: `flag-link-${i}`,
    company_id: f.company_id,
    reported_at: ago(f.daysAgo),
    source: f.source,
    severity: f.severity,
    title: f.title,
    body: null,
    status: "open",
    resolved_at: null,
    created_at: ago(f.daysAgo),
    linked_issue_id: f.linked_issue_id,
    triaged_at: ago(f.daysAgo - 0.1),
    triaged_by: "triage_agent:v1",
  });
});

const sanya_audit_decisions: any[] = [];
COMPANIES_SEED.filter((c) => c.has_decision).forEach((c) => {
  sanya_audit_decisions.push({
    id: `dec-${c.id}`,
    company_id: c.id,
    decision: c.has_decision!,
    notes: c.has_decision === "bugs" ? "Spotted 3 layout bugs and 1 broken link." : "All checks passed.",
    bug_issue_ids: [],
    decided_by: SANYA_ID,
    decided_at: ago(1),
  });
});

const outbound_emails = [
  { id: "em-1", company_id: "c-pool-sign-03", recipient_email: "ops@pacificpools.com", template: "proposal_send", payload: {}, status: "sent", provider: "stub", provider_message_id: "stub-1", sent_at: ago(1), created_at: ago(1) },
  { id: "em-2", company_id: "c-pool-sign-04", recipient_email: "info@desertmirage.com", template: "contract_send", payload: {}, status: "sent", provider: "stub", provider_message_id: "stub-2", sent_at: ago(1), created_at: ago(1) },
  { id: "em-3", company_id: "c-pool-audit-01", recipient_email: "ops@splashmasters.com", template: "audit_invite", payload: {}, status: "sent", provider: "stub", provider_message_id: "stub-3", sent_at: ago(1), created_at: ago(1) },
];

const notifications = [
  { id: "n-1", recipient_user_id: SANYA_ID, kind: "map-ready", severity: "info", title: "Map ready for Splash Masters", body: null, related_company_id: "c-pool-audit-01", read_at: null, created_at: ago(1) },
  { id: "n-2", recipient_user_id: SANYA_ID, kind: "integrations-ready", severity: "info", title: "Integrations ready for Sunbelt Pools", body: null, related_company_id: "c-pool-build-02", read_at: null, created_at: ago(0.5) },
];

const contract_drafts: any[] = [];
COMPANIES_SEED.filter((c) => ["awaiting-approval", "proposal", "live", "sanya-audit"].includes(c.stage_slug)).forEach((c, i) => {
  contract_drafts.push({
    id: `cd-${c.id}`,
    company_id: c.id,
    build_run_id: null,
    tenant_slug: null,
    monthly_usd: c.monthly_usd ?? 1500,
    tier_slug: "standard",
    contract_md: `# Contract for ${c.name}\n\nStandard CLEO SaaS agreement.\n\n## Term\n12 months auto-renewing.`,
    clauses: [],
    jurisdiction: "US-DE",
    status: c.stage_slug === "live" || c.stage_slug === "sanya-audit" ? "signed" : c.stage_slug === "awaiting-approval" ? "sent" : "draft",
    sent_at: ago(2),
    signed_at: c.stage_slug === "live" || c.stage_slug === "sanya-audit" ? ago(1) : null,
    signature_url: null,
    cost_usd: 0,
    generated_at: ago(3),
    updated_at: ago(2),
  });
});

const proposal_artifacts: any[] = COMPANIES_SEED
  .filter((c) => ["proposal", "awaiting-approval", "sanya-audit", "live"].includes(c.stage_slug))
  .map((c, i) => ({
    id: `pa-${c.id}`,
    company_id: c.id,
    kind: "synopsis",
    version: 1,
    storage_path: `synopsis/${c.id}/v1.md`,
    generated_by: "synopsis_agent:stub",
    generated_at: ago(2),
    released_to_client_at: null,
  }));

const niche_templates = niches;

// ─── CEO-view augmentations ───────────────────────────────────────────────
// Add discount + ceo_approval + ceo_signed state to contract_drafts already
// seeded above.
function patchContract(id: string, patch: Record<string, unknown>) {
  const idx = contract_drafts.findIndex((c: any) => c.id === id);
  if (idx >= 0) Object.assign(contract_drafts[idx], patch);
}

// Pacific Pools: a discount pending CEO approval (Sanya proposed 25% off)
patchContract("cd-c-pool-sign-03", {
  list_monthly_usd: 1995,
  monthly_usd: 1495,
  discount_pct: 25,
  discount_justification: "Anchor customer for cleo-for-pools — 3 referrals expected. Owner is well-known.",
  ceo_approval_status: "pending",
  ceo_signed_at: null,
});

// Desert Mirage Pools: approved discount, awaiting CEO signature
patchContract("cd-c-pool-sign-04", {
  list_monthly_usd: 1695,
  monthly_usd: 1295,
  discount_pct: 24,
  discount_justification: "Multi-year LOI signed. Pricing match to nearest local competitor.",
  ceo_approval_status: "approved",
  ceo_approval_by: SANYA_ID,
  ceo_approval_at: ago(1),
  ceo_signed_at: null,
});

// Crystal Clear Pools — fully signed last week (lives in Wins feed)
patchContract("cd-c-pool-live-01", {
  list_monthly_usd: 1495,
  monthly_usd: 1495,
  discount_pct: 0,
  ceo_approval_status: "not_required",
  ceo_signed_at: ago(7),
  ceo_signed_by: OUADIE_ID,
});

// Lagoon Builders — signed 30 days ago
patchContract("cd-c-pool-live-02", {
  list_monthly_usd: 2495,
  monthly_usd: 1995,
  discount_pct: 20,
  discount_justification: "Founder-friend pricing for 12 months.",
  ceo_approval_status: "approved",
  ceo_approval_by: OUADIE_ID,
  ceo_approval_at: ago(32),
  ceo_signed_at: ago(30),
  ceo_signed_by: OUADIE_ID,
});

// AquaArt Pools — signed 21 days ago (no discount)
patchContract("cd-c-pool-live-03", {
  list_monthly_usd: 995,
  monthly_usd: 995,
  discount_pct: 0,
  ceo_approval_status: "not_required",
  ceo_signed_at: ago(21),
  ceo_signed_by: OUADIE_ID,
});

// Touchdown Tech — signed 60 days ago
patchContract("cd-c-game-live-01", {
  list_monthly_usd: 2995,
  monthly_usd: 2495,
  discount_pct: 17,
  discount_justification: "Multi-year strategic deal — Gameday's first marquee.",
  ceo_approval_status: "approved",
  ceo_approval_by: OUADIE_ID,
  ceo_approval_at: ago(62),
  ceo_signed_at: ago(60),
  ceo_signed_by: OUADIE_ID,
});

// CEO KPI inputs (MOCK)
const ceo_kpi_inputs = [
  {
    id: "kpi-current",
    month: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
    monthly_burn_usd: 58000,
    payroll_usd: 48000,
    headcount: 11,
    cash_balance_usd: 812000,
    mrr_target_usd: 25000,
    line_allocations: {
      "cleo-for-pools": 22000,
      "gameday-model": 18000,
      "real-estate-model": 9000,
    },
    open_requisitions: [
      { title: "Sr. AI engineer", manager: "V", comp_band: "$210–250k" },
      { title: "Mid Frontend engineer", manager: "Mitanshi", comp_band: "$140–170k" },
    ],
    updated_at: ago(2),
  },
];

// Scheduled calls for the calendar widget (this week)
const aheadDays = (days: number, hour = 10) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};
const scheduled_calls = [
  {
    id: "sc-1",
    company_id: "c-pool-sign-03",
    offer_id: null,
    slot_start: aheadDays(2, 10),
    slot_end: aheadDays(2, 11),
    agenda: "CLEO proposal walk-through",
    provider: "google-meet",
    meet_url: "https://meet.google.com/abc-defg-hij",
    external_event_id: null,
    created_at: ago(1),
  },
  {
    id: "sc-2",
    company_id: "c-pool-sign-04",
    offer_id: null,
    slot_start: aheadDays(3, 13),
    slot_end: aheadDays(3, 14),
    agenda: "Contract review",
    provider: "google-meet",
    meet_url: "https://meet.google.com/xyz-uvwq-rst",
    external_event_id: null,
    created_at: ago(0.5),
  },
  {
    id: "sc-3",
    company_id: "c-game-live-01",
    offer_id: null,
    slot_start: aheadDays(5, 15),
    slot_end: aheadDays(5, 16),
    agenda: "Quarterly business review",
    provider: "google-meet",
    meet_url: "https://meet.google.com/mno-pqrs-tuv",
    external_event_id: null,
    created_at: ago(2),
  },
];

const call_slot_offers: any[] = [];

// CEO escalations from Sanya
const ceo_escalations = [
  {
    id: "esc-1",
    raised_by: SANYA_ID,
    title: "Pacific Pools wants 35% off — above policy",
    body: "Owner is well-known in the niche and pledged 3 written referrals. Our policy ceiling is 25% off list. Asking for an exception this once.",
    category: "contract",
    urgency: "high",
    related_company_id: "c-pool-sign-03",
    status: "open",
    decision: null,
    decision_notes: null,
    decided_by: null,
    decided_at: null,
    created_at: ago(2),
  },
  {
    id: "esc-2",
    raised_by: SANYA_ID,
    title: "Should we sunset Gameday Model?",
    body: "60 days since launch, 1 live customer, 1 in audit, 2 in proposal. Growth is flat. Killing the line frees Mitanshi for Real Estate.",
    category: "strategic",
    urgency: "normal",
    related_company_id: null,
    status: "open",
    decision: null,
    decision_notes: null,
    decided_by: null,
    decided_at: null,
    created_at: ago(5),
  },
  {
    id: "esc-3",
    raised_by: SANYA_ID,
    title: "Hire a second designer for Real Estate launch?",
    body: "Real Estate line ships in 4 weeks. Current designer is already at 110% utilization. Mid-level @ ~$150k or contract @ $8k/mo for 3 months.",
    category: "hire",
    urgency: "normal",
    related_company_id: null,
    status: "acknowledged",
    decision: null,
    decision_notes: null,
    decided_by: OUADIE_ID,
    decided_at: ago(1),
    created_at: ago(8),
  },
];

export const INITIAL_DB = {
  companies,
  ops_users: opsUsers,
  project_lifecycle_stage_runs: stageRuns,
  customer_flags,
  client_journey_events,
  audit_checklists,
  tech_issues,
  sanya_audit_decisions,
  outbound_emails,
  notifications,
  contract_drafts,
  proposal_artifacts,
  niche_templates,
  scheduled_calls,
  call_slot_offers,
  ceo_kpi_inputs,
  ceo_escalations,
};

export const SEEDED_USER_ID = SANYA_ID;
export const SEEDED_USER_EMAIL = "sanya@aubos.ai";
