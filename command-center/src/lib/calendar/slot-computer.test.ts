// Run-as-script tests for the slot computer. No real test runner in the
// repo; this file exports a runAll() that asserts via plain throws. To run:
//   cd command-center && npx tsx src/lib/calendar/slot-computer.test.ts
// (or any equivalent TS runner).
//
// Each test logs PASS/FAIL to console. runAll() returns the number of
// failures so a CI script could exit non-zero on it.

import { computeSlotsForRange, validateBookingRequest } from "./slot-computer.ts";
import type { CalendarAvailability, FreeBusyWindow } from "./types.ts";

const NY = "America/New_York";

const baseAvail = (overrides: Partial<CalendarAvailability> = {}): CalendarAvailability => ({
  owner_user_id: "00000000-0000-0000-0000-000000000001",
  timezone: NY,
  weekly_rules: [
    { weekday: 1, start: "09:00", end: "17:00" },
    { weekday: 2, start: "09:00", end: "17:00" },
    { weekday: 3, start: "09:00", end: "17:00" },
    { weekday: 4, start: "09:00", end: "17:00" },
    { weekday: 5, start: "09:00", end: "17:00" },
  ],
  slot_duration_minutes: 30,
  buffer_minutes: 0,
  advance_notice_hours: 0,
  booking_window_days: 14,
  is_active: true,
  ...overrides,
});

let failures = 0;
function assert(cond: unknown, label: string): void {
  if (cond) {
    console.log("  ✓ " + label);
  } else {
    failures++;
    console.log("  ✗ " + label);
  }
}

// Helper: parse the NY 9am wall-clock for a given calendar date into UTC ISO.
function nyHourToUTC(y: number, m: number, d: number, h: number, mi = 0): string {
  // Use Intl by manually constructing — same two-pass logic as slot-computer.
  let utcMs = Date.UTC(y, m - 1, d, h, mi);
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: NY, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(new Date(utcMs));
    const o: Record<string, string> = {};
    for (const p of parts) o[p.type] = p.value;
    let obsHour = parseInt(o.hour, 10);
    if (obsHour === 24) obsHour = 0;
    const obsMs = Date.UTC(+o.year, +o.month - 1, +o.day, obsHour, +o.minute);
    const want = Date.UTC(y, m - 1, d, h, mi);
    if (obsMs === want) break;
    utcMs += (want - obsMs);
  }
  return new Date(utcMs).toISOString();
}

function test1_baseline_slots_inside_rules(): void {
  console.log("test1 — slots only emit inside weekly_rules windows (Mon-Fri 9-5 NY)");
  const avail = baseAvail();
  // Pick a known Monday in summer 2026 to avoid DST corner cases for this baseline.
  // 2026-06-01 is a Monday.
  const now = new Date(nyHourToUTC(2026, 6, 1, 8, 0)); // 8 AM Monday NY
  const rangeStart = now;
  const rangeEnd = new Date(now.getTime() + 1 * 86_400_000); // 24h window
  const slots = computeSlotsForRange(avail, [], rangeStart, rangeEnd, now);
  // Expect 16 slots: 9:00, 9:30, ..., 16:30 (last that ends by 17:00)
  assert(slots.length === 16, `slots.length === 16 (got ${slots.length})`);
  // First slot starts at 9am NY
  assert(slots[0]?.starts_at === nyHourToUTC(2026, 6, 1, 9, 0), `first slot at 9am NY (got ${slots[0]?.starts_at})`);
  // Last slot starts at 4:30pm NY
  assert(slots[slots.length - 1]?.starts_at === nyHourToUTC(2026, 6, 1, 16, 30), `last slot at 4:30pm NY (got ${slots[slots.length-1]?.starts_at})`);
}

function test2_skip_weekend(): void {
  console.log("test2 — no slots on Saturday/Sunday with Mon-Fri rules");
  const avail = baseAvail();
  // Saturday 2026-06-06
  const now = new Date(nyHourToUTC(2026, 6, 6, 0, 0));
  const slots = computeSlotsForRange(avail, [], now, new Date(now.getTime() + 86_400_000), now);
  assert(slots.length === 0, `Saturday returns 0 slots (got ${slots.length})`);
}

function test3_skip_during_block(): void {
  console.log("test3 — slots overlapping a block are dropped");
  const avail = baseAvail();
  const now = new Date(nyHourToUTC(2026, 6, 1, 0, 0)); // Monday midnight NY
  const blockStart = nyHourToUTC(2026, 6, 1, 11, 0);
  const blockEnd = nyHourToUTC(2026, 6, 1, 13, 0);
  const fb: FreeBusyWindow[] = [{ starts_at: blockStart, ends_at: blockEnd, source: "block" }];
  const slots = computeSlotsForRange(avail, fb, now, new Date(now.getTime() + 86_400_000), now);
  // 16 baseline slots minus 4 (11:00, 11:30, 12:00, 12:30) = 12
  assert(slots.length === 12, `12 slots after blocking 11-13 (got ${slots.length})`);
  for (const s of slots) {
    const t = s.starts_at;
    assert(
      t !== nyHourToUTC(2026, 6, 1, 11, 0) &&
      t !== nyHourToUTC(2026, 6, 1, 11, 30) &&
      t !== nyHourToUTC(2026, 6, 1, 12, 0) &&
      t !== nyHourToUTC(2026, 6, 1, 12, 30),
      `slot at ${t} is not in 11-13`,
    );
  }
}

function test4_advance_notice(): void {
  console.log("test4 — advance_notice_hours filters slots starting too soon");
  const avail = baseAvail({ advance_notice_hours: 4 });
  // Monday 10 AM NY → range now → now+24h (i.e., until Tuesday 10am).
  // advance_notice=4h means earliest allowed slot starts at 14:00 (2pm) Monday.
  // Expected: 6 Monday slots (14:00 → 16:30) + 2 Tuesday slots (9:00, 9:30) = 8 total.
  const now = new Date(nyHourToUTC(2026, 6, 1, 10, 0));
  const slots = computeSlotsForRange(avail, [], now, new Date(now.getTime() + 86_400_000), now);
  assert(slots.length === 8, `8 slots (6 Mon afternoon + 2 Tue morning) (got ${slots.length})`);
  assert(slots[0]?.starts_at === nyHourToUTC(2026, 6, 1, 14, 0), `first slot at 2pm NY`);
  // Tuesday 9am should be in the result
  assert(slots.some((s) => s.starts_at === nyHourToUTC(2026, 6, 2, 9, 0)), `Tue 9am slot present`);
}

function test5_booking_window(): void {
  console.log("test5 — booking_window_days caps how far ahead slots are emitted");
  const avail = baseAvail({ booking_window_days: 2, advance_notice_hours: 0 });
  // Monday 8am NY → window covers Mon (1) + Tue (2) only
  const now = new Date(nyHourToUTC(2026, 6, 1, 8, 0));
  const slots = computeSlotsForRange(avail, [], now, new Date(now.getTime() + 30 * 86_400_000), now);
  // 16 slots on Mon + 16 on Tue = 32 max; the window is 2 days = exactly 48 hours
  // from now (8am Monday) → cuts off at 8am Wednesday → includes all of Mon + Tue
  assert(slots.length === 32, `32 slots within 2-day booking window (got ${slots.length})`);
  // No Wednesday slots
  const wedStart = nyHourToUTC(2026, 6, 3, 9, 0);
  assert(slots.every((s) => s.starts_at < wedStart), `no slots on/after Wed`);
}

function test6_inactive_returns_nothing(): void {
  console.log("test6 — is_active=false returns 0 slots");
  const avail = baseAvail({ is_active: false });
  const now = new Date(nyHourToUTC(2026, 6, 1, 8, 0));
  const slots = computeSlotsForRange(avail, [], now, new Date(now.getTime() + 7 * 86_400_000), now);
  assert(slots.length === 0, `inactive availability returns 0 slots`);
}

function test7_validate_inactive(): void {
  console.log("test7 — validateBookingRequest: inactive → reason='inactive'");
  const avail = baseAvail({ is_active: false });
  const now = new Date(nyHourToUTC(2026, 6, 1, 8, 0));
  const req = { starts_at: new Date(nyHourToUTC(2026, 6, 1, 10, 0)), ends_at: new Date(nyHourToUTC(2026, 6, 1, 10, 30)) };
  const r = validateBookingRequest(avail, [], req, now);
  assert(!r.ok && r.reason === "inactive", `reason inactive`);
}

function test8_validate_past(): void {
  console.log("test8 — validateBookingRequest: past start → reason='past'");
  const avail = baseAvail({ advance_notice_hours: 2 });
  const now = new Date(nyHourToUTC(2026, 6, 1, 10, 0));
  // request at 11am NY (only 1h ahead, less than advance_notice 2h)
  const req = { starts_at: new Date(nyHourToUTC(2026, 6, 1, 11, 0)), ends_at: new Date(nyHourToUTC(2026, 6, 1, 11, 30)) };
  const r = validateBookingRequest(avail, [], req, now);
  assert(!r.ok && r.reason === "past", `reason past`);
}

function test9_validate_outside_hours(): void {
  console.log("test9 — validateBookingRequest: 8am request (before 9am opening) → outside_hours");
  const avail = baseAvail();
  const now = new Date(nyHourToUTC(2026, 6, 1, 0, 0));
  const req = { starts_at: new Date(nyHourToUTC(2026, 6, 1, 8, 0)), ends_at: new Date(nyHourToUTC(2026, 6, 1, 8, 30)) };
  const r = validateBookingRequest(avail, [], req, now);
  assert(!r.ok && r.reason === "outside_hours", `reason outside_hours`);
}

function test10_validate_overlap(): void {
  console.log("test10 — validateBookingRequest: overlapping existing booking → overlap");
  const avail = baseAvail();
  const now = new Date(nyHourToUTC(2026, 6, 1, 0, 0));
  const existing: FreeBusyWindow[] = [{
    starts_at: nyHourToUTC(2026, 6, 1, 10, 0),
    ends_at: nyHourToUTC(2026, 6, 1, 10, 30),
    source: "booking",
  }];
  const req = { starts_at: new Date(nyHourToUTC(2026, 6, 1, 10, 0)), ends_at: new Date(nyHourToUTC(2026, 6, 1, 10, 30)) };
  const r = validateBookingRequest(avail, existing, req, now);
  assert(!r.ok && r.reason === "overlap", `reason overlap`);
}

function test11_validate_duration_mismatch(): void {
  console.log("test11 — validateBookingRequest: 45-min request against 30-min slot → duration_mismatch");
  const avail = baseAvail();
  const now = new Date(nyHourToUTC(2026, 6, 1, 0, 0));
  const req = { starts_at: new Date(nyHourToUTC(2026, 6, 1, 10, 0)), ends_at: new Date(nyHourToUTC(2026, 6, 1, 10, 45)) };
  const r = validateBookingRequest(avail, [], req, now);
  assert(!r.ok && r.reason === "duration_mismatch", `reason duration_mismatch`);
}

function test12_validate_ok(): void {
  console.log("test12 — validateBookingRequest: clean 10am Monday request → ok");
  const avail = baseAvail();
  const now = new Date(nyHourToUTC(2026, 6, 1, 0, 0));
  const req = { starts_at: new Date(nyHourToUTC(2026, 6, 1, 10, 0)), ends_at: new Date(nyHourToUTC(2026, 6, 1, 10, 30)) };
  const r = validateBookingRequest(avail, [], req, now);
  assert(r.ok, `clean request returns ok=true`);
}

export function runAll(): number {
  console.log("\n=== Slot-computer tests ===");
  test1_baseline_slots_inside_rules();
  test2_skip_weekend();
  test3_skip_during_block();
  test4_advance_notice();
  test5_booking_window();
  test6_inactive_returns_nothing();
  test7_validate_inactive();
  test8_validate_past();
  test9_validate_outside_hours();
  test10_validate_overlap();
  test11_validate_duration_mismatch();
  test12_validate_ok();
  console.log(`\n${failures === 0 ? "✓ all green" : `✗ ${failures} failure(s)`}\n`);
  return failures;
}

// Run if invoked directly via tsx / node --import
const isMain = typeof process !== "undefined" && process.argv?.[1]?.endsWith("slot-computer.test.ts");
if (isMain) {
  const n = runAll();
  if (typeof process !== "undefined") process.exit(n);
}
