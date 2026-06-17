# Architecture 01 — Data Model

- **Project:** pepper-st-dashboard
- **Status:** **Historical proposal — SUPERSEDED. Do NOT use as target schema.**
- **Last updated:** 2026-06-15 (superseded 2026-06-17)

> **⛔ HISTORICAL PROPOSAL ONLY — DO NOT USE AS TARGET SCHEMA.** The target schema is
> **`docs/architecture/09-multi-business-branch-channel-strategy.md` + ADR-0016** (8 tables; conversation
> = **customer/contact thread**; provider sessions in **`app_conversation_sessions`**). Everything below
> is **Gate-1 historical design context**, superseded by ADR-0012 (customer/identity removed) and
> ADR-0015/0016 (multi-business + contact-thread). See the detailed supersession banners below.

Logical model for the `dashboard` schema. Physical SQL is in
`02-schema-proposal.sql.md` (reviewable, **not applied**). Mapping to Agno is in
`03-agno-mapping.md`.

> **⚠ SUPERSEDED IN PART (2026-06-16) — Slice 12D-D / ADR-0012.** This Gate-1 proposal modelled a
> dashboard-side **customer/identity** model. That model was **removed**: `app_customers` and
> `app_customer_identities` (and `app_conversations.customer_id` / `customer_identity_id`) **no longer
> exist**. **The dashboard owns exactly 4 tables** — `app_tenants`, `app_channels`, `app_conversations`,
> `app_tenant_entitlements`. The external contact id is stored **by value** on
> `app_conversations.external_contact_id` (indexed, **not** unique); the contact registry is AI-owned
> (`ai.customers` / `ai.agno_sessions.user_id`). The diagrams/sections below are kept as **historical
> design context** — do **not** reintroduce the customer/identity tables. Current contract:
> `docs/database/03-dashboard-data-contract.md`.

> **⚠ HIERARCHY SUPERSEDED (2026-06-16) — ADR-0015 / `architecture/09`.** This model assumes
> **`tenant → channel → conversation`** with `tenant ≈ business`. The **target** model is
> **`Tenant → Business → optional Location → Channel → Conversation → Agno Session`** (`tenant ≠
> business`): the schema grows to **7 core tables** — adding `app_businesses`, `app_locations`,
> `app_ai_agent_bindings`, `app_realtime_outbox`, plus `business_id` (required) and `location_id`
> (nullable) on `app_channels` + `app_conversations`. The 4-table description below is the **current
> implementation** (migration via expand→backfill→verify→enforce is **approval-gated / not yet
> applied**). ADR-0012's **by-value contact** principle is **kept**.

> **⚠ GRAIN REVISED (2026-06-17) — ADR-0016 / `architecture/09`.** The conversation grain is now the
> **customer/contact thread** (one `app_conversations` row **per contact**), **not** one row per Agno
> session. `agno_session_id` **moves off** `app_conversations` to **`app_conversation_sessions`**
> (`external_session_id` == `ai.agno_sessions.session_id` by value, no FK). Full target schema = **8
> tables**. **Supersedes `1 Agno session = 1 dashboard conversation`.**

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

> *The diagram above is the original 6-table proposal, kept as **history**. **Current model = 4 tables**;
> the `app_customers` / `app_customer_identities` boxes were **removed in 12D-D / ADR-0012** — the contact
> is the `external_contact_id` value stored directly on `app_conversations`.*

- A **tenant** has many **channels** and **conversations**, and **exactly one**
  current entitlement row (`app_tenant_entitlements`, **1───1**). Plan/subscription
  history is parked.
- A **conversation** belongs to one tenant + one channel, carries the contact **by
  value** in `external_contact_id` (masked; indexed, **not** unique — one contact may
  own many conversations), and references exactly one Agno session by
  `agno_session_id`. *(There is no dashboard-side customer/identity row — removed in
  12D-D / ADR-0012; the contact registry is AI-owned.)*

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

### ~~app_customers~~ — REMOVED (12D-D / ADR-0012)
The v1 tenant-scoped customer table. **Dropped** in Slice 12D-D; the customer
registry is AI-owned (`ai.customers`). **Not reintroduced.**

### ~~app_customer_identities~~ — REMOVED (12D-D / ADR-0012)
The v1 customer↔contact-id link table. **Dropped** in Slice 12D-D. The external
contact id now lives **by value** on `app_conversations.external_contact_id`
(indexed, **not** unique) — there is **no** separate identity table.

### app_conversations
The Agno↔dashboard mapping record. **No message bodies.**
Key fields: `id`, `tenant_id`, `channel_id`, `agno_session_id` (text →
`ai.agno_sessions.session_id`), `external_contact_id` (the contact, stored **by
value**, masked on read — **no `customer_id`/`customer_identity_id` since 12D-D /
ADR-0012**), `status` (dashboard-owned, one of `open`/`resolved`/`archived` —
CHECK-constrained), `first_at`, `last_at`, `created_at`, `updated_at` (bumped when
mapping refreshes `last_at`/`status`).
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
| app_conversations | `(tenant_id, channel_id, agno_session_id)` | `(tenant_id, last_at DESC)`, `(tenant_id, channel_id, external_contact_id)` *(non-unique)* |
| app_tenant_entitlements | `(tenant_id)` *(1:1 per tenant)* | `tenant_id` |

*(`app_customers` / `app_customer_identities` removed in 12D-D / ADR-0012.)*

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
