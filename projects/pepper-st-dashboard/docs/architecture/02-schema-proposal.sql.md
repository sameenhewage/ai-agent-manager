# Architecture 02 — Schema Proposal (Reviewable SQL)

- **Project:** pepper-st-dashboard
- **Status:** Phase 1 (docs-first) — **PROPOSAL ONLY**
- **Last updated:** 2026-06-15
- **Related:** ADR-0001, ADR-0002, ADR-0003, ADR-0006, ADR-0008
- **Drizzle parity (Slice 2, 2026-06-15):** implemented as Drizzle ORM in
  `base-dashboard-app/lib/db/schema.ts`; migration `0000` **generated, not applied**.
  Parity table + Gate 2 package: `migration-proposal-0000.md`.

> ## ⛔ DO NOT APPLY
> This SQL is a **reviewable proposal**. It has **not** been run. No `dashboard`
> schema or `app_*` table exists yet. Applying it requires a **separate explicit
> migration approval gate**. Nothing here touches the `ai` schema.
>
> **Implementation note:** this SQL stays as the human-readable **schema
> proposal / source of truth for review**. The actual implementation (after
> approval) is authored as a **Drizzle ORM schema** and applied via **Drizzle
> migrations (`drizzle-kit`)** generated to match this proposal — not by running
> these statements by hand. Raw `pg` is only an indirect driver under Drizzle.
> See `05-tech-stack.md` and ADR-0001.

## Design notes

- New **`dashboard`** schema, same database as `ai`. `app_` table prefix.
- UUID surrogate PKs (`gen_random_uuid()`, built into PostgreSQL 13+).
- Tenants carry **lifecycle** fields (`status`, `onboarding_status`, `updated_at`)
  and a **`timezone`** (default `Asia/Colombo`) that drives the **Today / Month /
  Custom** analytics boundaries (future tenants may be in other countries). No
  locale/currency tables are added.
- Channels use a stable **`channel_key`** (unique per tenant) so a tenant can have
  **more than one** WhatsApp channel later — uniqueness is **not** `(tenant_id, type)`.
- Conversations carry **`customer_identity_id`** (the exact identity used) and treat
  `external_contact_id` as **indexed, not unique**.
- **`app_tenant_entitlements`** (renamed from `app_subscription_limits`) holds **one
  current entitlement row per tenant** (`UNIQUE (tenant_id)`) — the tenant's
  **current access/limits**, **not** a finalized pricing/billing model. Pricing is
  decided later by the internal team; the future pricing model is **parked**.
- **Audit `updated_at`** on mutable tables (`app_tenants`, `app_channels`,
  `app_customers`, `app_conversations`, `app_tenant_entitlements`), bumped on writes
  (e.g. when mapping refreshes a conversation's `last_at`/`status`).
- **CHECK constraints** guard enum-like text columns (`app_tenants.status`,
  `app_tenants.onboarding_status`, `app_conversations.status`) and keep retention
  **NULL or positive** on `app_tenant_entitlements` (`raw_history_retention_days`,
  `analytics_retention_days`). **NULL retention = unlimited** (enterprise / fully
  enabled).
- `timestamptz` for dashboard timestamps; Agno epoch-seconds are converted on
  **read** (the dashboard does not store Agno timestamps except cached
  `first_at`/`last_at` on conversations).
- Contact/session identifiers are **text** (never numeric; no `94` assumption).
- Every operational table carries `tenant_id` for row-level scoping.
- **No** transcript/message tables — transcripts render live from `ai.agno_sessions`.

---

## Proposed DDL

```sql
-- ============================================================
-- PEPPER ST. Dashboard — Phase 1 schema PROPOSAL (DO NOT APPLY)
-- Reviewable only. Requires separate migration approval.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS dashboard;

-- ---------- app_tenants : the business/client ----------
CREATE TABLE dashboard.app_tenants (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name              text        NOT NULL,
    slug              text        NOT NULL,
    status            text        NOT NULL DEFAULT 'active',   -- 'active' | 'suspended' | 'archived'
    onboarding_status text        NOT NULL DEFAULT 'pending',  -- 'pending' | 'in_progress' | 'complete'
    timezone          text        NOT NULL DEFAULT 'Asia/Colombo', -- drives Today/Month/Custom analytics boundaries
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),       -- bump on any tenant mutation
    CONSTRAINT app_tenants_slug_key UNIQUE (slug),
    CONSTRAINT app_tenants_status_check
        CHECK (status IN ('active','suspended','archived')),
    CONSTRAINT app_tenants_onboarding_status_check
        CHECK (onboarding_status IN ('pending','in_progress','complete'))
);
-- A tenant is NOT a chat session. session_id is never stored here.

-- ---------- app_channels : tenant source/integration ----------
CREATE TABLE dashboard.app_channels (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                uuid NOT NULL REFERENCES dashboard.app_tenants(id) ON DELETE CASCADE,
    type                     text NOT NULL,            -- 'whatsapp' (Phase 1)
    channel_key              text NOT NULL,            -- stable per-tenant key, e.g. 'whatsapp-main';
                                                       -- allows MULTIPLE whatsapp channels per tenant later
    display_name             text,
    -- source-mapping fields (bind dashboard channel -> upstream bot/Agno):
    source_agent_id          text,                     -- e.g. 'concierge' (set in Phase 1)
    source_team_id           text,                     -- future contract (ADR-0008)
    external_business_id     text,                     -- future contract (ADR-0008)
    external_phone_number_id text,                     -- future contract (ADR-0008)
    is_active                boolean NOT NULL DEFAULT true,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    -- NOTE: deliberately NOT UNIQUE (tenant_id, type) — that would cap a tenant at
    -- one whatsapp channel. Uniqueness is on the stable channel_key instead.
    CONSTRAINT app_channels_tenant_channel_key UNIQUE (tenant_id, channel_key)
);
CREATE INDEX app_channels_tenant_idx ON dashboard.app_channels (tenant_id);

-- ---------- app_customers : tenant-scoped end customer ----------
CREATE TABLE dashboard.app_customers (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid NOT NULL REFERENCES dashboard.app_tenants(id) ON DELETE CASCADE,
    display_name text,                                 -- nullable: Agno has no name
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()    -- bump on any customer mutation
);
CREATE INDEX app_customers_tenant_idx ON dashboard.app_customers (tenant_id);

-- ---------- app_customer_identities : external contact id per channel ----------
CREATE TABLE dashboard.app_customer_identities (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           uuid NOT NULL REFERENCES dashboard.app_tenants(id) ON DELETE CASCADE,
    customer_id         uuid NOT NULL REFERENCES dashboard.app_customers(id) ON DELETE CASCADE,
    channel_id          uuid NOT NULL REFERENCES dashboard.app_channels(id) ON DELETE CASCADE,
    external_contact_id text NOT NULL,                 -- WhatsApp phone (TEXT) in Phase 1
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT app_cust_ident_unique UNIQUE (tenant_id, channel_id, external_contact_id)
);
CREATE INDEX app_cust_ident_customer_idx ON dashboard.app_customer_identities (customer_id);

-- ---------- app_conversations : Agno session mapping (NO message bodies) ----------
CREATE TABLE dashboard.app_conversations (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            uuid NOT NULL REFERENCES dashboard.app_tenants(id) ON DELETE CASCADE,
    customer_id          uuid NOT NULL REFERENCES dashboard.app_customers(id) ON DELETE CASCADE,
    customer_identity_id uuid NOT NULL REFERENCES dashboard.app_customer_identities(id) ON DELETE CASCADE,
    channel_id           uuid NOT NULL REFERENCES dashboard.app_channels(id) ON DELETE CASCADE,
    agno_session_id      text NOT NULL,                 -- -> ai.agno_sessions.session_id (NO FK across schema/ownership)
    external_contact_id  text NOT NULL,                 -- cached (== agno_session_id in Phase 1)
    status               text NOT NULL DEFAULT 'open',  -- dashboard-owned, NOT from Agno: 'open'|'resolved'|'archived'
    first_at             timestamptz,                   -- from ai.agno_sessions.created_at (epoch->ts)
    last_at              timestamptz,                   -- from ai.agno_sessions.updated_at (epoch->ts)
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),  -- bump when mapping refreshes last_at/status
    -- Conversation identity is the Agno session within tenant+channel:
    CONSTRAINT app_conv_agno_unique UNIQUE (tenant_id, channel_id, agno_session_id),
    CONSTRAINT app_conv_status_check CHECK (status IN ('open','resolved','archived'))
);
CREATE INDEX app_conv_tenant_last_idx ON dashboard.app_conversations (tenant_id, last_at DESC);
CREATE INDEX app_conv_customer_idx    ON dashboard.app_conversations (customer_id);
CREATE INDEX app_conv_identity_idx    ON dashboard.app_conversations (customer_identity_id);
-- external_contact_id is INDEXED but NOT UNIQUE: one contact may have several
-- conversations once sessions diverge from the phone (ADR-0008).
CREATE INDEX app_conv_contact_idx     ON dashboard.app_conversations (tenant_id, channel_id, external_contact_id);
-- NOTE: deliberately NO foreign key to ai.agno_sessions — the dashboard must not
-- own or constrain Agno data. The link is by value (agno_session_id) only.

-- ---------- app_tenant_entitlements : per-tenant CURRENT access/limits ----------
-- Renamed from app_subscription_limits. This is the tenant's CURRENT
-- access/entitlement configuration, NOT a finalized pricing/billing model
-- (pricing is parked; the internal team decides it later).
-- Phase 1: EXACTLY ONE current entitlement row per tenant (UNIQUE (tenant_id)).
-- Changing access/retention is an in-place UPDATE of this row (bump updated_at),
-- not a new row. Plan/subscription history/versioning is parked (would need a
-- separate history table; see roadmap) rather than multiple live rows here.
-- NULL retention = UNLIMITED (enterprise / current fully enabled setup).
-- NO HIDDEN PRODUCT DEFAULTS: plan_code and is_fully_enabled are NOT NULL with NO
-- DEFAULT and MUST be inserted explicitly at onboarding; retention columns are
-- nullable with NO DEFAULT (omit -> NULL -> unlimited, or set an explicit number).
-- This deliberately avoids baking in a 'standard'/30-day pricing assumption before
-- the pricing/subscription model is finalized (parked). If a temporary default is
-- ever added, it MUST be documented here as temporary, not a final pricing decision.
CREATE TABLE dashboard.app_tenant_entitlements (
    id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                  uuid NOT NULL REFERENCES dashboard.app_tenants(id) ON DELETE CASCADE,
    plan_code                  text    NOT NULL,                    -- explicit at onboarding; non-final label, e.g. 'standard' | 'enterprise' (NO default)
    is_fully_enabled           boolean NOT NULL,                    -- explicit at onboarding; enterprise / full-access flag (NO default)
    raw_history_retention_days integer,                             -- nullable, NO default; NULL = unlimited (raw chat access)
    analytics_retention_days   integer,                             -- nullable, NO default; NULL = unlimited (analytics detail)
    created_at                 timestamptz NOT NULL DEFAULT now(),
    updated_at                 timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT app_tenant_entitlements_tenant_key UNIQUE (tenant_id),
    CONSTRAINT app_tenant_entitlements_raw_retention_check
        CHECK (raw_history_retention_days IS NULL OR raw_history_retention_days > 0),
    CONSTRAINT app_tenant_entitlements_analytics_retention_check
        CHECK (analytics_retention_days IS NULL OR analytics_retention_days > 0)
);
```

---

## Proposed seed (demo) — also NOT applied

> **One-time seed, not rerunnable as-is.** The block below is intended to run
> **once** during the initial migration. Re-running it **fails** (the first
> `INSERT` violates `app_tenants_slug_key`). The Drizzle implementation should use
> the **idempotent upsert** variant shown after this block.

```sql
-- Seed the demo tenant PEPPER ST. + WhatsApp channel mapped to agent 'concierge'.
WITH t AS (
  INSERT INTO dashboard.app_tenants (name, slug)
  VALUES ('PEPPER ST.', 'pepper-st')
  RETURNING id
)
INSERT INTO dashboard.app_channels (tenant_id, type, channel_key, display_name, source_agent_id)
SELECT id, 'whatsapp', 'whatsapp-main', 'PEPPER ST. WhatsApp', 'concierge' FROM t;

-- PEPPER ST. = enterprise / fully enabled -> NULL retention = UNLIMITED access:
INSERT INTO dashboard.app_tenant_entitlements
  (tenant_id, plan_code, is_fully_enabled, raw_history_retention_days, analytics_retention_days)
SELECT id, 'enterprise', true, NULL, NULL
FROM dashboard.app_tenants WHERE slug = 'pepper-st';
```

### Idempotent variant (safe to re-run — preferred for the Drizzle seed)

```sql
-- Upsert by natural unique keys so re-running is a no-op.
INSERT INTO dashboard.app_tenants (name, slug)
VALUES ('PEPPER ST.', 'pepper-st')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO dashboard.app_channels (tenant_id, type, channel_key, display_name, source_agent_id)
SELECT id, 'whatsapp', 'whatsapp-main', 'PEPPER ST. WhatsApp', 'concierge'
FROM dashboard.app_tenants WHERE slug = 'pepper-st'
ON CONFLICT (tenant_id, channel_key) DO NOTHING;

INSERT INTO dashboard.app_tenant_entitlements
  (tenant_id, plan_code, is_fully_enabled, raw_history_retention_days, analytics_retention_days)
SELECT id, 'enterprise', true, NULL, NULL
FROM dashboard.app_tenants WHERE slug = 'pepper-st'
ON CONFLICT (tenant_id) DO NOTHING;
```

> In Drizzle this maps to `insert(...).onConflictDoNothing({ target: ... })` keyed
> by `slug`, `(tenant_id, channel_key)`, and `(tenant_id)` respectively — the
> rerunnable form the implementation should use.

> Customers/identities/conversations are **not** hand-seeded; they are created by
> the mapping workflow (`docs/workflows/04-...`) from real `ai.agno_sessions`
> rows where `agent_id = 'concierge'`.

---

## Verification (post-apply, when approved later)

```sql
-- expect schema + 6 tables
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'dashboard' ORDER BY 1;

-- expect uniqueness constraints present
SELECT conname FROM pg_constraint
WHERE connamespace = 'dashboard'::regnamespace ORDER BY 1;
```

## Rollback (if ever applied and needs reverting)

```sql
DROP SCHEMA IF EXISTS dashboard CASCADE;  -- only affects dashboard.* ; ai.* untouched
```

## Explicitly excluded (per locked decisions)

- No `messages` / `runs` / transcript tables.
- No `intent` / `summary` / `confidence` / `priority` / issue / exchange /
  follow-up / task tables.
- No tenant-specific schemas/tables; no channel-specific tables.
- No FK from `dashboard.*` into `ai.*`.
