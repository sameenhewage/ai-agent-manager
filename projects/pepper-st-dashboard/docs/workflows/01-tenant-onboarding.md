# Workflow 01 — Tenant Onboarding

- **Status:** Phase 1 (docs-first) — documented seed/manual flow (no UI yet)
- **Last updated:** 2026-06-15
- **Related:** ADR-0002, `docs/architecture/04-multitenancy.md`

## Goal

Register a new business (tenant) and its WhatsApp channel so its conversations
can map in and it gets a **fresh, empty, tenant-scoped dashboard**.

## Preconditions

- `dashboard` schema applied (separate approval gate — not yet).
- The business's upstream Agno binding is known (at minimum `agent_id`; ideally
  future `external_business_id` / `external_phone_number_id`).

## Steps

1. **Create the tenant**
   - Insert `app_tenants(name, slug, status, onboarding_status, timezone)`
     (e.g. `('PEPPER ST.', 'pepper-st', 'active', 'complete', 'Asia/Colombo')`).
   - `slug` must be unique. `status`/`onboarding_status` track lifecycle.
   - `timezone` (default `Asia/Colombo`) drives the Today/Month/Custom analytics
     boundaries; set it per tenant (future tenants may be in other countries).
2. **Create the channel**
   - Insert `app_channels(tenant_id, type='whatsapp', channel_key='whatsapp-main', display_name, source_agent_id, …)`.
   - `channel_key` is the stable per-tenant key (uniqueness is `(tenant_id, channel_key)`),
     so a tenant can add more WhatsApp channels later.
   - Set source-mapping fields known today (`source_agent_id='concierge'`); leave
     future fields (`external_business_id`, `external_phone_number_id`) null until
     the contract (ADR-0008) lands.
3. **Set entitlements** (all fields **explicit** — no hidden column defaults)
   - Insert the tenant's **single** `app_tenant_entitlements(tenant_id, plan_code,
     is_fully_enabled, raw_history_retention_days, analytics_retention_days)` row
     (`UNIQUE (tenant_id)`). `plan_code` and `is_fully_enabled` are **required**
     (`NOT NULL`, no default); retention is `NULL` = unlimited **or** an explicit
     number. **PEPPER ST. = enterprise / fully enabled** with both retentions
     **NULL** (= unlimited). Later access/retention changes update this row in place.
     This is the tenant's **current access config, not final pricing** (pricing
     parked).
4. **Verify isolation**
   - Open the dashboard scoped to the new tenant → it shows **empty** lists until
     the mapping workflow links real Agno sessions.

## Result

A tenant with one WhatsApp channel and a current **entitlement** row (PEPPER ST. =
enterprise / unlimited retention), ready for the mapping workflow (Workflow 02 / 04).

## Acceptance

- New tenant's Chat Monitor + Analytics are empty (no other tenant's data leaks).
- `(tenant_id, channel_key)` uniqueness prevents duplicate channels while allowing
  more than one WhatsApp channel per tenant.

## Phase 1 vs future

- **Phase 1:** performed as a reviewed seed script (see
  `docs/architecture/02-schema-proposal.sql.md` seed block).
- **Future:** a Platform-Operator onboarding UI + auth; capture
  business/phone-number ids per ADR-0008.

## Example businesses

PEPPER ST. (demo seed), ABC Fashion, XYZ Auto Care — each becomes a separate
tenant with its own channel(s).
