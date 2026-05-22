// ⚠ KEEP IN SYNC with command-center/src/lib/calendar/types.ts. Deno edge
// functions can't import outside supabase/functions; this is the Deno copy.
//
// Shared types for the in-house calendar v1.
// Mirror the migrations/007_calendar.sql schema. Weekday convention: ISO-8601
// (1=Monday, 7=Sunday) — DO NOT swap to 0-indexed; the slot-computer assumes
// ISO and the migration's seed examples assume ISO.

export interface CalendarWeeklyRule {
  weekday: 1 | 2 | 3 | 4 | 5 | 6 | 7; // 1=Monday, 7=Sunday
  start: string; // "HH:MM" 24h local-to-availability.timezone
  end: string;   // "HH:MM" 24h local-to-availability.timezone (exclusive end)
}

export interface CalendarAvailability {
  id?: string;
  owner_user_id: string;
  timezone: string;                    // IANA, e.g. "America/New_York"
  weekly_rules: CalendarWeeklyRule[];
  slot_duration_minutes: number;
  buffer_minutes: number;
  advance_notice_hours: number;
  booking_window_days: number;
  is_active: boolean;
}

export interface FreeBusyWindow {
  starts_at: string; // ISO timestamptz
  ends_at: string;   // ISO timestamptz
  source?: "block" | "booking";
  label?: string | null;
}

export interface ComputedSlot {
  starts_at: string; // ISO UTC
  ends_at: string;   // ISO UTC
}

export type BookingRejectionReason =
  | "inactive"
  | "past"
  | "beyond_window"
  | "outside_hours"
  | "duration_mismatch"
  | "overlap";

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: BookingRejectionReason; detail?: string };
