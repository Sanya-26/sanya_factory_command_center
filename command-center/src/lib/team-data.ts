// Pure helpers for the Team Management page (Round-6 Product PRD §22).
// Operates over tech_issues + ops_users with no I/O. The page wraps the
// computed view v_team_workload + these helpers.

export type StuckReason = "blocked" | "stale_in_progress" | "never_started";

export interface TechIssue {
  id: string;
  company_id: string | null;
  assignee_id: string | null;
  title: string;
  description?: string | null;
  severity: string;
  priority?: string;
  status: "open" | "in_progress" | "blocked" | "done" | "wontfix" | string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

export interface OpsUser {
  user_id: string;
  email?: string | null;
  display_name?: string | null;
  role: string;
}

export interface StuckInfo {
  stuck: boolean;
  reason?: StuckReason;
  age_days: number;
}

const DAY_MS = 86_400_000;
export const STALE_IN_PROGRESS_DAYS = 5;
export const NEVER_STARTED_DAYS = 7;

function daysBetween(iso: string, now: number): number {
  return Math.floor((now - new Date(iso).getTime()) / DAY_MS);
}

export function isStuck(issue: TechIssue, now: number = Date.now()): StuckInfo {
  const updatedAge = daysBetween(issue.updated_at, now);
  const createdAge = daysBetween(issue.created_at, now);
  if (issue.status === "blocked") {
    return { stuck: true, reason: "blocked", age_days: updatedAge };
  }
  if (issue.status === "in_progress" && updatedAge >= STALE_IN_PROGRESS_DAYS) {
    return { stuck: true, reason: "stale_in_progress", age_days: updatedAge };
  }
  if (issue.status === "open" && issue.assignee_id && createdAge >= NEVER_STARTED_DAYS) {
    return { stuck: true, reason: "never_started", age_days: createdAge };
  }
  return { stuck: false, age_days: updatedAge };
}

export function stuckReasonLabel(reason: StuckReason | undefined): string {
  if (reason === "blocked") return "Blocked";
  if (reason === "stale_in_progress") return "No activity 5+ days";
  if (reason === "never_started") return "Assigned 7+ days, never started";
  return "Stuck";
}

export interface EngineerCard {
  user_id: string;
  name: string;
  role: string;
  open_count: number;
  in_progress_count: number;
  blocked_count: number;
  closed_last_7d: number;
  stuck_count: number;
  oldest_in_progress_age_days: number | null;
  working_on: Array<{ id: string; title: string; severity: string; age_days: number }>;
  stuck_top?: { id: string; title: string; reason: StuckReason; age_days: number };
  throughput_weekly: number[]; // length 12, oldest → newest
}

function displayName(u: OpsUser): string {
  if (u.display_name) return u.display_name;
  if (u.email) return u.email.split("@")[0];
  return u.user_id.slice(0, 8);
}

const ENGINEER_ROLES = new Set(["tech", "cto"]);

export function isEngineer(u: OpsUser): boolean {
  return ENGINEER_ROLES.has(u.role);
}

export function computeEngineerCards(
  issues: TechIssue[],
  users: OpsUser[],
  now: number = Date.now(),
): EngineerCard[] {
  const engineers = users.filter(isEngineer);
  return engineers.map((u) => {
    const mine = issues.filter((i) => i.assignee_id === u.user_id);
    const openIssues = mine.filter((i) => i.status === "open");
    const inProgress = mine.filter((i) => i.status === "in_progress");
    const blocked = mine.filter((i) => i.status === "blocked");
    const closedLast7d = mine.filter((i) => {
      if (i.status !== "done" || !i.closed_at) return false;
      return now - new Date(i.closed_at).getTime() <= 7 * DAY_MS;
    });
    const stuckRows = mine
      .map((i) => ({ issue: i, info: isStuck(i, now) }))
      .filter((r) => r.info.stuck)
      .sort((a, b) => b.info.age_days - a.info.age_days);
    const workingOn = inProgress
      .slice()
      .sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime())
      .slice(0, 3)
      .map((i) => ({
        id: i.id,
        title: i.title,
        severity: i.severity,
        age_days: daysBetween(i.updated_at, now),
      }));
    const oldestInProgress = inProgress.reduce<number | null>((max, i) => {
      const age = daysBetween(i.updated_at, now);
      return max == null || age > max ? age : max;
    }, null);
    const throughput = buildThroughputWeekly(mine, now);
    const top = stuckRows[0];
    return {
      user_id: u.user_id,
      name: displayName(u),
      role: u.role,
      open_count: openIssues.length,
      in_progress_count: inProgress.length,
      blocked_count: blocked.length,
      closed_last_7d: closedLast7d.length,
      stuck_count: stuckRows.length,
      oldest_in_progress_age_days: oldestInProgress,
      working_on: workingOn,
      stuck_top: top
        ? { id: top.issue.id, title: top.issue.title, reason: top.info.reason!, age_days: top.info.age_days }
        : undefined,
      throughput_weekly: throughput,
    };
  });
}

function buildThroughputWeekly(issues: TechIssue[], now: number): number[] {
  const buckets = new Array(12).fill(0);
  const endOfThisWeek = now;
  for (const i of issues) {
    if (i.status !== "done" || !i.closed_at) continue;
    const closedAt = new Date(i.closed_at).getTime();
    const weeksAgo = Math.floor((endOfThisWeek - closedAt) / (7 * DAY_MS));
    if (weeksAgo < 0 || weeksAgo >= 12) continue;
    const idx = 11 - weeksAgo; // newest at end
    buckets[idx]++;
  }
  return buckets;
}

export interface StuckRow {
  issue_id: string;
  title: string;
  assignee_id: string | null;
  assignee_name: string;
  reason: StuckReason;
  age_days: number;
  severity: string;
  company_id: string | null;
}

export function computeTeamStuckList(
  issues: TechIssue[],
  users: OpsUser[],
  now: number = Date.now(),
): StuckRow[] {
  const nameById = new Map<string, string>();
  for (const u of users) nameById.set(u.user_id, displayName(u));
  const rows: StuckRow[] = [];
  for (const i of issues) {
    if (!i.assignee_id) continue;
    const u = users.find((x) => x.user_id === i.assignee_id);
    if (!u || !isEngineer(u)) continue;
    const info = isStuck(i, now);
    if (!info.stuck) continue;
    rows.push({
      issue_id: i.id,
      title: i.title,
      assignee_id: i.assignee_id,
      assignee_name: nameById.get(i.assignee_id) ?? i.assignee_id,
      reason: info.reason!,
      age_days: info.age_days,
      severity: i.severity,
      company_id: i.company_id,
    });
  }
  rows.sort((a, b) => b.age_days - a.age_days);
  return rows;
}
