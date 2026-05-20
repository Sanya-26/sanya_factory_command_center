# PRD: CEO View (Ouadie) in command-center

## Context
AUBOS has three role-specific views in command-center: Product (Sanya), Tech (Mitanshi/Adam/V), and now **CEO** (Ouadie). Ouadie's day-to-day job is **revenue, runway, contracts, and strategic line-investment decisions** — not tickets or audits. He needs a view that answers one question — *Are we winning?* — and a tight decision queue for the things only he can resolve.

This is a sibling deliverable to the Product PRD (`docs/PRD-product-view.md`). It reuses the role-based shell, the `getFactorySupabase()` mock backend, recharts charting, and the proposal-deck slide pattern. It introduces a new department (`ceo`), new pages under `/#ceo/*`, and extends `contract_drafts` with discount + CEO sign-off fields.

**Ouadie does NOT see the Tech view at all.** The CEO sidebar replaces the Cleo/AI-Factory sidebar entirely when `role='ceo'`, the same way the Product sidebar replaces it when `role='product_manager'`.

## 1. Persona & role
| Role slug | Person | View | Core responsibilities |
|---|---|---|---|
| `ceo` | Ouadie | **CEO view** (this PRD) | Approve every customer discount. Sign every customer contract as final signatory. Watch revenue, growth, runway. Decide where to invest. Communicate progress to the board. |

The 3 other roles (product_manager, tech, cto) are scoped in the Product PRD.

## 2. Business rules Ouadie owns
1. **Every customer contract requires CEO signature.** Whatever Sanya / legal review puts in front of him is the final stop before "signed".
2. **Every discount requires CEO approval.** If the proposed `monthly_usd` is below the niche's list price (i.e. `discount_pct > 0`), it cannot be sent to the customer until Ouadie approves. No discount → no CEO approval gate.
3. **Live-customer churn risks escalate to the CEO when red > 7 days.** Triage is Sanya's; rescue strategy is the CEO's.
4. **Strategic per-line decisions** (invest / hold / sunset) are the CEO's call.
5. **Board / investor updates** flow from this view.

## 3. Information architecture
```
/#ceo
├── /home                       Main dashboard (north-star + KPIs + Decision Queue + Wins + Strategic + Cash)
├── /contracts                  Full contracts table (sortable, filterable; signature actions)
├── /discounts                  Discount approval queue + history
├── /wins                       Wins feed (last 30/60/90d) + investor-email generator
├── /strategic                  Expanded per-line strategic comparison (charts + recommendations)
├── /cash                       Burn breakdown + runway calculator (MOCK)
└── /board                      Board snapshot — 8-slide deck, exportable to PDF
```

Sidebar (when `role='ceo'`): brand "AUBOS · Executive" + sections matching the routes above + a footer with mock-mode pill + sign-out (same chrome as the Product sidebar).

## 4. Pages

### 4.1 CEO Home (`/#ceo/home`) — the 5-second / 30-second / 2-minute layered read

**4.1.1 North-star (top of page, single sentence)**
Computed from `v_financial_summary` + `ceo_kpi_inputs`:
> *"On track for $25k MRR by EOQ · 2d behind plan · 1 deal closes this week."*

Layout: a single tall card spanning the page width with a R/Y/G indicator on the left and the sentence on the right. The same card surfaces the next milestone in tiny text below.

**4.1.2 KPI tile strip (6 tiles)**
Each tile follows the §19 `KpiTile` pattern (hover → insight popover). Tiles flagged with the new `<MockBadge>` chip where the underlying data is placeholder.

| Tile | Source | Notes |
|---|---|---|
| MRR | `contract_drafts` sum where `status in ('signed','sent','approved')` | Real. |
| MoM growth % | (this month MRR – last month MRR) / last month MRR | Real once we have 2 months of data; MOCK badge until then. |
| Live customers | `project_lifecycle_stage_runs` count where `stage_slug='live'` | Real. |
| Net new (MTD) | `client_journey_events` where `event_kind='onboarding_complete'` and `at >= start_of_month()` | Real. |
| Cash runway | `ceo_kpi_inputs.cash_balance_usd / monthly_burn_usd` | **MOCK** badge. |
| Burn / mo | `ceo_kpi_inputs.monthly_burn_usd` | **MOCK** badge. |

**4.1.3 Decision Queue (the most important panel)**
Three sub-sections, each with its own header and count. Items only the CEO can resolve.

**A. Contracts awaiting my signature**
Source: `v_ceo_contracts_pending` where `queue_bucket='awaiting_ceo_signature'`.
Columns: Customer · List → Final · Discount % · Sent by · Sent at.
Row action: a primary **"Sign →"** button that opens a confirmation modal.
- On confirm: UPDATE `contract_drafts` SET `ceo_signed_at=now(), ceo_signed_by=<user>, status='signed'`.
- Side effects: notify Sanya (`kind='contract-signed'`); the row moves to the Wins feed.

**B. Discount approvals pending**
Source: `v_ceo_contracts_pending` where `queue_bucket='awaiting_discount_approval'`.
Columns: Customer · List · Proposed · Discount % · Justification · Submitted by.
Row actions: **Approve** (primary, blue), **Reject** (red), **Defer** (ghost).
- Approve: `ceo_approval_status='approved', ceo_approval_at=now(), ceo_approval_by=<user>`. Row moves to "Awaiting my signature" bucket.
- Reject: `ceo_approval_status='rejected', ceo_approval_notes=<reason>`. Sanya notified via `kind='discount-rejected'`.
- Defer: leaves untouched; closes the row for this session only.

**C. Churn-risk escalations (live + red > 7d)**
Source: `v_account_health` where `status='red'` AND tenant is live AND time-in-red > 7 days.
Columns: Customer · Days red · Reason summary · MRR at risk.
Row action: **Open account →** navigates to `/#product/<niche>/customer/<id>` (yes, the Product detail page — CEO doesn't have his own customer-detail page; he reads Sanya's).

**4.1.4 Wins feed (last 30 days)**
Source: `contract_drafts` where `ceo_signed_at >= now() - interval '30 days'`.
Each row: Customer · Monthly · Niche · Signed date · Logo (placeholder circle initial).
Footer: **"Copy as bullet list for board email"** button → assembles markdown bullets and copies to clipboard.

**4.1.5 Per-line strategic comparison (3 cards side by side)**
For each `niche_template`:
- Header: line name + niche slug
- MRR (real)
- 30-day growth % (computed from sparkline of new signups)
- Live count · in-flight count
- **MOCK badge**: burn allocation $/mo (from `ceo_kpi_inputs.line_allocations` jsonb or hardcoded)
- **MOCK badge**: unit economics — CAC, LTV, Payback
- **Recommendation chip** (computed): `Invest` / `Hold` / `Reassess`
  - `Invest` when growth > 30% AND mrr > burn_allocation
  - `Reassess` when growth < 0% OR mrr < 0.5 × burn_allocation
  - `Hold` otherwise

**4.1.6 People & cash sidebar (right rail)**
A vertical card with `<MockBadge>` at the top. Pulls from `ceo_kpi_inputs`:
- Headcount: 11
- Payroll/mo: $48k
- Other burn: $10k
- Cash balance: $812k
- Runway: 14mo
- Open requisitions: 2
- "Edit inputs →" link → `/#ceo/cash`

### 4.2 `/#ceo/contracts` — Contracts view
Single table of every row in `contract_drafts`. Filters: status (draft / approved / sent / signed / archived), niche, search by customer name.
Status column uses the same selectStyle as the Product Issues page. Each row exposes the contextual action: Sign (when awaiting) or "View signed" (when done).

### 4.3 `/#ceo/discounts` — Discount approval queue
Top: stats strip (pending count · approved 30d · rejected 30d · avg discount %).
Body: full table of every contract with `discount_pct > 0`, including history. Drill-in panel shows the discount justification + the approval audit trail (`ceo_approval_status`, `ceo_approval_by`, `ceo_approval_at`, `ceo_approval_notes`).

### 4.4 `/#ceo/wins` — Wins feed
Default range: last 30 days. Toggle for 60 / 90 / YTD.
Sort: by ceo_signed_at desc. Columns: Customer · Monthly · Niche · Stage (live / building / audit) · Signed.
Top-right CTA: **"Generate investor update"** → drafts a paragraph in a modal that Ouadie can copy/paste. Text is templated locally — no real send.

### 4.5 `/#ceo/strategic` — Strategic line comparison (deep dive)
Same three lines as the Home strategic card, but expanded:
- MRR trend line chart (12 months) for each line
- New-signup chart (sparkline writ large)
- Cost-to-build chart (mock; per-line allocation)
- Recommendation card with rationale prose

### 4.6 `/#ceo/cash` — Cash & burn calculator
Editable mock inputs (headcount, payroll/mo, other burn, cash balance, MRR target). On change, recomputes runway in real time. Persists to `ceo_kpi_inputs` (mock = localStorage).

### 4.7 `/#ceo/board` — Board snapshot deck
Opens the same `<BoardSnapshotDeck>` modal accessible from the Home page header. The full route enables full-page mode for presenting / printing.

## 5. Board Snapshot — slide deck
Clone of `ProposalDeck.tsx` pattern. 8 slides:

| # | Slide | Body content |
|---|---|---|
| 1 | Cover | "AUBOS · Board Snapshot · {Month Year} · Prepared by Ouadie" + AUBOS mark. |
| 2 | Headline numbers | 4 huge tiles: MRR, MoM growth %, Live customers, Runway months. No chartjunk. |
| 3 | Customers won (this month) | List of `ceo_signed_at` rows from this month with MRR each. |
| 4 | Customers at risk | Red-status accounts with reason. |
| 5 | Per-line scorecard | 3-column comparison (MRR / growth / live / recommendation). |
| 6 | Cash & burn | Headcount, payroll, total burn, runway, planned hires. |
| 7 | Strategic asks | Bullet list of CEO asks of the board (editable text area). |
| 8 | Next 30 days | Top 3 commitments (editable text area). |

Export: reuses the existing `command-center/scripts/render-prd-html.cjs` pipeline. Output: `C:\Users\sanya\Desktop\board-snapshot-{YYYY-MM}.pdf`.

## 6. Data model

### 6.1 `contract_drafts` — new fields
```sql
alter table public.contract_drafts
  add column if not exists list_monthly_usd numeric,                                   -- the niche's list price at quote time
  add column if not exists discount_pct numeric default 0,                              -- 0 if no discount; > 0 triggers ceo approval gate
  add column if not exists discount_justification text,
  add column if not exists ceo_approval_status text default 'not_required'
    check (ceo_approval_status in ('not_required','pending','approved','rejected')),
  add column if not exists ceo_approval_by uuid references public.ops_users(user_id),
  add column if not exists ceo_approval_at timestamptz,
  add column if not exists ceo_approval_notes text,
  add column if not exists ceo_signed_at timestamptz,
  add column if not exists ceo_signed_by uuid references public.ops_users(user_id);
```
Trigger logic: when a discounted `contract_drafts` row is inserted/updated with `discount_pct > 0` and `ceo_approval_status='not_required'`, flip it to `'pending'` automatically. In mock mode this is enforced in `mockSupabase.ts`.

### 6.2 `ceo_kpi_inputs` — new table
```sql
create table if not exists public.ceo_kpi_inputs (
  id uuid primary key default gen_random_uuid(),
  month date not null unique,                          -- 'YYYY-MM-01'
  monthly_burn_usd numeric not null,
  payroll_usd numeric not null,
  headcount int not null,
  cash_balance_usd numeric not null,
  mrr_target_usd numeric not null,
  line_allocations jsonb not null default '{}',         -- {"cleo-for-pools": 22000, ...}
  open_requisitions jsonb not null default '[]',        -- [{"title": "Sr. AI engineer", "manager": "V"}]
  updated_at timestamptz default now()
);
```

### 6.3 `v_ceo_contracts_pending` — new view
```sql
create or replace view public.v_ceo_contracts_pending as
select
  cd.id, cd.company_id, c.name as company_name, c.niche,
  cd.monthly_usd, cd.list_monthly_usd, cd.discount_pct, cd.discount_justification,
  cd.status, cd.ceo_approval_status, cd.ceo_approval_by, cd.ceo_approval_at,
  cd.ceo_signed_at, cd.sent_at,
  case
    when cd.discount_pct > 0 and cd.ceo_approval_status = 'pending' then 'awaiting_discount_approval'
    when cd.status in ('approved','sent') and cd.ceo_signed_at is null then 'awaiting_ceo_signature'
    when cd.ceo_signed_at is not null then 'signed'
    else 'idle'
  end as queue_bucket
from public.contract_drafts cd
join public.companies c on c.id = cd.company_id;
```

### 6.4 New notification kinds
| Kind | Recipient | Trigger |
|---|---|---|
| `contract-signed` | Sanya (product_manager) | CEO clicks Sign |
| `discount-rejected` | Sanya | CEO rejects a discount |
| `discount-approved` | Sanya | CEO approves a discount (so she can send the contract) |
| `churn-risk-escalation` | CEO | nightly check finds a live account red > 7d |

## 7. Files to create / modify

### 7.1 New pages (under `command-center/src/pages/ceo/`)
- `CeoHome.tsx` — composition of all the home sections
- `CeoContracts.tsx` — full contracts table
- `CeoDiscounts.tsx` — discount queue + history
- `CeoWins.tsx` — wins feed + investor email generator
- `CeoStrategic.tsx` — expanded per-line comparison
- `CeoCash.tsx` — editable burn / runway calculator
- `CeoBoardSnapshot.tsx` — full-page board snapshot

### 7.2 New components (under `command-center/src/components/`)
- `MockBadge.tsx` — small yellow "MOCK" chip (reusable)
- `CeoDecisionQueue.tsx` — the 3-section queue on CeoHome
- `StrategicLineCard.tsx` — single per-line card (compact + expanded variants)
- `WinsFeed.tsx` — wins list + "copy to board email" CTA
- `BoardSnapshotDeck.tsx` — 8-slide deck (sibling to ProposalDeck)

### 7.3 New libs (under `command-center/src/lib/`)
- `ceo-data.ts` — pure functions: `computeNorthStar()`, `computeKpiInsights()`, `computeQueueRows()`, `computeStrategicCards()`.
- `ceo-mock-financials.ts` — default `ceo_kpi_inputs` content for seeds.

### 7.4 Modified files
- `command-center/src/shell/route.ts` — add `'ceo'` to `Department` union and adjust `DEFAULT_ROUTE_*` helpers.
- `command-center/src/shell/Sidebar.tsx` — render the CEO sidebar set when `role='ceo'` (mirrors the `product_manager` branch). Tech departments are NOT visible to CEO.
- `command-center/src/App.tsx` — `PageRouter` dispatches `#ceo/*` segments to the CEO pages.
- `command-center/src/lib/seeds.ts` — add discount + ceo_approval_status to 2 existing contract_drafts rows; add 2 "signed" contract_drafts rows for the Wins feed; add a ceo_kpi_inputs row for the current month.
- `command-center/src/lib/mockSupabase.ts` — recognize `ceo_kpi_inputs` as a table (auto-created on insert is fine) and compute `v_ceo_contracts_pending` via a reducer. Add the discount-→-pending automation in `insert/update` on contract_drafts.

## 8. Verification

1. **Role swap**: promote Sanya's mock user to `role='ceo'` (or add a dev toggle). Reload command-center → CEO sidebar appears; Cleo/Factory sidebars are gone.
2. **Home renders**: north-star sentence reads from current MRR + target. 6 KPI tiles populate; runway/burn carry MOCK chips.
3. **Decision Queue**:
   - "Contracts awaiting my signature" lists at least 1 seeded contract.
   - "Discount approvals pending" lists at least 1 seeded contract with `discount_pct > 0`.
   - "Churn-risk escalations" lists any red-> 7d accounts.
4. **Approve a discount** → it disappears from the discount queue and appears in the signature queue. Sanya receives a `discount-approved` notification.
5. **Reject a discount** → it disappears with notes recorded. Sanya receives `discount-rejected`.
6. **Sign a contract** → `ceo_signed_at` set; row moves to the Wins feed within the same session.
7. **Strategic cards**: each of the 3 lines shows a recommendation chip with a sensible value given the seeded data.
8. **Board snapshot**: clicking the header button opens the 8-slide deck modal. "Export PDF" produces `board-snapshot-{YYYY-MM}.pdf` on the Desktop using the existing render pipeline.

## 9. Out of scope (v1)
- Real Brex / QuickBooks / Stripe ingest for burn / cash / MRR. We use `ceo_kpi_inputs` editable in `/#ceo/cash`.
- Real e-signature provider (DocuSign etc.) for the "Sign" button. v1 just flips `ceo_signed_at` and notifies — the contract pdf+signature panel is a follow-up.
- NPS / CSAT pipeline. Placeholder card only.
- Investor email *send*. v1 generates draft text in the app; sending uses existing `outbound_emails` once a provider is wired.
- Hiring requisitions table. v1 surfaces them inline in `ceo_kpi_inputs.open_requisitions` as a static list, with a future ticket to make them their own first-class entities.
- Per-customer churn-rescue workflow. CEO clicks "Open account" → lands on the Product customer detail page (Sanya's page), reuses its action panel.
