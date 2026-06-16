# Handoff — Slice 12D-D: Dashboard v2 Schema Simplification

- **Date:** 2026-06-16
- **Status:** ✅ DONE — migration **APPLIED to the live DB** (product-approved); all checks PASS.
- **Decision:** ADR-0012 · **Log:** TD-072 · **DB review:** `docs/database/08-dashboard-v2-schema-simplification.md`

## What & why

The dashboard kept a v1 **customer/identity model** (`app_customers`, `app_customer_identities`, and the
`app_conversations.customer_id` / `customer_identity_id` FK columns) that **duplicated** data the AI
platform owns (`ai.agno_sessions.user_id` / `ai.customers`) and that **no read path used** — Chat Monitor,
Analytics, and the Dashboard already source the contact from `app_conversations.external_contact_id`
(masked) and the link key from `agno_session_id`. This slice removes the dead model so the dashboard stores
only what it owns. **The dashboard now owns exactly 4 tables.**

## Files changed

**Schema / code**
- `lib/db/schema.ts` — removed `appCustomers` + `appCustomerIdentities` tables and their inferred types;
  slimmed `appConversations` (dropped `customerId` / `customerIdentityId` columns + the
  `app_conv_customer_idx` / `app_conv_identity_idx` indexes); kept `externalContactId` + the
  agno-unique / status / tenant-last / contact constraints; header now says 4 tables.
- `lib/agno/mapping.ts` — `ConversationIds` no longer carries `customerId` / `customerIdentityId`.
- `lib/agno/sync.ts` — removed `findOrCreateIdentity` + the `customersCreated` / `identitiesCreated`
  counters; sync now does **one upsert per Agno session** keyed by `(tenant, channel, agno_session_id)`
  with `external_contact_id` by value.

**Tests / verifiers**
- `lib/db/schema.test.ts` — 4-table ALLOWED set; `app_customers` / `app_customer_identities` moved to
  FORBIDDEN; `app_conversations` FK test = tenant+channel only; new asserts (no `customer_id` /
  `customer_identity_id` columns; `external_contact_id` text NOT NULL).
- `lib/agno/mapping.test.ts` — `buildConversationValues` carries no customer/identity ids.
- `lib/db/migration.test.ts` — kept-table set + **new DROP-migration assertions** (drops both tables + both
  columns; still never touches `ai.*`).
- `scripts/verify.ts`, `scripts/agno-verify.ts` (contact-on-conversation invariant), `scripts/db-discovery.ts`.

**Migration / safety**
- `drizzle/0001_clumsy_rawhide_kid.sql` (generated, then hardened with `IF EXISTS` on the FK drops) +
  `drizzle/meta/*` snapshot.
- `.gitignore` — exclude `/pepper-db-review.sql`, `/backups/`, `*.dump` (raw PII); migrations stay committed.

**Docs**
- ADR-0012 (new); ADR-0003 + ADR-0011 supersede notes; `docs/database/03` (contract), `docs/database/07`
  (forward note), `docs/database/08` (new review); `docs/changelog/technical-decision-log.md` (TD-072);
  `docs/phases/phase-1-post-acceptance-hardening.md`; `docs/workflows/02` + `docs/workflows/04`;
  `docs/product/01-users-and-roles.md`; `docs/templates/migration-proposal-template.md`; `CONTEXT.md`.

## Tests run (all PASS)

- `npm run db:migrate` → applied `0001` to the live DB; live state confirmed (4 tables; columns dropped;
  `external_contact_id` kept).
- `db:agno:reconfirm` (read-only, no writes), `db:agno:verify`, `db:chat:verify`, `db:analytics:verify`
  (parity exact: conv 4 / turns 38 / messages 110 / tokens 828,005 / cost $0.077716308).
- `npm run typecheck` clean · `npm run test` **138/138** · `npm run build` green.
- Browser smoke (prod server `:3210`): Dashboard / Analytics / Chat Monitor render, masked, **no raw
  phone/session** in HTML or API; only a cosmetic `favicon.ico` 404.

## Risks / notes

- **Destructive on a live shared DB** — mitigated by: full backup (`backups/2026-06-16-dashboard-pre-12dd.sql`),
  explicit approval gate, `ai.*` untouched, idempotent (`IF EXISTS`) drops, and full post-apply re-verify.
- **Rollback:** `DROP SCHEMA dashboard CASCADE;` then restore the backup (see `docs/database/08` §6).
- **Stale dev servers** from earlier sessions may still be running on `:3000` / `:3100`; the authoritative
  verification used a fresh production server on `:3210`.
- **`DATABASE_URL`** uses the `postgresql+psycopg://` scheme — `pg` / `drizzle-kit` handle it, but `pg_dump`
  needs it normalized to `postgresql://` (done in the backup step).

## Next

- **STOP.** Per the slice request, do **not** start Slice 12C filter/loading UX (already shipped) or any
  other slice without explicit approval. Optional follow-ups remain approval-gated (12B/12E/12F/12G).
