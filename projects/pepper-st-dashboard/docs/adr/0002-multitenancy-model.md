# ADR-0002 — Multi-tenancy Model

- **Status:** Accepted
- **Date:** 2026-06-15
- **Related:** ADR-0003, ADR-0008, `docs/architecture/04-multitenancy.md`

## Context

The product serves multiple businesses (PEPPER ST., ABC Fashion, XYZ Auto Care).
Onboarding a business must yield a fresh, empty, isolated dashboard. Auth/login is
parked, but the data model must not need rework when auth arrives. A tenant is a
business — **not** a chat session and **not** a customer.

## Decision

1. **Shared `dashboard` schema with row-level tenant scoping.** Every operational
   table carries `tenant_id`; all queries filter by it.
2. **No tenant-specific schemas. No tenant-specific tables. No channel-specific
   tables** (e.g. `whatsapp_customers` is forbidden).
3. **Entity chain:** `app_tenants → app_channels → app_customer_identities →
   app_customers → app_conversations`. `session_id` is **never** stored on
   `app_tenants`.
4. **Channel-driven tenant resolution:** an Agno session is resolved to a tenant
   via `app_channels` source-mapping fields (`source_agent_id`, etc.), not via the
   session id.
5. **Channels keyed by `(tenant_id, channel_key)`** (a stable per-tenant key),
   **not** `(tenant_id, type)` — so one tenant may run **multiple** WhatsApp
   channels in future without a schema change.
6. **Onboarding = inserting rows** (tenant, channel, entitlements), never
   running DDL.

## Consequences

- Adding a tenant is cheap and safe; no schema sprawl.
- Composite uniqueness (`tenant_id, channel_key`; `tenant_id, channel_id, …`)
  prevents cross-tenant collisions within the dashboard while allowing multiple
  channels per tenant.
- A data/repository layer must **require** `tenant_id` on every operational query.
- ⚠ A real risk remains upstream: `ai.agno_sessions.session_id` is a **global**
  phone-number PK. Cross-tenant safety ultimately needs the contract in ADR-0008.

## Alternatives considered

- **Schema-per-tenant**: rejected — DDL on onboarding, migration multiplication,
  overkill for many small tenants.
- **Table-per-tenant / per-channel**: rejected — explicitly forbidden; unmanageable.
- **Single-tenant now, retrofit later**: rejected — retrofitting tenancy is costly
  and error-prone; tenancy is mandatory from day one.
