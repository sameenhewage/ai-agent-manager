# Phase 1 — Scope, Plan, Gates

- **Project:** pepper-st-dashboard
- **Status:** Slices 0–7C complete — **Phase 1 feature-complete + demo-grade**; dense real-data Dashboard, Chat Monitor lazy-loaded (instant `○ Static` shell, full-height workspace), Analytics report (two real charts) — all real-data only, no document scroll. **Gate 8 (Phase 1 acceptance) ✅ PASS — accepted 2026-06-15** (typecheck + 106 tests + build green; prod-mode browser acceptance; `db:chat:verify` + `db:analytics:verify` ALL PASS; boundaries clean).
- **Last updated:** 2026-06-15

## Objective

Ship a **tenant-scoped, read-only** console over the existing Agno WhatsApp agent
that shows **only real data**: Dashboard, Chat Monitor, Analytics.

## In scope

- Multi-tenant data model (`dashboard.app_*`), tenant-scoped everywhere.
- WhatsApp channel mapping to the Agno `concierge` agent.
- Chat Monitor: conversation list + **live** transcript (masked PII, retention).
- Analytics: date-filtered **real** metrics (volume, turns, tokens, cost).
- Dashboard: headline real metrics + recent conversations.

## Real data only (locked)

Contact/session id (masked), transcript, timestamps, turn/message counts,
token/cost metrics. **No** fabricated intent/summary/confidence/priority/
business-category/issue/exchange/follow-up/AI-resolved fields (ADR-0007).

## Parked in Phase 1

Orders, Issues, Exchanges, Follow-ups, Custom Items, Staff Tasks, advanced Bot
Status, login/auth, reveal-phone, per-visit conversation splitting, live human
chat, rich AI metadata. See `roadmap.md`.

## Deliverables sequence (after gates)

> **Detailed build plan:** `docs/phases/phase-1-implementation-plan.md` — slices 0–7,
> each with scope, tests, approval gate, and handoff. Summary:

0. **Subagent readiness (Gate 0)** — ✅ **PASS (2026-06-15)**: the 7 global agents are
   present & usable; PEPPER ST. coordination created under `docs/{agents,workflows,
   templates}`; skills installed/active (root governance). See `docs/agents/README.md`. No app code.
1. **Docs-first bootstrap** — ✅ done (this doc set).
2. **App shell + UI foundation** — ✅ **Implemented (2026-06-15)**: Next.js + TS +
   Tailwind + shadcn/ui; demo tokens; sidebar/topbar/dashboard shell; 3 nav surfaces.
   No DB logic. See `docs/handoff/2026-06-15-slice-1-app-shell.md`.
3. **Drizzle schema / migration proposal** — ✅ **Implemented (2026-06-15)**: Drizzle
   schema matching `02-schema-proposal.sql.md`; migration `0000` **generated** here (not applied in
   this step; **Gate 2 was subsequently approved and the migration applied during step 4 / Seed** —
   see the Gates table below). Entitlements **explicit** (no hidden defaults). See
   `docs/handoff/2026-06-15-slice-2-drizzle-schema.md`.
4. **Seed + tenant context** — ✅ **Implemented (2026-06-15)**: migration applied
   (post-Gate 2); seeded PEPPER ST. + WhatsApp/`concierge` + **explicit enterprise/unlimited
   entitlement**; demo tenant resolver. Verified read-only; `ai.*` untouched. See
   `docs/handoff/2026-06-15-slice-3-apply-seed-tenant.md`.
5. **Chat Monitor** — ✅ **Implemented (2026-06-15)**: tenant-scoped list + live read-only
   transcript (masked PII, retention windowing, empty/restricted/error states); server-first;
   `ai.*` read-only; no transcript persisted. Verified in-browser + `db:chat:verify`. See
   `docs/handoff/2026-06-15-slice-5-chat-monitor.md`.
6. **Basic analytics** — ✅ **Implemented (2026-06-15)**: tenant-timezone ranges
   (Today/3D/7D/14D/30D/Month/Custom); real metrics only (volume, new/returning, turns, messages,
   tokens, cost with coverage, activity bounds) + daily series; `analytics_retention_days` clamp
   (NULL = unlimited); server-first; `ai.*` read-only; no fabricated KPIs. Verified in-browser +
   `db:analytics:verify`. See `docs/handoff/2026-06-15-slice-6-analytics.md`.
7. **Demo hardening** — ✅ **Implemented (2026-06-15)**: Chat Monitor **performance** refactor
   (instant static shell + lazy list/transcript API routes — shell ~32ms vs ~2–3s); skeleton/
   error/retry states across Dashboard/Chat Monitor/Analytics; honest Dashboard hub (no stale
   "later slices" copy, no fake KPIs); no Bloomwire leaks; masking intact. Verified in-browser +
   `db:chat:verify`. See `docs/handoff/2026-06-15-slice-7-demo-hardening.md`.
8. **UI workspace correction (Slice 7B)** — ✅ **Implemented (2026-06-15)**: fixed the document-scroll
   bug — the app shell is now a fixed `h-dvh` viewport frame; Chat Monitor is a full-height two-pane
   workspace (list + transcript each scroll internally; the document never scrolls); Dashboard is a
   compact, centered, honest overview (no fake KPIs); Analytics is a real-data report. **UI/layout
   only** — no data, schema, or feature changes; the hybrid lazy Chat Monitor split is preserved.
   Verified in-browser (runtime DOM scroll assertions) + `db:chat:verify`. See
   `docs/handoff/2026-06-15-slice-7b-ui-workspace.md`.
9. **Dashboard + Analytics parity (Slice 7C)** — ✅ **Implemented (2026-06-15)**: rebuilt the
   Dashboard from a centered link-hub into a dense, real-data operations console (`force-dynamic`):
   `.phead` + range toolbar, 8 real KPI cards, two real charts (conversations + tokens/day), masked
   recent conversations, coverage panel, and one honest "Not tracked" panel — reusing the existing
   `getAnalyticsData` + `getConversationList` services (no new data source). Analytics gained the
   shared area chart + a real tokens/day chart. **Visual/product correction only** — no migrations,
   no DB writes, `ai.agno_*` untouched, no fabricated metrics (guarded by a unit test); Chat Monitor
   stays `○ Static` and un-regressed. 106 tests + typecheck + build green; browser-verified. See
   `docs/handoff/2026-06-15-slice-7c-dashboard-parity.md`.

## Gates

| Gate | What | Status |
|---|---|---|
| 0 | **Subagent readiness** — global agents present + PEPPER ST. coordination created; skills installed/active (root governance) | ✅ PASS (2026-06-15) |
| 1 | Stage 1 analysis approved | ✅ done |
| 2 | Approve `dashboard` schema migration (Drizzle schema + migrations matching the SQL proposal) | ✅ approved + applied (Slice 3, 2026-06-15) |
| 3 | Tech stack (`docs/architecture/05-tech-stack.md`) | ✅ locked |
| 4 | Per-slice QA + docs/handoff update | per slice |
| 8 | **Phase 1 acceptance review** — product / UI / data / security-PII / performance / docs across Dashboard, Chat Monitor, Analytics (no blockers) | ✅ PASS (2026-06-15) |
| 9 | **Deploy readiness / deploy-target decision** — options, DB/env readiness, boundaries, risks, checklist (decision gate; nothing deployed) | ✅ PASS (2026-06-15) — recommend self-host adjacent to Agno PG; see `docs/deployment/01-deploy-readiness.md`, ADR-0010 (Proposed) |

## Acceptance (phase-level)

- Two seeded tenants prove isolation (B empty, no leak from A).
- Transcript: no system messages, no duplicates, ordered, retention-bounded.
- Retention is an **access limit** driven by `app_tenant_entitlements`
  (`raw_history_retention_days` + `analytics_retention_days`; **`NULL` = unlimited**,
  e.g. PEPPER ST. = enterprise): Chat Monitor list + transcript respect the raw-history
  window; conversations whose last activity is older than the window are not shown as
  normal history (direct access → restricted/empty state). Analytics detail is capped
  at `analytics_retention_days` (no rollup table yet). A `NULL` knob = unlimited.
- No full phone numbers in UI or logs.
- No metric shown without a real Agno source.
- Zero writes to `ai.*`; no transcript persisted in `dashboard.*`.

## Definition of done (Phase 1)

All slices pass automated tests + QA; every feature's docs/workflow/ADR and the
decision log are updated; handoff written.
