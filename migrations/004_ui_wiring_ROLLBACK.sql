-- ============================================================================
-- ROLLBACK for migration 004_ui_wiring.sql
--
-- ⚠  DESTRUCTIVE.  This file DROPs the 9 tables and 4 views created by 004,
--    DROPs the 3 triggers and 2 functions it added, and DROPs the 13 columns
--    it added (5 to tenant_health_snapshots/ops_users/client_journey_events,
--    9 to contract_drafts).  It does NOT remove the 3 niche_templates rows
--    (cleo-for-pools, gameday-model, real-estate-model) since deleting them
--    could break references elsewhere — manually delete with
--    `delete from public.niche_templates where niche_slug in (...)` if needed.
--
-- ONLY run this if migration 004 was applied and demonstrably needs to be
-- reverted (e.g., it surfaced an integration issue that can't be patched
-- forward). NEVER run on production without explicit user approval.
--
-- Required: superuser / service_role / Management API.
-- ============================================================================

begin;

-- Triggers
drop trigger if exists trg_contract_drafts_auto_pending on public.contract_drafts;
drop trigger if exists trg_mirror_tech_issue_to_alert   on public.tech_issues;
drop trigger if exists trg_tech_issues_touch            on public.tech_issues;

-- Trigger functions (DROP last; views/triggers depend on them)
drop function if exists public.contract_drafts_auto_pending();
drop function if exists public.mirror_tech_issue_to_alert();
drop function if exists public.tech_issues_touch_updated_at();

-- Views
drop view if exists public.v_ceo_contracts_pending;
drop view if exists public.v_issues_with_flag_stats;
drop view if exists public.v_financial_summary;
drop view if exists public.v_account_health;

-- Foreign key on customer_flags.linked_issue_id (depends on tech_issues)
alter table public.customer_flags
  drop constraint if exists customer_flags_linked_issue_fk;

-- Tables (children first)
drop table if exists public.scheduled_calls;
drop table if exists public.call_slot_offers;
drop table if exists public.ceo_escalations;
drop table if exists public.ceo_kpi_inputs;
drop table if exists public.outbound_emails;
drop table if exists public.audit_checklists;
drop table if exists public.sanya_audit_decisions;
drop table if exists public.tech_issues;
drop table if exists public.customer_flags;

-- Reverse ALTER ADD COLUMN on existing tables
alter table public.contract_drafts
  drop column if exists ceo_signed_by,
  drop column if exists ceo_signed_at,
  drop column if exists ceo_approval_notes,
  drop column if exists ceo_approval_at,
  drop column if exists ceo_approval_by,
  drop column if exists ceo_approval_status,
  drop column if exists discount_justification,
  drop column if exists discount_pct,
  drop column if exists list_monthly_usd;

alter table public.tenant_health_snapshots
  drop column if exists override_expires_at,
  drop column if exists override_set_at,
  drop column if exists override_by,
  drop column if exists override_status;

alter table public.ops_users
  drop column if exists display_name;

alter table public.client_journey_events
  drop column if exists payload;

-- niche_templates rows are intentionally NOT removed.  If you really want
-- to clean them, run separately:
--   delete from public.niche_templates
--     where niche_slug in ('cleo-for-pools','gameday-model','real-estate-model');

commit;
