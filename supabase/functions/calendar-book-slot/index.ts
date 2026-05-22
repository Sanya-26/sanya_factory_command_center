// Edge function: calendar-book-slot
// PUBLIC (no JWT) — customers booking from a picker URL aren't logged in.
// Security relies on the unguessable picker_token in call_slot_offers
// (same hardening pattern as agents-schedule-call-confirm).
//
// Two entry modes (mutually exclusive):
//   A) { picker_token, picked_slot_index } — customer picked one of the
//      slots that Sanya offered. We resolve the slot via call_slot_offers,
//      validate it's still available, book it.
//   B) { picker_token, starts_at, ends_at } — direct booking with explicit
//      time window. Still tied to a picker_token so the customer must have
//      a valid offer link.
//
// On success:
//   • INSERT calendar_bookings (status='confirmed')
//   • UPDATE call_slot_offers SET picked_slot_index=X, picked_at=now()
//   • INSERT scheduled_calls (provider='aubos-calendar')
//   • Queue confirmation email via outbound_emails
//   • Notify the offering ops_user via notifications
//
// Idempotency: the overlap EXCLUDE constraint on calendar_bookings guarantees
// no double-booking. The offer's single-use check (picked_at != null →
// reject) prevents two booking attempts on the same offer.
//
// PRD §9D.2

import { admin } from "../_shared/supabase.ts";
import { validateBookingRequest } from "../_shared/calendar/slot-computer.ts";
import type { CalendarAvailability, FreeBusyWindow } from "../_shared/calendar/types.ts";

interface SlotRow {
  start_iso: string;
  end_iso: string;
}
interface OfferRow {
  id: string;
  company_id: string;
  offered_by: string;
  agenda: string;
  duration_min: number;
  slots: SlotRow[];
  picker_token: string;
  picked_slot_index: number | null;
  picked_at: string | null;
  expires_at: string;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  let body: { picker_token?: string; picked_slot_index?: number; starts_at?: string; ends_at?: string; booked_by_name?: string };
  try { body = await req.json(); } catch { return new Response("invalid json", { status: 400 }); }

  const token = body.picker_token;
  if (typeof token !== "string" || token.length < 16) {
    return new Response("missing or malformed picker_token", { status: 400 });
  }

  const sb = admin();

  // 1. Resolve offer + guards (mirrors schedule-call-confirm patterns).
  const { data: offerData, error: offErr } = await sb
    .from("call_slot_offers")
    .select("*")
    .eq("picker_token", token)
    .maybeSingle();
  if (offErr || !offerData) return new Response("offer not found", { status: 404 });
  const offer = offerData as OfferRow;
  if (offer.picked_at != null) return new Response("offer already picked", { status: 409 });
  if (new Date(offer.expires_at).getTime() < Date.now()) return new Response("offer expired", { status: 410 });

  // 2. Determine the requested window.
  let startsAtIso: string;
  let endsAtIso: string;
  let pickedIndex: number | null = null;
  if (typeof body.picked_slot_index === "number") {
    if (!Number.isInteger(body.picked_slot_index) || body.picked_slot_index < 0) {
      return new Response("picked_slot_index must be a non-negative integer", { status: 400 });
    }
    if (body.picked_slot_index >= (offer.slots ?? []).length) {
      return new Response("picked_slot_index out of range", { status: 400 });
    }
    const slot = offer.slots[body.picked_slot_index];
    startsAtIso = slot.start_iso;
    endsAtIso = slot.end_iso;
    pickedIndex = body.picked_slot_index;
  } else if (body.starts_at && body.ends_at) {
    startsAtIso = body.starts_at;
    endsAtIso = body.ends_at;
  } else {
    return new Response("must provide picked_slot_index or starts_at+ends_at", { status: 400 });
  }
  const startsAt = new Date(startsAtIso);
  const endsAt = new Date(endsAtIso);
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) {
    return new Response("invalid starts_at / ends_at", { status: 400 });
  }
  if (endsAt.getTime() <= startsAt.getTime()) {
    return new Response("ends_at must be > starts_at", { status: 400 });
  }

  // 3. Pull the owner's active availability + current free-busy for validation.
  const { data: avail } = await sb
    .from("calendar_availabilities")
    .select("*")
    .eq("owner_user_id", offer.offered_by)
    .eq("is_active", true)
    .maybeSingle();
  if (avail) {
    const availability = avail as unknown as CalendarAvailability;
    const { data: fb } = await sb
      .from("v_calendar_free_busy")
      .select("starts_at, ends_at, source, label")
      .eq("owner_user_id", offer.offered_by)
      .gte("ends_at", new Date(startsAt.getTime() - 3_600_000).toISOString())
      .lte("starts_at", new Date(endsAt.getTime() + 3_600_000).toISOString());
    const validation = validateBookingRequest(
      availability,
      (fb ?? []) as FreeBusyWindow[],
      { starts_at: startsAt, ends_at: endsAt },
      new Date(),
    );
    if (!validation.ok) {
      return new Response(
        JSON.stringify({ error: validation.reason, detail: validation.detail }),
        { status: validation.reason === "overlap" ? 409 : 400, headers: { "content-type": "application/json" } },
      );
    }
  }
  // If no availability exists, we still allow the booking — the offer itself
  // is the authorization. The overlap EXCLUDE constraint provides hard
  // protection against double-booking either way.

  // 4. Look up customer info for the email + booking row.
  const { data: company } = await sb
    .from("companies")
    .select("id, name, email")
    .eq("id", offer.company_id)
    .maybeSingle();
  const customerEmail = (company as { email: string | null } | null)?.email ?? "unknown@unknown.local";
  const customerName = (company as { name: string } | null)?.name ?? null;

  // 5. INSERT calendar_bookings. If the EXCLUDE constraint fires, return 409.
  const { data: bookingRow, error: bookErr } = await sb
    .from("calendar_bookings")
    .insert({
      owner_user_id: offer.offered_by,
      company_id: offer.company_id,
      slot_offer_id: offer.id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      booked_by_email: customerEmail,
      booked_by_name: body.booked_by_name ?? customerName,
      title: offer.agenda ?? "Customer call",
      status: "confirmed",
    })
    .select("id")
    .single();
  if (bookErr || !bookingRow) {
    const msg = bookErr?.message ?? "booking insert failed";
    const status = msg.toLowerCase().includes("calendar_bookings_no_overlap") ? 409 : 500;
    return new Response(JSON.stringify({ error: msg }), { status, headers: { "content-type": "application/json" } });
  }
  const bookingId = (bookingRow as { id: string }).id;

  // 6. Mark offer as picked.
  await sb
    .from("call_slot_offers")
    .update({ picked_slot_index: pickedIndex, picked_at: new Date().toISOString() })
    .eq("id", offer.id);

  // 7. INSERT scheduled_calls (audit + UI calendar widget reads this).
  const { data: scheduledRow } = await sb
    .from("scheduled_calls")
    .insert({
      company_id: offer.company_id,
      offer_id: offer.id,
      slot_start: startsAt.toISOString(),
      slot_end: endsAt.toISOString(),
      agenda: offer.agenda,
      provider: "aubos-calendar",
      meet_url: null, // v1: no video links yet
    })
    .select("id")
    .single();
  const scheduledCallId = (scheduledRow as { id: string } | null)?.id ?? null;

  // 8. Queue confirmation email.
  if (customerEmail && customerEmail !== "unknown@unknown.local") {
    await sb.from("outbound_emails").insert({
      company_id: offer.company_id,
      recipient_email: customerEmail,
      template: "schedule_call_confirm",
      payload: {
        company_name: customerName,
        slot_start: startsAt.toISOString(),
        slot_end: endsAt.toISOString(),
        agenda: offer.agenda,
        // meet_url intentionally absent in v1
      },
      sent_by: offer.offered_by,
      status: "queued",
      provider: "aubos-calendar",
    });
  }

  // 9. Notify the offering ops_user.
  await sb.from("notifications").insert({
    recipient_user_id: offer.offered_by,
    kind: "schedule-call-confirmed",
    severity: "info",
    title: `Call confirmed: ${customerName ?? "customer"}`,
    body: `Customer booked the slot starting ${new Date(startsAt).toUTCString()}.`,
    related_company_id: offer.company_id,
  });

  return new Response(
    JSON.stringify({
      ok: true,
      booking_id: bookingId,
      scheduled_call_id: scheduledCallId,
      provider: "aubos-calendar",
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      meet_url: null,
    }),
    { headers: { "content-type": "application/json" } },
  );
});
