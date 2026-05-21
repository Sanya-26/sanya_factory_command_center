# PRD: Product-Manager View in command-center

## Context
The command-center today is one undifferentiated admin shell behind a binary `ops_users` → admin/not-admin gate. Sanya (Product) needs a view tailored to product oversight: per-product-variation dashboards, a customer-journey table with phase-grouped action buttons, an auditor's approval workflow, and the ability to assign issues to named engineers — without changing the Tech view that Mitanshi/Adam use day-to-day. Several supporting pieces don't exist yet (outbound email, synopsis/pricing/contract/QC agents, customer complaint intake), so they're scoped here too.

Reusing the existing pipeline avoids fork-and-drift: the same `client_journey_events` / `project_lifecycle_stage_runs` data drives both views; the Product view re-skins it.

---

## 1. Personas & roles

| Role slug | Person(s) | View | Powers |
|---|---|---|---|
| `product_manager` | Sanya | **Product view** (NEW) | Browse all product variations, audit accounts, raise issues, send outbound emails to customers, approve/bug/disapprove builds |
| `tech` | Mitanshi, Adam | Tech view (existing command-center as-is) | Receive assigned issues, fix bugs, manage builds |
| `cto` | V | Tech view + **role-assignment UI** | Only role that can promote / demote others' `role`. Receives Sanya's "high-priority fix" escalations |
| `ceo` | Ouadie | Tech view + **fundamental-issue inbox** | Receives Sanya's "disapprove → fundamental issue" escalations |

> Old PRD draft mentioned a "CX" role — confirmed dropped. Only the 4 roles above ship in v1.

---

## 2. Permission model

**Schema change** — extend `ops_users.role` CHECK constraint to add the 4 new values:

```sql
alter table public.ops_users drop constraint if exists ops_users_role_check;
alter table public.ops_users add constraint ops_users_role_check
  check (role = any (array[
    'product_manager','tech','cto','ceo',  -- new canonical roles
    'founder','admin','operator','ops','counsel','content','staff','viewer'  -- preserved for backwards compat
  ]));
```

**Role-assignment UI** — a new section in command-center settings, **visible only when `role='cto'`**. Lists every `ops_users` row + a dropdown to change role. All other roles see no admin section.

**Frontend gate** — extend `Shell.tsx` so the rendered sidebar + page router depends on `auth.role` not just `auth.status==='admin'`. Files affected:
- [src/App.tsx#L52-L111](aubos_factory_ui/command-center/src/App.tsx#L52-L111) — fetch `role` alongside admin check.
- [src/shell/Shell.tsx](aubos_factory_ui/command-center/src/shell/Shell.tsx) — branch on role.
- [src/shell/Sidebar.tsx](aubos_factory_ui/command-center/src/shell/Sidebar.tsx) — render Product sidebar (3 product cards + Issues + Settings) when `role='product_manager'`; keep existing Cleo/AI-Factory sidebar for everyone else.
- [src/shell/route.ts](aubos_factory_ui/command-center/src/shell/route.ts) — add `product/*` route segments.

---

## 3. Information architecture (Product view)

```
/product
├── /                            Main dashboard
├── /<variation>                 Per-product dashboard (cleo-for-pools | gameday-model | real-estate-model)
│   ├── /                         Customer list (3-phase table)
│   ├── /customer/<company_id>    Per-customer detail (status, flags, actions, audit panel)
│   └── /flags                    All customer complaints for this variation
├── /issues                       Tech issues assigned by Sanya (tech_issues + tenant_alerts)
├── /settings                     CTO-only: role assignment + agent settings
```

---

## 4. Pages

### 4.1 Main dashboard (`/product`)
Top-level health view for the whole business.

| Tile | Source |
|---|---|
| Overall business health (Red / Yellow / Green) | Composite over all 3 variations (see §9) |
| Financial metrics: MRR, ACV per variation, churn rate, runway | `companies.mrr_usd`, `cleo_packages.monthly_usd`, `tenant_token_usage` rollup. *New view* `v_financial_summary`. |
| 3 product cards: **Cleo for Pools**, **Gameday Model**, **Real Estate Model** | Each card shows: # live customers, # in-flight, # red-flagged, health traffic-light. Click → drills into `/product/<variation>` |

### 4.2 Per-product dashboard (`/product/cleo-for-pools`, etc.)
A customer-row table grouped by the three PRD phases (see §5). Columns:

| Column | Phase 1 | Phase 2 | Phase 3 (live) |
|---|---|---|---|
| Customer name | Link to detail | Link to detail | Link to detail |
| Current status | e.g., "Map created" | "Factory producing" | "Live" |
| Flags | Red dot + count | Red dot + count | Red dot + count |
| Actions | **Map · Synopsis · Proposal · Contract** | **Production link · Integrations · Credentials · QC sign-off** | **Health · Open audit · Issues** |
| Tech assignee (if any) | — | engineer avatar (Mitanshi/Adam) | engineer avatar |

### 4.3 Per-customer detail (`/product/<variation>/customer/<company_id>`)

Three vertically stacked panels matching the 3 phases:

**Phase 1 — Map → Contract Signed**
- Status pill: Map creating | Map created | Schedule call CTA | Call scheduled (DATE) | Send Contract CTA | Contract Signed
- Action buttons (always visible, gated by status):
  - **View Map** → renders `onboarding_canvas_states.canvas_json`
  - **View Synopsis** → renders `proposal_artifacts.synopsis_md` (generated by new Synopsis Agent, see §6.4)
  - **View / Send Proposal** → renders `proposal_artifacts.proposal_md` + financial section (from Pricing Agent §6.1). "Send" button triggers outbound email.
  - **View / Edit / Send Contract** → reuses existing `ContractEditor`; Send triggers outbound email.

**Phase 2 — Factory producing → Integrations**
- Status pill: Factory Producing Tool | Credentials | Integrations
- Action buttons:
  - **Production link** → `tenant_runtimes.domain`
  - **Integrations list** → existing `Integrations` component
  - **Account credentials** (view + "Email credentials to client" CTA)
  - **QC sign-off**: shows tech-team signer + timestamp from `cleo_self_tests.verdict='pass'` rows.

**Phase 3 — Audit by Sanya**
- **QC Checklist** (curated per account by new QC Agent §6.3): each row is a check Sanya runs manually with Pass/Fail/Note.
- Decision buttons:
  - **Approve** → advance `project_lifecycle_stage_runs` to `live`; write decision row.
  - **Bugs** → modal to write per-bug notes + assign to engineer → INSERT into `tech_issues` (cascades to `tenant_alerts` severity=high, mentions CTO V's team via `notification_dispatchers`).
  - **Disapprove** → modal explains fundamental issue → INSERT decision + notification to CEO Ouadie + CTO V (severity=critical).

**Live** (post-Phase 3 approve)
- Health traffic-light (see §9), customer complaints, last-N audit findings, link to runtime.

### 4.4 Issues page (`/product/issues`)
Stand-alone bug tracker view of `tech_issues` table (§7). Filter by assignee, status, priority. Sanya creates / closes here; Mitanshi & Adam see the same rows in a Tech-view variant.

---

## 5. Phase mapping (existing 12 stages → PRD's 3 phases)

| PRD Phase | Existing stages |
|---|---|
| **Phase 1** | `intake`, `council`, `proposal`, `awaiting-approval` (when waiting on contract signature) |
| **Phase 2** | `queued`, `planning`, `building`, `deployed` |
| **Phase 3 (Audit)** | New synthetic stage `sanya-audit` inserted between `deployed` and `live` |
| **Live** | `live` |

The Product view re-labels existing stage values to the PRD names (Map creating, Map created, Call scheduled, etc.) in a single lookup table in `lib/stage-labels.ts`.

---

## 6. New agents

Each is added to `agent_registry` + has its own daemon row in `agent_pods`.

### 6.1 Pricing Agent
- **Trigger**: when a proposal is requested for a company.
- **Input**: `companies` row (niche, size, region) + `niche_templates.template` (cost model) + `cleo_packages` price book.
- **Output**: financial section (MSRP, recurring, ROI projection) written into `proposal_artifacts.financial_md`.
- **Where it runs**: Cloud agent (Claude/GPT) called from a Supabase Edge Function `agents/pricing-run`.

### 6.2 Contract Agent
- **Trigger**: when Sanya clicks "Generate Contract" (or auto on proposal acceptance).
- **Input**: `proposal_artifacts` + `niche_templates.contract_template_md` + `companies` legal info.
- **Output**: `contract_drafts` row (existing empty table; we'll define schema: company_id, draft_md, version, status, last_edited_by, last_edited_at, sent_at, signed_at).
- **Capabilities**: create / edit / review (suggest red-flag clauses) / version.
- **Reuses** existing `ContractEditor.tsx`.

### 6.3 QC Agent
- **Trigger**: when `deployed` stage completes (= tenant is up but not yet live).
- **Input**: `companies.niche`, `niche_templates.completeness_checklist`, the tenant's features list, and last `e2e_audit_runs`.
- **Output**: a curated checklist of test steps Sanya must run manually, persisted in new table `audit_checklists` (per-account, regenerated on each redeploy).

### 6.4 Synopsis Agent
- **Trigger**: when `onboarding_canvas_states.status='complete'` (map finished).
- **Input**: canvas JSON (before/after state, opportunities, modules).
- **Output**: markdown synopsis stored in `proposal_artifacts.synopsis_md`. Triggers a `notifications` row (kind=`map-ready`, recipient=Sanya) — drives the bell + optional email.

---

## 7. New data model

### 7.1 Schema additions
```sql
-- Customer complaints / flags
create table public.customer_flags (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  reported_at timestamptz not null default now(),
  source text not null,                  -- 'support_email', 'chat', 'manual', 'audit'
  severity text not null check (severity in ('low','medium','high','critical')),
  title text not null,
  body text,
  status text not null default 'open',   -- open | acknowledged | resolved
  resolved_at timestamptz
);

-- Sanya-curated bug tracker (cascades to tenant_alerts)
create table public.tech_issues (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id),
  build_run_id uuid references public.build_runs(id),
  raised_by uuid references public.ops_users(user_id) not null,
  assignee_id uuid references public.ops_users(user_id),
  title text not null,
  description text,
  severity text not null default 'medium',
  status text not null default 'open',   -- open | in_progress | blocked | done | wontfix
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
-- Trigger: on insert/update, upsert a mirrored tenant_alerts row.

-- Sanya's audit decisions
create table public.sanya_audit_decisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  decision text not null check (decision in ('approve','bugs','disapprove')),
  notes text,
  bug_issue_ids uuid[],                  -- references tech_issues.id when decision='bugs'
  decided_at timestamptz not null default now()
);

-- Audit checklist per account (curated by QC Agent)
create table public.audit_checklists (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  generated_at timestamptz not null default now(),
  items jsonb not null,                  -- [{ id, label, expected, status: pending|pass|fail, note, checked_by, checked_at }]
  signed_off_by uuid references public.ops_users(user_id),
  signed_off_at timestamptz
);

-- Manual health-score override (auto-calc lives in a view; this is the override)
alter table public.tenant_health_snapshots
  add column if not exists override_status text check (override_status in ('green','yellow','red')),
  add column if not exists override_by uuid references public.ops_users(user_id),
  add column if not exists override_expires_at timestamptz;
```

### 7.2 niche_templates additions
```sql
-- Map PRD names to canonical slugs.
update public.niche_templates set slug='cleo-for-pools' where slug='residential-pool-service';
insert into public.niche_templates (slug, display_name, template, completeness_checklist)
values
  ('gameday-model', 'Gameday Model', '{}'::jsonb, '[]'::jsonb),
  ('real-estate-model', 'Real Estate Model', '{}'::jsonb, '[]'::jsonb)
on conflict (slug) do nothing;
```

### 7.3 Reused tables
- `client_journey_events` (event log)
- `project_lifecycle_stage_runs` (stage timeline) — add new stage value `sanya-audit`
- `audit_requests` (existing audit workflow — read by Product view, written by approve/disapprove)
- `tenant_alerts` (mirror target for tech_issues)
- `notifications` + `notification_dispatchers` (in-app + Slack mention pipeline)
- `proposal_artifacts` (synopsis_md, proposal_md, financial_md columns may need adding)
- `contract_drafts` (define schema as in §6.2)
- `onboarding_canvas_states` (map data)

---

## 8. Email & notifications

### 8.1 Outbound email
**Provider TBD** (Sanya to choose later — Resend/Postmark/SendGrid/SES). PRD specifies the abstract interface:
- `emailService.send({ to, template, data, replyTo, threadKey })`
- Templates needed: `schedule_call`, `proposal_send`, `contract_send`, `credentials_send`, `audit_invite`.
- All sends logged in new table `outbound_emails` (id, to, template, payload_jsonb, sent_at, message_id, status).

### 8.2 In-app + Slack notifications (reuse)
Insert into `notifications` triggers `notification_dispatchers` (existing) which fan-outs to Slack mention via `ops_users.slack_user_id`. New `kind` values to add:
- `map-ready` — Synopsis Agent finished, recipient=`product_manager`.
- `integrations-ready` — `tenant_runtimes` reached `integrations` stage, recipient=`product_manager`.
- `audit-disapproved` — Sanya disapprove decision, recipients=`cto`,`ceo`.
- `audit-bugs-high-priority` — Sanya bug decision, recipients=`cto`,`tech`.

---

## 9. Health score (recommended formula)

**View `v_account_health`**, recomputed on read:

```
status = override_status (if set & not expired)
       ELSE worst of these signals:
       
       RED if any of:
         - any tenant_alert with severity='critical' unresolved < 24h old
         - any customer_flag with severity='critical' status='open'
         - last successful e2e_audit_runs older than 14 days
         - tenant_runtimes.last_heartbeat_at older than 30 min
         
       YELLOW if any of:
         - any tenant_alert severity='high' unresolved
         - any customer_flag severity='high' status='open' 
         - 2+ customer_flags severity='medium' open
         - last e2e older than 7 days
         - 1+ open tech_issue severity in ('high','critical')
         
       GREEN otherwise.
```

The product variation card aggregates: variation health = worst account health across its live accounts.

---

## 10. Files to create / modify

**New (Product view shell)**
- `command-center/src/pages/product/index.tsx` — main dashboard
- `command-center/src/pages/product/variation.tsx` — per-variation customer table
- `command-center/src/pages/product/customer-detail.tsx` — 3-phase panel + decision buttons
- `command-center/src/pages/product/issues.tsx` — tech_issues view
- `command-center/src/pages/product/settings.tsx` — CTO-only role assignment + agent settings
- `command-center/src/lib/stage-labels.ts` — 12-stage → PRD phase mapping
- `command-center/src/lib/health-score.ts` — client-side wrapper around `v_account_health`

**Modified**
- `command-center/src/App.tsx` — fetch + propagate `role`
- `command-center/src/shell/Shell.tsx` + `Sidebar.tsx` + `route.ts` — role-based sidebar
- `command-center/src/pages/cleo-command-center/ContractEditor.tsx` — wire "Send via email" CTA

**New supabase**
- `migrations/002_product_view.sql` — all schema additions in §7
- `supabase/functions/agents/pricing-run/` (Edge Function)
- `supabase/functions/agents/contract-run/`
- `supabase/functions/agents/qc-run/`
- `supabase/functions/agents/synopsis-run/`
- `supabase/functions/emails/send/` (provider-agnostic façade)

---

## 11. Verification

1. **Permission switch**: a CTO promotes a test user to `product_manager` → that user reloads command-center → sees Product sidebar, no Tech sidebar.
2. **Phase 1 happy path**: pick a company in `intake`; Map button renders canvas; click "Send Proposal" → row appears in `outbound_emails`, customer receives templated email (or mock log if provider stub).
3. **Audit flow**: advance a build to `sanya-audit`; checklist appears (generated by QC Agent); mark items pass; click Approve → `project_lifecycle_stage_runs` advances to `live` + decision row written.
4. **Bug routing**: click Bugs → assign Mitanshi → `tech_issues` row + mirrored `tenant_alerts` row + Slack mention to Mitanshi + Tech view shows the issue.
5. **Disapprove routing**: click Disapprove → CEO + CTO receive notification of kind `audit-disapproved` (visible in their NotificationBell).
6. **Health score**: insert a critical `tenant_alert` for a live company → its card flips to Red in <2s (realtime).
7. **Synopsis notification**: mark a canvas as `status='complete'` → Synopsis Agent runs → Sanya gets `map-ready` notification.
8. **Niche additions**: confirm `niche_templates` now has `cleo-for-pools`, `gameday-model`, `real-estate-model`.

---

## 13. Local-first dev mode (no Supabase required)

### 13.1 Goal & rationale
Demo + iterate on the Product view without ever touching the real AI Factory Supabase. Empty-state / "Unknown error" screens go away. Reload-safe so screenshots and walk-throughs reproduce.

### 13.2 Mechanism — drop-in mock client at `getFactorySupabase()`
The whole Product view talks to Supabase through a single singleton in
[command-center/src/lib/factorySupabase.ts](aubos_factory_ui/command-center/src/lib/factorySupabase.ts). That's the ONE injection point.

**New env var**: `VITE_DATA_BACKEND` ∈ {`mock`, `supabase`}.
- Default = `mock` in development (`import.meta.env.DEV`) when no `VITE_SUPABASE_URL` is set OR the URL equals `mock://local`.
- Production builds default to `supabase`.

**New file**: `command-center/src/lib/mockSupabase.ts` — exports `createMockClient()` returning an object that implements the **subset of Supabase JS used by the Product pages** (no MCP, no realtime, no auth). Surface required (from Phase 1 exploration):
- `.from(table)` → query builder: `.select(...)`, `.insert(...)`, `.update(...)`, `.delete(...)`, with chainable `.eq()`, `.in()`, `.order()`, `.limit()`, `.maybeSingle()`, `.single()`
- Tables backed by in-memory arrays:
  `companies`, `ops_users`, `project_lifecycle_stage_runs`, `customer_flags`, `tech_issues`, `audit_checklists`, `sanya_audit_decisions`, `notifications`, `outbound_emails`, `contract_drafts`, `client_journey_events`, `proposal_artifacts`
- Views backed by computed reducers over those arrays:
  `v_account_health` (red/yellow/green per company, same formula as §9)
  `v_financial_summary` (per-niche rollup)

### 13.3 Seed data — `command-center/src/lib/seeds.ts`
Bundled JSON-shaped fixtures. Counts that look realistic without being overwhelming:

| Variation | Live | Phase 3 (audit) | Phase 2 (build) | Phase 1 (sign) |
|---|---|---|---|---|
| cleo-for-pools | 3 | 1 | 2 | 4 |
| gameday-model | 1 | 1 | 1 | 2 |
| real-estate-model | 0 | 0 | 1 | 3 |

Each company gets a name, niche, email, current stage, 1–3 random `client_journey_events`, and 0–2 `customer_flags` of varying severity. Three companies get an `audit_checklists` row with 8–10 pre-filled items (some pass, some pending). Two `tech_issues` exist (1 open assigned to Mitanshi, 1 done). Two `sanya_audit_decisions` (one approve, one bugs). `outbound_emails` has 3 historical sent rows. `ops_users` mirror real names: Sanya (product_manager), Mitanshi + Adam (tech), V (cto), Ouadie (ceo).

### 13.4 Persistence — `localStorage`
Mock data lives in memory but **snapshots to `localStorage` on every write**, restored on page load. Reset button in dev menu (sidebar footer) wipes + re-seeds.

### 13.5 Mode indicator
Sidebar footer shows a "🧪 Local mock data" pill when `VITE_DATA_BACKEND=mock`, so it's never ambiguous which backend is live.

### 13.6 Files to create / modify
- **New**: `command-center/src/lib/mockSupabase.ts` — the fake client
- **New**: `command-center/src/lib/seeds.ts` — fixtures
- **Modified**: `command-center/src/lib/factorySupabase.ts` — env-gated dispatch
- **Modified**: `command-center/src/shell/Sidebar.tsx` — mock-mode pill + reset button
- **Modified**: `command-center/.env.example` — document `VITE_DATA_BACKEND`

---

## 14. Visualizations

### 14.1 Library
Add **recharts** to `command-center/package.json`. ~70 KB gzip, declarative, no D3 boilerplate, works with React 18. No other charts in the codebase today (only `@xyflow/react` for node-graph stuff in BusinessMap).

### 14.2 Per-page additions

**ProductHome.tsx**
- Replace the dead "Green" stat tile with a **Health distribution donut** (counts of red / yellow / green across all live accounts).
- Add a **Phase funnel** (vertical bar chart): Phase 1 → Phase 2 → Phase 3 → Live, stacked by variation.
- Add a **MRR-by-niche bar chart** beside the financial summary table.
- Each of the 3 product variation cards gains a tiny **sparkline** of `live_count` over the last 12 weeks (synthetic from journey events).

**ProductVariation.tsx**
- Above the customer table, a **horizontal stacked bar** showing the 4 phases' relative populations for this niche.
- Each row's status pill becomes a **12-step progress strip** (one tick per stage, current one highlighted) — replaces the bare text label.

**ProductCustomerDetail.tsx**
- Above the 3 panels, a **horizontal stage stepper** spanning all 12 lifecycle stages (`intake … live`), current stage highlighted in blue.
- New right-rail panel: **Activity timeline** — last 15 `client_journey_events` for the company (relative time + event_kind + actor).
- Small **Health trend** line chart (last 30 days, RYG state changes).

**ProductIssues.tsx**
- Top strip: 4 stat tiles (Open / In progress / Blocked / Done last 7d) + a **Status donut**.
- Add **search + assignee filter**.

**ProductFlags.tsx**
- Top: **Severity bar chart** (low/medium/high/critical counts) + a **Flags-over-time** sparkline.
- Add **search by company / title**.

### 14.3 Reusable chart components
- `command-center/src/components/charts/StatusDonut.tsx` (red/yellow/green or severity buckets)
- `command-center/src/components/charts/PhaseFunnel.tsx`
- `command-center/src/components/charts/MrrByNicheBar.tsx`
- `command-center/src/components/charts/Sparkline.tsx`
- `command-center/src/components/charts/StageStepper.tsx`
- `command-center/src/components/charts/ActivityTimeline.tsx`

---

## 15. Usability polish

- **Loading skeletons** instead of "Unknown error" while fetches resolve.
- **Empty-state CTAs** ("No customers yet — seed sample data?" button visible only in mock mode).
- **Refresh button + auto-refresh** (30s) on the Home + Variation pages.
- **Severity / status badges**: shared component, consistent palette across Issues, Flags, customer detail.
- **Floating "Quick Actions" panel** on the customer detail page: Approve / Bugs / Disapprove + Email CTAs always reachable without scrolling.
- **Search + filter** on Issues, Flags, and the customer table (text + status dropdown).
- **Keyboard navigation**: `g h` → Home, `g v` → current variation, `g i` → Issues (using a small global key handler).
- **Last-updated timestamp** in the top trail bar so you know how stale the data is.
- **Mock-mode reset** in sidebar: wipes localStorage + re-seeds.

---

## 16. Sequencing for §13–§15

To minimize churn:
1. Add recharts + mock client + seeds + factorySupabase env-gate (the foundation).
2. Verify all 6 pages still render against the mock with non-empty UIs.
3. Add the 6 reusable chart components.
4. Wire charts into ProductHome → ProductVariation → ProductCustomerDetail (heaviest pages first).
5. Wire smaller charts into ProductIssues + ProductFlags.
6. Add empty-state CTAs, loading skeletons, refresh, search/filter.
7. Add mode pill + reset button to the sidebar.

When the user later flips `VITE_DATA_BACKEND=supabase` (or applies the migration and the env defaults to supabase in dev), the same pages work against the real DB unchanged.

---

## 17. Round-2 feedback — PM walk-through fixes

Feedback captured from Sanya's first walk-through of the live mock UI. This section overrides §4 / §14 / §15 where they conflict.

### 17.1 Dashboard (`/#product/home`)

**Bugs to fix**
- KPI tile values are invisible: numbers render but inherit the shell's light text color on white tile. Fix by setting explicit `color: #111827` on tile values and labels (and applying the same fix to all data tables).
- "Product variations" card text was invisible too — same root cause; same fix.

**Renaming "Product variations" → "Product Lines"** (confirmed). Update everywhere: sidebar headers, dashboard tile, in-app copy, PRD doc.

**"Whose account?" — Account Health donut needs context**
- Retitle to **"Customer health (live accounts)"**.
- Subtitle: "How many of your live customers are healthy right now."
- Hover on a slice → tooltip lists customer names in that bucket.
- Sub-link below the donut: "View red accounts →" filters to customers in red.

**Variation cards: missing names + add a meaningful sparkline**
- Each card displays the variation name as a large title (was visually swallowed), a 1-line stat row (`3 live · 7 in flight · $5,980 MRR`), and a sparkline.
- Sparkline = **new live customers per month**, last 12 months — answers "is this product growing?"

**PM-flavored widgets to add to the dashboard** (Sanya confirmed):
- **My audit queue** — list of accounts at `sanya-audit` waiting on Sanya's verdict, with age in days, sorted oldest-first. Click row → opens that customer's detail at the audit panel.
- **Top flagged issues this week** — top 5 rows from `v_issues_with_flag_stats` sorted by priority_score desc, restricted to issues with flag activity in the last 7 days. Click → Issues page filtered to that row.
- **Average time to live (per niche)** — table or bar chart: signup → live days, computed from `client_journey_events` event pairs. Highlights slow niches.

### 17.2 Per-niche page (applies to Cleo for Pools, Gameday, Real Estate)

**Phase funnel: one-line description per phase**
- "**Sign**: customer signed up, we're mapping their business and writing a proposal."
- "**Build**: the AI Factory is producing their tools and wiring integrations."
- "**Audit**: Sanya is reviewing the deployed tenant against the client-value checklist."
- "**Live**: customer is using their tool in production."

**Health donut: relabel + add tooltip context** (same fixes as §17.1).

**Phase 1 row — gated action buttons**

| Stage `stage_slug` | Status label shown | Map | Synopsis | Proposal | Contract | Schedule call |
|---|---|---|---|---|---|---|
| `intake` | **Map creating…** | ✗ disabled | ✗ disabled | ✗ disabled | ✗ disabled | — |
| `council` | **Map created — drafting proposal** | ✓ | ✓ | ✗ disabled | ✗ disabled | — |
| `proposal` | **Ready for call** | ✓ | ✓ | ✓ | ✗ disabled | ✓ enabled |
| `proposing` | **Proposal sent — awaiting client** | ✓ | ✓ | ✓ | ✗ disabled | — |
| `awaiting-approval` | **Contract pending signature** | ✓ | ✓ | ✓ | ✓ | — |

**Phase 2 row — gated**

| Stage | Status label | Production link | Integrations | Credentials | QC sign-off |
|---|---|---|---|---|---|
| `queued` / `planning` / `building` | **Factory producing tool…** | ✗ | ✗ | ✗ | (info-only chip showing "in progress") |
| `deployed` | **Credentials + integrations ready** | ✓ | ✓ | ✓ | info-only chip: "✓ passed by Mitanshi 2h ago" |

> QC sign-off is **not** a button — it's an info chip showing who signed off and when. (Sanya's feedback.)

**Live row**
- "Health" column shows the actual **traffic-light + score** (e.g., 🟢 92), clickable to drill into the customer detail health tab.
- "Issues" column shows **"N issues"** count, clickable → opens that customer's issues filter.
- "Flags" column shows **"N flags"** count, clickable → opens that customer's flags.

**Click customer name** → navigate to `/#product/<niche>/customer/<id>` (already implemented; confirm action-button row no longer captures this gesture).

### 17.3 Customer detail (`/#product/<niche>/customer/<id>`)

**Stage-aware action panels**
Each Phase panel shows only the buttons listed in the §17.2 gating tables, with disabled ones either greyed (with tooltip "available once map is created") or removed entirely (UX decision: **grey, don't remove** — so the user understands what's coming next). Active button gets a subtle blue glow.

**Action button behaviors (mostly popups, not page nav)**
- **Map** → opens `<MapPopup>` modal rendering `onboarding_canvas_states.canvas` for this company.
- **Synopsis** → opens `<SynopsisPopup>` modal rendering the markdown synopsis stored in `proposal_artifacts (kind='synopsis')`.
- **Proposal** → opens `<ProposalPopup>` modal showing the proposal markdown + a "Send via email" button inside.
- **Contract** → opens the existing `ContractEditor` (already wired) in a side drawer.
- **Schedule call** / **Ready for call** → opens a `<ScheduleCallPopup>` that lets Sanya pick a time and triggers a Google Meet invite (see AskUserQuestion for provider).

**Phase 3 — Sanya's audit is client-focused, not tech-focused**
The seeded checklist items become client-experience tasks, not smoke tests. New default items (the QC agent should generate similar ones):
1. Sign up as a brand-new customer and complete the full onboarding without help. Does it feel obvious?
2. Submit a real quote request as a homeowner. Does the form ask the right questions?
3. Try the 3 most common journeys (browse → quote → schedule) and time each. Anything > 3 clicks?
4. Open the site on a phone. Is anything cramped or broken?
5. Pretend to be a confused customer. Where does support live? Is it reachable?
6. Read the copy on the home page out loud. Does it sound like Crystal Clear Pools or like a template?
7. Check the photos. Are they from the real customer or stock?
8. Try the AI receptionist (if enabled). Does it answer the top 3 FAQs correctly?
9. Try to break it: empty inputs, weird characters, double submits. Anything explode?
10. Final gut check: would you recommend this to a friend in this niche today?

**Live phase**
- Header chip turns into a permanent banner: 🟢 Live since 2026-03-04 · Health: Green · 2 issues · 0 flags.
- Replace the 2 button placeholders with: clickable issue count → opens issues filtered to this company; clickable flag count → opens flags filtered to this company; clickable health chip → opens a health history side panel.

### 17.4 Issues + Flags redesign — the big one

**Vocabulary**
- **Flag** = customer-raised complaint or feature request. Many per customer.
- **Issue** = the underlying engineering ticket Sanya tracks. One issue can collect many flags from many customers.
- A **Triage Agent** processes new flags and either links each to an existing issue OR creates a new issue.

**Data model additions**
```sql
alter table public.customer_flags
  add column linked_issue_id uuid references public.tech_issues(id),
  add column triaged_at timestamptz,
  add column triaged_by text;  -- 'triage_agent:v1' or 'manual:<ops_user_id>'

create or replace view public.v_issues_with_flag_stats as
select
  ti.*,
  coalesce(s.flag_count, 0) as flag_count,
  coalesce(s.customer_count, 0) as customer_count,
  coalesce(s.flag_count, 0) + coalesce(s.customer_count, 0) * 2 as priority_score
from public.tech_issues ti
left join (
  select linked_issue_id,
         count(*) as flag_count,
         count(distinct company_id) as customer_count
  from public.customer_flags
  where linked_issue_id is not null and status != 'resolved'
  group by linked_issue_id
) s on s.linked_issue_id = ti.id;
```

**Triage Agent** (new edge function `agents/triage-flag-run`)
- Trigger: HTTP POST `{ flag_id }` on customer_flags insert.
- Reads recent open `tech_issues` + the flag's title/body.
- LLM call (`_shared/llm.ts`): classify as either an existing issue id OR a new issue.
- If existing: UPDATE customer_flags SET linked_issue_id = X, triaged_at = now(), triaged_by = 'triage_agent:v1'.
- If new: INSERT into tech_issues + link.
- For local mock: implement a substring-similarity matcher (no LLM) — same flag titles get bucketed.

**Issues page (`/#product/issues`) redesign**
- New columns: **Flags** (count), **Customers** (distinct count), **Priority** (priority_score), Severity, Assignee, Created.
- Default sort: priority_score desc.
- Click an issue row → drawer/modal showing the flag list (customer name, title, reported_at) so Sanya understands the pattern.

**Per-customer Flags page changes**
- Add a "Linked issue" column. Click → opens issue drawer.

**Why this matters**
Without grouping, 10 customers each filing a "site is slow on mobile" flag look like 10 unrelated complaints. After triage, that's one issue with 10 flags from 10 customers — and the issue table sorts it to the top by priority. Sanya assigns it to one engineer, fix lands, all 10 flags resolve together.

### 17.5 Modal popup + dedicated routes (Sanya wants both)
- `command-center/src/components/Modal.tsx` — overlay + body slot + close button + Esc-to-close + click-overlay-to-close + "Open in full page →" header link.
- Modals: `MapPopup`, `SynopsisPopup`, `ProposalPopup`, `ScheduleCallPopup`.
- Dedicated routes for the same content (linkable / bookmarkable):
  - `/#product/<niche>/customer/<id>/map`
  - `/#product/<niche>/customer/<id>/synopsis`
  - `/#product/<niche>/customer/<id>/proposal`
- Action button on the customer detail row → opens the modal by default; the modal header's "Open full page" link navigates to the dedicated route. Both render the same `MapView` / `SynopsisView` / `ProposalView` component internally.

### 17.5b Schedule-call — Google Meet via Google Calendar OAuth
Existing wiring to reuse:
- [src/pages/factory/CalendarOAuthCallback.tsx](aubos_factory_ui/command-center/src/pages/factory/CalendarOAuthCallback.tsx) — the OAuth landing page for Google Calendar (already handles the redirect_uri exchange).
- [src/pages/factory/FactorySettings.tsx](aubos_factory_ui/command-center/src/pages/factory/FactorySettings.tsx) — connection state UI for the user's Google Calendar token (assume it stores the token; verify on implementation).

New work:
- `<ScheduleCallPopup>` — body shows: 30/45/60-min slot picker for the next 14 days using the user's free-busy. Inputs: customer name (pre-filled), customer email (pre-filled), agenda (defaults to "CLEO proposal walk-through").
- On submit: POST to `agents-schedule-call` (new edge function) with `{ company_id, slot_start, slot_end, duration_min, agenda }`. The function uses the connected Google account's tokens to create a Calendar event with Meet enabled, invites the customer, and inserts an `outbound_emails` row of template `schedule_call_confirm` for the receipt.
- Falls back gracefully when no Google account is connected: shows a "Connect Google Calendar →" link pointing at the existing OAuth start.
- In **mock mode**, the popup pretends to schedule (writes a row to a new `scheduled_calls` mock table + `outbound_emails`) without hitting Google.

### 17.6 Status-label + action-gating implementation
- New `lib/stage-actions.ts` returns `{ statusLabel, enabledActions }` for a given stage_slug.
- All Phase rows + the customer detail panels read from this single source.
- Tooltip on disabled buttons: "Available once <prerequisite>".

### 17.7 Seed data adjustments
- Add `linked_issue_id` to the existing seed flags so the new issues view has stats out of the box (most-flagged issue: "Lead form double-submits" — 4 customers, 7 flags).
- Add 3–5 more seed flags spread across customers to make the priority scoring visible.

### 17.8 Apply to all 3 niches
Everything in §17.2–§17.3 applies to Cleo for Pools, Gameday Model, and Real Estate Model identically. The stage labels and action gating are stage-driven (`stage_slug`), not niche-driven, so they carry across.

---

## 18. Round-3 feedback — Account Health, calendar, proposal, schedule flow, V assignment

Captured from Sanya's second walk-through. Supersedes §17 where they conflict.

### 18.1 Dashboard (`/#product/home`)

- **Remove "Financial summary" table** — it duplicates the per-line cards.
- **Reorder sections**: KPI tiles → existing PM widgets (My audit queue · Top flagged issues · Avg time to live) → Product lines (cards) → Charts row (Phase funnel + Account health redesign + MRR by niche).
- **Account Health card — redesign**: drop the donut-only view; show an **"At-risk accounts" list** with WHY each one is at risk (e.g., "AquaArt Pools · Yellow · 1 high flag open + last e2e 9d ago"). A small inline status pill replaces the donut; the list is the actionable thing. Same redesign applies to per-niche page (§18.2).
- **Calendar widget — new** on the overview: list of upcoming customer calls for the next 7 days, sourced from `scheduled_calls` (created by the new schedule-call flow §18.4). Each row: date/time · customer · agenda · Meet link (if any) · "Open" button. Empty state: "No calls scheduled this week."

### 18.2 Per-niche page (Cleo for Pools / Gameday / Real Estate)
- **Account health donut** on this page uses the same new design as §18.1 (at-risk customer list scoped to this niche).
- **Phase funnel chart**: phase descriptions move into the chart **tooltip** (recharts `<Tooltip content={...}>`) instead of plain text below the title. Hovering "Sign" shows the sentence; same for Build/Audit/Live.

### 18.3 Tooltip-with-insight on every chart
A new shared `<ChartCard>` wrapper that gives any chart:
- Optional title
- A small `?` info icon in the top-right
- On hover/click: a popover showing two short sentences — "**What this is**: …" and "**What to do with it**: …"

Applied to every chart on the overview + niche pages. Example wording:
- **Phase funnel**: "What this is: count of customers in each stage of the journey." / "What to do: if Audit ≫ Build, you're the bottleneck; if Build ≫ Live, the Factory is."
- **Account health card**: "What this is: every live account flagged yellow or red, with the specific reason." / "What to do: open the riskiest one and clear the root cause."
- **MRR by niche**: "What this is: monthly recurring revenue from signed/sent contracts per product line." / "What to do: compare to ACV — high MRR + low ACV = volume play; opposite = enterprise."
- **My audit queue**: "What this is: accounts at the sanya-audit stage waiting on your verdict." / "What to do: clear oldest first; > 3d is a customer-experience risk."
- **Top flagged issues**: "What this is: open issues ranked by flag count and distinct customers affected." / "What to do: assign the top-priority one to a tech engineer immediately."
- **Avg time to live**: "What this is: average days from signup → onboarding-complete, per product line." / "What to do: if > 30d, find the bottleneck in Phase 1 or 2."
- **Sparklines on variation cards**: "What this is: new live customers per month over the last 12 months." / "What to do: if flat, your top-of-funnel is the problem."

### 18.4 Schedule-call flow — Sanya offers slots, customer picks

The previous flow had Sanya book a slot directly. New flow:

1. Sanya clicks "Schedule call" on a customer.
2. `<ScheduleCallPopup>` lets her **multi-select 3–7 slots** that work for her over the next 14 days (toggle buttons; 30-min default duration).
3. Submit creates a `call_slot_offers` row with the slot list + a unique short token.
4. An `outbound_emails` row of template `schedule_call_offer` is queued, payload includes the public picker URL `https://welcome.aubos.ai/pick/<token>` (mock displays the URL in the success modal).
5. Customer-facing slot-picker (out of scope for this iteration's app — would live in customer-ui repo; for mock, simulate it by adding a "Simulate client picks slot 2" button in mock mode that fires the confirmation path).
6. When customer picks, Edge function `agents-schedule-call-confirm` creates the actual Google Calendar event with Meet link and writes a `scheduled_calls` row pointing back at the offer. Confirmation emails fire to both parties.
7. The new Calendar widget (§18.1) reads from `scheduled_calls`.

**Data model**
```sql
create table public.call_slot_offers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  offered_by uuid not null references ops_users(user_id),
  agenda text not null,
  duration_min int not null default 30,
  slots jsonb not null,                    -- [{ start_iso, end_iso }]
  picker_token text not null unique,
  picked_slot_index int,
  picked_at timestamptz,
  created_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '7 days')
);

create table public.scheduled_calls (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  offer_id uuid references call_slot_offers(id),
  slot_start timestamptz not null,
  slot_end timestamptz not null,
  agenda text not null,
  provider text default 'mock',           -- 'google-meet' in real backend
  meet_url text,
  external_event_id text,
  created_at timestamptz default now()
);
```

### 18.5 Proposal — beautiful presentation, not just markdown

Replace the current `ProposalPopup` markdown rendering with a **slide-deck** layout:
- 6–8 slides, swipeable / prev-next controls + a slide-counter / mini-thumbnail strip
- Slides:
  1. **Cover**: customer logo placeholder · niche · "Prepared for {Customer Name}" · date · big AUBOS / CLEO mark.
  2. **The challenge**: 1-line problem statement + 2–3 stat callouts ("12% lead conversion · 41% after-hours misses").
  3. **What CLEO will build**: 4 cards (branded site · AI receptionist · quote calculator · drip nurture) with icons.
  4. **The customer experience**: before/after side-by-side (text from synopsis).
  5. **Pricing**: tier card with monthly price + what's included; ROI projection underneath.
  6. **Timeline**: 3–5 day Gantt-style block ("Day 1 intake · Day 2 build · Day 3 audit · Day 4 handover · Day 5 live").
  7. **Why now**: 3 trends bullets.
  8. **Next step**: big CTA "Schedule the 30-min walkthrough" + signature line.
- Each slide is a React component composed via a `<Slide>` shell with consistent padding, typography, and a fixed footer ("CLEO · {Customer Name} · {date}").
- "Send via email" still works — email body contains a snapshot link to the deck for the customer.
- The popup keeps the "Open full page ↗" header link so Sanya can present full-screen.

### 18.6 Issue assignment — V (CTO) can be assigned + can delegate

- Issue assignee dropdown now lists everyone with `role IN ('tech','cto')` — i.e., Mitanshi, Adam, **and V**.
- When the current logged-in user is V (role=cto), the Issues page lets V re-assign any issue assigned to himself to a tech ops_user. The existing assignee dropdown already supports this; the only change is filter relaxation.
- A small "Reassign →" affordance shows for issues where `assignee_id = current_user.id` and the current user is `cto`, so V doesn't have to spelunk the dropdown to find the delegation.
- Update the seed: add a 3rd issue assigned directly to V to demonstrate the delegation UX.

### 18.7 Files to create / modify (round 3)

**New**
- `command-center/src/components/ChartCard.tsx` — chart wrapper with `?` info popover.
- `command-center/src/components/AtRiskList.tsx` — replaces the StatusDonut on overview + niche pages.
- `command-center/src/components/CalendarWidget.tsx` — upcoming meetings (next 7 days).
- `command-center/src/components/ProposalDeck.tsx` — slide deck used by `ProposalPopup`.

**Modified**
- `command-center/src/pages/product/ProductHome.tsx` — reorder, remove financial summary, swap donut for AtRiskList, add CalendarWidget, wrap charts in ChartCard.
- `command-center/src/pages/product/ProductVariation.tsx` — same AtRiskList swap + tooltipped phase funnel + ChartCard wrappers.
- `command-center/src/components/charts/PhaseFunnel.tsx` — custom recharts tooltip with phase descriptions.
- `command-center/src/components/product-popups.tsx` — `ProposalPopup` uses `ProposalDeck`.
- `command-center/src/components/schedule-call-popup.tsx` — multi-select slots + offers flow.
- `command-center/src/pages/product/ProductIssues.tsx` — assignee dropdown includes `cto`; "Reassign →" affordance when self-assigned and role=cto.
- `command-center/src/lib/seeds.ts` — add 1 issue assigned to V; add a couple of `scheduled_calls` rows for the calendar widget to render against.
- `command-center/src/lib/mockSupabase.ts` — accept new tables `call_slot_offers`, `scheduled_calls` (auto-created by first insert; no view changes).

### 18.8 Verification (round 3)
- Open `/#product/home`. Order: KPI · PM widgets · Product lines · Charts row. No financial summary table. Calendar widget shows seeded upcoming meetings.
- Account-health card lists by name the at-risk customers + the reason for each.
- Hover the `?` on any chart → popover with "What this is / What to do with it" copy.
- Phase funnel: hovering a bar shows the bar value AND a one-sentence description of that phase.
- Pacific Pools customer detail · click Schedule call → multi-slot picker → submit → success modal shows the email + the public picker URL.
- Issues page assignee dropdown lists Mitanshi, Adam, V. Re-assign an issue from V → Adam from the dropdown.
- Proposal click on Pacific Pools → slide deck modal opens; "Open full page" navigates to dedicated route.

---

## 19. Round-4 feedback — KPI insights, sparkline labels, Issues readability

Captured from Sanya's third walk-through. Tightly scoped polish.

### 19.1 KPI tiles need insights, not just numbers

Each of the four tiles on `/#product/home` ("Overall business health", "MRR", "Live customers", "In flight") gets a **hover tooltip** with one short, data-driven insight. Mock data acceptable where the live data isn't expressive enough.

| Tile | Insight (computed where possible, otherwise placeholder) |
|---|---|
| **Overall business health** | "2 accounts dipped to yellow this week — AquaArt Pools (1 high flag) and Stadium Stream (in audit > 4d). None red yet." |
| **MRR (signed contracts)** | "+$1,495 this month from Splash Masters going live. Standard tier ($1,495) is 67% of revenue; premium is 22%." |
| **Live customers** | "1 went live this week (Touchdown Tech, 2026-05-15). 2 more in audit awaiting your verdict." |
| **In flight** | "Splash Masters has been in audit 2d — that's the oldest. 4 customers stuck in Phase 1 > 7 days." |

Implementation:
- New `<KpiTile>` component that wraps the existing layout + accepts a `tooltip` prop.
- Hovering the tile reveals a small popover above it (similar visual to ChartCard's `?` popover but triggered by hover and no `?` icon).
- Insights computed in `ProductHome` from existing data (stages, contracts, journey events). Fall back to a sensible static sentence when the data doesn't support a specific number.

### 19.2 Sparklines on Product Line cards need a label

The line chart on each product line card currently has zero context. Fix:
- Add a label **below** the sparkline: "Signups · last 12 weeks" with a tiny trend chip ("↑ 25%" / "→ flat" / "↓ 12%").
- Add a hover tooltip on the card itself with one insight, same pattern as §19.1:
  - "Cleo for Pools is the fastest-growing line — 4 signups in the last 4 weeks vs 2 the previous 4."
  - "Gameday Model is flat — last signup was 3 weeks ago."
  - "Real Estate Model just started — 3 signups in the last 2 weeks, no live yet."

### 19.3 Issues table readability

The screenshot shows Status and Assignee dropdowns rendering as dark-gray-on-darker-gray — unreadable. Root cause: native `<select>` elements inherit no explicit color, so the OS dark theme paints them grey-on-grey when the parent has dark colors. The Issues table sets `color: #111827` on the table but the select OS UA styles take over.

Fix:
- Add a shared `selectStyle` constant: `{ background: "white", color: "#111827", border: "1px solid #d1d5db", padding: "4px 8px", borderRadius: 4, fontSize: 12 }`.
- Apply it to **all** `<select>` elements on the Issues page (status, assignee, filter dropdowns) — and audit the other product pages for the same issue (ProductFlags resolve dropdown, ProductCustomerDetail checklist Pass/Fail).
- The "open / in_progress / blocked / done / wontfix" status select gets a colored left border per state for extra glance-ability (optional micro-polish).

### 19.4 Files to create / modify (round 4)

**New**
- `command-center/src/components/KpiTile.tsx` — tile with hover-tooltip slot.
- `command-center/src/lib/insights.ts` — computes the four tile insights + the per-line sparkline insight from current mock/real data.

**Modified**
- `command-center/src/pages/product/ProductHome.tsx` — swap inline `<StatTile>` with `<KpiTile>`, pass computed insights; add sparkline label + trend chip on the variation cards; pass insight tooltip to each card.
- `command-center/src/pages/product/ProductIssues.tsx` — apply `selectStyle` to every `<select>`. Same for ProductFlags resolve action and ProductCustomerDetail checklist status select.

### 19.5 Verification
- Hover each KPI tile → small popover with one insight appears above.
- Hover each Product Line card → tooltip with growth insight. Below the sparkline: "Signups · last 12 weeks · ↑/→/↓ %".
- Issues page: every select renders white-on-dark-text, readable at a glance. Same on Flags and Customer Detail checklist.

---

## 22. Round-6 — Team management

### 22.1 Context
Sanya wants an **engineer-first surface** so she can manage the team: see what each person is working on, who's stuck, who's been sitting on something too long. Today the only view of engineers is `ProductIssues`, where they show up as a column on an issue-first table. §22 adds the inverse — one card per engineer with their now-state, oldest in-progress item, stuck items, and weekly throughput.

### 22.2 Scope (v1)
- **Work source**: `tech_issues` only. No new schema; no per-customer build ownership. Engineer-to-build assignment is a follow-up.
- **Stuck rules** (single source of truth in `lib/team-data.ts`):
  1. `status='blocked'` (any age)
  2. `status='in_progress'` AND `updated_at` older than **5 days**
  3. `status='open'`, assigned, never moved to in_progress, `created_at` older than **7 days**
- **Drill-in**: clicking an engineer card opens a right-side drawer with their full issue list grouped by status (In progress · Blocked · Open · Closed last 14d).

### 22.3 Page layout — `/#product/team`

**KPI strip — 4 tiles (`KpiTile` with hover insight):**

| Tile | Computation | Insight |
|---|---|---|
| Active engineers | role∈{tech,cto} with any open/in_progress/blocked | Lists every engineer + how many active |
| Open issues (team) | sum of open + in_progress + blocked across team | Names who carries the most |
| Stuck items | rows matching §22.2 stuck rules | Red value if > 0; names the oldest stuck item |
| Throughput · 7d | closed in last 7 days, summed across team | Names the top closer |

**Engineer cards** — 3 columns, one per engineer:
- Header: name + role chip + (conditional) "N stuck" pill
- "Now" row: Open / In progress / Blocked pills
- Working on: top 1–3 in_progress items, sorted by oldest `updated_at`, with severity chip + age
- Stuck row (red, conditional): "Stuck on *<title>* · *<N>* d · *<reason>*"
- Closed 7d: big number + 12-week throughput sparkline
- Footer: **Open queue →** opens `<EngineerQueueDrawer>`

**Team-wide stuck list** (right rail, `<ChartCard>`-wrapped):
- One row per stuck item across all engineers, sorted oldest first
- Each row: red dot · title · "Sanya · reason · age" subline · Open button → drawer

**Workload balance** (`<ChartCard>` + recharts horizontal stacked bar):
- One row per engineer, stacks: Open / In progress / Blocked

**Throughput trend** (`<ChartCard>` + recharts line chart):
- 12 weeks × per-engineer issues closed/week; one line per engineer

### 22.4 Engineer queue drawer (`<EngineerQueueDrawer>`)

Right-side overlay (Esc + overlay-click to close). Header shows name + role + summary chip ("X open · Y in progress · Z blocked · 7d closed: N"). Body: 4 grouped lists — In progress · Blocked · Open · Closed (last 14d). Each row deep-links to `/#product/issues`.

### 22.5 Data layer

**`lib/team-data.ts`** (pure, side-effect-free):
- `isStuck(issue, now?) → { stuck, reason?, age_days }`
- `computeEngineerCards(issues, users, now?) → EngineerCard[]`
- `computeTeamStuckList(issues, users, now?) → StuckRow[]`
- Constants: `STALE_IN_PROGRESS_DAYS=5`, `NEVER_STARTED_DAYS=7`

**`mockSupabase.ts`** — new computed view `v_team_workload`. Same compute-on-demand pattern as `v_account_health` / `v_issues_with_flag_stats`. Calls `computeEngineerCards` from team-data.

### 22.6 Seeds enrichment

5 demo `tech_issues` added so each engineer card lights up:
1. `ti-team-blocked-01` — Mitanshi · blocked · "Stripe webhook signature mismatch" (demonstrates `blocked` stuck rule)
2. `ti-team-stale-01` — Adam · in_progress · updated 7d ago (demonstrates `stale_in_progress`)
3. `ti-team-neverstarted-01` — V · open · created 9d ago (demonstrates `never_started`)
4. `ti-team-done-recent-01` — Mitanshi · done · closed 2d ago (populates Throughput)
5. `ti-team-done-recent-02` — Adam · done · closed 4d ago (populates Throughput)

### 22.7 Files

**New**
- `command-center/src/pages/product/ProductTeam.tsx`
- `command-center/src/components/EngineerCard.tsx`
- `command-center/src/components/EngineerQueueDrawer.tsx`
- `command-center/src/lib/team-data.ts`

**Modified**
- `command-center/src/shell/Sidebar.tsx` — add `{ id: "team", label: "Team" }` between Real Estate Model and Issues
- `command-center/src/App.tsx` — `route.section === "team"` → `<ProductTeamPage />`
- `command-center/src/lib/mockSupabase.ts` — `computeTeamWorkload` + register `v_team_workload`
- `command-center/src/lib/seeds.ts` — 5 demo tech_issues (see §22.6)

### 22.8 Verification
1. As Sanya, open `/#product/team`. Sidebar shows **Team** between Real Estate Model and Issues; it is active.
2. KPI strip: Active engineers = 3 (Mitanshi, Adam, V); Open issues populated; Stuck items > 0 in red; Throughput last 7d ≥ 2.
3. Three engineer cards render. Each shows pills + 1–3 in-progress items. Mitanshi shows a red Stuck row ("Blocked"). Adam shows red Stuck ("No activity 5+ days"). V shows red Stuck ("Assigned 7+ days, never started").
4. Team-wide stuck list aggregates ≥ 3 rows sorted oldest first.
5. Click an Engineer Card → drawer opens. Lists grouped by status. "Open →" navigates to /#product/issues.
6. Workload balance: stacked bars per engineer. Throughput chart: 3 lines, 12 weeks.
7. `tsc --noEmit` exit 0.
8. Hover any KPI tile → insight popover.

### 22.9 Out of scope (v1)
- Per-customer build ownership (a real engineer ↔ stage_run join). Follow-up if/when needed.
- Editing engineer profile / vacation / working-hours.
- Auto-Slack nudges when an item crosses the stuck threshold (notification layer exists; ticket on its own).
- Reassigning from inside the drawer (Issues page already supports this).

---

## 23. Round-7 — Project task tracking via tech_issues

### 23.1 Context
Initially, §22 Team Management planned to integrate Monday.com board data. After your tech team confirmed they're building in-house project management, we pivoted to use the existing **`tech_issues`** table instead. This is now the single source of truth for project tasks across Product and Tech views.

### 23.2 Changes to §22

The **Projects & tasks** section (collapsible) in `/#product/team` now displays `tech_issues` with:
- **Filters**: Project (company_id) · Assignee · Status · Priority
- **Progress counts**: Open · In progress · Blocked · Done (displayed in the collapsed header)
- **Task table**: Name · Assignee · Status (color pill) · Priority (color pill) · Age (days)
- **No Monday.com dependency** — pure in-house data.

### 23.3 Tech view — Project Management page

`/#factory/project-management` now shows:
- **5 KPI tiles**: Total tasks · Open · In progress · Blocked (red) · Done
- **ProjectTaskSection component** (full list, expanded) — same filters and table as Product view

### 23.4 Files changed

**New**
- `command-center/src/components/ProjectTaskSection.tsx` — filterable task table component

**Modified**
- `command-center/src/pages/product/ProductTeam.tsx` — swapped `MondayBoardSection` for `ProjectTaskSection`
- `command-center/src/pages/factory/ProjectManagement.tsx` — rewrote to use `tech_issues` instead of Monday API
- `command-center/src/pages/product/ProductHome.tsx` — removed `MondayBoardSummaryWidget`

**Removed**
- Monday.com integration files (no longer needed):
  - `command-center/src/lib/mondayClient.ts`
  - `command-center/src/lib/monday-data.ts`
  - `command-center/src/components/MondayBoardSection.tsx`
  - `command-center/src/components/MondayBoardSummaryWidget.tsx`

### 23.5 Data schema (no changes)

Still uses `tech_issues` table:
- Columns: `id`, `company_id`, `raised_by`, `assignee_id`, `title`, `description`, `severity`, **`priority`** (normal|high|urgent), **`status`** (open|in_progress|blocked|done|wontfix), `created_at`, `updated_at`, `closed_at`
- No new tables or columns required.

### 23.6 Verification
1. Open `/#product/team` → "Projects & tasks" section appears (collapsed); click to expand.
2. Expand section → 4 filter dropdowns (Project, Assignee, Status, Priority) + task table.
3. Filter by status='blocked' → see only blocked tasks; table updates instantly.
4. Open `/#factory/project-management` → 5 KPI tiles + full task list (expanded by default).
5. `tsc --noEmit` exit 0.

### 23.7 Out of scope (v1)
- Two-way sync between `tech_issues` and your tech team's PM tool (sync layer separate ticket).
- Real-time updates (page load + manual refresh sufficient for now).
- Task editing from inside these views (assignment already works via ProductIssues page).

---

## Appendix A — Catalog of new AI agents

This is what's introduced in this PRD relative to the pre-existing AI Factory pipeline (Planner, Backend-dev, Frontend-dev, VPS-dev, Code-critic, Visual-a11y). Each new agent has its own daemon row in `agent_pods` and a registry row in `agent_registry`.

### A.1 Synopsis Agent (§6.4)
- **Purpose**: Turn the customer's onboarding canvas into a 1-page markdown summary that the proposal then quotes from.
- **Trigger**: `onboarding_canvas_states.status = 'complete'`.
- **Inputs**: `onboarding_canvas_states.canvas` JSON (before/after, modules, opportunities) + `companies.name`, `companies.niche`.
- **Outputs**: `proposal_artifacts` row with `kind='synopsis'`; `notifications` row of kind `map-ready` to the product_manager.
- **Edge function**: `supabase/functions/agents-synopsis-run/index.ts`.

### A.2 Pricing Agent (§6.1)
- **Purpose**: Author the financial section of the proposal — pricing tier, projected ROI, payback.
- **Trigger**: Sanya clicks "Generate proposal" OR proposal_council finishes.
- **Inputs**: `companies` (niche, size, region), `niche_templates.template`, `cleo_packages` price book.
- **Outputs**: `proposal_artifacts` row with `kind='financial'`.
- **Edge function**: `supabase/functions/agents-pricing-run/index.ts`.

### A.3 Contract Agent (§6.2)
- **Purpose**: Draft a SaaS contract for the customer, scoped to their niche and proposal.
- **Trigger**: Sanya clicks "Generate contract" or proposal acceptance.
- **Inputs**: `proposal_artifacts`, `niche_templates`, `companies` legal info.
- **Outputs**: `contract_drafts` row (existing table, repurposed). Capabilities: create / edit / review (red-flag clauses) / version.
- **Edge function**: `supabase/functions/agents-contract-run/index.ts`.
- **Reuses**: existing `ContractEditor.tsx` for the editing UI.

### A.4 QC Agent (§6.3)
- **Purpose**: When a tenant deploys, generate a tailored client-experience audit checklist for Sanya (not tech smoke tests).
- **Trigger**: project_lifecycle stage advances to `deployed`.
- **Inputs**: `companies.niche`, `niche_templates.completeness_checklist`, deployed feature list, last `e2e_audit_runs`.
- **Outputs**: `audit_checklists` row (new table); marks any prior checklist for that company `is_current=false`.
- **Edge function**: `supabase/functions/agents-qc-run/index.ts`.
- **Default items** (§17.3): "Sign up as a brand-new customer end-to-end. Does it feel obvious?", "Try to break it: empty inputs, weird characters", "Final gut check: would you recommend this to a friend?".

### A.5 Triage Agent (§17.4) — NEW in v3 feedback round
- **Purpose**: Group incoming customer flags onto the underlying engineering issues they represent. Without this, 10 customers reporting "site is slow on mobile" look like 10 unrelated complaints. After triage, they roll up to 1 issue with 10 flags — sortable to the top by priority.
- **Trigger**: HTTP POST `{ flag_id }` on `customer_flags` insert (DB hook in production).
- **Inputs**: the new flag's `title`/`body` + recent open `tech_issues`.
- **Outputs**: UPDATE `customer_flags.linked_issue_id` to point at an existing issue, OR INSERT a new `tech_issues` row + link.
- **Edge function**: `supabase/functions/agents-triage-flag-run/index.ts`.
- **Mock implementation**: substring-similarity matcher (no LLM) in `lib/mockSupabase.ts` for local dev.

### A.6 Schedule-Call Agent (§18.4) — NEW in v4 feedback round
- **Purpose**: When the customer picks one of Sanya's offered slots, create a real Google Calendar event with a Meet link and confirm both parties.
- **Trigger**: customer hits the `/pick/<token>` page and selects a slot (or for v1 mock: the "Simulate client picks slot 1" button).
- **Inputs**: `call_slot_offers` row (new table) + the chosen slot index.
- **Outputs**: `scheduled_calls` row (new table) with the Meet URL; two `outbound_emails` rows (`schedule_call_confirm` to customer + to Sanya).
- **Edge function**: `supabase/functions/agents-schedule-call-confirm/index.ts` (plus the existing `agents-schedule-call` for offer-time work).

### A.7 Emails Façade (§8.1, not strictly an agent but the email outbound)
- **Purpose**: Drain `outbound_emails` (status=`queued`), pick provider (Resend default), send, mark sent or failed.
- **Edge function**: `supabase/functions/emails-send/index.ts`.
- **Templates supported**: `schedule_call_offer`, `schedule_call_confirm`, `proposal_send`, `contract_send`, `credentials_send`, `audit_invite`.

---

## Appendix B — Catalog of new tables / views / columns

Everything introduced in this PRD. All migration SQL collected in `migrations/002_product_view.sql` (and the additions tracked under each feedback section).

### B.1 New tables

| Table | Purpose | Section |
|---|---|---|
| `customer_flags` | Customer-raised complaints. Many per customer. Triage Agent links each to a `tech_issues` row. | §7.1 + §17.4 columns |
| `tech_issues` | Sanya-curated engineering tickets. Many flags can map to one issue. Mirrors to `tenant_alerts` on insert (trigger). | §7.1 |
| `sanya_audit_decisions` | Append-only log of approve / bugs / disapprove verdicts. References related `tech_issues` ids when decision='bugs'. | §7.1 |
| `audit_checklists` | Per-account, regenerated on each redeploy. `items jsonb` carries 8–10 client-experience checks. | §7.1 |
| `outbound_emails` | Queue + log of every customer-facing email. Filled by app, drained by `emails-send` edge function. | §8.1 |
| `call_slot_offers` | Sanya's offered slots for a customer call. `picker_token` enables the public picker URL. | §18.4 |
| `scheduled_calls` | Confirmed customer calls, with Meet URL. Feeds the Calendar widget on overview. | §18.4 |

### B.2 New columns on existing tables

| Table.column | Type | Purpose |
|---|---|---|
| `customer_flags.linked_issue_id` | uuid → tech_issues | Set by Triage Agent. Drives the flag↔issue rollup. |
| `customer_flags.triaged_at` | timestamptz | When the agent processed this flag. |
| `customer_flags.triaged_by` | text | 'triage_agent:v1' or 'manual:<user_id>'. |
| `tenant_health_snapshots.override_status` | text | Manual R/Y/G override; supersedes auto-computed. |
| `tenant_health_snapshots.override_by` | uuid → ops_users | Who set the override. |
| `tenant_health_snapshots.override_expires_at` | timestamptz | When the override stops being honored. |
| `ops_users.role` (CHECK extended) | text | Adds `product_manager`, `tech`, `cto`, `ceo` to the allowed values. |

### B.3 New views

| View | Definition (summary) | Used by |
|---|---|---|
| `v_account_health` | Per-company red/yellow/green, computed from `tenant_alerts`, `customer_flags`, last-e2e age, runtime heartbeat. Respects active `tenant_health_snapshots.override_status`. | AtRiskList, KPI tile, variation cards |
| `v_financial_summary` | Per-niche rollup: live_count / in_flight_count / churned_count / mrr_usd / avg_acv_usd. | ProductHome KPI math + per-line cards |
| `v_issues_with_flag_stats` | `tech_issues` augmented with `flag_count` (open flags linked to this issue), `customer_count` (distinct companies among those flags), `priority_score = flag_count + 2*customer_count`. | Issues table sort + Top flagged widget |

### B.4 niche_templates

| Action | Description |
|---|---|
| Rename | `residential-pool-service` → `cleo-for-pools`. |
| Insert | `gameday-model` (empty template; sample data). |
| Insert | `real-estate-model` (empty template; sample data). |

### B.5 New notification kinds (existing `notifications.kind` enum extension)

| Kind | Recipient | Trigger |
|---|---|---|
| `map-ready` | product_manager | Synopsis Agent finishes |
| `integrations-ready` | product_manager | tenant_runtimes hits 'integrations' |
| `audit-bugs-high-priority` | tech roles + cto | Sanya decision=bugs |
| `audit-disapproved` | cto, ceo | Sanya decision=disapprove |

---

## Appendix C — Catalog of new UI components

All new files under `command-center/src/`. Filenames in the table; module purpose in the body.

### C.1 Pages (under `pages/product/`)

| File | What you see |
|---|---|
| `ProductHome.tsx` | Overview: 4 KPI tiles (with hover insights) · PM widgets (audit queue / top flagged / avg time to live) · 3 product line cards (with sparkline + trend chip + hover insight) · charts row (AtRiskList / PhaseFunnel / MRR by line) · Calendar widget. |
| `ProductVariation.tsx` | Per-line page: Phase funnel (with per-phase tooltip descriptions) · AtRiskList scoped to this niche · 4 phase tables grouped by `phase1` / `phase2` / `phase3` / `live`. Action buttons gated per stage. Live row uses clickable counts not buttons. |
| `ProductCustomerDetail.tsx` | Per-customer: 11-stage stepper · 3 phase panels with gated actions (Map, Synopsis, Proposal, Schedule call, Contract, Production link, Integrations, Credentials, QC sign-off chip) · audit checklist + Approve/Bugs/Disapprove decisions · activity timeline sidebar · quick actions panel. |
| `ProductIssues.tsx` | Issues table sorted by `priority_score` desc. Columns: Issue · Flags · Customers · Priority · Severity · Status · Assignee (role-prefixed). Click row → modal listing linked flags from real customers. |
| `ProductFlags.tsx` | Per-line flags view. Severity donut + 14-day reported sparkline. Linked-issue column per flag. |
| `ProductSettings.tsx` | CTO-only role assignment UI. Lists every ops_users row, dropdown to change role. |

### C.2 Shared widgets (under `components/`)

| File | Used by | Purpose |
|---|---|---|
| `KpiTile.tsx` | ProductHome | Hover tooltip with one insight. |
| `ChartCard.tsx` | Every chart/widget | "?" info button → "What this is / What to do" popover. |
| `AtRiskList.tsx` | ProductHome + ProductVariation | Lists yellow/red customers with reasons. Replaces the donut. |
| `CalendarWidget.tsx` | ProductHome | Next-7-days customer calls list. |
| `Modal.tsx` | All popups | Generic overlay with Esc + click-outside + "Open full page ↗". |
| `product-popups.tsx` | ProductVariation + Detail | MapPopup, SynopsisPopup, ProposalPopup wrappers. |
| `ProposalDeck.tsx` | ProposalPopup | 8-slide deck (Cover · Challenge · What we build · Customer experience · Pricing · Timeline · Why now · Next step). |
| `schedule-call-popup.tsx` | ProductVariation + Detail | Multi-slot offer flow. |

### C.3 Chart components (under `components/charts/`)

| File | Where |
|---|---|
| `StatusDonut.tsx` | Issue severity donut. |
| `PhaseFunnel.tsx` | ProductHome + ProductVariation (with custom per-phase tooltip). |
| `MrrByNicheBar.tsx` | ProductHome. |
| `Sparkline.tsx` | ProductHome variation cards + ProductFlags. |
| `StageStepper.tsx` | ProductCustomerDetail. |
| `ActivityTimeline.tsx` | ProductCustomerDetail. |
| `LoadingSkeleton.tsx` | Anywhere data is fetching. |

### C.4 Libraries (under `lib/`)

| File | Purpose |
|---|---|
| `stage-labels.ts` | Maps the existing 12 stage slugs → 3 PRD phase labels. |
| `stage-actions.ts` | Per-stage status label + which action buttons are enabled + prereq tooltip text. Single source of truth. |
| `health-score.ts` | TS wrapper around the `v_account_health` view + manual override helpers. |
| `insights.ts` | Computes the 4 KPI tile insights and per-line growth insight from current data. |
| `seeds.ts` | Local-only fixtures: 19 fake companies across the 3 lines + journey events + flags + issues + decisions + checklists + scheduled calls. |
| `mockSupabase.ts` | The fake Supabase client. Singleton from `factorySupabase.ts`. Backed by `localStorage`. |
| `factorySupabase.ts` | Env-gated dispatch between mock and real client. Exports `isMockBackend()` + `resetMockDB()`. |
| `ui-styles.ts` | Shared `selectStyle` / `inputStyle` so native form controls render readably in the dark shell. |

---

## 12. Open questions to resolve before / during build

- **Email provider** — Resend default unless Sanya/V picks otherwise.
- **Financial source-of-truth** — does CLEO's `cleo_packages.monthly_usd` already capture all variations' pricing, or do we need a separate price book per niche?
- **Customer complaint intake** — how do complaints reach `customer_flags`? From the existing `tenant_alerts`? From inbound emails? Manual entry by Sanya? Phase 2 question; v1 supports manual + tenant_alert mirror.
- **Slack mentions** — assumes `ops_users.slack_user_id` is populated for Mitanshi/Adam/V/Ouadie. Will need a one-time setup step.
- **Real Estate / Gameday templates** — `niche_templates.template` is empty for the new niches. Until populated, those product cards show "coming soon" instead of customer rows.
- **Schedule-call mechanism** — pure email-link to a Calendly/Cal.com URL stored on `ops_users` row, vs. an embedded scheduler? PRD assumes link-out for v1.
- **Audit-by-Sanya stage** — currently invented as a synthetic stage `sanya-audit`. Need to confirm no existing stage covers this; if `awaiting-approval` already does, reuse instead of adding.
