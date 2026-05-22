-- ============================================================================
-- ROLLBACK for migration 007_calendar.sql
--
-- DESTRUCTIVE. Drops the 3 calendar tables (and any data in them), the
-- v_calendar_free_busy view, and the trigger + function. The btree_gist
-- extension stays installed (it may be used elsewhere).
--
-- Run only if you need to fully remove the in-house calendar v1 from
-- production. NEVER run on prod without explicit user approval — bookings
-- are real data.
-- ============================================================================

begin;

drop view if exists public.v_calendar_free_busy;

drop trigger if exists trg_calendar_availabilities_touch on public.calendar_availabilities;
drop function if exists public.calendar_availabilities_touch();

drop table if exists public.calendar_bookings;
drop table if exists public.calendar_blocks;
drop table if exists public.calendar_availabilities;

commit;
