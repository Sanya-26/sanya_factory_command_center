-- ============================================================================
-- Migration 007 — In-house calendar v1 (time-slot booking only)
--
-- Scope:
--   • Per-ops_user weekly availability rules (calendar_availabilities)
--   • Ad-hoc unavailable windows (calendar_blocks)
--   • Confirmed bookings (calendar_bookings)
--   • Free-busy union view (v_calendar_free_busy)
--   • Exclusion constraint preventing overlapping confirmed bookings per owner
--
-- Out of scope: video meeting links, recurring events, multi-user free-busy,
-- external calendar sync, reminders. See BUILD_LOG.md Phase 9 for forward path.
--
-- Conventions matched from existing schema:
--   • UUID primary keys (`gen_random_uuid()` default)
--   • Permissive `_ops_all to public` RLS policy (Phase 5 pattern — UI is
--     anon-keyed but pages gate by ops_users role at the app layer)
--   • Service-role policy alongside, for edge-function writes
--   • updated_at maintained by trigger
--   • Idempotent (IF NOT EXISTS / IF EXISTS / DROP THEN CREATE for triggers)
--   • Wrapped in BEGIN ... COMMIT for atomic apply/rollback
--
-- Weekday convention: ISO-8601 (1=Monday, 7=Sunday). Documented here so the
-- slot-computer in command-center/src/lib/calendar/slot-computer.ts can
-- match.
-- ============================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Extensions (btree_gist needed for the overlap-prevention EXCLUDE on
--    tstzrange × uuid). Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────
create extension if not exists btree_gist;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. calendar_availabilities — one row per ops_user with weekly rules
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.calendar_availabilities (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.ops_users(user_id) on delete cascade,
  timezone text not null,                              -- IANA, e.g. 'America/New_York'
  weekly_rules jsonb not null default '[]'::jsonb,     -- [{ weekday:1, start:"09:00", end:"17:00" }, ...]
  slot_duration_minutes int not null default 30 check (slot_duration_minutes >= 5 and slot_duration_minutes <= 480),
  buffer_minutes int not null default 0 check (buffer_minutes >= 0 and buffer_minutes <= 240),
  advance_notice_hours int not null default 2 check (advance_notice_hours >= 0 and advance_notice_hours <= 720),
  booking_window_days int not null default 30 check (booking_window_days >= 1 and booking_window_days <= 365),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One active availability row per owner. (Future scope could allow multiple
-- named profiles — for v1 we enforce one.)
create unique index if not exists calendar_availabilities_owner_active_uniq
  on public.calendar_availabilities (owner_user_id) where is_active = true;
create index if not exists calendar_availabilities_owner_idx
  on public.calendar_availabilities (owner_user_id);

alter table public.calendar_availabilities enable row level security;
drop policy if exists "calendar_availabilities_ops_all" on public.calendar_availabilities;
create policy "calendar_availabilities_ops_all" on public.calendar_availabilities for all to public using (true) with check (true);
drop policy if exists "calendar_availabilities_service_role" on public.calendar_availabilities;
create policy "calendar_availabilities_service_role" on public.calendar_availabilities for all to service_role using (true) with check (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. calendar_blocks — ad-hoc unavailable windows on top of weekly_rules
--    (vacation, OOO, focus-time, etc.). Read by free-busy.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.calendar_blocks (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.ops_users(user_id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists calendar_blocks_owner_range_idx
  on public.calendar_blocks (owner_user_id, starts_at, ends_at);

alter table public.calendar_blocks enable row level security;
drop policy if exists "calendar_blocks_ops_all" on public.calendar_blocks;
create policy "calendar_blocks_ops_all" on public.calendar_blocks for all to public using (true) with check (true);
drop policy if exists "calendar_blocks_service_role" on public.calendar_blocks;
create policy "calendar_blocks_service_role" on public.calendar_blocks for all to service_role using (true) with check (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. calendar_bookings — confirmed meetings booked via the customer flow
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.calendar_bookings (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.ops_users(user_id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  slot_offer_id uuid references public.call_slot_offers(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  booked_by_email text not null,
  booked_by_name text,
  title text not null default 'Customer call',
  notes text,
  status text not null default 'confirmed' check (status in ('confirmed','cancelled','no_show')),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  check (ends_at > starts_at)
);

create index if not exists calendar_bookings_owner_starts_idx
  on public.calendar_bookings (owner_user_id, starts_at) where status = 'confirmed';
create index if not exists calendar_bookings_company_idx
  on public.calendar_bookings (company_id) where company_id is not null;
create index if not exists calendar_bookings_slot_offer_idx
  on public.calendar_bookings (slot_offer_id) where slot_offer_id is not null;

-- Overlap prevention. Two CONFIRMED bookings owned by the same user cannot
-- have overlapping [starts_at, ends_at) ranges. Cancelled/no_show rows are
-- excluded so a re-book of a cancelled slot works.
alter table public.calendar_bookings
  drop constraint if exists calendar_bookings_no_overlap;
alter table public.calendar_bookings
  add constraint calendar_bookings_no_overlap
  exclude using gist (
    owner_user_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status = 'confirmed');

alter table public.calendar_bookings enable row level security;
drop policy if exists "calendar_bookings_ops_all" on public.calendar_bookings;
create policy "calendar_bookings_ops_all" on public.calendar_bookings for all to public using (true) with check (true);
drop policy if exists "calendar_bookings_service_role" on public.calendar_bookings;
create policy "calendar_bookings_service_role" on public.calendar_bookings for all to service_role using (true) with check (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. updated_at trigger on calendar_availabilities (others are append-only)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.calendar_availabilities_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

drop trigger if exists trg_calendar_availabilities_touch on public.calendar_availabilities;
create trigger trg_calendar_availabilities_touch
  before update on public.calendar_availabilities
  for each row execute function public.calendar_availabilities_touch();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. v_calendar_free_busy — UNION of blocks + confirmed bookings.
--    The slot-computer in command-center reads this single source of truth.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.v_calendar_free_busy as
select
  owner_user_id,
  starts_at,
  ends_at,
  'block'::text  as source,
  id as source_id,
  reason as label
from public.calendar_blocks
union all
select
  owner_user_id,
  starts_at,
  ends_at,
  'booking'::text as source,
  id as source_id,
  title as label
from public.calendar_bookings
where status = 'confirmed';

commit;

-- ============================================================================
-- POST-APPLY verification:
--   • select table_name from information_schema.tables where table_schema='public'
--       and table_name in ('calendar_availabilities','calendar_blocks','calendar_bookings');
--     -- expect 3 rows
--   • select view_name from information_schema.views where table_schema='public'
--       and view_name='v_calendar_free_busy';
--     -- expect 1 row
--   • select conname from pg_constraint where conname='calendar_bookings_no_overlap';
--     -- expect 1 row
--   • select count(*) from public.v_calendar_free_busy;
--     -- expect 0 (no rows yet)
-- ============================================================================
