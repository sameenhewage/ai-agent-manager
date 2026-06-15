# PEPPER ST. Dashboard

A **multi-tenant SaaS operations dashboard** built on top of an existing **Agno
WhatsApp AI agent**. The bot talks to customers on WhatsApp and writes sessions
to PostgreSQL (`ai.agno_sessions`); this dashboard **reads and organizes** that
activity into conversation monitoring, transcript history, and analytics.

> **Status:** Phase 1 — **Slice 1 (app shell + UI foundation) in place**. The Next.js
> app shell, design tokens, and the three nav surfaces exist, but there is still **no
> database access, no migrations, no schema changes, and no Agno reads**. The
> `dashboard` schema and all `app_*` tables described here remain **proposals to
> review**, not applied objects.

- **Last updated:** 2026-06-15
- **Project key:** `pepper-st-dashboard`
- **Read first:** [`CONTEXT.md`](./CONTEXT.md) (domain glossary)

---

## What this is / is not

**Is:** a read-and-organize layer with its own `dashboard` schema that maps to
Agno data by reference; multi-tenant from day one.

**Is not:** the AI bot, a Shopify integration, an owner/mutator of `ai.agno_*`,
or a copy of raw chat messages.

See [`CONTEXT.md` §2](./CONTEXT.md) for the full ownership boundary.

---

## Phase 1 scope (locked)

- **Nav surfaces:** Dashboard, Chat Monitor, Analytics — **only**.
- **Data shown:** contact/session id (masked), transcript, timestamps,
  turn/message counts, token/cost metrics — **only real data** from
  `ai.agno_sessions`.
- **Parked:** Orders, Issues, Exchanges, Follow-ups, Custom Items, Staff Tasks,
  advanced Bot Status, login/auth, per-visit conversation splitting, rich AI
  metadata (intent/summary/confidence/priority).
- **Phase 2 (mandatory, not Phase 1):** live WhatsApp human chat + AI→human
  handover — canonical transcript stays upstream, dashboard stores metadata only
  (ADR-0009, Workflow 08).
- **Tenant-scoped:** every operational record carries `tenant_id`; onboarding a
  business yields a fresh empty tenant dashboard.

---

## Local development (Slice 1 — app shell)

The app is a **Next.js (App Router) + TypeScript + Tailwind + shadcn/ui** project in
**`base-dashboard-app/`** (kept separate from the project docs). Slice 1 is **UI shell
only** — no DB, no Agno reads.

```bash
# from projects/pepper-st-dashboard/base-dashboard-app/
npm install            # pinned deps (Next 15, React 19, Tailwind, shadcn deps)
npm run dev            # http://localhost:3000

# checks
npm run typecheck      # tsc --noEmit
npm run test           # Vitest unit (tokens, cn, nav)
npm run e2e:install    # one-time Playwright browser download
npm run e2e            # Playwright shell spec (auto-starts dev server)
npm run build          # production build
```

App structure (under `base-dashboard-app/`):

```
app/
├── layout.tsx                 ← root (fonts, metadata)
├── globals.css                ← demo design tokens → CSS variables
└── (dashboard)/
    ├── layout.tsx             ← AppShell (sidebar + topbar)
    ├── page.tsx               ← Dashboard (placeholders, no fake metrics)
    ├── chat-monitor/page.tsx  ← placeholder (built in Slice 5)
    └── analytics/page.tsx     ← placeholder (built in Slice 6)
components/
├── shell/                     ← sidebar, topbar, app-shell, nav-items, theme-toggle
└── ui/                        ← restyled shadcn primitives (button, card, badge)
lib/                           ← utils (cn), tokens
e2e/                           ← Playwright shell spec
```

> DB credentials are **never** committed; `.env*` is gitignored. No `DATABASE_URL`
> is used in Slice 1.

---

## Documentation map

This project uses **living technical documentation**. Every workflow and
technical decision is documented phase/version-wise. **No feature is complete
until its docs and handoff are updated.**

```
projects/pepper-st-dashboard/
├── CONTEXT.md                         ← domain glossary (read first)
├── README.md                          ← this file
├── base-dashboard-app/                ← Next.js app (Slice 1 shell)
└── docs/
    ├── product/
    │   ├── 00-product-vision.md
    │   ├── 01-users-and-roles.md
    │   ├── 02-core-flows.md
    │   ├── 03-feature-scope.md
    │   └── 04-prd-first-slice.md
    ├── architecture/
    │   ├── 00-overview.md             ← system context & boundaries
    │   ├── 01-data-model.md           ← entities, relationships, constraints
    │   ├── 02-schema-proposal.sql.md  ← reviewable SQL (DO NOT APPLY)
    │   ├── 03-agno-mapping.md         ← ai.agno_sessions → dashboard mapping
    │   ├── 04-multitenancy.md         ← tenant isolation strategy
    │   └── 05-tech-stack.md           ← locked stack (Next/TS/Tailwind/shadcn/Drizzle/Zod)
    ├── adr/
    │   ├── 0001-technical-baseline.md
    │   ├── 0002-multitenancy-model.md
    │   ├── 0003-agno-session-mapping-and-conversation-grain.md
    │   ├── 0004-read-only-agno-transcript.md
    │   ├── 0005-pii-phone-masking.md
    │   ├── 0006-query-level-retention.md
    │   ├── 0007-phase-1-real-data-only.md
    │   ├── 0008-future-tenant-source-contract.md
    │   └── 0009-live-handover-and-transcript-ownership.md
    ├── workflows/
    │   ├── 01-tenant-onboarding.md
    │   ├── 02-tenant-channel-customer-conversation-mapping.md
    │   ├── 03-agno-transcript-rendering.md
    │   ├── 04-agno-session-indexing-mapping.md
    │   ├── 05-analytics-filter.md
    │   ├── 06-retention-access-limit.md
    │   ├── 07-pii-phone-masking.md
    │   ├── 08-future-whatsapp-live-human-chat.md
    │   ├── 09-future-tenant-source-contract.md
    │   ├── gate-0-subagent-readiness.md          ← coordination (Gate 0)
    │   ├── phase-1-slice-workflow.md             ← coordination
    │   ├── schema-migration-review-workflow.md   ← coordination (Gate 2)
    │   └── qa-handoff-workflow.md                ← coordination
    ├── phases/
    │   ├── phase-1.md
    │   ├── phase-1-implementation-plan.md
    │   └── roadmap.md
    ├── changelog/
    │   └── technical-decision-log.md
    ├── handoff/
    │   └── 2026-06-15-stage-1-bootstrap.md
    ├── agents/                                   ← project-scoped agent coordination
    │   ├── README.md
    │   └── agent-boundaries.md
    └── templates/                                ← slice / QA / migration templates
        ├── slice-plan-template.md
        ├── slice-handoff-template.md
        ├── qa-report-template.md
        └── migration-proposal-template.md
```

---

## Source inputs (reference only)

- **Live data source:** `ai.agno_sessions` (PostgreSQL 16.9, schemas `ai` +
  `public`). Read-only. See `docs/architecture/03-agno-mapping.md`.
- **UI prototype:** `demo_site/bloomwire ai chat designs/` (at repo root).
  A clickable **"Bloomwire"** mock — its **visual system is reused**, but its
  branding, people, and **all sample numbers/records are dummy** and must not be
  treated as real data. PEPPER ST. is the real tenant.

---

## Key locked decisions (summary)

1. One Agno row (per phone) = one **rolling** Conversation (per-visit split parked).
2. **No faked AI fields** — show only real Agno data in Phase 1.
3. Nav = Dashboard + Chat Monitor + Analytics; other prototype screens hidden.
4. **Mask phone numbers** by default; `session_id` is sensitive PII.
5. Retention is controlled by **explicit tenant entitlements**:
   `raw_history_retention_days` + `analytics_retention_days`. **`NULL` = unlimited.**
   **PEPPER ST. = enterprise / unlimited.** Any future 30-day standard plan must be
   **explicitly configured during onboarding** — it is **not** a hidden DB default.
   Enforced at **query level**; never delete Agno rows.
6. **Tenant support mandatory** from day one (auth parked).
7. Same DB, separate **`dashboard`** schema, `app_` prefix; no tenant/channel-specific tables; no message duplication.
8. **Living docs** required; handoff + decision log kept current.
9. **Stack locked:** Next.js + TypeScript + Tailwind + **shadcn/ui** (restyled to
   match the demo, not its default theme) + **Drizzle ORM** + PostgreSQL + **Zod**.
   Migrations are **Drizzle migrations**; the SQL doc is the review artifact; raw
   `pg` is only Drizzle's driver.
10. **Live human handover is Phase 2 (mandatory)**; the **canonical transcript stays
    upstream** (Agno/WhatsApp) — the dashboard stores handover/control/send-status
    **metadata only**, no message duplication without a dedicated ADR (ADR-0009).

Full rationale: `docs/adr/` and `docs/changelog/technical-decision-log.md`.

---

## How to work in this project

- Read `CONTEXT.md`, then the relevant `docs/` area, before proposing changes.
- Respect the boundary: **never** write to `ai.agno_*`; **never** copy raw
  messages; **always** scope operational data by `tenant_id`.
- Update the matching workflow/ADR/decision-log entry as part of any change.
- Nothing in `docs/architecture/02-schema-proposal.sql.md` is applied until a
  separate, explicit migration approval.
