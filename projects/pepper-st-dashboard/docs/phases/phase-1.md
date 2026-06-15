# Phase 1 — Scope, Plan, Gates

- **Project:** pepper-st-dashboard
- **Status:** docs-first bootstrap complete; build not started
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
   templates}`; skills parked. See `docs/agents/README.md`. No app code.
1. **Docs-first bootstrap** — ✅ done (this doc set).
2. **App shell + UI foundation** — ✅ **Implemented (2026-06-15)**: Next.js + TS +
   Tailwind + shadcn/ui; demo tokens; sidebar/topbar/dashboard shell; 3 nav surfaces.
   No DB logic. See `docs/handoff/2026-06-15-slice-1-app-shell.md`.
3. **Drizzle schema / migration proposal** — Drizzle schema matching
   `02-schema-proposal.sql.md`; migration **proposed, not applied** (Gate 2).
   Entitlements **explicit** (no hidden defaults).
4. **Seed + tenant context** — apply (post-Gate 2) and seed PEPPER ST. + WhatsApp/
   `concierge` + **explicit enterprise/unlimited entitlement**; demo
   `current_tenant_id` strategy.
5. **Chat Monitor** — tenant-scoped list + live transcript + retention/access. TDD.
6. **Basic analytics** — timezone-aware ranges; real metrics only;
   `analytics_retention_days` applied. TDD.
7. **Demo hardening** — PEPPER ST. branding; remove Bloomwire leaks; loading/empty/
   error states; PII audit; handoff.

## Gates

| Gate | What | Status |
|---|---|---|
| 0 | **Subagent readiness** — global agents present + PEPPER ST. coordination created; skills parked | ✅ PASS (2026-06-15) |
| 1 | Stage 1 analysis approved | ✅ done |
| 2 | Approve `dashboard` schema migration (Drizzle schema + migrations matching the SQL proposal) | ⛔ pending |
| 3 | Tech stack (`docs/architecture/05-tech-stack.md`) | ✅ locked |
| 4 | Per-slice QA + docs/handoff update | per slice |

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
