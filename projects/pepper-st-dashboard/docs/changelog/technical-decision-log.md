# Technical Decision Log

- **Project:** pepper-st-dashboard
- **Purpose:** running, phase/version-wise log of technical decisions. Newest
  first. Each entry links to the authoritative ADR/workflow.
- **Last updated:** 2026-06-15

> Living document. **No feature is complete unless this log (and the relevant
> ADR/workflow/handoff) is updated.**

---

## 2026-06-15 — Slice 5: Chat Monitor (live, read-only, masked)

### TD-053 — Chat Monitor presenter + server data service (Slice 5)
Pure `lib/chat-monitor/presenter.ts` shapes the UI payload: `maskContactId` on every contact,
`last_at`-desc ordering, retention windowing (`isWithinRetention`; **NULL = unlimited**;
out-of-window excluded + counted), and transcript view-state (`ok|empty|restricted`). Server
`lib/chat-monitor/service.ts` resolves PEPPER ST. (Slice 3 resolver) + `whatsapp-main`, reads
dashboard mappings + `ai.agno_sessions` **read-only**, parses transcripts in memory (Slice 4
parser, retention applied), and returns a fully-masked, serializable payload (no raw
contact/session id, no DB handle). TDD: 10 presenter tests (76 total). ->
`lib/chat-monitor/{presenter,service}.ts` (+ `presenter.test.ts`).

### TD-054 — Server-first Chat Monitor page + client UI (Slice 5)
`app/(dashboard)/chat-monitor/page.tsx` is a `force-dynamic` Server Component (so `build` never
opens a DB connection) with error/empty states; client `components/chat-monitor/chat-monitor.tsx`
holds only selection + mobile-toggle state and renders the masked list + live transcript
(Customer/AI bubbles; empty/restricted states; deterministic UTC timestamps to avoid hydration
drift). Read-only `db:chat:verify` proves no raw id leaks into the payload. Verified in-browser
(13 conversations, masked, real transcript, no fabricated metrics); `ai.*` untouched; no transcript
persisted. -> `app/(dashboard)/chat-monitor/page.tsx`, `components/chat-monitor/chat-monitor.tsx`,
`scripts/chat-monitor-verify.ts`, `package.json`.

---

## 2026-06-15 — Slice 4: Agno transcript parser/service + mapping sync

### TD-051 — Read-only Agno transcript parser + shared PII masker (Slice 4)
Added pure, in-memory modules under `base-dashboard-app/lib/agno/`: `parser.ts`
(`parseTranscript` — flatten `runs[].messages[]`, exclude `system`, drop `from_history`,
dedupe by id, retention cutoff [`NULL` = unlimited], order by `created_at`, hide tool
messages + never expose raw tool args, derive message/turn counts + last activity),
`mask.ts` (country-agnostic `maskContactId` for UI **and** logs; never logs a raw phone),
and `mapping.ts` (active exactly-one channel resolution; conversation values with
`agno_session_id` as text). TDD: specs first (RED→GREEN), 21 Agno tests; 66/66 total.
-> `lib/agno/{types,parser,mask,mapping}.ts` (+ tests),
`handoff/2026-06-15-slice-4-agno-parser-mapping.md`.

### TD-052 — Idempotent Agno→dashboard mapping sync applied (Slice 4)
`lib/agno/sync.ts` reads `ai.agno_sessions` (agent `concierge`) **read-only** and upserts
ONLY `app_customers` / `app_customer_identities` / `app_conversations` (find-or-create on the
composite uniques; `first_at`/`last_at` from epoch; `status='open'`). Scripts:
`db:agno:inspect` (read-only, masked), `db:agno:sync`, `db:agno:verify` (read-only). Applied
to the real DB: **13** concierge sessions → 13 conversations/customers/identities; re-run
created **0** (idempotent). Verify ALL PASS; `ai.*` untouched; no forbidden/message tables;
no transcript persisted; ids masked in all output. -> `lib/agno/sync.ts`,
`scripts/agno-{inspect,sync,verify}.ts`, `package.json`.

---

## 2026-06-15 — Slice 3: migration applied + PEPPER ST. seeded + tenant context

### TD-048 — Server-side DB access + idempotent seed + demo tenant resolver (Slice 3)
Added `base-dashboard-app/lib/db/client.ts` (pg Pool + Drizzle from `DATABASE_URL`, masked
logging), `lib/db/seed.ts` (pure `buildSeedPayload()` + idempotent `seedPepperSt(db)` via
`onConflictDoNothing`), and `lib/tenant/context.ts` (Phase-1 demo resolver by slug
`pepper-st`; temporary stand-in for auth). Unit-tested without DB (45/45). Secrets via a
gitignored `.env`; `.env.example` added. -> `lib/{db,tenant}/*`, `scripts/{seed,verify}.ts`,
`handoff/2026-06-15-slice-3-apply-seed-tenant.md`.

### TD-049 — Gate-2 migration applied to the real DB + verified (Slice 3)
Enabled apply (env-gated `dbCredentials` in `drizzle.config.ts`; scripts `db:migrate` /
`db:seed` / `db:verify`; never `push`). Applied `0000` -> created `dashboard` + 6 `app_*`
tables; seeded PEPPER ST. tenant + `whatsapp-main`/`concierge` channel + enterprise
entitlement (retention `NULL` = unlimited). Read-only `db:verify` PASSED all checks; `ai.*`
untouched; no forbidden tables. drizzle-kit created its standard `drizzle.__drizzle_migrations`
ledger (outside `dashboard`). -> `drizzle.config.ts`, `package.json`, `migration-proposal-0000.md`.

### TD-050 — Stale "Skills parked" project docs corrected (no governance duplication)
Replaced the stale "skills empty/parked/optional" wording in `docs/agents/README.md`,
`docs/workflows/gate-0-subagent-readiness.md`, and the stage-1 handoff with a factual
pointer to **root** governance (`AGENTS.md`, `CLAUDE.md`, `docs/agents/skill-alignment.md`,
`.claude/skills/*/SKILL.md`). No skills/governance duplicated into project docs.

---

## 2026-06-15 — Slice 2: Drizzle schema + migration proposal (PROPOSED, not applied)

### TD-046 — Dashboard Drizzle schema authored to match the SQL proposal (Slice 2)
Implemented the dashboard-owned Drizzle schema (`base-dashboard-app/lib/db/schema.ts`):
the 6 `dashboard.app_*` tables exactly matching `02-schema-proposal.sql.md` — slug-unique
tenants (+ `timezone` default `Asia/Colombo`), `(tenant_id, channel_key)` channel
uniqueness, customer-identity uniqueness `(tenant_id, channel_id, external_contact_id)`,
conversation mapping with `agno_session_id` as **text and no FK into `ai.*`**, and 1:1
`app_tenant_entitlements` with **no hidden defaults** (plan_code / is_fully_enabled NOT
NULL; retention nullable; `NULL` = unlimited). TDD: schema-shape + migration specs first
(RED→GREEN), **39/39** tests, typecheck + build green (Node 20).
-> `base-dashboard-app/{lib/db/schema.ts,lib/db/schema.test.ts,lib/db/migration.test.ts}`,
`handoff/2026-06-15-slice-2-drizzle-schema.md`.

### TD-047 — Migration generated for review only; apply is Gate-2-gated (Slice 2)
Used a **generate-only** Drizzle setup: `drizzle.config.ts` has **no `dbCredentials`** and
only a `db:generate` script (no `migrate`/`push`, no DB driver), so no connection can
happen. `drizzle-kit generate` produced `drizzle/0000_perpetual_james_howlett.sql` (DDL
only — no seed). Parity reviewed vs the SQL proposal and packaged for **Gate 2** in
`docs/architecture/migration-proposal-0000.md`. Nothing applied; `ai.agno_*` untouched.
-> `base-dashboard-app/{drizzle.config.ts,drizzle/0000_*.sql,package.json}`,
`architecture/migration-proposal-0000.md`.

---

## 2026-06-15 — Slice 1: app shell + UI foundation (build started)

### TD-044 — Next.js app shell scaffolded (Slice 1; UI-only)
The Phase 1 build began with the app shell in `base-dashboard-app/`: Next.js (App Router) +
TypeScript + Tailwind + shadcn/ui (restyled). Delivered the sidebar + topbar + dashboard
frame and the three approved nav surfaces (Dashboard / Chat Monitor / Analytics);
Chat Monitor + Analytics are placeholders and Dashboard shows honest empty/placeholder
states. No DB, no Drizzle, no migrations, no seed, no Agno reads, no fabricated metrics;
`ai.agno_*` untouched. -> `base-dashboard-app/{app,components,lib}`,
`handoff/2026-06-15-slice-1-app-shell.md`, `phases/phase-1*.md`.

### TD-045 — Prototype tokens carried into Tailwind via CSS variables (resolves tech-stack Q4)
Demo tokens are defined as CSS variables in `app/globals.css` (mapped 1:1 from the
prototype) and referenced from `tailwind.config.ts` `theme.extend`; shadcn primitives are
restyled to those variables, not the default theme. Fonts (Plus Jakarta Sans + JetBrains
Mono) load via a Google Fonts `<link>`. Resolves open question #4 in `05-tech-stack.md`.
-> `base-dashboard-app/{app/globals.css,tailwind.config.ts,lib/tokens.ts}`, `05-tech-stack.md`.

---

## 2026-06-15 — Gate 0 executed: subagent readiness (PASS)

### TD-041 — Gate 0 PASS: global agents present & usable
Verified the **7 global agents** in `.claude/agents/` (`webapp-orchestrator`,
`product-discovery-agent`, `solution-architect-agent`, `prototype-agent`,
`fullstack-builder-agent`, `qa-review-agent`, `handoff-agent`) are present and
well-formed. The earlier "empty `.claude/*`" finding (TD-039) was **stale**. **No
global agents were duplicated or modified.** → `phases/phase-1-implementation-plan.md`,
`docs/agents/README.md`, `handoff/2026-06-15-stage-1-bootstrap.md`.

### TD-042 — PEPPER ST. agent coordination is project-scoped
PEPPER ST.-specific coordination lives under `projects/pepper-st-dashboard/docs/`,
**not** in global `.claude/`: `docs/agents/` (README roster + slice ownership;
`agent-boundaries.md`), `docs/workflows/` (gate-0-subagent-readiness, phase-1-slice,
schema-migration-review, qa-handoff), `docs/templates/` (slice-plan, slice-handoff,
qa-report, migration-proposal). Global `.claude/` stays generic and reusable per the
`AGENTS.md` multi-project rule. → `docs/agents/`, `docs/workflows/`, `docs/templates/`.

### TD-043 — Skills parked
Global `.claude/skills/` contains empty skill subfolders; **no project skills** are
defined for PEPPER ST. Skills are optional and **non-blocking** for Gate 0; revisit
only when a stable convention is confirmed. → `docs/agents/README.md`.

---

## 2026-06-15 — Entitlement defaults removed + Phase 1 implementation plan + subagent gate

### TD-037 — No hidden entitlement defaults (explicit insert at onboarding)
Removed column defaults on `app_tenant_entitlements`: `plan_code` and
`is_fully_enabled` are now `NOT NULL` with **no default** (must be inserted
explicitly); `raw_history_retention_days` / `analytics_retention_days` have **no
default** (omit → `NULL` → unlimited). Avoids baking in a `standard`/30-day pricing
assumption while pricing is parked; any temporary default must be documented as
temporary. → `02-schema-proposal.sql.md`, `01-data-model.md`, `04-multitenancy.md`,
ADR-0006, Workflow 01/05/06, CONTEXT, `product/02-core-flows.md`.

### TD-038 — Phase 1 implementation plan (Slices 0–7)
Added `docs/phases/phase-1-implementation-plan.md`: a **planning-only**, slice-by-slice
build plan (0 readiness · 1 shell · 2 Drizzle schema/migration proposal · 3 seed +
tenant context · 4 Agno parser · 5 Chat Monitor · 6 analytics · 7 demo hardening),
each with goal / owner / files / scope / tests / docs / gate / handoff.
→ `phases/phase-1.md`.

### TD-039 — Subagent readiness is the first pre-build gate (Gate 0)
Before any implementation, `.claude/{agents,workflows,templates,skills}` must be
populated and usable. **Finding (2026-06-15):** these dirs exist but are **empty** →
the `AGENTS.md` agents are not actually available; restoring/creating them is the
first gated step. → `phases/phase-1-implementation-plan.md` (Slice 0),
`phases/phase-1.md` (Gate 0), `AGENTS.md`. **Update (TD-041):** on execution the
global agents were in fact **present & usable**; only project-scoped coordination +
skills remained. **Gate 0 = PASS.**

### TD-040 — Analytics wording finalized (raw access vs analytics detail)
Phase 1 **raw chat access** is controlled by `raw_history_retention_days`; **analytics
detail** by `analytics_retention_days`; `NULL` = unlimited; longer analytics history
needs future rollups / a plan feature. Supersedes the earlier "analytics capped by
`raw_history_retention_days`" wording (TD-024). → `phases/roadmap.md`, ADR-0006,
Workflow 05/06.

---

## 2026-06-15 — Entitlements rename + tenant timezone (pre-Gate 2 cleanup)

### TD-031 — Rename `app_subscription_limits` → `app_tenant_entitlements`
The table represents the tenant's **current access/entitlement** configuration, **not**
a finalized pricing/billing model. Pricing is decided later by the internal team; the
future pricing model is **parked**. → `02-schema-proposal.sql.md`, `01-data-model.md`,
`04-multitenancy.md`, ADR-0002, ADR-0006, Workflow 01/05/06, CONTEXT, README.

### TD-032 — Entitlement fields + 1:1 relationship
Fields: `id`, `tenant_id`, `plan_code` (non-final label, e.g. `standard`/`enterprise`),
`is_fully_enabled`, `raw_history_retention_days`, `analytics_retention_days`,
`created_at`, `updated_at`. **One current row per tenant** (`UNIQUE (tenant_id)`,
**`app_tenants 1───1 app_tenant_entitlements`**); plan/subscription history parked.

### TD-033 — `NULL` retention = unlimited; PEPPER ST. seeded enterprise
Retention columns are **nullable**; CHECKs are `... IS NULL OR ... > 0`. Standard
tenants default to **30**; **`NULL` = unlimited** (enterprise / fully enabled). Seed:
PEPPER ST. = `plan_code='enterprise'`, `is_fully_enabled=true`,
`raw_history_retention_days=NULL`, `analytics_retention_days=NULL`.
→ `02-schema-proposal.sql.md`, ADR-0006, Workflow 01/06, PRD, phase-1.

### TD-034 — `analytics_retention_days` is a separate analytics cap
Analytics detail is capped by `analytics_retention_days` (distinct from raw-history
access); `NULL` = unlimited (no clamp). Replaces the earlier "analytics capped by
`raw_history_retention_days`". → ADR-0006, Workflow 05/06, roadmap.

### TD-035 — Tenant timezone
`app_tenants.timezone text NOT NULL DEFAULT 'Asia/Colombo'` drives the **Today / Month
/ Custom** analytics boundaries (future tenants may be in other countries). **No
locale/currency tables.** → `02-schema-proposal.sql.md`, `01-data-model.md`,
`04-multitenancy.md`, Workflow 01/05, CONTEXT, feature-scope.

### TD-036 — Conversation `status` clarification (PRD)
Do **not** state "status does not exist" generally. Correct: no **Agno-derived**
intent/summary/confidence/priority/business-status is shown; a **dashboard-owned**
conversation `status` exists internally (`open`/`resolved`/`archived`) but Phase 1
does not surface it as a meaningful AI/business signal because it defaults to `open`.
→ `04-prd-first-slice.md`.

---

## 2026-06-15 — Phase 2: live human handover + canonical transcript ownership

### TD-026 — Live WhatsApp human chat + AI→human handover is MANDATORY for Phase 2
Promoted from parked/Phase 4. When the AI **cannot complete a task** it hands over to
a human operator who can **see the conversation**, **see the handover reason**, **take
the next action**, and **reply to the customer** via the WhatsApp-connected dashboard.
→ ADR-0009, Workflow 08, `phases/roadmap.md`, `product/03-feature-scope.md`,
`product/01-users-and-roles.md`.

### TD-027 — Canonical transcript ownership = Agno/WhatsApp pipeline
Exactly **one** canonical transcript, owned **upstream**; the dashboard renders it
**live, read-only** (ADR-0004 holds). To reply, the dashboard **calls the bot/WhatsApp
send API**; the bot persists; the dashboard re-reads. Never a transcript source, never
a writer of `ai.*`. → ADR-0009, ADR-0004.

### TD-028 — Dashboard stores handover/control/send-status METADATA ONLY
Allowed: handover events (reason/direction/actor/time), conversation control/ownership
state, outbound **send status** (keyed by **upstream message id**). **Not** allowed:
message bodies. Human-vs-AI attribution is derived by **correlation**, not duplication.
→ ADR-0009.

### TD-029 — No message duplication without a dedicated ADR
Storing message text (incl. outbound human replies) in `dashboard.*` is **forbidden**
until a separate explicit ADR approves it; the only anticipated trigger is the pipeline
**not echoing** dashboard-sent replies back (preferred fix = the outbound contract).
→ ADR-0009 §D, ADR-0008.

### TD-030 — Phase 2 control-plane schema deferred to a migration gate
The metadata tables (handover events, conversation control, outbound send status) are
**conceptual** now; their DDL is authored in a **Phase 2 schema proposal** and applied
behind its **own gate**. **No tables added now.** → ADR-0009 §E, Workflow 08.

---

## 2026-06-15 — Schema hardening + retention/analytics access semantics

### TD-020 — Audit `updated_at` on conversations & customers
Added `updated_at` to `app_conversations` and `app_customers` (other mutable
tables already had it). Mapping **bumps** a conversation's `updated_at` when it
refreshes `last_at`/`status`. → `architecture/02-schema-proposal.sql.md`,
`architecture/01-data-model.md`, ADR-0003, Workflow 02/04.

### TD-021 — CHECK constraints on enum-like columns
`app_tenants.status` IN ('active','suspended','archived');
`app_tenants.onboarding_status` IN ('pending','in_progress','complete');
`app_conversations.status` IN ('open','resolved','archived');
`app_subscription_limits.raw_history_retention_days > 0` *(later renamed to
`app_tenant_entitlements` and relaxed to `IS NULL OR > 0` — see TD-031 / TD-033)*.
→ `architecture/02-schema-proposal.sql.md`, `architecture/01-data-model.md`, CONTEXT.

### TD-022 — Channel resolution: active + exactly one
Resolving an Agno session to a channel/tenant matches **active** channels only and
must return **exactly one**: 0 → unmapped (skip), >1 → **ambiguous** (skip + masked
warning); **never guess a tenant**. Ambiguity = `app_channels` config error.
→ `architecture/03-agno-mapping.md`, Workflow 02/04/09.

### TD-023 — Retention is an access limit (list + transcript)
Retention gates **access**, not deletion: both the Chat Monitor **list** and the
**transcript** respect the window. A conversation whose `last_at` is older than the
cutoff is out-of-window — not shown as normal history; direct access → **restricted/
empty retention state**. Index rows may still exist. → ADR-0006, Workflow 06,
`phases/phase-1.md`, `product/04-prd-first-slice.md`.

### TD-024 — Phase 1 analytics capped by retention
No analytics rollup table exists yet, so analytics detail is **capped at the
tenant's `raw_history_retention_days`**; ranges are clamped to the window. Longer
historical analytics needs **future rollups / a plan feature**. → ADR-0006,
Workflow 05, `phases/roadmap.md`. **Superseded by TD-034 / TD-040:** analytics detail
is capped by `analytics_retention_days` (a separate knob; `NULL` = unlimited), **not**
`raw_history_retention_days`.

### TD-025 — Seed SQL is a one-time migration seed
The demo seed block is **not rerunnable as-is** (re-run violates
`app_tenants_slug_key`). Documented an **idempotent upsert** variant
(`ON CONFLICT DO NOTHING` / Drizzle `onConflictDoNothing`) as the form the
implementation should use. → `architecture/02-schema-proposal.sql.md`.

---

## 2026-06-15 — Stack lock + schema-proposal corrections

### TD-014 — App stack LOCKED (supersedes TD-012)
**Next.js (latest) + TypeScript + Tailwind + shadcn/ui + Drizzle ORM +
PostgreSQL + Zod.** Migrations are **Drizzle migrations (`drizzle-kit`)** authored
to match the SQL proposal (which stays the **review artifact**); raw `pg` is used
**only** as Drizzle's driver, not as the data-access layer. → ADR-0001,
`architecture/05-tech-stack.md`.

### TD-015 — shadcn/ui must match the demo UI, not override it
The dashboard must visually match the demo closely (colors, layout, spacing,
radius, shadows, typography). Prototype tokens are mapped into the Tailwind theme
and shadcn components are **restyled**; the default shadcn theme is **not**
adopted. → `architecture/05-tech-stack.md`.

### TD-016 — Tenant lifecycle fields
`app_tenants` adds `status` (`active`/`suspended`/`archived`), `onboarding_status`
(`pending`/`in_progress`/`complete`), and `updated_at`. → `architecture/01-data-model.md`,
`architecture/02-schema-proposal.sql.md`.

### TD-017 — Channels keyed by `(tenant_id, channel_key)`
`app_channels` adds a stable `channel_key` (+ `updated_at`); uniqueness is
`(tenant_id, channel_key)` **not** `(tenant_id, type)`, so a tenant may run
**multiple** WhatsApp channels. Source-mapping fields (`source_agent_id`,
`source_team_id`, `external_business_id`, `external_phone_number_id`) confirmed
present; Phase 1 sets only `source_agent_id`. → ADR-0002, ADR-0008.

### TD-018 — Conversation identity + `customer_identity_id`
`app_conversations` adds `customer_identity_id`. Uniqueness is
`(tenant_id, channel_id, agno_session_id)` **only**; `external_contact_id` is
**indexed, not unique** (a contact may own several conversations once sessions
diverge from the phone). → ADR-0003, ADR-0008.

### TD-019 — One current subscription-limits row per tenant
`app_subscription_limits` uses `UNIQUE (tenant_id)` (+ `updated_at`): exactly one
current row per tenant, updated in place. Multi-row plan **history** is parked
(would need a separate history table). → ADR-0006. **Superseded by TD-031** (table
renamed to `app_tenant_entitlements`; the 1:1-per-tenant rule still holds).

---

## 2026-06-15 — Phase 1 docs-first bootstrap

### TD-001 — Read-and-organize, never mutate Agno
Dashboard reads `ai.agno_sessions`; never writes to `ai.*`, never copies raw
messages. → ADR-0001, ADR-0004.

### TD-002 — Same DB, new `dashboard` schema, `app_` prefix
No tenant-specific or channel-specific schemas/tables. No FK from `dashboard.*`
into `ai.*`. → ADR-0001, ADR-0002, `architecture/02-schema-proposal.sql.md`.

### TD-003 — Multi-tenancy mandatory from day one
Shared schema + row-level `tenant_id` on every operational table; auth parked.
Tenant ≠ session; `session_id` never on `app_tenants`. → ADR-0002.

### TD-004 — Conversation grain = one rolling Agno row per phone
One `ai.agno_sessions` row (per phone) = one rolling conversation. Per-visit
splitting parked. → ADR-0003.

### TD-005 — Dual identifiers modelled separately
`agno_session_id` and `external_contact_id` are separate fields (equal in Phase 1
= the phone) so they can diverge without migration. → ADR-0003, ADR-0008.

### TD-006 — Transcript rendered live, cleaned
Flatten `runs[].messages[]`, drop `role=system`, drop `from_history=true`, dedupe
by `id`, order by `created_at`. No transcript storage. → ADR-0004, Workflow 03.

### TD-007 — Show only real data in Phase 1
No fabricated intent/summary/confidence/priority/business-category/issue/
exchange/follow-up/AI-resolved metrics. Nav = Dashboard, Chat Monitor, Analytics;
other prototype screens hidden; visual style kept. → ADR-0007, `product/03-feature-scope.md`.

### TD-008 — PII masking by default
`session_id`/phone is sensitive; masked in UI list views, transcript headers,
exports, and logs. Store real value, mask on read; admin reveal is future. → ADR-0005, Workflow 07.

### TD-009 — Retention at query level (30 days default)
`raw_history_retention_days=30` per tenant; filter transcript messages/runs by
timestamp; never delete `ai.agno_sessions`. → ADR-0006, Workflow 06.

### TD-010 — `app_channels` reserves source-mapping fields
`source_agent_id`, `source_team_id`, `external_business_id`,
`external_phone_number_id`. Demo: `concierge` → PEPPER ST. WhatsApp. → ADR-0002, `architecture/01-data-model.md`.

### TD-011 — Future tenant/source contract required for production
Phone-only global `session_id` is unsafe for multi-tenant SaaS; require Agno
sessions to become tenant/channel-scoped or globally unique (metadata contract
preferred). → ADR-0008, Workflow 09.

### TD-012 — Proposed stack (SUPERSEDED by TD-014)
Originally proposed TypeScript + Next.js + Tailwind + `pg` + **plain SQL
migrations** + `node --test`/Vitest. **Superseded 2026-06-15 by TD-014**: Drizzle
ORM + Drizzle migrations + shadcn/ui + Zod; `pg` demoted to driver only.
→ TD-014, ADR-0001, `architecture/05-tech-stack.md`.

### TD-013 — Schema SQL is a proposal, not applied
`architecture/02-schema-proposal.sql.md` requires a separate migration approval
gate (Gate 2) before any DDL runs. → `phases/phase-1.md`.

---

## Grounding facts (Stage 1 read-only DB inspection, 2026-06-15)

- Schemas: `ai`, `public`. PostgreSQL 16.9. `dashboard` does not exist yet.
- `ai.agno_sessions`: `session_id` (varchar PK) = WhatsApp phone; `session_type`
  NOT NULL (`agent`); jsonb `session_data/.../runs/summary`; `created_at`/
  `updated_at` = **epoch seconds**.
- `metadata` and `summary` are **NULL** on all rows.
- `session_data` = `{ session_state (empty), session_metrics }`;
  `session_metrics` = tokens + cost.
- `runs` = array (1–10, avg 4.7); `runs[].messages[]` = `{role, content, id,
  created_at, from_history, ...}`; `system` repeats per run; `from_history` all
  false in current data.
- Demo volume: 11 sessions, 1 agent (`concierge`), dates 2026-06-11..06-15.

> Inspection was read-only and masked; no `ai.*` mutation; credentials not stored.

---

## Template for new entries

```
## YYYY-MM-DD — <phase/slice>
### TD-NNN — <short title>
<decision in 1–3 sentences> → <ADR/workflow links>
```
