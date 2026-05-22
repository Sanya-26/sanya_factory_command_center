-- ============================================================================
-- Migration 004: UI wiring — connect command-center to real AI Factory Supabase
--
-- Target project: jzppqxiprjsuvuyulbyj ("AI Factory")
-- Authored:       Phase 5D, 2026-05-22
-- Authored from:  SCHEMA_COMPARISON.md (gap analysis between UI expectations
--                 and the real public schema audited live via the Management
--                 API). Replaces migrations/002 and migrations/003, which were
--                 written against an imagined clean schema and would have
--                 collided with reality (003 specifically would have failed
--                 since contract_drafts already exists with different columns
--                 than 003 assumed).
--
-- Safety properties:
--   • Every CREATE TABLE  uses IF NOT EXISTS
--   • Every ADD COLUMN    uses IF NOT EXISTS (Postgres 9.6+)
--   • Every CREATE VIEW   uses CREATE OR REPLACE
--   • Every CREATE TRIGGER is preceded by DROP TRIGGER IF EXISTS
--   • Every CREATE INDEX  uses IF NOT EXISTS
--   • Every INSERT uses ON CONFLICT DO NOTHING
--   • NO DROP / TRUNCATE / DELETE statements anywhere
--   • Wrapped in a single transaction (BEGIN ... COMMIT) so any failure
--     rolls the whole file back automatically
--
-- Reversibility:
--   • migrations/004_ui_wiring_ROLLBACK.sql contains the reverse of every
--     statement. NEVER run rollback on prod without explicit user approval.
--
-- Reviewer checklist (before applying):
--   [ ] No existing table named below is dropped or renamed
--   [ ] All ADD COLUMN are additive (nullable or default-set)
--   [ ] All FKs reference tables that already exist
--   [ ] All CHECK constraints permit the existing data (rows = 0, so trivially)
--   [ ] No data is mutated except the 3 niche INSERTs (ON CONFLICT DO NOTHING)
--   [ ] All RLS policies use service_role only — UI's anon key will not see
--       these tables until a follow-up policy migration designs ops_users gating
-- ============================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. customer_flags — Round-2 triage flag store (Product View)
--    Consumed by: ProductFlags page; ProductHome "Top flagged issues" widget;
--                 AtRiskList reasons; the triage edge function inserts these.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.customer_flags (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  reported_at timestamptz not null default now(),
  source text not null check (source in ('support_email','chat','manual','audit','runtime_alert')),
  severity text not null check (severity in ('low','medium','high','critical')),
  title text not null,
  body text,
  status text not null default 'open' check (status in ('open','acknowledged','resolved')),
  acknowledged_by uuid references public.ops_users(user_id),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  -- Round-2 triage columns (these would normally be added by a later ALTER,
  -- but since we're creating the table fresh we include them inline):
  linked_issue_id uuid,                  -- FK to tech_issues(id) added at end of file (after tech_issues exists)
  triaged_at timestamptz,
  triaged_by text                         -- 'triage_agent:v1:<provider>' or 'manual:<user_id>'
);
create index if not exists customer_flags_company_status_idx
  on public.customer_flags (company_id, status);
create index if not exists customer_flags_reported_at_idx
  on public.customer_flags (reported_at desc);
create index if not exists customer_flags_linked_issue_idx
  on public.customer_flags (linked_issue_id) where linked_issue_id is not null;

alter table public.customer_flags enable row level security;
drop policy if exists "service_role customer_flags" on public.customer_flags;
create policy "service_role customer_flags" on public.customer_flags
  for all to service_role using (true) with check (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. tech_issues — Sanya's bug tracker (Product View). Mirrors into tenant_alerts.
--    Consumed by: ProductIssues page; ProductTeam engineer cards; ProductHome
--    "Top flagged" widget. Insert path: ProductCustomerDetail Bugs decision.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.tech_issues (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  build_run_id uuid references public.build_runs(id) on delete set null,
  raised_by uuid not null references public.ops_users(user_id),
  assignee_id uuid references public.ops_users(user_id),
  title text not null,
  description text,
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
  priority text not null default 'normal' check (priority in ('normal','high','urgent')),
  status text not null default 'open' check (status in ('open','in_progress','blocked','done','wontfix')),
  mirrored_alert_id uuid references public.tenant_alerts(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists tech_issues_assignee_status_idx
  on public.tech_issues (assignee_id, status);
create index if not exists tech_issues_company_idx
  on public.tech_issues (company_id);
create index if not exists tech_issues_priority_status_idx
  on public.tech_issues (priority, status);

alter table public.tech_issues enable row level security;
drop policy if exists "service_role tech_issues" on public.tech_issues;
create policy "service_role tech_issues" on public.tech_issues
  for all to service_role using (true) with check (true);

-- Mirror trigger: insert into tenant_alerts when a tech_issue is created.
-- Maps tech_issue.priority → alert.severity:
--   urgent → critical, high → high, otherwise → medium
-- Stores the alert id back on tech_issues for cross-reference.
create or replace function public.mirror_tech_issue_to_alert()
returns trigger language plpgsql security definer as $$
declare
  alert_severity text;
  new_alert_id uuid;
begin
  alert_severity := case
    when new.priority = 'urgent' then 'critical'
    when new.priority = 'high'   then 'high'
    else 'medium'
  end;
  if new.company_id is not null then
    insert into public.tenant_alerts (company_id, kind, severity, message, payload, build_run_id, ts)
    values (
      new.company_id,
      'tech_issue',
      alert_severity,
      new.title,
      jsonb_build_object(
        'tech_issue_id', new.id,
        'assignee_id',   new.assignee_id,
        'raised_by',     new.raised_by,
        'priority',      new.priority,
        'description',   coalesce(new.description, '')
      ),
      new.build_run_id,
      now()
    )
    returning id into new_alert_id;
    new.mirrored_alert_id := new_alert_id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_mirror_tech_issue_to_alert on public.tech_issues;
create trigger trg_mirror_tech_issue_to_alert
  before insert on public.tech_issues
  for each row execute function public.mirror_tech_issue_to_alert();

-- updated_at maintenance (the existing moddatetime extension would work too,
-- but we keep our own function to avoid extension surface).
create or replace function public.tech_issues_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists trg_tech_issues_touch on public.tech_issues;
create trigger trg_tech_issues_touch
  before update on public.tech_issues
  for each row execute function public.tech_issues_touch_updated_at();

-- Now that tech_issues exists, add the deferred FK on customer_flags.linked_issue_id.
alter table public.customer_flags
  drop constraint if exists customer_flags_linked_issue_fk;
alter table public.customer_flags
  add constraint customer_flags_linked_issue_fk
  foreign key (linked_issue_id) references public.tech_issues(id) on delete set null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. sanya_audit_decisions — Phase-3 verdict log (Product View)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.sanya_audit_decisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  decision text not null check (decision in ('approve','bugs','disapprove')),
  notes text,
  bug_issue_ids uuid[] not null default '{}',
  decided_by uuid not null references public.ops_users(user_id),
  decided_at timestamptz not null default now()
);
create index if not exists sanya_audit_decisions_company_idx
  on public.sanya_audit_decisions (company_id, decided_at desc);

alter table public.sanya_audit_decisions enable row level security;
drop policy if exists "service_role sanya_audit_decisions" on public.sanya_audit_decisions;
create policy "service_role sanya_audit_decisions" on public.sanya_audit_decisions
  for all to service_role using (true) with check (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. audit_checklists — per-account QC checklist generated by qc-run agent
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.audit_checklists (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  generated_at timestamptz not null default now(),
  generated_by text not null default 'qc_agent',
  items jsonb not null,
  signed_off_by uuid references public.ops_users(user_id),
  signed_off_at timestamptz,
  is_current boolean not null default true
);
create index if not exists audit_checklists_company_current_idx
  on public.audit_checklists (company_id) where is_current = true;

alter table public.audit_checklists enable row level security;
drop policy if exists "service_role audit_checklists" on public.audit_checklists;
create policy "service_role audit_checklists" on public.audit_checklists
  for all to service_role using (true) with check (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. outbound_emails — provider-agnostic email log
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.outbound_emails (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  recipient_email text not null,
  template text not null,
  payload jsonb not null default '{}',
  sent_by uuid references public.ops_users(user_id),
  status text not null default 'queued' check (status in ('queued','sent','failed')),
  provider text,
  provider_message_id text,
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists outbound_emails_company_idx
  on public.outbound_emails (company_id, created_at desc);
create index if not exists outbound_emails_status_idx
  on public.outbound_emails (status, created_at) where status = 'queued';

alter table public.outbound_emails enable row level security;
drop policy if exists "service_role outbound_emails" on public.outbound_emails;
create policy "service_role outbound_emails" on public.outbound_emails
  for all to service_role using (true) with check (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. call_slot_offers + scheduled_calls — Round-3 schedule-call flow
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.call_slot_offers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  offered_by uuid not null references public.ops_users(user_id),
  agenda text not null,
  duration_min int not null default 30,
  slots jsonb not null,                       -- [{ start_iso, end_iso }, ...]
  picker_token text not null unique,
  picked_slot_index int,
  picked_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);
create index if not exists call_slot_offers_company_idx
  on public.call_slot_offers (company_id, created_at desc);
create index if not exists call_slot_offers_token_idx
  on public.call_slot_offers (picker_token);

alter table public.call_slot_offers enable row level security;
drop policy if exists "service_role call_slot_offers" on public.call_slot_offers;
create policy "service_role call_slot_offers" on public.call_slot_offers
  for all to service_role using (true) with check (true);

create table if not exists public.scheduled_calls (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  offer_id uuid references public.call_slot_offers(id) on delete set null,
  slot_start timestamptz not null,
  slot_end timestamptz not null,
  agenda text not null,
  provider text not null default 'mock',     -- 'google-meet' in prod
  meet_url text,
  external_event_id text,
  created_at timestamptz not null default now()
);
create index if not exists scheduled_calls_company_idx
  on public.scheduled_calls (company_id, slot_start);
create index if not exists scheduled_calls_window_idx
  on public.scheduled_calls (slot_start);

alter table public.scheduled_calls enable row level security;
drop policy if exists "service_role scheduled_calls" on public.scheduled_calls;
create policy "service_role scheduled_calls" on public.scheduled_calls
  for all to service_role using (true) with check (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. ceo_kpi_inputs — editable cash/burn inputs (CEO Cash page)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.ceo_kpi_inputs (
  id uuid primary key default gen_random_uuid(),
  month date not null unique,                 -- 'YYYY-MM-01'
  monthly_burn_usd numeric not null,
  payroll_usd numeric not null,
  headcount int not null,
  cash_balance_usd numeric not null,
  mrr_target_usd numeric not null,
  line_allocations jsonb not null default '{}'::jsonb,
  open_requisitions jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.ceo_kpi_inputs enable row level security;
drop policy if exists "service_role ceo_kpi_inputs" on public.ceo_kpi_inputs;
create policy "service_role ceo_kpi_inputs" on public.ceo_kpi_inputs
  for all to service_role using (true) with check (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. ceo_escalations — Round-5 Sanya → Ouadie channel
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.ceo_escalations (
  id uuid primary key default gen_random_uuid(),
  raised_by uuid not null references public.ops_users(user_id),
  title text not null,
  body text,
  category text not null check (category in ('customer','contract','strategic','budget','hire','vendor','other')),
  urgency text not null default 'normal' check (urgency in ('low','normal','high','urgent')),
  related_company_id uuid references public.companies(id) on delete set null,
  status text not null default 'open' check (status in ('open','acknowledged','decided','deferred','rejected')),
  decision text,
  decision_notes text,
  decided_by uuid references public.ops_users(user_id),
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists ceo_escalations_status_idx
  on public.ceo_escalations (status, urgency, created_at desc);
create index if not exists ceo_escalations_company_idx
  on public.ceo_escalations (related_company_id);

alter table public.ceo_escalations enable row level security;
drop policy if exists "service_role ceo_escalations" on public.ceo_escalations;
create policy "service_role ceo_escalations" on public.ceo_escalations
  for all to service_role using (true) with check (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. contract_drafts — ADD COLUMNS for discount + CEO sign-off
--    Existing rows get NULL/default; nothing is rewritten.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.contract_drafts
  add column if not exists list_monthly_usd numeric,
  add column if not exists discount_pct numeric not null default 0,
  add column if not exists discount_justification text,
  add column if not exists ceo_approval_status text not null default 'not_required'
    check (ceo_approval_status in ('not_required','pending','approved','rejected')),
  add column if not exists ceo_approval_by uuid references public.ops_users(user_id),
  add column if not exists ceo_approval_at timestamptz,
  add column if not exists ceo_approval_notes text,
  add column if not exists ceo_signed_at timestamptz,
  add column if not exists ceo_signed_by uuid references public.ops_users(user_id);

create index if not exists contract_drafts_ceo_queue_idx
  on public.contract_drafts (ceo_approval_status, ceo_signed_at)
  where ceo_approval_status = 'pending' or ceo_signed_at is null;

-- Trigger: discount > 0 + not_required → auto-flip to 'pending'
create or replace function public.contract_drafts_auto_pending()
returns trigger language plpgsql as $$
begin
  if new.discount_pct is not null and new.discount_pct > 0
     and (new.ceo_approval_status is null or new.ceo_approval_status = 'not_required') then
    new.ceo_approval_status := 'pending';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_contract_drafts_auto_pending on public.contract_drafts;
create trigger trg_contract_drafts_auto_pending
  before insert or update of discount_pct, ceo_approval_status on public.contract_drafts
  for each row execute function public.contract_drafts_auto_pending();

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. tenant_health_snapshots — ADD override columns (manual R/Y/G)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.tenant_health_snapshots
  add column if not exists override_status text check (override_status in ('green','yellow','red')),
  add column if not exists override_by uuid references public.ops_users(user_id),
  add column if not exists override_set_at timestamptz,
  add column if not exists override_expires_at timestamptz;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. ops_users.display_name — optional UX column for the Issues assignee column
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.ops_users
  add column if not exists display_name text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. client_journey_events.payload — optional jsonb for Activity Timeline
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.client_journey_events
  add column if not exists payload jsonb;

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. niche_templates — seed the 3 hardcoded UI niches
--    Cleo for Pools aliases residential-pool-service (copies template + checklist).
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.niche_templates (niche_slug, display_name, template, completeness_checklist)
select 'cleo-for-pools', 'Cleo for Pools',
       coalesce(template, '{}'::jsonb),
       coalesce(completeness_checklist, '[]'::jsonb)
from public.niche_templates
where niche_slug = 'residential-pool-service'
on conflict (niche_slug) do nothing;

insert into public.niche_templates (niche_slug, display_name, template, completeness_checklist)
values
  ('gameday-model',     'Gameday Model',     '{}'::jsonb, '[]'::jsonb),
  ('real-estate-model', 'Real Estate Model', '{}'::jsonb, '[]'::jsonb)
on conflict (niche_slug) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. Views — recompute on read (no materialization)
-- ─────────────────────────────────────────────────────────────────────────────

-- v_account_health: per-company R/Y/G with override precedence
create or replace view public.v_account_health as
with active_override as (
  select distinct on (company_id)
    company_id, override_status, override_expires_at
  from public.tenant_health_snapshots
  where override_status is not null
    and (override_expires_at is null or override_expires_at > now())
  order by company_id, override_set_at desc nulls last
),
sig_red as (
  select c.id as company_id from public.companies c
  where exists (
    select 1 from public.tenant_alerts ta
    where ta.company_id = c.id
      and ta.severity = 'critical'
      and ta.resolved_at is null
      and ta.ts > now() - interval '24 hours'
  ) or exists (
    select 1 from public.customer_flags cf
    where cf.company_id = c.id
      and cf.severity = 'critical'
      and cf.status = 'open'
  ) or exists (
    select 1
    from public.tenants t
    join public.tenant_runtimes tr on tr.tenant_slug = t.slug
    where t.company_id = c.id::text
      and tr.status = 'live'
      and (tr.last_health_check_at is null
           or tr.last_health_check_at < now() - interval '30 minutes')
  )
),
sig_yellow as (
  select c.id as company_id from public.companies c
  where exists (
    select 1 from public.tenant_alerts ta
    where ta.company_id = c.id and ta.severity = 'high' and ta.resolved_at is null
  ) or exists (
    select 1 from public.customer_flags cf
    where cf.company_id = c.id and cf.severity = 'high' and cf.status = 'open'
  ) or (
    select count(*) from public.customer_flags cf2
    where cf2.company_id = c.id and cf2.severity = 'medium' and cf2.status = 'open'
  ) >= 2 or exists (
    select 1 from public.tech_issues ti
    where ti.company_id = c.id
      and ti.severity in ('high','critical')
      and ti.status not in ('done','wontfix')
  )
)
select
  c.id   as company_id,
  c.name as company_name,
  c.niche,
  case
    when ao.override_status is not null then ao.override_status
    when r.company_id  is not null      then 'red'
    when y.company_id  is not null      then 'yellow'
    else 'green'
  end as status,
  (ao.override_status is not null) as is_override,
  ao.override_expires_at
from public.companies c
left join active_override ao on ao.company_id = c.id
left join sig_red          r  on r.company_id = c.id
left join sig_yellow       y  on y.company_id = c.id;

-- v_financial_summary: per-niche aggregate. NOTE: tenants.company_id is TEXT
-- in this schema, so we cast companies.id::text to join.
create or replace view public.v_financial_summary as
select
  coalesce(c.niche, 'unknown') as niche,
  count(distinct c.id) filter (where tr.status = 'live')                                  as live_count,
  count(distinct c.id) filter (where tr.status is null or tr.status not in ('live','decommissioned')) as in_flight_count,
  count(distinct c.id) filter (where tr.status = 'decommissioned')                        as churned_count,
  coalesce(sum(cd.monthly_usd) filter (where cd.status in ('signed','sent','approved')), 0)    as mrr_usd,
  coalesce(avg(cd.monthly_usd) filter (where cd.status in ('signed','sent','approved')), 0)::numeric as avg_acv_usd
from public.companies c
left join public.tenants t          on t.company_id = c.id::text
left join public.tenant_runtimes tr on tr.tenant_slug = t.slug
left join public.contract_drafts cd on cd.company_id = c.id
group by c.niche;

-- v_issues_with_flag_stats: tech_issues + linked customer_flags rollup
create or replace view public.v_issues_with_flag_stats as
select
  ti.*,
  coalesce(s.flag_count, 0)              as flag_count,
  coalesce(s.customer_count, 0)          as customer_count,
  coalesce(s.flag_count, 0) + coalesce(s.customer_count, 0) * 2 as priority_score
from public.tech_issues ti
left join (
  select
    linked_issue_id,
    count(*)                       as flag_count,
    count(distinct company_id)     as customer_count
  from public.customer_flags
  where linked_issue_id is not null and status != 'resolved'
  group by linked_issue_id
) s on s.linked_issue_id = ti.id;

-- v_ceo_contracts_pending: bucket every contract draft for the CEO queue
create or replace view public.v_ceo_contracts_pending as
select
  cd.id, cd.company_id, c.name as company_name, c.niche,
  cd.monthly_usd, cd.list_monthly_usd, cd.discount_pct, cd.discount_justification,
  cd.status, cd.ceo_approval_status, cd.ceo_approval_by, cd.ceo_approval_at,
  cd.ceo_approval_notes, cd.ceo_signed_at, cd.ceo_signed_by, cd.sent_at,
  case
    when cd.discount_pct > 0 and cd.ceo_approval_status = 'pending'        then 'awaiting_discount_approval'
    when cd.status in ('approved','sent') and cd.ceo_signed_at is null      then 'awaiting_ceo_signature'
    when cd.ceo_signed_at is not null                                       then 'signed'
    else 'idle'
  end as queue_bucket
from public.contract_drafts cd
join public.companies c on c.id = cd.company_id;

commit;

-- ============================================================================
-- POST-APPLY VERIFICATION QUERIES (run separately as superuser):
--
-- 1) New tables exist:
--    select table_name from information_schema.tables
--      where table_schema='public' and table_name in
--        ('customer_flags','tech_issues','sanya_audit_decisions','audit_checklists',
--         'outbound_emails','call_slot_offers','scheduled_calls','ceo_kpi_inputs',
--         'ceo_escalations');
--    Expected: 9 rows
--
-- 2) Added columns on contract_drafts:
--    select column_name from information_schema.columns
--      where table_schema='public' and table_name='contract_drafts'
--        and column_name in ('list_monthly_usd','discount_pct','ceo_approval_status',
--                            'ceo_approval_by','ceo_approval_at','ceo_approval_notes',
--                            'ceo_signed_at','ceo_signed_by','discount_justification');
--    Expected: 9 rows
--
-- 3) Added override columns on tenant_health_snapshots:
--    select column_name from information_schema.columns
--      where table_schema='public' and table_name='tenant_health_snapshots'
--        and column_name in ('override_status','override_by','override_set_at','override_expires_at');
--    Expected: 4 rows
--
-- 4) Views exist and execute:
--    select count(*) from public.v_account_health;
--    select count(*) from public.v_financial_summary;
--    select count(*) from public.v_issues_with_flag_stats;
--    select count(*) from public.v_ceo_contracts_pending;
--    Expected: each returns a count (likely 0 or matching companies count) without error
--
-- 5) New niches seeded:
--    select niche_slug from public.niche_templates
--      where niche_slug in ('cleo-for-pools','gameday-model','real-estate-model');
--    Expected: 3 rows
--
-- 6) Trigger smoke test (run as service_role; clean up after):
--    insert into public.tech_issues (raised_by, title)
--      values ((select user_id from public.ops_users limit 1), '__test__');
--    -- Should fire mirror_tech_issue_to_alert if company_id provided
--    delete from public.tech_issues where title='__test__';
-- ============================================================================
