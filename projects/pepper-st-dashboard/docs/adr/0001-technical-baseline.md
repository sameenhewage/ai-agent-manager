# ADR-0001 — Technical Baseline

- **Status:** Accepted (Phase 1 baseline; **stack locked** 2026-06-15)
- **Date:** 2026-06-15
- **Related:** ADR-0002..0008, `docs/architecture/`

## Context

We are building a multi-tenant SaaS dashboard over an existing Agno WhatsApp AI
agent that stores sessions in PostgreSQL (`ai.agno_sessions`). Stage 1 inspection
showed the bot's data is thin (no `metadata`/`summary`), `session_id` is the
phone number and a global PK, timestamps are epoch seconds, and a session is a
rolling thread. The dashboard must read this data, organize it per tenant, and
never duplicate or mutate it.

## Decision

1. **Same database, new `dashboard` schema, `app_` table prefix.** Keep dashboard
   tables separate from `ai.*`; no cross-schema FKs into `ai.*`.
2. **Read-and-organize only.** The dashboard reads `ai.agno_sessions`; it never
   writes to `ai.*` and never copies raw messages.
3. **Tenant-scoped from day one** (see ADR-0002).
4. **Show only real data in Phase 1** (see ADR-0007).
5. **Locked app stack:** **TypeScript + Next.js (latest, App Router)** for safe
   server-side PG reads; **Tailwind CSS + shadcn/ui** restyled to the prototype
   tokens (UI must match the demo closely, not the default shadcn theme);
   **Drizzle ORM** over **PostgreSQL** for typed data access with **Drizzle
   migrations (`drizzle-kit`)**; **Zod** for validation; **Vitest + Playwright**
   for tests. Raw `pg` is used **only** as Drizzle's driver, not as the data layer.
   The hand-written SQL in `02-schema-proposal.sql.md` stays as the **review
   artifact**; the Drizzle schema is authored to match it
   (`docs/architecture/05-tech-stack.md`).
6. **Docs-first.** Living documentation precedes code; migrations are applied only
   after a separate approval gate.

## Consequences

- A backend/server runtime is required (static-only is insufficient for PG reads).
- Transcript assembly + masking + tenancy live in a typed, testable data layer.
- The dashboard remains resilient to Agno changes because coupling is by value
  (`agno_session_id`) and read-only.

## Alternatives considered

- **Separate database** for dashboard: rejected — Agno data is in the same PG and
  cross-DB reads add ops complexity for no Phase 1 benefit.
- **Raw `pg` query layer / plain-SQL migrations as the app strategy**: rejected —
  **Drizzle ORM** gives typed schema + queries and owns migrations; `pg` stays an
  indirect driver. **Prisma**: rejected in favour of Drizzle's lighter,
  SQL-transparent model.
- **Static site + client-side DB calls**: rejected — credentials/PII exposure and
  no server-side masking/retention enforcement.
