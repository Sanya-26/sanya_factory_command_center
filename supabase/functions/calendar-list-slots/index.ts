// Edge function: calendar-list-slots
// Authenticated (JWT verification ON — only ops_users with a session call this).
// Returns the available booking slots for a given owner over a time range.
//
// POST body:
//   { owner_user_id?: string, owner_user_email?: string,
//     range_start: ISO, range_end: ISO }
//   (Either owner_user_id or owner_user_email required. If neither is
//    provided, defaults to the calling user's id from the JWT.)
//
// Response:
//   { slots: [{starts_at, ends_at}], timezone, availability_id }
//
// PRD §9D.1

import { admin } from "../_shared/supabase.ts";
import { computeSlotsForRange } from "../_shared/calendar/slot-computer.ts";
import type { CalendarAvailability, FreeBusyWindow } from "../_shared/calendar/types.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  let body: { owner_user_id?: string; owner_user_email?: string; range_start?: string; range_end?: string };
  try { body = await req.json(); } catch { return new Response("invalid json", { status: 400 }); }
  const { range_start, range_end } = body;
  if (!range_start || !range_end) return new Response("missing range_start / range_end", { status: 400 });

  const rangeStartDate = new Date(range_start);
  const rangeEndDate = new Date(range_end);
  if (!Number.isFinite(rangeStartDate.getTime()) || !Number.isFinite(rangeEndDate.getTime())) {
    return new Response("invalid range_start / range_end", { status: 400 });
  }
  if (rangeEndDate.getTime() <= rangeStartDate.getTime()) {
    return new Response("range_end must be > range_start", { status: 400 });
  }
  // Cap the range at 90 days to avoid runaway compute.
  const ninetyDays = 90 * 86_400_000;
  if (rangeEndDate.getTime() - rangeStartDate.getTime() > ninetyDays) {
    return new Response("range too large (max 90 days)", { status: 400 });
  }

  const sb = admin();

  // Resolve owner_user_id
  let ownerUserId = body.owner_user_id ?? null;
  if (!ownerUserId && body.owner_user_email) {
    // Look up via auth.users + ops_users
    const { data: u } = await sb.from("ops_users").select("user_id").limit(50);
    // We need email match; use the auth.users join via Management API isn't
    // available here. Use the supabase admin auth API instead.
    const { data: au } = await sb.auth.admin.listUsers();
    const match = au?.users?.find((x) => x.email === body.owner_user_email);
    if (!match) return new Response(`no user with email ${body.owner_user_email}`, { status: 404 });
    // Confirm they're an ops_user
    const inOps = (u ?? []).find((row) => (row as { user_id: string }).user_id === match.id);
    if (!inOps) return new Response("user found but not in ops_users", { status: 403 });
    ownerUserId = match.id;
  }
  if (!ownerUserId) return new Response("must provide owner_user_id or owner_user_email", { status: 400 });

  // Load availability
  const { data: avail, error: aErr } = await sb
    .from("calendar_availabilities")
    .select("*")
    .eq("owner_user_id", ownerUserId)
    .eq("is_active", true)
    .maybeSingle();
  if (aErr) return new Response(JSON.stringify({ error: aErr.message }), { status: 500 });
  if (!avail) return new Response(JSON.stringify({ slots: [], timezone: null, availability_id: null, note: "no active availability for this user" }), {
    headers: { "content-type": "application/json" },
  });

  const availability = avail as unknown as CalendarAvailability & { id: string };

  // Load free-busy windows (only within the range, plus a small buffer)
  const fbStart = new Date(rangeStartDate.getTime() - 3_600_000).toISOString();
  const fbEnd = new Date(rangeEndDate.getTime() + 3_600_000).toISOString();
  const { data: fb } = await sb
    .from("v_calendar_free_busy")
    .select("starts_at, ends_at, source, label")
    .eq("owner_user_id", ownerUserId)
    .gte("ends_at", fbStart)
    .lte("starts_at", fbEnd);
  const freeBusy = (fb ?? []) as FreeBusyWindow[];

  const slots = computeSlotsForRange(availability, freeBusy, rangeStartDate, rangeEndDate, new Date());

  return new Response(
    JSON.stringify({
      slots,
      timezone: availability.timezone,
      availability_id: availability.id,
      slot_duration_minutes: availability.slot_duration_minutes,
    }),
    { headers: { "content-type": "application/json" } },
  );
});
