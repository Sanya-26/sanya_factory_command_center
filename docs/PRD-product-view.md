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

## 12. Open questions to resolve before / during build

- **Email provider** — Resend default unless Sanya/V picks otherwise.
- **Financial source-of-truth** — does CLEO's `cleo_packages.monthly_usd` already capture all variations' pricing, or do we need a separate price book per niche?
- **Customer complaint intake** — how do complaints reach `customer_flags`? From the existing `tenant_alerts`? From inbound emails? Manual entry by Sanya? Phase 2 question; v1 supports manual + tenant_alert mirror.
- **Slack mentions** — assumes `ops_users.slack_user_id` is populated for Mitanshi/Adam/V/Ouadie. Will need a one-time setup step.
- **Real Estate / Gameday templates** — `niche_templates.template` is empty for the new niches. Until populated, those product cards show "coming soon" instead of customer rows.
- **Schedule-call mechanism** — pure email-link to a Calendly/Cal.com URL stored on `ops_users` row, vs. an embedded scheduler? PRD assumes link-out for v1.
- **Audit-by-Sanya stage** — currently invented as a synthetic stage `sanya-audit`. Need to confirm no existing stage covers this; if `awaiting-approval` already does, reuse instead of adding.
