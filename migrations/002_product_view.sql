-- ============================================================================
-- Migration 002: Product-Manager View
-- See docs/PRD-product-view.md for full spec.
-- Adds: 4-role permission model, customer flags, Sanya's bug tracker,
--       audit-decision log, audit checklists, niche additions, health view,
--       outbound email log. Re-uses existing notifications + tenant_alerts.
-- ============================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Permission model: extend ops_users.role allowed values
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.ops_users drop constraint if exists ops_users_role_check;
alter table public.ops_users
  add constraint ops_users_role_check
  check (role = any (array[
    'product_manager','tech','cto','ceo',
    'founder','admin','operator','ops','counsel','content','staff','viewer'
  ]));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Customer complaints / flags
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
  created_at timestamptz not null default now()
);
create index if not exists customer_flags_company_status_idx on public.customer_flags (company_id, status);
create index if not exists customer_flags_reported_at_idx on public.customer_flags (reported_at desc);

alter table public.customer_flags enable row level security;
drop policy if exists "service_role customer_flags" on public.customer_flags;
create policy "service_role customer_flags" on public.customer_flags
  for all to service_role using (true) with check (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. tech_issues (Sanya-curated bug tracker, mirrors into tenant_alerts)
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
create index if not exists tech_issues_assignee_status_idx on public.tech_issues (assignee_id, status);
create index if not exists tech_issues_company_idx on public.tech_issues (company_id);

alter table public.tech_issues enable row level security;
drop policy if exists "service_role tech_issues" on public.tech_issues;
create policy "service_role tech_issues" on public.tech_issues
  for all to service_role using (true) with check (true);

-- Trigger: on tech_issues insert, mirror into tenant_alerts (severity from issue.priority)
create or replace function public.mirror_tech_issue_to_alert()
returns trigger
language plpgsql
security definer
as $$
declare
  alert_severity text;
  new_alert_id uuid;
begin
  alert_severity := case
    when new.priority = 'urgent' then 'critical'
    when new.priority = 'high' then 'high'
    else 'medium'
  end;
  if new.company_id is not null then
    insert into public.tenant_alerts (company_id, kind, severity, message, payload, build_run_id)
    values (
      new.company_id,
      'tech_issue',
      alert_severity,
      new.title,
      jsonb_build_object(
        'tech_issue_id', new.id,
        'assignee_id', new.assignee_id,
        'raised_by', new.raised_by,
        'priority', new.priority,
        'description', coalesce(new.description, '')
      ),
      new.build_run_id
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

-- updated_at maintenance
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;
drop trigger if exists trg_tech_issues_touch on public.tech_issues;
create trigger trg_tech_issues_touch before update on public.tech_issues
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Sanya's audit decisions
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
create index if not exists sanya_audit_decisions_company_idx on public.sanya_audit_decisions (company_id, decided_at desc);

alter table public.sanya_audit_decisions enable row level security;
drop policy if exists "service_role sanya_audit_decisions" on public.sanya_audit_decisions;
create policy "service_role sanya_audit_decisions" on public.sanya_audit_decisions
  for all to service_role using (true) with check (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Audit checklists (curated per account by QC Agent)
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
-- 6. Outbound emails (log; provider-agnostic façade fills these)
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
create index if not exists outbound_emails_company_idx on public.outbound_emails (company_id, created_at desc);

alter table public.outbound_emails enable row level security;
drop policy if exists "service_role outbound_emails" on public.outbound_emails;
create policy "service_role outbound_emails" on public.outbound_emails
  for all to service_role using (true) with check (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. tenant_health_snapshots: manual override columns
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.tenant_health_snapshots
  add column if not exists override_status text check (override_status in ('green','yellow','red')),
  add column if not exists override_by uuid references public.ops_users(user_id),
  add column if not exists override_set_at timestamptz,
  add column if not exists override_expires_at timestamptz;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. v_account_health (composite traffic-light per company)
-- ─────────────────────────────────────────────────────────────────────────────
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
      and cf.severity = 'critical' and cf.status = 'open'
  ) or exists (
    select 1
    from public.tenants t
    join public.tenant_runtimes tr on tr.tenant_slug = t.slug
    where t.company_id = c.id::text
      and tr.status = 'live'
      and (tr.last_health_check_at is null or tr.last_health_check_at < now() - interval '30 minutes')
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
  c.id as company_id,
  c.name as company_name,
  c.niche,
  case
    when ao.override_status is not null then ao.override_status
    when r.company_id is not null then 'red'
    when y.company_id is not null then 'yellow'
    else 'green'
  end as status,
  case when ao.override_status is not null then true else false end as is_override,
  ao.override_expires_at
from public.companies c
left join active_override ao on ao.company_id = c.id
left join sig_red r on r.company_id = c.id
left join sig_yellow y on y.company_id = c.id;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. v_financial_summary (per-niche rollup for Product main dashboard)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.v_financial_summary as
select
  coalesce(c.niche, 'unknown') as niche,
  count(distinct c.id) filter (where tr.status = 'live') as live_count,
  count(distinct c.id) filter (where tr.status is null or tr.status not in ('live','decommissioned')) as in_flight_count,
  count(distinct c.id) filter (where tr.status = 'decommissioned') as churned_count,
  coalesce(sum(cd.monthly_usd) filter (where cd.status in ('signed','sent','approved')), 0) as mrr_usd,
  coalesce(avg(cd.monthly_usd) filter (where cd.status in ('signed','sent','approved')), 0) as avg_acv_usd
from public.companies c
left join public.tenants t on t.company_id = c.id::text
left join public.tenant_runtimes tr on tr.tenant_slug = t.slug
left join public.contract_drafts cd on cd.company_id = c.id
group by c.niche;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. niche_templates: rename + insert PRD canonical variations
-- ─────────────────────────────────────────────────────────────────────────────
update public.niche_templates
  set niche_slug = 'cleo-for-pools',
      display_name = coalesce(nullif(display_name,''), 'Cleo for Pools')
  where niche_slug = 'residential-pool-service';

insert into public.niche_templates (niche_slug, display_name, template)
values
  ('gameday-model', 'Gameday Model', '{}'::jsonb),
  ('real-estate-model', 'Real Estate Model', '{}'::jsonb)
on conflict (niche_slug) do update set display_name = excluded.display_name;

commit;
