# ADR-0012 — Dashboard v2 schema simplification (drop the customer/identity model)

- **Status:** **Accepted** (Slice 12D-D). Migration `0001_clumsy_rawhide_kid.sql` **applied to the live
  `papper` DB on 2026-06-16** with explicit product approval, after a full backup. Verified green by all
  read-only verifiers + browser smoke.
- **Date:** 2026-06-16
- **Supersedes:** ADR-0011's "**no dashboard schema migration is required**" verdict and its retention of
  `app_customer_identities`; ADR-0003 **§4** ("a conversation also stores `customer_identity_id`").
- **Related:** ADR-0001 (read-and-organize, link by value), ADR-0003 (session mapping & grain — grain
  stands), ADR-0004 (read-only transcript — unchanged), ADR-0005 (phone masking — unchanged), ADR-0011
  (Agno v2 recoupling), `docs/database/03` (contract), `docs/database/07` (old-vs-current),
  `docs/database/08` (this slice's review).

## Context

ADR-0011 re-coupled the dashboard to Agno v2 **behind the mapping seam** and concluded that the existing
schema already carried the three v2 identifiers, so **no migration was needed**. That left the dashboard
owning a **CRM-style contact model** inherited from v1:

- `dashboard.app_customers` (a tenant-scoped end customer; `display_name` always NULL — Agno has no name),
- `dashboard.app_customer_identities` (the contact-on-channel; `(tenant_id, channel_id, external_contact_id)` unique),
- and two FK columns on `app_conversations`: `customer_id` + `customer_identity_id`.

Review for Slice 12D-D found this model is **pure duplication with no Phase-1 consumer**:

1. **The AI platform owns the contact registry.** `ai.agno_sessions.user_id` (and `ai.customers` on the
   platform side) is the canonical contact. The dashboard's `app_customers`/`app_customer_identities`
   re-store the same WhatsApp phone the dashboard doesn't own.
2. **Nothing reads them.** Every read surface — Chat Monitor (`getConversationList` /
   `getConversationTranscript`), Analytics (`getAnalyticsData` + universe helpers), and the Dashboard —
   sources the contact from **`app_conversations.external_contact_id`** (masked on read) and the link key
   from `app_conversations.agno_session_id`. No code path joins `app_customers` or
   `app_customer_identities`.
3. **They cost complexity + a second PII store.** Sync ran a find-or-create against the identity table on
   every session (extra FKs, extra writes), and the tables held **13 v1-leftover rows of raw phone PII**
   referenced only by archived conversations.
4. **"New vs returning" needs no identity table.** Analytics derives new/returning by
   `external_contact_id` over `app_conversations` (first-seen-in-range), which is independent of the
   dropped tables.

This contradicted the project goal of a **clean, AI-navigable schema that stores only what the dashboard
owns** (ADR-0001).

## Decision

**Remove the duplicate customer/identity model from the dashboard.** The contact lives **by value** on the
conversation index — exactly like `agno_session_id` — and the AI platform remains the registry of record.

1. **Drop** `dashboard.app_customers` and `dashboard.app_customer_identities`.
2. **Drop** `app_conversations.customer_id` and `app_conversations.customer_identity_id` (+ their FKs and
   the `app_conv_customer_idx` / `app_conv_identity_idx` indexes).
3. **Keep** `app_conversations.external_contact_id` (TEXT, **NOT NULL**, **indexed but not unique**) as the
   single, masked-on-read contact source.
4. **Grain unchanged (ADR-0003 §1):** one Agno session = one `app_conversations` row, unique on
   `(tenant_id, channel_id, agno_session_id)`. One contact → many sessions → many conversations (the
   `external_contact_id` index stays non-unique).
5. **Sync simplified:** map each live `ai.agno_sessions` row to exactly one `app_conversations` row keyed
   by `(tenant, channel, agno_session_id)` with `external_contact_id` derived from `user_id`. No
   find-or-create; no customer/identity rows; no `customersCreated`/`identitiesCreated` counters.

## Consequences

- **Dashboard schema = 4 tables:** `app_tenants`, `app_channels`, `app_conversations`,
  `app_tenant_entitlements`.
- **No surface behaviour change.** Chat Monitor, Analytics, and the Dashboard already read
  `external_contact_id`; verifiers and browser smoke confirm identical masked output, transcript reads
  from `ai.agno_sessions.runs`, and exact analytics parity (conv 4 / turns 38 / tokens 828,005 / cost
  $0.077716308).
- **Boundaries preserved:** `ai.*` strictly read-only and untouched by the migration; transcript boundary
  (ADR-0004) intact (still no `app_conversation_messages`, no message content in `dashboard.*`); masking
  (ADR-0005) intact; link stays **by value** (no cross-schema FK).
- **PII surface reduced:** one fewer dashboard store of raw phones; the 13 v1-leftover identity PII rows
  are gone.
- **Supersedes** ADR-0011's no-migration verdict (this slice *does* migrate — to *simplify*, not to
  re-add data) and ADR-0003 §4 (the `customer_identity_id` link no longer exists).

## Migration & safety

- **Artifact:** `drizzle/0001_clumsy_rawhide_kid.sql` — `DROP TABLE … CASCADE` ×2, `DROP CONSTRAINT IF
  EXISTS` ×2 (hardened: the explicit FK drops are idempotent because the preceding `CASCADE` already
  removes them), `DROP INDEX IF EXISTS` ×2, `DROP COLUMN IF EXISTS` ×2. DDL-only; **no `INSERT`; no `ai.*`
  reference**. Locked by `lib/db/migration.test.ts`.
- **Backup (rollback source):** `backups/2026-06-16-dashboard-pre-12dd.sql` (full `dashboard` schema DDL +
  data, gitignored as raw PII).
- **Rollback:** `DROP SCHEMA dashboard CASCADE;` then restore from the backup. `ai.*` is unaffected
  throughout, so no transcript/session data is ever at risk.

## Alternatives considered

- **Keep the tables but stop writing them (dead schema):** rejected — leaves a duplicate PII store and a
  misleading data contract; the opposite of the clean-schema goal.
- **Drop `external_contact_id` too and join `ai.*` for the contact on every read:** rejected — breaks the
  by-value, low-coupling read path (ADR-0001) and would add a per-read cross-schema dependency just to
  render a masked label.
- **Defer past Phase 1:** rejected — the duplicate model was actively confusing the contract docs and
  blocking the agreed simplification.
