# Architecture 01 — Data Model

- **Project:** pepper-st-dashboard
- **Status:** Phase 1 (docs-first) — proposal
- **Last updated:** 2026-06-15

Logical model for the `dashboard` schema. Physical SQL is in
`02-schema-proposal.sql.md` (reviewable, **not applied**). Mapping to Agno is in
`03-agno-mapping.md`.

## Entities and relationships

```
app_tenants 1───* app_channels
     │                  │
     │                  │ (channel)
     1                  │
     *                  │
app_customers 1───* app_customer_identities *───1 app_channels
     │                                                │
     │                                                │
     1                                                │
     *                                                │
app_conversations *──────────────────────────────────1 app_channels
     │
     └─ agno_session_id ──► ai.agno_sessions.session_id   (external, read-only)

app_tenants 1───1 app_tenant_entitlements
```

- A **tenant** has many **channels**, **customers**, **conversations**, and
  **exactly one** current entitlement row (`app_tenant_entitlements`, **1───1**).
  Plan/subscription history is parked.
- A **customer** has many **identities** (one per channel/contact id) and many
  **conversations**.
- A **conversation** belongs to one tenant + one channel + one customer + one
  **customer identity** (`customer_identity_id`) and references exactly one Agno
  session by `agno_session_id`.

## Entity summaries

### app_tenants
The business/client. Root of all scoping. Carries **lifecycle** state and a
**`timezone`**.
Key fields: `id`, `name`, `slug` (unique), `status` (`active`/`suspended`/
`archived`), `onboarding_status` (`pending`/`in_progress`/`complete`),
`timezone` (default `Asia/Colombo`; drives the Today/Month/Custom analytics
boundaries — future tenants may be in other countries), `created_at`,
`updated_at`.
**Never** carries `session_id` (a tenant is not a chat session).

### app_channels
A tenant's source/integration (Phase 1: WhatsApp). Carries a stable
**`channel_key`** and **source-mapping** fields binding the dashboard to the
upstream bot: `source_agent_id`, `source_team_id`, `external_business_id`,
`external_phone_number_id`.
Key fields: `id`, `tenant_id`, `type`, `channel_key`, `display_name`,
source-mapping fields, `is_active`, `created_at`, `updated_at`.
Unique: **`(tenant_id, channel_key)`** — deliberately **not** `(tenant_id, type)`,
so a tenant can have **more than one** WhatsApp channel later.

### app_customers
A tenant-scoped end customer (person).
Key fields: `id`, `tenant_id`, `display_name` (nullable — Agno has no name),
`created_at`, `updated_at`.

### app_customer_identities
Links a customer to an external contact id on a channel.
Key fields: `id`, `tenant_id`, `customer_id`, `channel_id`,
`external_contact_id` (text, the phone in Phase 1), `created_at`.
Unique: `(tenant_id, channel_id, external_contact_id)`.

### app_conversations
The Agno↔dashboard mapping record. **No message bodies.**
Key fields: `id`, `tenant_id`, `customer_id`, `customer_identity_id`,
`channel_id`, `agno_session_id` (text → `ai.agno_sessions.session_id`),
`external_contact_id` (cached), `status` (dashboard-owned, one of
`open`/`resolved`/`archived` — CHECK-constrained), `first_at`, `last_at`,
`created_at`, `updated_at` (bumped when mapping refreshes `last_at`/`status`).
Unique: **`(tenant_id, channel_id, agno_session_id)`** only.
`external_contact_id` is **indexed, not unique** (one contact may own several
conversations once sessions diverge from the phone — ADR-0008).

### app_tenant_entitlements
The tenant's **current access/entitlement** configuration (renamed from
`app_subscription_limits`) — **not** a finalized pricing/billing model (pricing is
parked; the internal team decides it later). **One current row per tenant**
(`UNIQUE (tenant_id)`, **1:1**); access/retention changes are in-place updates
(bump `updated_at`), not new rows.
Key fields: `id`, `tenant_id`, `plan_code` (non-final label, e.g.
`standard`/`enterprise`), `is_fully_enabled` (enterprise/full-access flag),
`raw_history_retention_days`, `analytics_retention_days`, `created_at`,
`updated_at`. **Retention columns are nullable: `NULL` = unlimited** (enterprise /
fully enabled). **No hidden product defaults:** `plan_code` and `is_fully_enabled`
are `NOT NULL` with **no default** (set explicitly at onboarding); retention columns
have **no default** (omit → `NULL` → unlimited). Plan/subscription history is parked.

## Identifiers and types

- All ids: surrogate UUID primary keys (`id`).
- `agno_session_id`, `external_contact_id`: **text** (never numeric; never assume
  `94` prefix), even though demo data is all phone numbers.
- Timestamps in `dashboard.*`: `timestamptz`. Agno epoch-second values are
  converted on read (`to_timestamp(...)`).

## Constraints and indexes (logical)

| Table | Unique | Helpful indexes |
|---|---|---|
| app_tenants | `slug` | — |
| app_channels | `(tenant_id, channel_key)` | `tenant_id` |
| app_customers | — | `tenant_id` |
| app_customer_identities | `(tenant_id, channel_id, external_contact_id)` | `customer_id` |
| app_conversations | `(tenant_id, channel_id, agno_session_id)` | `(tenant_id, last_at DESC)`, `customer_id`, `customer_identity_id`, `(tenant_id, channel_id, external_contact_id)` *(non-unique)* |
| app_tenant_entitlements | `(tenant_id)` *(1:1 per tenant)* | `tenant_id` |

All FKs reference `app_tenants(id)` (and parent rows) with `tenant_id` carried
explicitly for scoping and composite uniqueness.

## Why `agno_session_id` and `external_contact_id` are separate fields

In Phase 1 they hold the **same value** (the phone). They are modelled
separately because in production the Agno session id **must** become
tenant/channel-scoped or globally unique (see ADR-0008), at which point the
session id and the contact id diverge. Separate fields avoid a migration later.

## What this model deliberately excludes

- No `messages`/`runs` tables (no transcript duplication).
- No `intent`, `summary`, `confidence`, `priority`, `business_category`,
  issue/exchange/follow-up tables (no Agno source; parked).
- No tenant-specific or channel-specific tables (`whatsapp_customers`, etc.).
