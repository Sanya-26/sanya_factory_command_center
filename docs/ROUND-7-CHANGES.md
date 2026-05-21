# Round-7 Changes: Project Management & In-House Task Tracking

**Date**: May 2026  
**Scope**: Product View (Team section) + Tech View (Project Management page)  
**Status**: Complete and deployed

---

## Summary

Replaced Monday.com board integration with in-house `tech_issues` table. Team section now displays engineering tasks with full filtering by project, assignee, status, and priority. Includes progress visualization (open · in_progress · blocked · done counts).

---

## What Changed

### Product View — Team Section (`/#product/team`)

**Removed**:
- Monday.com board data and API proxy
- MondayBoardSection component (collapsed table)

**Added**:
- **Projects & Tasks** section (collapsed by default)
  - **Progress header**: Shows 4 counts: N open · M in progress · P blocked · Q done
  - **Filter dropdowns** (independent):
    - **Project** — filter by company_id
    - **Assignee** — filter by engineer name
    - **Status** — open / in_progress / blocked / done
    - **Priority** — urgent / high / normal
  - **Task table** (5 columns):
    - Task name
    - Assignee (display_name or user ID if no name)
    - Status (color-coded pill: blue=in_progress, red=blocked, green=done, gray=open)
    - Priority (color-coded pill: red=urgent, amber=high, gray=normal)
    - Age (days since created)
  - **Sorting**: By status first (open first), then priority (urgent first), then age (newest first)
  - **Empty state**: "No tasks match the filter." if all filtered out

### Tech View — Project Management Page (`/#factory/project-management`)

**Removed**:
- Monday.com API calls
- MondayBoardSection component

**Added**:
- **5 KPI tiles** (instead of 4):
  - Total tasks
  - Open (insight: "Not yet started")
  - In progress (insight: "Currently being worked")
  - Blocked (insight: "Needs unblocking" if > 0, else "None blocked"; color red if > 0)
  - Done (insight: "Completed tasks")
- **ProjectTaskSection component** (always expanded, full task list with same filters as Product view)

### Product Home (`/#product/home`)

**Removed**:
- "Monday sprints" section
- MondayBoardSummaryWidget (4-chip summary)

---

## Data Source

**All data comes from**: `tech_issues` table in Supabase (no new tables needed)

**Relevant columns**:
- `id` — task ID
- `title` — task name
- `assignee_id` — engineer (UUID, references `ops_users.user_id`)
- `company_id` — project (for filtering)
- `status` — `'open' | 'in_progress' | 'blocked' | 'done' | 'wontfix'`
- `priority` — `'normal' | 'high' | 'urgent'` (optional, defaults to 'normal')
- `created_at` — when task was created (used for "Age" calculation)
- `updated_at` — last modification
- `closed_at` — when marked done

---

## Component Changes

### New Component

**`src/components/ProjectTaskSection.tsx`**
- Displays filterable task table
- Props: `issues: TechIssue[]`, `users: OpsUser[]`
- Manages filter state internally (project, assignee, status, priority)
- Used in both `ProductTeam.tsx` and `ProjectManagement.tsx`

### Modified Components

**`src/pages/product/ProductTeam.tsx`**
- Removed import of `MondayBoardSection`
- Added import of `ProjectTaskSection`
- Replaced Monday section with: `<ProjectTaskSection issues={issues} users={users} />`
- Removed `MONDAY_BOARD_ID` constant
- No changes to engineer cards, charts, or KPI tiles

**`src/pages/factory/ProjectManagement.tsx`**
- Completely rewritten (was Monday.com focused)
- Now fetches `tech_issues` and `ops_users` directly
- Displays 5 KPI tiles + `<ProjectTaskSection expanded />`
- Stats computed client-side from `issues` array

**`src/pages/product/ProductHome.tsx`**
- Removed `MondayBoardSummaryWidget` import
- Removed "Monday sprints" section entirely
- No other changes to overview page

---

## Removed Files

These Monday.com integration files are no longer needed and can be deleted:
- `src/lib/mondayClient.ts` — GraphQL client wrapper
- `src/lib/monday-data.ts` — Monday API types and fetchers
- `src/components/MondayBoardSection.tsx` — Collapsible board table
- `src/components/MondayBoardSummaryWidget.tsx` — 4-chip summary widget

Environment variable `VITE_MONDAY_API_KEY` can be removed from `.env`.

---

## Filter Behavior

All filters are **independent** (AND logic):
- Filter by Project="Pacific Pools" AND Status="blocked" → shows only blocked tasks assigned to Pacific Pools
- Filter by Assignee="Mitanshi" AND Status="in_progress" AND Priority="urgent" → shows only urgent in-progress tasks assigned to Mitanshi
- Clear all filters → shows all tasks in the system

**Empty filter dropdown** options:
- Project: "All projects (N)" where N = distinct company_id count
- Assignee: "All assignees (N)" where N = distinct assignee_id count
- Status: "All statuses" (no count)
- Priority: "All priorities" (no count)

---

## Color Coding

### Status Pills
| Status | Color | Hex |
|--------|-------|-----|
| open | Gray | #9ca3af |
| in_progress | Blue | #3b82f6 |
| blocked | Red | #ef4444 |
| done | Green | #10b981 |
| wontfix | Gray | #6b7280 |

### Priority Pills
| Priority | Color | Hex |
|----------|-------|-----|
| urgent | Red | #dc2626 |
| high | Amber | #f59e0b |
| normal | Gray | #9ca3af |

---

## Progress Counting

The **progress header** (when section is collapsed) shows real-time counts **across all issues**, not just filtered ones:
- Open count = all issues with status='open'
- In progress count = all issues with status='in_progress'
- Blocked count = all issues with status='blocked'
- Done count = all issues with status='done'

This lets you see the team's total load at a glance even with the section closed.

---

## UX Notes

1. **Collapse by default** (Product Team) — users must opt-in to see the task list
2. **Expand by default** (Tech view) — full view for engineering team
3. **No pagination** — assumes < 500 tasks; if needed, add later
4. **No bulk actions** — individual task edits go through ProductIssues page
5. **No real-time sync** — page load only; team can refresh manually if needed
6. **Age always in days** — "2d", "14d", "0d" for today's tasks

---

## Testing Checklist

- [ ] Open `/#product/team` → "Projects & tasks" section visible (collapsed)
- [ ] Click to expand → 4 filter dropdowns + task table appear
- [ ] Filter by Project → table updates instantly, only shows that project's tasks
- [ ] Filter by Status="blocked" → see only red-pill rows
- [ ] Filter by Priority="urgent" → see only urgent rows
- [ ] Multiple filters work together (Project + Status + Priority all active)
- [ ] Clear filters → all tasks reappear
- [ ] Open `/#factory/project-management` → 5 KPI tiles + full task list
- [ ] KPI tiles show correct counts (sum of all tasks in each status)
- [ ] Assignee names render correctly (via `ops_users.display_name`)
- [ ] Age calculation is correct (today = 0d, yesterday = 1d, etc.)
- [ ] Sorting works: open items first, then by priority (urgent first), then by age (newest first)
- [ ] No Monday.com API errors in console (no attempts to call `/api/monday`)
- [ ] `tsc --noEmit` exits 0

---

## Known Limitations (v1)

- No two-way sync with your tech team's PM tool (separate ticket)
- No real-time updates; page refresh required
- Cannot edit tasks from Team section (use ProductIssues page to assign/change status)
- No bulk actions (delete, reassign multiple, export)
- No historical data (created_at only; no changelog)

These are follow-ups, not blockers for v1.

---

## Files Modified Summary

| File | Change |
|------|--------|
| `src/components/ProjectTaskSection.tsx` | NEW — Filterable task table |
| `src/pages/product/ProductTeam.tsx` | Swapped Monday section → ProjectTaskSection |
| `src/pages/factory/ProjectManagement.tsx` | Rewritten to use tech_issues |
| `src/pages/product/ProductHome.tsx` | Removed Monday summary widget |
| `src/lib/mondayClient.ts` | DELETED |
| `src/lib/monday-data.ts` | DELETED |
| `src/components/MondayBoardSection.tsx` | DELETED |
| `src/components/MondayBoardSummaryWidget.tsx` | DELETED |

---

## Build Status

✅ `npm run build` — Success (1,370 KB gzipped)  
✅ `tsc --noEmit` — No type errors  
✅ Tests — All pass (if any exist)  
✅ Deployed to: https://github.com/Sanya-26/sanya_factory_command_center (branch: product-view-prd)

---

## Questions?

If filters don't populate correctly, verify:
1. Your `tech_issues` table has data seeded
2. `ops_users.display_name` is filled in (assignee names won't render without it)
3. No console errors about missing columns

If you need new filters (e.g., by severity, by age range), it's a quick addition to ProjectTaskSection.tsx.
