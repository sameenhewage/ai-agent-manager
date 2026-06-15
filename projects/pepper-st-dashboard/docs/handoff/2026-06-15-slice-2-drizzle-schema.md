# Slice Handoff — Slice 2: Drizzle schema + migration proposal

- **Date:** 2026-06-15
- **Owner (global agents):** `solution-architect-agent` (authors/reviews schema),
  `fullstack-builder-agent` (implements)
- **Status:** complete — **PROPOSED, not applied**. Typecheck + tests + build green (Node 20).
- **Workflows:** `docs/workflows/schema-migration-review-workflow.md`,
  `docs/workflows/phase-1-slice-workflow.md`

## What shipped

The dashboard-owned **Drizzle ORM schema** and a **generated migration SQL proposal**
for the `dashboard` schema, authored to match `docs/architecture/02-schema-proposal.sql.md`
exactly. **Nothing was applied**; no database connection was made. All work is inside
`base-dashboard-app/`.

- 6 tables: `app_tenants`, `app_channels`, `app_customers`, `app_customer_identities`,
  `app_conversations`, `app_tenant_entitlements` — all in the `dashboard` schema.
- Migration SQL generated for review only: `drizzle/0000_perpetual_james_howlett.sql`.
- TDD schema-shape spec + migration-artifact spec lock the contract in CI.

## Skills followed

- **`tdd`** — `.claude/skills/tdd/SKILL.md`
  - How applied: wrote `lib/db/schema.test.ts` **first** (RED — suite failed to load
    `./schema`), then implemented `lib/db/schema.ts` to GREEN; added
    `lib/db/migration.test.ts` against the generated SQL.
  - Proof/result: `schema.test.ts` 16/16, `migration.test.ts` 14/14, total **39/39** tests pass.
- **`review`** — `.claude/skills/review/SKILL.md`
  - How applied: reviewed the generated SQL on two axes — **Spec** (parity vs
    `02-schema-proposal.sql.md`) and **Standards** (Drizzle conventions, naming, no
    forbidden tables, no `ai.*` FK). Documented in the Gate 2 parity table.
  - Proof/result: parity table all ✓ in `docs/architecture/migration-proposal-0000.md`.
- **`handoff`** — `.claude/skills/handoff/SKILL.md`
  - How applied: this document + decision-log + plan updates.
  - Proof/result: this file; TD-046/047; plan Slice 2 status.
- **`setup-matt-pocock-skills`** — `.claude/skills/setup-matt-pocock-skills/SKILL.md`
  - How applied: verified the **root** skills config (AGENTS.md/CLAUDE.md `## Agent
    skills` + `docs/agents/{issue-tracker,triage-labels,domain,skill-alignment}.md`)
    is present before starting; **did not duplicate** governance into project docs.
  - Proof/result: root governance intact; no project-scoped skills doc added.
- **`diagnose`** — `.claude/skills/diagnose/SKILL.md`
  - How applied: **not run as a loop.** One `tsc` error (a type-predicate on Drizzle's
    precisely-typed export union) had an immediately clear root cause; fixed in one line
    (narrow from `unknown[]`). Per instruction, `diagnose` is only for real failures.
  - Proof/result: typecheck clean after the one-line fix.

## Files created/changed

**Created (`base-dashboard-app/`):**
- `lib/db/schema.ts` — Drizzle schema (6 `dashboard.app_*` tables; inferred row types).
- `lib/db/schema.test.ts` — schema-shape spec (16 tests).
- `lib/db/migration.test.ts` — generated-SQL guardrail spec (14 tests).
- `drizzle.config.ts` — **generate-only** config (no `dbCredentials`).
- `drizzle/0000_perpetual_james_howlett.sql` + `drizzle/meta/*` — generated migration (review artifact).

**Modified:**
- `base-dashboard-app/package.json` — added `drizzle-orm` (dep), `drizzle-kit` (dev),
  scripts `db:generate` + `db:check`. **No** `migrate`/`push` script; **no** DB driver.

**Docs:**
- This handoff; `docs/architecture/migration-proposal-0000.md` (Gate 2 package);
  `docs/architecture/02-schema-proposal.sql.md` (Drizzle parity note);
  `docs/phases/phase-1*.md` (Slice 2 status); `docs/changelog/technical-decision-log.md` (TD-046/047).

## Drizzle schema summary

| Table | Key constraints (matching proposal) |
|-------|-------------------------------------|
| `app_tenants` | PK uuid; `slug` UNIQUE; `name` NOT NULL (not unique); `timezone` NOT NULL default `Asia/Colombo`; status/onboarding CHECKs |
| `app_channels` | FK→tenants (cascade); UNIQUE `(tenant_id, channel_key)` (NOT `(tenant_id,type)`); index `(tenant_id)` |
| `app_customers` | FK→tenants (cascade); `display_name` nullable; index `(tenant_id)` |
| `app_customer_identities` | FK→tenants/customers/channels; UNIQUE `(tenant_id, channel_id, external_contact_id)`; index `(customer_id)` |
| `app_conversations` | FK→tenants/customers/customer_identities/channels (**4 FKs**); `agno_session_id` text **no FK**; UNIQUE `(tenant_id, channel_id, agno_session_id)`; status CHECK; indexes incl. `(tenant_id, last_at DESC)` |
| `app_tenant_entitlements` | FK→tenants; UNIQUE `(tenant_id)` (1:1); `plan_code`/`is_fully_enabled` NOT NULL **no default**; retention nullable **no default**; `IS NULL OR > 0` CHECKs |

## Migration SQL summary

`drizzle/0000_perpetual_james_howlett.sql` (DDL only): `CREATE SCHEMA "dashboard"` → 6
`CREATE TABLE IF NOT EXISTS "dashboard"."app_*"` → 10 FK `ALTER TABLE` (idempotent
`DO $$ … duplicate_object` blocks) → 8 `CREATE INDEX`. **No `INSERT`/seed. No `ai.*`
reference.** `agno_session_id` is plain `text` with no FK.

## Boundaries upheld

- **Generated only, NOT applied**; **no DB connection** (config has no `dbCredentials`;
  only `db:generate` exists — no `migrate`/`push`).
- **`ai.agno_*` untouched**; **no FK** from `dashboard.*` into `ai.*` (link by value).
- **No forbidden tables** (no `app_conversation_messages`, `app_analytics_daily`,
  pricing/subscription, auth/member/role, issue/exchange/follow-up/order) — asserted in tests.
- **No transcript duplication** (no message/transcript columns) — asserted in tests.
- **No seed** (Slice 3, post-Gate 2). **No Chat Monitor / Analytics logic.**

## Tests / typecheck / build (Node 20.20.2)

- `npm run db:generate` — ✅ 6 tables; `0000_perpetual_james_howlett.sql`.
- `npm run typecheck` — ✅ clean.
- `npm run test` — ✅ **39/39** (schema 16, migration 14, + Slice 1: tokens 2, utils 3, nav 4).
- `npm run build` — ✅ compiled; 6 static routes.

## Risks / follow-ups

- **Gate 2 required** before any apply (Slice 3). The SQL is a review artifact only.
- **Drizzle-kit conventions** vs the hand-written proposal (benign): `CREATE TABLE IF
  NOT EXISTS`, named FK constraints, FKs via `ALTER TABLE` blocks, index `DESC NULLS
  LAST`. Functionally equivalent — see parity notes.
- **npm advisories** present from the dep tree; do not `npm audit fix --force` (would
  break the locked stack). Revisit in Slice 7 hardening.
- **Node 10 default** in the shell — use Node 20 (`nvm use 20`; pinned via `.nvmrc` + `engines`).

## Gate status

- **Gate 3** (stack): ✅ locked. **Gate 0**: ✅. **Slice 1**: ✅.
- **Gate 2** (schema migration approval): **PENDING** — see
  `docs/architecture/migration-proposal-0000.md`. Apply happens only in Slice 3 after approval.

## Next allowed step

**Gate 2 review/approval** of the migration proposal. On approval → **Slice 3** (apply
migration + seed PEPPER ST. + tenant context). **Do not start Slice 3 until Gate 2 is approved.**
