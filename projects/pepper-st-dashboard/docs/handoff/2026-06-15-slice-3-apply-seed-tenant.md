# Slice Handoff — Slice 3: apply migration + seed PEPPER ST. + tenant context

- **Date:** 2026-06-15
- **Owner (global agent):** `fullstack-builder-agent`
- **Status:** complete — migration **applied** + seed **applied** to the real DB; verified.
- **Workflows:** `docs/workflows/schema-migration-review-workflow.md` (apply step),
  `docs/workflows/phase-1-slice-workflow.md`

## What shipped

The first DB-touching slice. Added server-side DB access, applied the Gate-2-approved
`0000` migration to the real database, seeded PEPPER ST. dashboard-owned metadata
(idempotent), and added a demo tenant resolver. Only `dashboard.*` is written; `ai.*` is
untouched. Secrets stay in a gitignored `.env`.

## Skills followed

- **`tdd`** — `.claude/skills/tdd/SKILL.md`
  - How: added unit tests for the seed payload shape/idempotency intent and the tenant
    resolver **before/with** the implementation; kept DB integration out of unit tests
    (a separate `db:verify` script needs `DATABASE_URL`).
  - Proof: `lib/db/seed.test.ts` (4) + `lib/tenant/context.test.ts` (2); **45/45** unit tests pass without DB.
- **`review`** — `.claude/skills/review/SKILL.md`
  - How: reviewed the apply/seed against boundaries (dashboard-only writes, no `ai.*`,
    no forbidden tables, no fabricated metrics) and confirmed via read-only `db:verify`.
  - Proof: `db:verify` — ALL CHECKS PASSED.
- **`handoff`** — `.claude/skills/handoff/SKILL.md` — this doc + decision log + plan updates.
- **`diagnose`** — `.claude/skills/diagnose/SKILL.md` — **not needed** (one trivial
  `tsx`/typecheck nit — untyped `pg` rows — fixed inline; no investigation loop).
- **`setup-matt-pocock-skills`** — referenced only to keep skills in **root** governance;
  no project-scoped skills doc created (stale "parked" wording corrected, not duplicated).

## Files created/changed

**Created (`base-dashboard-app/`):**
- `lib/db/client.ts` — server-side `pg` Pool + Drizzle client from `DATABASE_URL`; `maskDbUrl()`.
- `lib/db/seed.ts` — `PEPPER_ST_SEED` + `buildSeedPayload()` (pure) + idempotent `seedPepperSt(db)`.
- `lib/tenant/context.ts` — `getCurrentTenantSlug()` (pure) + `resolveCurrentTenant(db)`.
- `lib/db/seed.test.ts`, `lib/tenant/context.test.ts` — unit tests (no DB).
- `scripts/seed.ts`, `scripts/verify.ts` — runnable seed + read-only verification.
- `.env.example` — placeholder `DATABASE_URL` + `DEMO_TENANT_SLUG` (real `.env` is gitignored).

**Modified:**
- `drizzle.config.ts` — enable apply: env-gated `dbCredentials.url` from `DATABASE_URL`
  (+ `.env` autoload). `generate`/`migrate` only; never `push`.
- `package.json` — `+pg`, `+@types/pg`, `+tsx`; scripts `db:migrate`, `db:seed`, `db:verify`.
- Docs cleanup (stale "Skills parked/empty/optional" → factual root-governance reference,
  no duplication): `docs/agents/README.md`, `docs/workflows/gate-0-subagent-readiness.md`,
  `docs/handoff/2026-06-15-stage-1-bootstrap.md`.

## DB connection safety

- `DATABASE_URL` read from env / gitignored `.env` **only**; never hardcoded, committed, or printed.
- Connection logs are **masked**: `postgresql+...://***:***@***:5432/<db>`.
- DB code uses the Node `pg` driver (cannot be bundled client-side); no `NEXT_PUBLIC_` exposure.
- Only `generate` + `migrate` are wired (no `push`/diffing).

## Migration apply result

`npm run db:migrate` (`drizzle-kit migrate`, `pg` driver) applied `0000_perpetual_james_howlett.sql`:
created schema `dashboard` + the 6 `app_*` tables. drizzle-kit also created its standard
`drizzle.__drizzle_migrations` ledger (migration bookkeeping; outside `dashboard`, not an app table).

## Seed result

`npm run db:seed` (idempotent, `onConflictDoNothing`): PEPPER ST. tenant
(`slug=pepper-st`, `2efc97ca-57c9-419f-bc0d-aeb549fcb9e2`) + WhatsApp channel
(`whatsapp-main`, `source_agent_id=concierge`) + enterprise entitlement
(`is_fully_enabled=true`, retention `NULL`/`NULL`). Re-runnable (no duplicate rows).

## Tenant context summary

`lib/tenant/context.ts` — Phase-1 demo resolver, **server-side**: `getCurrentTenantSlug()`
returns `DEMO_TENANT_SLUG` (default `pepper-st`); `resolveCurrentTenant(db)` loads that
tenant row. Documented as a **temporary** stand-in for auth (no Clerk/Auth.js, no
member/role tables). Not yet wired into a page (that comes with Chat Monitor/Analytics).

## Verification query results (`npm run db:verify`, read-only)

ALL CHECKS PASSED: `dashboard` exists; exactly the 6 tables; no forbidden tables;
PEPPER ST. tenant ×1; `whatsapp-main` channel ×1; enterprise entitlement ×1;
`plan_code=enterprise`, `is_fully_enabled=true`, both retentions `NULL`; no `app_*`
leaked into the `ai` schema.

## Boundaries upheld

- **`ai.agno_*` untouched / `ai` schema unaltered** — all code references only `dashboard.*`;
  verify confirms no `app_*` objects in `ai`.
- **No forbidden tables** (messages/analytics_daily/pricing/subscription/auth/role/order…).
- **No transcript duplication; no Agno parser; no Chat Monitor/Analytics logic; no fake metrics.**
- **No auth system.** Slice 4 not started.

## Tests / typecheck / build (Node 20.20.2)

- `npm run typecheck` — ✅ clean
- `npm run test` — ✅ **45/45** (7 files; unit-only, no DB)
- `npm run build` — ✅ 6 routes
- `npm run db:migrate` / `db:seed` / `db:verify` — ✅ applied + seeded + verified

## Risks / follow-ups

- **`.env` holds a real secret** — gitignored; never commit. Rotate if ever exposed.
- **`drizzle.__drizzle_migrations`** ledger now exists on the DB (expected for Drizzle migrate).
- **npm advisories** persist in the dep tree; do not `npm audit fix --force` (breaks locked stack).
- **Tenant resolver** is a demo stand-in; real auth/tenant selection is a later phase.

## Gate status

- **Gate 2:** ✅ approved (applied this slice). **Gate 3/0:** ✅. **Slices 1–2:** ✅.
- **Gate 4** (per-slice QA + docs/handoff): satisfied for Slice 3.

## Next allowed step

**Slice 4 — Agno transcript parser/service** (read-only mapping of `ai.agno_sessions` →
`dashboard.app_conversations`/customers/identities). **Do not start Slice 4 until directed.**
