-- ============================================================================
-- 004a — Fix mirror trigger severity mapping
--
-- Discovered during 5E smoke test: tenant_alerts.severity uses p0/p1/p2/p3
-- (priority labels), not the low/medium/high/critical vocabulary my 004
-- trigger assumed. Migration 004 applied successfully (the trigger function
-- was created), but the function would fail on any INSERT into tech_issues
-- because the alert row gets rejected by tenant_alerts_severity_check.
--
-- Fix: CREATE OR REPLACE the trigger function with the correct mapping.
--   urgent → p0, high → p1, normal/medium → p2, low → p3
--
-- Safety:
--   • CREATE OR REPLACE FUNCTION is non-destructive — re-defines the body.
--   • No tech_issues rows exist yet (table was created seconds ago), so no
--     historical data is affected.
--   • Trigger binding to tech_issues remains; only the function body changes.
-- ============================================================================

begin;

create or replace function public.mirror_tech_issue_to_alert()
returns trigger language plpgsql security definer as $$
declare
  alert_severity text;
  new_alert_id uuid;
begin
  -- Map tech_issues.priority → tenant_alerts.severity using the
  -- project's existing p0/p1/p2/p3 vocabulary.
  alert_severity := case
    when new.priority = 'urgent' then 'p0'
    when new.priority = 'high'   then 'p1'
    when new.priority = 'normal' then 'p2'
    else                              'p3'
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

commit;
