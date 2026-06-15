# Architecture 05 — Tech Stack (Locked)

- **Project:** pepper-st-dashboard
- **Status:** Phase 1 — **STACK LOCKED**; **app shell scaffolded (Slice 1, `base-dashboard-app/`)**. Deps install on `npm install`.
- **Last updated:** 2026-06-15
- **Related:** ADR-0001

> The stack below is **locked**. It was fixed during the docs-first bootstrap (no code
> then); **Slice 1 has since scaffolded the app shell** against it. Data-layer work
> still waits for the schema migration approval gate (Gate 2).

## Constraints driving the choice

- Must **read PostgreSQL** server-side (Agno lives in PG) → needs a backend/server
  runtime; a purely static site is insufficient.
- Must render the prototype's look **closely** (palette, spacing, radius, shadows,
  typography — Plus Jakarta Sans + JetBrains Mono).
- Must be **tenant-scoped**, testable, and easy to hand off.
- This project deliberately locks a richer stack than the lightweight repo
  samples (todo-app, service-booking-manager) because of the PG + multi-tenant
  + typed-data requirements.

## Locked baseline

| Layer | Choice | Rationale |
|---|---|---|
| Language | **TypeScript** | Type-safe mapping/transcript logic end to end |
| Framework | **Next.js (latest, App Router)** | Server components for safe server-side PG reads; route handlers; simple deploy |
| Styling | **Tailwind CSS** with the prototype's tokens mapped into the Tailwind theme | Reproduce the demo palette/spacing/radius/shadow/type closely |
| UI components | **shadcn/ui** (Radix + Tailwind) | Accessible primitives we **restyle** to the demo; not used with default theme |
| DB access | **Drizzle ORM** (typed schema + queries) | Typed, reviewable data access over PostgreSQL; tenant-scoped helpers |
| Migrations | **Drizzle migrations (`drizzle-kit`)** generated from the Drizzle schema | Single source of truth = Drizzle schema; SQL proposal is the review artifact |
| Driver | **`pg`** (indirect, under Drizzle only) | Drizzle's Postgres driver — **not** a hand-rolled query layer |
| Validation | **Zod** | Validate inputs/filters (date ranges, params) and parse Agno JSON shapes |
| DB | **PostgreSQL** (same instance as Agno; new `dashboard` schema, read-only to `ai.*`) | Reuse the existing database |
| Testing | **Vitest** (unit: transcript/masking/tenancy/retention) + **Playwright** (UI flows) | Typed tests; UI coverage |
| Deploy | TBD (Vercel-style or self-host) | Decide at build gate |

## Data access: Drizzle ORM (not raw `pg`)

The core logic is **read-only mapping + JSON transcript assembly**. Drizzle gives
a **typed schema** (the source of truth for migrations) and **typed, reviewable
queries**, while still emitting plain SQL we can inspect. Raw `pg` is present
**only** as the driver Drizzle uses; we do **not** write a bespoke `pg` query
layer. The hand-written SQL in `02-schema-proposal.sql.md` remains the
**review artifact**, and the Drizzle schema is authored to match it.

## UI fidelity: shadcn/ui must match the demo, not override it

- The dashboard must **visually match the demo UI closely** — same colors,
  layout, spacing, radius, shadows, and typographic feel.
- shadcn/ui provides **behavioral/accessible primitives**; every component is
  **restyled with the prototype's design tokens**. The default shadcn theme is
  **not** adopted as-is.
- Prototype tokens (e.g. AI violet `#7c3aed`, brand rose `#be185d`, WhatsApp
  green `#25d366`, radius ~14px, Plus Jakarta Sans + JetBrains Mono) are mapped
  into the Tailwind theme / CSS variables and reused across shadcn components.
- PEPPER ST. branding replaces Bloomwire; the **visual system is preserved**.

## Security/PII notes for the stack

- Masking happens in a **shared util** used by both UI and logging; raw phone is
  never logged.
- DB credentials via environment variables only (never committed). The Agno
  connection string is treated as a secret.
- All Agno access is **read-only** (consider a read-only DB role in production).

## Open questions for the gate

1. ~~Stack choice~~ — **locked**: Next.js + TypeScript + Tailwind + shadcn/ui +
   Drizzle ORM + PostgreSQL + Zod.
2. ~~Migration approach~~ — **locked**: Drizzle migrations (`drizzle-kit`); the
   SQL proposal stays as the review artifact.
3. Confirm **deploy target** (Vercel-style vs self-host).
4. ~~Confirm how prototype tokens are carried into Tailwind~~ — **resolved (Slice 1)**:
   demo tokens are CSS variables in `app/globals.css` referenced by `tailwind.config.ts`
   (`theme.extend`); shadcn primitives are restyled to them; fonts via Google Fonts
   `<link>` (Plus Jakarta Sans + JetBrains Mono).
