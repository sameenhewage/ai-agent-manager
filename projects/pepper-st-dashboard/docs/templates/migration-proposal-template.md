# Migration Proposal — <name> (Gate 2)

- **Author:** fullstack-builder-agent · **Reviewer:** solution-architect-agent
- **Date:** <YYYY-MM-DD>
- **Status:** PROPOSED — **not applied**

## Summary

<what the migration creates/changes in `dashboard.*` only>

## Drizzle ↔ SQL parity (vs docs/architecture/02-schema-proposal.sql.md)

| Table | Matches proposal? | Notes |
|---|---|---|
| app_tenants | <y/n> | `timezone` present |
| app_channels | <y/n> | `(tenant_id, channel_key)` unique |
| app_conversations | <y/n> | **no FK** to `ai.*`; `external_contact_id` by value (ADR-0012 — no customer/identity tables) |
| app_tenant_entitlements | <y/n> | explicit (no hidden defaults); nullable retention |

## Boundary checks

- **Dashboard-owned tables only** (current live: `app_tenants`, `app_channels`, `app_conversations`, `app_tenant_entitlements`; **target adds** `app_businesses` / `app_locations` / `app_conversation_sessions` / `app_ai_agent_bindings` / `app_realtime_outbox` — ADR-0015/0016); **no** forbidden tables (incl. the removed `app_customers` / `app_customer_identities`): <ok>
- **No FK** from `dashboard.*` into `ai.*`: <ok>
- Nothing applied; `ai.agno_*` untouched: <ok>

## Seed (proposed; applied in Slice 3 only after approval)

- PEPPER ST. = `plan_code='enterprise'`, `is_fully_enabled=true`, retention `NULL`
  (unlimited); idempotent upsert.

## Approval

- Gate 2 approver: <name> · Decision: <approve / request changes>
