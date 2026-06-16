# Architecture 04 — Multi-tenancy

- **Project:** pepper-st-dashboard
- **Status:** Phase 1 (docs-first) — proposal
- **Last updated:** 2026-06-15
- **Related:** ADR-0002, ADR-0008, **ADR-0015**

> **⚠ HIERARCHY SUPERSEDED (2026-06-16) — ADR-0015 / `architecture/09`.** The target model is
> **`Tenant → Business → optional Location → Channel → Conversation → Agno Session`** with
> **`tenant ≠ business`** (a tenant may run many businesses; a default business is created at
> onboarding). The single-business `tenant → channel → conversation` description below is the **current
> implementation** (migration to the multi-business model is approval-gated / not yet applied). The
> shared-schema + row-level-scoping **principle is unchanged** — the target simply adds `business_id` and
> optional `location_id` as further row-level scopes.

## Principle

**Multi-tenancy is mandatory from day one**, even though login/auth is parked.
A **tenant** is the **SaaS account / billing / owner boundary** (PEPPER ST., *Sameen Group*) — **not**
a business (**`tenant ≠ business`**, ADR-0015). Onboarding a new client **creates a fresh tenant** with
a **fresh, empty, tenant-scoped dashboard** **and a default business** under it (a tenant may add more
businesses later).

## Isolation strategy: shared schema, row-level scoping

- **One** `dashboard` schema, shared by all tenants.
- **Every operational table carries `tenant_id`** and all queries filter by it.
- **No tenant-specific schemas. No tenant-specific tables. No channel-specific
  tables.** (Explicitly forbidden — see ADR-0002.)

Rationale: simplest correct model for many small tenants; avoids schema sprawl;
keeps onboarding to inserting rows, not running DDL.

## Hierarchy: Tenant → Business → optional Location → Channel → Conversation

**Target model (ADR-0015 / `architecture/09`):**

```
app_tenants (Sameen Group — SaaS/billing/owner boundary; timezone=Asia/Colombo)
  └─ app_businesses (PEPPER ST Fashion — a tenant may have MANY; default created at onboarding)
       ├─ app_locations (Colombo / Kandy — OPTIONAL branch; 0..N; NULL = shared/unknown)
       └─ app_channels (type=whatsapp|instagram|facebook|website; external_channel_id = provider id;
            │             business_id required; location_id NULL = shared channel)
            └─ app_conversations (tenant_id + business_id + channel_id required; location_id optional;
                                   agno_session_id → ai.agno_sessions; external_contact_id by value, masked)
```

**Current implementation (single business, pre-migration):**

```
app_tenants (PEPPER ST.) → app_channels (WhatsApp) → app_conversations (agno_session_id → ai.agno_sessions)
  (No app_customers / app_customer_identities — removed in 12D-D / ADR-0012; business/location columns are the ADR-0015 target.)
```

- A tenant is the **SaaS/billing/owner boundary** — **not** a business, session, or customer
  (**`tenant ≠ business`**, ADR-0015).
- `session_id` is **never** stored on `app_tenants`.
- The bond to the upstream bot lives on `app_channels` via source-mapping fields; under ADR-0015 the
  Agno agent is resolved via **`app_ai_agent_bindings`** (no hard-coded `agent_id` format).

## Resolving an Agno session to a tenant

Phase 1 (single tenant/agent): every `ai.agno_sessions` row with
`agent_id = concierge` belongs to the **PEPPER ST. WhatsApp** channel.

The resolution rule is **channel-driven**: match the Agno row's
`agent_id`/(future) team/business/phone-number-id against `app_channels`
source-mapping fields → that channel's `tenant_id` scopes everything.

> ⚠ **Production risk:** `ai.agno_sessions.session_id` is a **global** primary
> key that is currently just a phone number. Two tenants sharing a phone, or a
> phone reused across businesses, would collide. The required future contract
> (ADR-0008) makes Agno sessions tenant/channel-scoped or globally unique.

## Onboarding a tenant (Phase 1 = seed/manual)

1. Insert `app_tenants` (name, slug; `status='active'`, `onboarding_status`
   advanced to `complete` when set up).
2. Insert `app_channels` (type `whatsapp`, **`channel_key`** e.g. `whatsapp-main`,
   source-mapping fields). Uniqueness is `(tenant_id, channel_key)`, so more
   WhatsApp channels can be added later.
3. Insert the tenant's **single** `app_tenant_entitlements` row **explicitly** (PEPPER
   ST. = `plan_code='enterprise'`, `is_fully_enabled=true`, retention **NULL** =
   unlimited). No hidden defaults — every entitlement field is set at onboarding.
   Current access config, not final pricing.
4. Open dashboard scoped to the tenant → empty until sessions map in.

See `docs/workflows/01-tenant-onboarding.md`.

## Query discipline

- A repository/data layer must **require** a `tenant_id` for every operational
  read/write (no implicit global queries).
- Analytics and Chat Monitor are always tenant-filtered before touching Agno.
- Cross-tenant access is a future platform-operator capability, not Phase 1.

## Testing tenancy

- Seed two tenants; assert tenant B never sees tenant A's conversations.
- Assert a new tenant's dashboard is empty.
- Assert composite uniqueness prevents duplicate identities/conversations within
  a tenant+channel (`(tenant_id, channel_id, agno_session_id)`), while
  `external_contact_id` may legitimately repeat across conversations.
