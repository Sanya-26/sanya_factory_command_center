-- ============================================================================
-- ROLLBACK for migration 005_check_constraints_and_rls.sql
--
-- Restores the original CHECK constraints (more restrictive) and removes the
-- permissive RLS policies (leaving only service_role).
--
-- WARNING: rolling back will:
--   • Reject any existing ops_users rows with role NOT IN the original 8
--     values. If you applied Phase 6 Task 2 (Sanya/V to product_manager/cto),
--     run UPDATE ops_users SET role='admin' WHERE role IN ('product_manager',
--     'tech','cto','ceo') BEFORE this rollback or the constraint addition
--     will fail.
--   • Reject any proposal_artifacts rows with generated_by matching an agent
--     prefix. Run the equivalent UPDATE before rollback if needed.
--   • Remove anon access from the 9 new tables (service_role only) —
--     the UI will return empty for those tables.
--
-- NEVER run on production without explicit user approval.
-- ============================================================================

begin;

-- 1. Restore ops_users.role to original 8 values
alter table public.ops_users drop constraint if exists ops_users_role_check;
alter table public.ops_users
  add constraint ops_users_role_check
  check (role = any (array[
    'founder','admin','operator','ops','counsel','content','staff','viewer'
  ]));

-- 2. Restore proposal_artifacts.generated_by to original 2 values
alter table public.proposal_artifacts drop constraint if exists proposal_artifacts_generated_by_check;
alter table public.proposal_artifacts
  add constraint proposal_artifacts_generated_by_check
  check (generated_by = any (array['proposal-council'::text, 'admin-regen'::text]));

-- 3. Drop the permissive RLS policies (service_role policies from 004 remain)
drop policy if exists "customer_flags_ops_all"        on public.customer_flags;
drop policy if exists "tech_issues_ops_all"           on public.tech_issues;
drop policy if exists "sanya_audit_decisions_ops_all" on public.sanya_audit_decisions;
drop policy if exists "audit_checklists_ops_all"      on public.audit_checklists;
drop policy if exists "outbound_emails_ops_all"       on public.outbound_emails;
drop policy if exists "call_slot_offers_ops_all"      on public.call_slot_offers;
drop policy if exists "scheduled_calls_ops_all"       on public.scheduled_calls;
drop policy if exists "ceo_kpi_inputs_ops_all"        on public.ceo_kpi_inputs;
drop policy if exists "ceo_escalations_ops_all"       on public.ceo_escalations;

commit;
