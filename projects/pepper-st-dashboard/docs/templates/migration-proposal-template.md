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
| app_customers | <y/n> | |
| app_customer_identities | <y/n> | |
| app_conversations | <y/n> | **no FK** to `ai.*` |
| app_tenant_entitlements | <y/n> | explicit (no hidden defaults); nullable retention |

## Boundary checks

- **6 tables only**; **no** forbidden tables: <ok>
- **No FK** from `dashboard.*` into `ai.*`: <ok>
- Nothing applied; `ai.agno_*` untouched: <ok>

## Seed (proposed; applied in Slice 3 only after approval)

- PEPPER ST. = `plan_code='enterprise'`, `is_fully_enabled=true`, retention `NULL`
  (unlimited); idempotent upsert.

## Approval

- Gate 2 approver: <name> · Decision: <approve / request changes>
