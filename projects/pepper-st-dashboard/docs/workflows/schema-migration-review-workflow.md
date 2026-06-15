# Workflow — Schema Migration Review (PEPPER ST., Gate 2)

- **Type:** project coordination workflow
- **Owner:** `solution-architect-agent` (reviews); `fullstack-builder-agent` (authors).
- **Related:** `docs/architecture/02-schema-proposal.sql.md`,
  `docs/architecture/05-tech-stack.md`, `docs/phases/phase-1-implementation-plan.md`
  (Slice 2), `docs/templates/migration-proposal-template.md`.

## Entry condition

Slice 2: a Drizzle schema + generated migration **proposal** is ready for review.
**Nothing is applied** during this workflow.

## Steps

1. Author the **Drizzle schema** to match `02-schema-proposal.sql.md` (the review
   artifact): the **6** `dashboard.app_*` tables with exact constraints/indexes.
2. Generate migration files (`drizzle-kit`) **for review only**.
3. **Parity check** (diff generated SQL vs `02-schema-proposal.sql.md`): expect 6
   tables; **entitlements explicit** (no hidden defaults); nullable retention
   (`IS NULL OR > 0`); `app_tenants.timezone`; `1:1` entitlements.
4. Confirm **no FK** from `dashboard.*` into `ai.*`; **no forbidden tables**.
5. Fill `migration-proposal-template.md` and present for **Gate 2 approval**.

## Approval gate

**Gate 2** — explicit human approval to apply. Apply + seed happen in **Slice 3**, only
**after** approval.

## Validation

Parity table (Drizzle vs SQL) attached; no forbidden tables; no `ai.*` DDL; **nothing
applied yet**.

## Handoff output

A filled `migration-proposal-template.md`, the parity result, and an explicit
"**not applied**" statement.

## Stop conditions

- Any mismatch with the SQL proposal → fix **before** requesting approval.
- Any attempt to apply or seed before Gate 2 → **stop**.
