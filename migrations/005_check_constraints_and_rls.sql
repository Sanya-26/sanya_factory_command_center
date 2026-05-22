-- ============================================================================
-- Migration 005 — Expand 2 CHECK constraints + add permissive RLS to new tables
--
-- Three changes, all purely additive in effect:
--
--   1. public.ops_users.role CHECK — currently rejects the 4 PRD-canonical
--      roles (product_manager, tech, cto, ceo). Expand to include them.
--      Existing rows (all role='admin') remain valid.
--
--   2. public.proposal_artifacts.generated_by CHECK — currently allows only
--      'proposal-council' | 'admin-regen'. Expand to allow agent-prefix
--      patterns so the synopsis/pricing/qc/contract/triage agents can write
--      rows. Both original values stay accepted.
--
--   3. RLS — the 9 tables migration 004 created only have a service_role
--      policy. The project convention (per pg_policies inspection in
--      Phase 5B) uses an `_ops_all to public` permissive pattern for tables
--      the UI reads/writes from the browser via the anon key. Add matching
--      policies so the UI can actually consume the new tables.
--
-- All operations:
--   • Wrapped in BEGIN ... COMMIT (atomic).
--   • Use IF EXISTS / DROP-then-ADD for CHECK constraint expansion.
--   • Use DROP POLICY IF EXISTS + CREATE POLICY for idempotency.
--   • No data is rewritten; no rows are touched.
--
-- Reviewer note: this migration MODIFIES three constraints / adds 9 policies
-- on tables that pre-existed (ops_users, proposal_artifacts). The user's
-- Phase 6 brief explicitly authorized Task 5 (proposal_artifacts CHECK fix)
-- and Task 2 (role assignments — which requires the ops_users CHECK to allow
-- the new role values). The RLS policy additions are needed for Task 1's
-- dev-bypass to actually return data from the new tables.
-- ============================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ops_users.role — expand allowed values to include PRD-canonical roles
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.ops_users drop constraint if exists ops_users_role_check;
alter table public.ops_users
  add constraint ops_users_role_check
  check (role = any (array[
    -- Original 8:
    'founder','admin','operator','ops','counsel','content','staff','viewer',
    -- New 4 (PRD-canonical):
    'product_manager','tech','cto','ceo'
  ]));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. proposal_artifacts.generated_by — allow agent-prefix patterns
--    Existing rows have generated_by='proposal-council' — still accepted.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.proposal_artifacts
  drop constraint if exists proposal_artifacts_generated_by_check;
alter table public.proposal_artifacts
  add constraint proposal_artifacts_generated_by_check
  check (
    generated_by in ('proposal-council', 'admin-regen')
    or generated_by like 'pricing_agent:%'
    or generated_by like 'qc_agent:%'
    or generated_by like 'synopsis_agent:%'
    or generated_by like 'contract_agent:%'
    or generated_by like 'triage_agent:%'
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS — add permissive `_ops_all to public` policies on the 9 new tables
--    to match the existing project convention (see contract_drafts,
--    niche_templates, tenant_alerts, etc.). UI uses the anon key + relies
--    on application-layer role gating via ops_users; RLS stays open at the
--    DB layer.
-- ─────────────────────────────────────────────────────────────────────────────

drop policy if exists "customer_flags_ops_all"        on public.customer_flags;
create policy "customer_flags_ops_all"        on public.customer_flags        for all to public using (true) with check (true);

drop policy if exists "tech_issues_ops_all"           on public.tech_issues;
create policy "tech_issues_ops_all"           on public.tech_issues           for all to public using (true) with check (true);

drop policy if exists "sanya_audit_decisions_ops_all" on public.sanya_audit_decisions;
create policy "sanya_audit_decisions_ops_all" on public.sanya_audit_decisions for all to public using (true) with check (true);

drop policy if exists "audit_checklists_ops_all"      on public.audit_checklists;
create policy "audit_checklists_ops_all"      on public.audit_checklists      for all to public using (true) with check (true);

drop policy if exists "outbound_emails_ops_all"       on public.outbound_emails;
create policy "outbound_emails_ops_all"       on public.outbound_emails       for all to public using (true) with check (true);

drop policy if exists "call_slot_offers_ops_all"      on public.call_slot_offers;
create policy "call_slot_offers_ops_all"      on public.call_slot_offers      for all to public using (true) with check (true);

drop policy if exists "scheduled_calls_ops_all"       on public.scheduled_calls;
create policy "scheduled_calls_ops_all"       on public.scheduled_calls       for all to public using (true) with check (true);

drop policy if exists "ceo_kpi_inputs_ops_all"        on public.ceo_kpi_inputs;
create policy "ceo_kpi_inputs_ops_all"        on public.ceo_kpi_inputs        for all to public using (true) with check (true);

drop policy if exists "ceo_escalations_ops_all"       on public.ceo_escalations;
create policy "ceo_escalations_ops_all"       on public.ceo_escalations       for all to public using (true) with check (true);

commit;

-- ============================================================================
-- POST-APPLY verification:
--
-- 1) ops_users CHECK includes 4 new roles:
--    select pg_get_constraintdef(c.oid)
--      from pg_constraint c where conname='ops_users_role_check';
--    -- expect array to include 'product_manager','tech','cto','ceo'
--
-- 2) proposal_artifacts CHECK allows agent prefixes:
--    select pg_get_constraintdef(c.oid)
--      from pg_constraint c where conname='proposal_artifacts_generated_by_check';
--
-- 3) RLS policies present:
--    select tablename, policyname, roles, cmd
--      from pg_policies
--      where schemaname='public' and policyname like '%_ops_all'
--        and tablename in ('customer_flags','tech_issues','sanya_audit_decisions',
--                          'audit_checklists','outbound_emails','call_slot_offers',
--                          'scheduled_calls','ceo_kpi_inputs','ceo_escalations');
--    -- expect 9 rows
-- ============================================================================
