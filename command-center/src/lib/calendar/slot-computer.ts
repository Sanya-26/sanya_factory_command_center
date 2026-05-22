// Pure-function slot computer for the in-house calendar.
// No Supabase calls, no Deno-isms, no browser globals — runs anywhere JS does.
// The edge functions import this via a Deno-relative path; the React UI
// imports it via the normal command-center path. Keep ES module syntax + no
// Node/Deno globals.

import type {
  CalendarAvailability,
  ComputedSlot,
  FreeBusyWindow,
  ValidationResult,
  CalendarWeeklyRule,
} from "./types.ts";

// ─── Timezone helpers ────────────────────────────────────────────────
// We don't ship date-fns-tz to the edge runtime. The standard library's
// Intl.DateTimeFormat covers what we need.

/** Returns the wall-clock parts of `instant` rendered in `tz`. */
function partsInTz(instant: Date, tz: string): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short",
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(instant)) parts[p.type] = p.value;
  const weekdayMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  // The hour part can render as "24" when crossing midnight in some
  // implementations — normalize to 0.
  let hour = parseInt(parts.hour, 10);
  if (hour === 24) hour = 0;
  return {
    year: parseInt(parts.year, 10),
    month: parseInt(parts.month, 10),
    day: parseInt(parts.day, 10),
    hour,
    minute: parseInt(parts.minute, 10),
    weekday: weekdayMap[parts.weekday] ?? 1,
  };
}

/**
 * Convert wall-clock (yyyy-mm-dd hh:mm) in `tz` to a UTC Date.
 * Two-iteration pattern handles DST: first pass treats wall-clock as UTC,
 * measures the error, corrects. Second pass converges (handles spring-forward
 * / fall-back boundaries).
 */
function zonedWallClockToUTC(y: number, m: number, d: number, h: number, mi: number, tz: string): Date {
  let utcMs = Date.UTC(y, m - 1, d, h, mi);
  for (let i = 0; i < 2; i++) {
    const observed = partsInTz(new Date(utcMs), tz);
    const observedMs = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute);
    const wantMs = Date.UTC(y, m - 1, d, h, mi);
    const diff = wantMs - observedMs;
    if (diff === 0) break;
    utcMs += diff;
  }
  return new Date(utcMs);
}

/** "09:30" → { h: 9, m: 30 } */
function parseHHMM(s: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return { h, m: mm };
}

/** Inclusive minute-count between two HH:MM clock times (end must be > start). */
function minutesBetween(start: { h: number; m: number }, end: { h: number; m: number }): number {
  return (end.h * 60 + end.m) - (start.h * 60 + start.m);
}

// ─── Free-busy index ────────────────────────────────────────────────
// Pre-parse and sort free-busy windows; quick overlap check via binary-search-ish
// linear scan (windows are few in v1).

function overlapsAny(start: Date, end: Date, windows: Array<{ s: number; e: number }>): boolean {
  const sMs = start.getTime();
  const eMs = end.getTime();
  for (const w of windows) {
    if (sMs < w.e && eMs > w.s) return true;
  }
  return false;
}

function indexFreeBusy(fb: FreeBusyWindow[]): Array<{ s: number; e: number }> {
  return fb
    .map((w) => ({ s: new Date(w.starts_at).getTime(), e: new Date(w.ends_at).getTime() }))
    .filter((w) => Number.isFinite(w.s) && Number.isFinite(w.e) && w.e > w.s)
    .sort((a, b) => a.s - b.s);
}

// ─── Core: computeSlotsForRange ───────────────────────────────────────

export function computeSlotsForRange(
  availability: CalendarAvailability,
  freeBusy: FreeBusyWindow[],
  rangeStart: Date,
  rangeEnd: Date,
  now: Date,
): ComputedSlot[] {
  if (!availability.is_active) return [];
  if (rangeEnd.getTime() <= rangeStart.getTime()) return [];

  const slots: ComputedSlot[] = [];
  const fbIdx = indexFreeBusy(freeBusy);
  const slotMs = availability.slot_duration_minutes * 60_000;
  const bufferMs = availability.buffer_minutes * 60_000;
  const earliestMs = now.getTime() + availability.advance_notice_hours * 3_600_000;
  const latestMs = Math.min(
    rangeEnd.getTime(),
    now.getTime() + availability.booking_window_days * 86_400_000,
  );

  if (earliestMs >= latestMs) return [];

  // Group rules by weekday for O(1) lookup per day.
  const rulesByWeekday = new Map<number, CalendarWeeklyRule[]>();
  for (const r of availability.weekly_rules ?? []) {
    if (!rulesByWeekday.has(r.weekday)) rulesByWeekday.set(r.weekday, []);
    rulesByWeekday.get(r.weekday)!.push(r);
  }

  // Walk day-by-day in the availability's timezone. We anchor on each
  // calendar date observed in tz, then enumerate that day's rule windows.
  // Start cursor = the earlier of rangeStart / earliestMs, but we drop slots
  // before earliestMs below.
  const cursor = new Date(Math.max(rangeStart.getTime(), now.getTime() - 86_400_000));
  // back up by 1 day so a partial day at start isn't skipped — duplicates
  // are filtered by latestMs/earliestMs guards below.

  const seenDays = new Set<string>(); // y-m-d (in tz) to avoid double-processing across midnight crossings
  let safety = 0;
  let cursorMs = cursor.getTime();
  while (cursorMs <= latestMs && safety < 400) {
    safety++;
    const p = partsInTz(new Date(cursorMs), availability.timezone);
    const dayKey = `${p.year}-${p.month}-${p.day}`;
    if (!seenDays.has(dayKey)) {
      seenDays.add(dayKey);
      const dayRules = rulesByWeekday.get(p.weekday) ?? [];
      for (const rule of dayRules) {
        const startHM = parseHHMM(rule.start);
        const endHM = parseHHMM(rule.end);
        if (!startHM || !endHM) continue;
        const totalMinutes = minutesBetween(startHM, endHM);
        if (totalMinutes < availability.slot_duration_minutes) continue;
        // Generate candidate slot starts at slot_duration + buffer cadence.
        const stepMinutes = availability.slot_duration_minutes + availability.buffer_minutes;
        for (let m = 0; m + availability.slot_duration_minutes <= totalMinutes; m += stepMinutes) {
          const h = startHM.h + Math.floor((startHM.m + m) / 60);
          const mi = (startHM.m + m) % 60;
          const slotStart = zonedWallClockToUTC(p.year, p.month, p.day, h, mi, availability.timezone);
          const slotEnd = new Date(slotStart.getTime() + slotMs);
          const startMs = slotStart.getTime();
          const endMs = slotEnd.getTime();
          if (startMs < earliestMs) continue;
          if (endMs > latestMs) continue;
          // Buffered overlap: extend the slot end by buffer when checking
          // against existing bookings (so back-to-back is prevented).
          const checkEnd = bufferMs > 0 ? new Date(endMs + bufferMs) : slotEnd;
          if (overlapsAny(slotStart, checkEnd, fbIdx)) continue;
          slots.push({
            starts_at: slotStart.toISOString(),
            ends_at: slotEnd.toISOString(),
          });
        }
      }
    }
    cursorMs += 86_400_000;
  }

  // De-dupe (defensive — different rules can in theory overlap) and sort.
  const dedup = new Map<string, ComputedSlot>();
  for (const s of slots) dedup.set(s.starts_at, s);
  return Array.from(dedup.values()).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}

// ─── Core: validateBookingRequest ────────────────────────────────────

export function validateBookingRequest(
  availability: CalendarAvailability,
  existingFreeBusy: FreeBusyWindow[],
  requested: { starts_at: Date; ends_at: Date },
  now: Date,
): ValidationResult {
  if (!availability.is_active) return { ok: false, reason: "inactive" };
  const sMs = requested.starts_at.getTime();
  const eMs = requested.ends_at.getTime();
  if (!Number.isFinite(sMs) || !Number.isFinite(eMs) || eMs <= sMs) {
    return { ok: false, reason: "duration_mismatch", detail: "starts_at must be < ends_at" };
  }
  const durationMin = Math.round((eMs - sMs) / 60_000);
  if (durationMin !== availability.slot_duration_minutes) {
    return { ok: false, reason: "duration_mismatch", detail: `expected ${availability.slot_duration_minutes} min, got ${durationMin}` };
  }
  const earliestMs = now.getTime() + availability.advance_notice_hours * 3_600_000;
  if (sMs < earliestMs) return { ok: false, reason: "past" };
  const latestMs = now.getTime() + availability.booking_window_days * 86_400_000;
  if (sMs > latestMs) return { ok: false, reason: "beyond_window" };

  // Inside weekly_rules? Compute the wall-clock in tz of the requested start.
  const p = partsInTz(requested.starts_at, availability.timezone);
  const rules = (availability.weekly_rules ?? []).filter((r) => r.weekday === p.weekday);
  if (rules.length === 0) return { ok: false, reason: "outside_hours", detail: `no rules for weekday ${p.weekday}` };
  const reqMinutes = p.hour * 60 + p.minute;
  const inside = rules.some((r) => {
    const s = parseHHMM(r.start);
    const e = parseHHMM(r.end);
    if (!s || !e) return false;
    const sMin = s.h * 60 + s.m;
    const eMin = e.h * 60 + e.m;
    return reqMinutes >= sMin && reqMinutes + availability.slot_duration_minutes <= eMin;
  });
  if (!inside) return { ok: false, reason: "outside_hours" };

  // Overlap with existing free-busy?
  const fbIdx = indexFreeBusy(existingFreeBusy);
  if (overlapsAny(requested.starts_at, requested.ends_at, fbIdx)) {
    return { ok: false, reason: "overlap" };
  }
  return { ok: true };
}
