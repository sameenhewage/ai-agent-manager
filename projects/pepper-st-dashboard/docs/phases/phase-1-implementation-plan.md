# Phase 1 — Implementation Plan (Build Slices)

- **Project:** pepper-st-dashboard
- **Status:** **Phase 1 build complete + Gate 8 accepted (2026-06-15)** — Slices 0–7 implemented
  (app shell → Drizzle schema → migration applied + seed → Agno parser/mapping → Chat Monitor →
  Analytics → **Chat Monitor lazy-loaded + demo hardening**), plus **7B** (workspace layout) and
  **7C** (dashboard/analytics parity) quality corrections. Gates 0–4 satisfied. This document defines
  *how* Phase 1 was built.
- **Last updated:** 2026-06-15
- **Related:** `docs/phases/phase-1.md`, `docs/product/04-prd-first-slice.md`,
  `docs/architecture/02-schema-proposal.sql.md`, `docs/architecture/05-tech-stack.md`,
  `AGENTS.md`, `docs/changelog/technical-decision-log.md`

> This is a **build plan**, not a build. It sequences the work into thin vertical
> slices, each independently reviewable, each with its own approval gate and
> handoff. **Slice 0 (subagent readiness) must pass before any other slice.**

---

## How to read this plan

Every slice is described with the same nine fields:

- **Goal** — the single outcome the slice delivers.
- **Owner / subagent** — the intended `.claude/agents/*` role that leads it.
- **Files likely touched** — *proposed* paths (actual implemented paths may differ slightly).
- **In scope** — what the slice includes.
- **Out of scope** — what it deliberately excludes (deferred to a later slice/phase).
- **Tests / validation** — how we prove it works (Vitest unit + Playwright E2E).
- **Docs to update** — living docs touched on completion.
- **Approval gate** — what must be approved before/after the slice.
- **Handoff requirement** — what the closing handoff must contain.

---

## Stack (locked — see `05-tech-stack.md`)

Next.js (latest, App Router) + TypeScript · Tailwind CSS (prototype tokens) ·
shadcn/ui (restyled, not default theme) · Drizzle ORM (+ `drizzle-kit` migrations;
`pg` only as Drizzle's driver) · Zod · **Vitest** (unit) + **Playwright** (UI flows).

## Pre-build gates

| Gate | What | Status |
|---|---|---|
| **0** | **Subagent readiness** — global agents present + PEPPER ST. coordination created (`docs/agents,workflows,templates`); skills installed/active (root governance) | ✅ **PASS (2026-06-15)** |
| 1 | Stage 1 analysis approved | ✅ done |
| 2 | Approve `dashboard` schema migration (Drizzle schema + migrations matching the SQL proposal) | ✅ approved + applied (Slice 3, 2026-06-15) |
| 3 | Tech stack (`05-tech-stack.md`) | ✅ locked |
| 4 | Per-slice QA + docs/handoff update | per slice |

## Cross-cutting rules (apply to every slice)

- **Read-only over `ai.*`.** Never write, delete, or migrate `ai.agno_*`.
- **Tenant scoping is mandatory.** Every operational query carries `tenant_id`.
- **No message duplication.** The canonical transcript stays upstream (ADR-0004/0009);
  the dashboard renders it live and stores **no** message bodies.
- **PII masking by default** in UI and logs (shared util — ADR-0005).
- **Entitlements are explicit.** No hidden `plan_code`/`is_fully_enabled`/retention
  defaults; `NULL` retention = unlimited (TD-037).
- **TDD where practical** (red → green → refactor); tests live with the slice.
- **Living docs**: a slice is not done until its docs/workflow/ADR + decision log +
  handoff are updated.
- **Do NOT add** the tables listed in "Tables explicitly NOT added now".

---

## Slice 0 — Subagent readiness gate

- **Goal:** Confirm the AI build team actually exists and is usable **before** any
  implementation; if not, restore/create it.
- **Owner / subagent:** WebApp Orchestrator (with Solution Architect review).
- **Files likely touched:** `.claude/agents/*`, `.claude/workflows/*`,
  `.claude/templates/*`, `.claude/skills/*`, `docs/agents/*` (only if restoring);
  this plan + decision log on completion. **No application code.**
- **In scope:**
  - Verify `.claude/agents`, `.claude/workflows`, `.claude/templates`, and skills are
    present **and non-empty**.
  - Confirm whether the agents referenced in `AGENTS.md` (WebApp Orchestrator,
    Product Discovery, Solution Architect, Prototype, Fullstack Builder, QA Review,
    Handoff) are real, loadable Claude subagents.
  - **Finding (2026-06-15, Gate 0 executed):** the **7 global agents** in
    `.claude/agents/` are **present and usable** (generic/reusable); `.claude/workflows`
    and `.claude/templates` hold generic team assets; `.claude/skills/` subfolders are
    **empty → parked** (optional, non-blocking). PEPPER ST. coordination (boundaries,
    slice ownership, slice/migration/QA-handoff workflows, templates) is created
    **project-scoped** under `docs/agents/`, `docs/workflows/`, `docs/templates/` —
    **no global agents were duplicated or modified**. **Gate 0 = PASS.** See
    `docs/agents/README.md`.
  - If missing: **propose restoring/creating** the agent + workflow + template set
    (and `docs/agents/*`) per `AGENTS.md`, for explicit approval, before Slice 1.
- **Out of scope:** Any app/UI/DB code; rewriting `AGENTS.md` operating rules.
- **Tests / validation:** Checklist — each named agent loads and can be invoked; each
  workflow/template referenced by `AGENTS.md` resolves; skills list is non-empty.
- **Docs to update:** this plan (status), `docs/changelog/technical-decision-log.md`,
  handoff. If agents are restored, note where and how.
- **Approval gate:** **Gate 0** — readiness confirmed (or restoration approved &
  completed). **Blocks all later slices.**
- **Handoff requirement:** State whether agents exist; if restored, list created
  files; if blocked, state exactly what approval/content is needed.

## Slice 1 — App shell + UI foundation

- **Status:** ✅ **Implemented (2026-06-15)** — shell scaffolded in `base-dashboard-app/` (Next.js + TS + Tailwind
  + shadcn/ui, demo tokens, 3 nav surfaces, no DB). Verified green under **Node 20**
  (`tsc --noEmit` clean, **9/9 Vitest**, `next build` OK); Playwright spec ready. See
  `docs/handoff/2026-06-15-slice-1-app-shell.md`.
- **Goal:** A running Next.js app whose shell visually matches the demo (sidebar,
  topbar, dashboard frame) — **no DB logic**.
- **Owner / subagent:** Fullstack Builder (Prototype Agent advises on token mapping).
- **Files likely touched:** `package.json`, `next.config.*`, `tsconfig.json`,
  `tailwind.config.ts`, `postcss.config.*`, `app/globals.css`, `app/layout.tsx`,
  `app/(dashboard)/layout.tsx`, `app/(dashboard)/page.tsx`,
  `components/ui/*` (shadcn primitives), `components/shell/{sidebar,topbar}.tsx`,
  `lib/utils.ts`, `vitest.config.ts`, `playwright.config.ts`,
  `e2e/shell.spec.ts`.
- **In scope:**
  - Next.js latest + TypeScript scaffold; Tailwind + shadcn/ui init.
  - Map prototype design tokens (AI violet `#7c3aed`, brand rose `#be185d`, WhatsApp
    green `#25d366`, radius ~14px, Plus Jakarta Sans + JetBrains Mono) into the
    Tailwind theme / CSS variables; **restyle** shadcn, not default theme.
  - Sidebar + topbar + dashboard shell; nav limited to **Dashboard / Chat Monitor /
    Analytics** (other prototype screens hidden).
- **Out of scope:** Any DB access, Agno reads, real data, auth.
- **Tests / validation:** Vitest (token/util sanity); Playwright (shell renders, nav
  routes exist, three nav items present, no Bloomwire branding).
- **Docs to update:** `05-tech-stack.md` (deploy/token-carry open questions resolved),
  decision log; confirm UI fidelity notes.
- **Approval gate:** Gate 3 (stack ✅) + Gate 0 passed. QA review of the shell.
- **Handoff requirement:** Screenshots/notes of shell vs demo; token-mapping summary;
  any deviations from the prototype.

## Slice 2 — Drizzle schema / migration proposal

- **Status:** ✅ **Implemented (2026-06-15)** — Drizzle schema + generated migration
  `0000` in `base-dashboard-app/` (**PROPOSED, not applied** in this slice; no DB connection). Typecheck
  + **39 tests** + build green (Node 20). **Gate 2 was subsequently approved and the migration applied
  in Slice 3** (see the pre-build gates table above) — see
  `docs/architecture/migration-proposal-0000.md` and
  `docs/handoff/2026-06-15-slice-2-drizzle-schema.md`.
- **Goal:** Author the **Drizzle schema** that matches the approved SQL design and a
  **migration proposal** — **without applying** it.
- **Owner / subagent:** Solution Architect (authors), Fullstack Builder (implements).
- **Files likely touched:** `lib/db/schema.ts`, `lib/db/index.ts` (Drizzle client,
  read-only-aware), `drizzle.config.ts`, `drizzle/` (generated migration files),
  `lib/db/types.ts`. **No DB apply.**
- **In scope:**
  - Drizzle schema for the **6** `dashboard.app_*` tables exactly matching
    `02-schema-proposal.sql.md`: `app_tenants` (incl. `timezone`), `app_channels`,
    `app_customers`, `app_customer_identities`, `app_conversations`,
    `app_tenant_entitlements`.
  - **Entitlements: no hidden defaults** — `plan_code`/`is_fully_enabled` `NOT NULL`
    (no default), retention columns nullable (no default; `NULL` = unlimited), with
    `IS NULL OR > 0` checks.
  - Composite uniqueness + CHECK constraints + indexes per the SQL proposal.
  - Generate the migration files for review (the SQL doc remains the review artifact).
  - **No FK from `dashboard.*` into `ai.*`** (link by value only).
- **Out of scope:** Running `drizzle-kit push`/`migrate` (waits for Gate 2); seed data
  (Slice 3); any `ai.*` DDL; **any** of the forbidden tables.
- **Tests / validation:** Vitest schema-shape tests; `drizzle-kit` generates cleanly;
  generated SQL diffed against `02-schema-proposal.sql.md` (expect 6 tables, matching
  constraints).
- **Docs to update:** `02-schema-proposal.sql.md` (note Drizzle parity), data model if
  any field clarifies, decision log.
- **Approval gate:** **Gate 2** — schema migration approved. **Migration is applied
  only after this gate** (in Slice 3's setup), never during this slice.
- **Handoff requirement:** Drizzle-vs-SQL parity table; confirmation nothing is applied
  yet; list of generated migration files.

## Slice 3 — Seed and tenant context

- **Status:** ✅ **Implemented (2026-06-15)** — migration `0000` **applied** to the real DB;
  PEPPER ST. + `whatsapp-main`/`concierge` + enterprise/unlimited entitlement **seeded**
  (idempotent); demo tenant resolver added; read-only `db:verify` PASSED; `ai.*` untouched.
  Typecheck + 45 tests + build green (Node 20). See
  `docs/handoff/2026-06-15-slice-3-apply-seed-tenant.md`.
- **Goal:** With Gate 2 approved, apply the migration and seed PEPPER ST.; establish a
  demo `current_tenant_id` strategy.
- **Owner / subagent:** Fullstack Builder.
- **Files likely touched:** `drizzle/` (apply), `lib/db/seed.ts`, `lib/tenant/context.ts`
  (resolve `current_tenant_id`), `app/(dashboard)/layout.tsx` (provide tenant context),
  `.env.example` (DB URL, demo tenant slug), `tests/seed.test.ts`.
- **In scope:**
  - Apply the approved Drizzle migration to create the `dashboard` schema.
  - Seed **PEPPER ST.** tenant (+ `timezone = Asia/Colombo`), **WhatsApp channel**
    (`channel_key=whatsapp-main`, `source_agent_id=concierge`), and the **entitlement
    row explicitly**: `plan_code='enterprise'`, `is_fully_enabled=true`,
    `raw_history_retention_days=NULL`, `analytics_retention_days=NULL` (unlimited).
  - Use the **idempotent upsert** seed variant (re-runnable).
  - Demo `current_tenant_id` strategy (Phase 1, no auth): resolve by env/slug to a
    single tenant; documented as a **temporary** stand-in for auth (Phase 2).
- **Out of scope:** Seeding customers/identities/conversations (those come from the
  mapping workflow off real Agno rows); auth; multi-tenant switching UI.
- **Tests / validation:** Vitest — seed is idempotent; entitlement row has the exact
  enterprise/NULL values; a second (empty) tenant can be seeded to prove isolation.
- **Docs to update:** `01-tenant-onboarding.md` (confirm explicit-insert seed),
  `04-multitenancy.md`, decision log.
- **Approval gate:** Gate 2 (must be approved before applying). QA review of seed.
- **Handoff requirement:** Confirm migration applied to `dashboard` only (`ai.*`
  untouched); seed values; the `current_tenant_id` demo strategy + its temporary nature.

## Slice 4 — Agno transcript parser / service

- **Status:** ✅ **Implemented (2026-06-15)** — read-only parser (`lib/agno/parser.ts`) +
  shared masker (`lib/agno/mask.ts`) + pure mapping helpers (`lib/agno/mapping.ts`) +
  idempotent mapping sync (`lib/agno/sync.ts`). Applied to the real DB: 13 `concierge`
  sessions → 13 conversations/customers/identities; re-run idempotent (0 new). Read-only on
  `ai.*`; no transcript persisted; ids masked. Typecheck + 66 tests + build green (Node 20).
  See `docs/handoff/2026-06-15-slice-4-agno-parser-mapping.md`.
- **Goal:** A typed, read-only service that turns one `ai.agno_sessions` row into a
  clean transcript — **no message duplication**.
- **Owner / subagent:** Fullstack Builder.
- **Files likely touched:** `lib/agno/transcript.ts` (parser), `lib/agno/client.ts`
  (read-only query), `lib/agno/types.ts` (Zod schemas for the JSON shape),
  `lib/pii/mask.ts` (shared masking util), `tests/transcript.test.ts`,
  `tests/mask.test.ts`, fixtures under `tests/fixtures/agno-session.json`.
- **In scope:**
  - Read `ai.agno_sessions` by `session_id` (read-only).
  - Flatten `runs[].messages[]`; **exclude `role='system'`**; **dedupe by message
    `id`** (also drop `from_history=true`); **sort by `created_at`**.
  - Map roles → senders (`user→customer`, `assistant→bot`, `tool→tool/system note`).
  - **Mask** phone/contact ids via the shared util (never log raw).
  - Apply **raw-history retention** when `raw_history_retention_days` is set; **`NULL`
    = unlimited** (no cutoff).
- **Out of scope:** UI rendering (Slice 5); analytics aggregation (Slice 6); writing
  anything back to `ai.*`; persisting transcripts in `dashboard.*`.
- **Tests / validation:** Vitest against a fixture with multi-run history +
  `from_history` + `system` messages → ordered, de-duplicated, system-free output;
  masking never emits raw phone; retention boundary (finite vs `NULL`).
- **Docs to update:** `03-agno-mapping.md`, `03-agno-transcript-rendering.md`,
  `07-pii-phone-masking.md`, decision log.
- **Approval gate:** Gate 4 (QA review of the service + tests).
- **Handoff requirement:** Test coverage summary; confirmation of read-only + no
  duplication; how `NULL` retention is handled.

## Slice 5 — Chat Monitor

- **Status:** ✅ **Implemented (2026-06-15)** — server-first page
  `app/(dashboard)/chat-monitor/page.tsx` (`force-dynamic`) → `lib/chat-monitor/service.ts`
  (dashboard reads + `ai.agno_sessions` read-only, transcripts parsed in memory) → pure
  `lib/chat-monitor/presenter.ts` (masking, `last_at` desc ordering, retention windowing,
  transcript view-state) → client `components/chat-monitor/chat-monitor.tsx` (selection +
  mobile toggle only). 13 PEPPER ST. conversations render with masked ids, turn/msg counts,
  live transcript (system excluded, deduped, ordered); empty/restricted/error states; no
  fabricated fields. TDD: 10 presenter tests (76 total). Verified in-browser + read-only
  `db:chat:verify` (no raw id leaks). `ai.*` untouched; nothing persisted. See
  `docs/handoff/2026-06-15-slice-5-chat-monitor.md`.
- **Goal:** Tenant-scoped conversation **list** + **detail/transcript** rendered live
  from Agno, honoring retention/access — **no human reply**.
- **Owner / subagent:** Fullstack Builder + QA Review.
- **Files likely touched:** `app/(dashboard)/chat-monitor/page.tsx` (list),
  `app/(dashboard)/chat-monitor/[conversationId]/page.tsx` (detail),
  `lib/conversations/list.ts` (tenant-scoped query + mapping via Workflow 02/04),
  `components/chat/{conversation-list,transcript,context-panel}.tsx`,
  `e2e/chat-monitor.spec.ts`, `tests/conversations.test.ts`.
- **In scope:**
  - Tenant-scoped conversation list (mapped from real Agno sessions for the channel),
    masked contact, `last_at`, turn count.
  - Conversation detail with the Slice 4 transcript; context panel shows **only real**
    fields (no intent/summary/priority).
  - **Retention/access behavior:** when `raw_history_retention_days` is finite,
    out-of-window conversations are not listed as normal history and direct access
    shows a **restricted/empty** state; when `NULL` (PEPPER ST.), nothing is excluded.
  - Channel resolution = **active + exactly one** (0 → unmapped, >1 → ambiguous; never
    guess).
- **Out of scope:** Human reply / take-over (Phase 2, ADR-0009); analytics; auth.
- **Tests / validation:** Vitest (tenant scoping excludes tenant B; mapping resolves
  one Agno row); Playwright (list renders masked, open transcript, restricted state for
  a forced finite-retention fixture).
- **Docs to update:** `04-prd-first-slice.md` (mark slice delivered),
  `02-agno-session-...`/`04-...mapping`, `06-retention-access-limit.md`, decision log.
- **Approval gate:** Gate 4 (QA review). PRD acceptance criteria pass.
- **Handoff requirement:** Which PRD acceptance criteria pass; masking/retention proof;
  no writes to `ai.*`; no transcript persisted.

## Slice 6 — Basic analytics

- **Status:** ✅ **Implemented (2026-06-15)** — pure `lib/analytics/ranges.ts` (tz-aware
  `[from,to)` for Today/3D/7D/14D/30D/This-month/Custom; dependency-free `parseRangeParams`
  — Zod not installed; pure `clampToRetention`) + `lib/analytics/aggregate.ts` (real metrics only:
  volume, new/returning, turns, displayed messages, token/cost with coverage, activity bounds,
  daily series). Server `lib/analytics/service.ts` (mapped conversations ⊕ `ai.agno_sessions`
  read-only incl. `session_data.session_metrics`; retention clamp) → `force-dynamic` page +
  client `components/analytics/analytics.tsx` (URL-driven range switch; KPI cards; dependency-free
  bar chart — no recharts). TDD: 23 analytics tests (99 total). Verified in-browser (7D/30D) +
  read-only `db:analytics:verify` (live == SQL). `ai.*` untouched; no fabricated KPIs. See
  `docs/handoff/2026-06-15-slice-6-analytics.md`.
- **Goal:** Real, date-filtered analytics in the tenant timezone — **no fake KPIs**.
- **Owner / subagent:** Fullstack Builder + QA Review.
- **Files likely touched:** `app/(dashboard)/analytics/page.tsx`,
  `lib/analytics/aggregate.ts` (live computation), `lib/analytics/ranges.ts`
  (timezone-aware bounds), `lib/validation/range.ts` (Zod), `components/analytics/*`,
  `tests/analytics.test.ts`, `e2e/analytics.spec.ts`.
- **In scope:**
  - Ranges **Today / 3D / 7D / 14D / 30D / This month / Custom**, computed in the
    **tenant timezone** (`app_tenants.timezone`).
  - Real metrics only: conversations in range, new vs returning contacts, turns,
    displayed messages, total tokens, cost, first/last activity.
  - Apply **`analytics_retention_days`** as the analytics cap (clamp range); **`NULL`
    = unlimited** (no clamp — PEPPER ST.). Flag the out-of-window portion (not a fake
    zero).
- **Out of scope:** AI-resolved %, intents, issues/exchanges/follow-ups, confidence,
  priority (no source — ADR-0007); analytics **rollups** (future).
- **Tests / validation:** Vitest — range boundaries (inclusive/exclusive), token/cost
  sums vs fixture, tenant B excluded, unsupported metrics absent from payload,
  analytics cap (finite clamps; `NULL` serves full range); Playwright (range switch).
- **Docs to update:** `05-analytics-filter.md`, `03-feature-scope.md`, decision log.
- **Approval gate:** Gate 4 (QA review).
- **Handoff requirement:** Metric definitions vs sources; confirm no fabricated KPIs;
  analytics-cap behavior (finite vs `NULL`).

## Slice 7 — Demo hardening

- **Status:** ✅ **Implemented (2026-06-15)** — Priority 1 was Chat Monitor **performance**: the
  old all-in-one server fetch parsed every transcript before first paint (~2–3s). Split into a
  cheap `getConversationList` (dashboard read + `jsonb_array_length(runs)`, no parsing) and a lazy
  `getConversationTranscript` (one IDOR-safe session), exposed as `GET /api/chat-monitor/conversations`
  and `.../[id]/transcript`; the page is now a STATIC shell + client that lazily fetches with
  skeleton/error/retry. Shell ~32ms (was ~2–3s); list ~377ms / transcript ~459ms warm. Plus honest
  Dashboard hub (no stale copy, no fake KPIs), `loading.tsx` skeletons, masking/no-leak audit. 99
  tests; typecheck + build green; `db:chat:verify` (split + IDOR) ALL PASS. See
  `docs/handoff/2026-06-15-slice-7-demo-hardening.md`.
- **Goal:** Make the build demo-safe and on-brand for PEPPER ST.
- **Owner / subagent:** Fullstack Builder + QA Review + Handoff Agent.
- **Files likely touched:** `app/globals.css` / theme (PEPPER ST. branding),
  `components/**` (loading/empty/error states), `lib/pii/mask.ts` (audit),
  `app/error.tsx`, `app/(dashboard)/**/loading.tsx`, `e2e/*` (states),
  `docs/handoff/*` (new handoff).
- **In scope:**
  - PEPPER ST. branding replaces Bloomwire; **remove any Bloomwire dummy-data leaks**.
  - Loading / empty / error states across Dashboard, Chat Monitor, Analytics.
  - **Demo-safe PII masking** audit (UI + logs).
  - Final demo walkthrough + handoff summary.
- **Out of scope:** New features; auth; live reply; deploy target decision (unless the
  gate resolves it).
- **Tests / validation:** Playwright — empty/loading/error states render; no raw phone
  anywhere; no "Bloomwire" string; Lighthouse/a11y smoke (optional).
- **Docs to update:** `README.md`, `00-product-vision.md` branding note, decision log,
  **new handoff** doc.
- **Approval gate:** Gate 4 (final QA). Phase-1 acceptance (see `phase-1.md`).
- **Handoff requirement:** Full Phase-1 handoff — what shipped, tests, residual risks,
  Phase 2 entry (live handover), and any open gate items.

---

## Tables explicitly NOT added now

Per locked scope, none of these are created in any Phase 1 slice (each needs its own
scope + ADR + gate when/if picked up):

- `app_conversation_messages` (no message duplication — canonical transcript upstream).
- `app_analytics_daily` (analytics rollups are a future ADR).
- `app_plans`, `app_plan_features`, `app_tenant_subscriptions` (pricing/subscription
  model is **parked**).
- Issue / exchange / follow-up / order tables.
- Auth / member / role tables (auth is Phase 2).
- Audit / queue / job tables.

## Definition of done (per slice)

- Scope agreed; change is one vertical slice.
- Automated tests pass (Vitest + Playwright as applicable).
- Cross-cutting rules upheld (read-only `ai.*`, tenant scoping, masking, explicit
  entitlements, no forbidden tables).
- Docs/workflow/ADR + decision log updated; handoff written.
- QA Review = PASS.
