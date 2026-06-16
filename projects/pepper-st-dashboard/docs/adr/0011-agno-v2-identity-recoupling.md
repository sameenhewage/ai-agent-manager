# ADR-0011 — Re-coupling to the migrated Agno (v2) identity model

- **Status:** **Accepted** (Gate 11A; AI-dev contract **confirmed** + live-verified 2026-06-16 — `agent_id = "<tenant_id>:<channel_id>"`). Code re-alignment proceeds under **Slice 11B**; the dashboard-only **data writes** (orphan cleanup + re-sync) remain **product-approval-gated**.
- **Date:** 2026-06-16
- **Related:** ADR-0001 (read-and-organize, by-value link), ADR-0003 (session mapping), ADR-0005
  (phone masking), ADR-0008 (future tenant/source contract), `docs/database/01..05`.

## Context

Between Gate 9 and Gate 10 the external AI platform migrated Agno to a richer schema and reset the
session data (read-only discovery in `docs/database/`). Three load-bearing identifiers changed:

1. `agno_sessions.agent_id` is now a composite **`<tenant_id>:<channel_id>`** — the AI platform builds
   it from the dashboard's own `app_tenants.id` + `app_channels.id` (confirmed + live-verified; the
   literal `concierge` is gone). The human label `PEPPER ST. WhatsApp Concierge` appears only at
   `runs[].agent_name`.
2. `agno_sessions.session_id` is now a 32-char opaque token (no longer the phone).
3. The WhatsApp contact (phone, PII) moved to the new `agno_sessions.user_id` column.

The dashboard couples by value via `app_channels.source_agent_id='concierge'` and
`external_contact_id == session_id`. Both are now invalid, so the dashboard maps **0** live sessions
and renders empty data. Transcript parsing and token/cost paths are otherwise unchanged.

## Decision (confirmed 2026-06-16)

Re-couple the dashboard to the v2 identity model **behind the existing mapping seam**
(`lib/agno/mapping.ts`, `app_channels.source_agent_id`), with **no change to the by-value, read-only
principle**:

1. **Agent identity (derived):** the agent key is **computed**, not stored — the mapping seam derives
   `agent_id = "${tenantId}:${channelId}"` from `app_tenants.id` + `app_channels.id` and matches live
   `ai.agno_sessions.agent_id` against it. `source_agent_id` is demoted to an optional derived/legacy
   cache (may be NULL). No `agent_name` scan; no opaque value baked into code/env.
2. **Contact identity:** derive `external_contact_id` from `agno_sessions.user_id` (phone, PII —
   masked as today), and use `session_id` purely as the opaque `agno_session_id` link key.
3. **Transcript/metrics:** unchanged (`runs[].messages[]`, `session_data.session_metrics`).
4. **Stale mapping:** clear/replace the 13 orphan `app_conversations` and re-run `db:agno:sync`
   (dashboard-only write, approval-gated).

## Consequences

- Restores Chat Monitor / Analytics / Dashboard to real data with a small, reviewable mapping change
  rather than a rewrite.
- Keeps `ai.*` strictly read-only and the link by-value (no cross-schema FK).
- Adds a new PII source (`user_id`); masking already covers phone shapes, but the read path's *source
  field* changes and must be reviewed.
- The composite `agent_id` is **derived from our own PKs**, so it is as stable as `app_tenants.id` /
  `app_channels.id` and cannot drift to a renamable label or per-deploy value. Resolution stays
  defensive (still returns unmapped/ambiguous correctly), and the link to `ai.*` stays read-only/by-value.

## Alternatives considered

- **Match by `agent_name` string only:** simplest, but a display label can be renamed by the AI
  platform → fragile unless the AI dev guarantees stability.
- **Stop filtering by agent and map every session on the channel:** rejected — multi-agent/team
  sessions (`team_id`/`workflow_id` now exist) would leak non-concierge sessions into the tenant.
- **Persist transcripts/contacts into `dashboard.*` to decouple:** rejected — violates ADR-0001/0004
  (no transcript duplication; read-only).

## Gate 11A recommendation (2026-06-16)

Gate 11A completed the design and **confirms NO dashboard schema migration is required** — the existing
`dashboard` schema already carries three distinct columns for the three v2 identifiers:

- agent key = **derived** `${tenant_id}:${channel_id}` in the mapping seam (`source_agent_id` demoted to derived/legacy cache),
- `app_conversations.agno_session_id` ← opaque `session_id` (no change),
- `app_customer_identities.external_contact_id` ← contact `user_id` (derivation source change only).

Re-alignment is therefore a **logic + config** change behind the existing mapping seam (consolidate the
v2 contract into `lib/agno/mapping.ts`; 11-point change set), plus a dashboard-only orphan cleanup +
re-sync, plus verify-script hardening. Full plan: `docs/database/06-agno-v2-realignment-plan.md`.

The agent-filter sub-decision is now **resolved**: derive `agent_id = "${tenant_id}:${channel_id}"`
(confirmed + live-verified; ordering tenant-first). No `agent_name` scan, no stored opaque value. This
does not change the no-migration verdict. `source_contract_version` and explicit orphan-status columns
were considered and **deferred** (not needed to restore Phase 1).

> AI-dev confirmation received and live-verified (2026-06-16); Status is now **Accepted**. Code
> re-alignment proceeds under Slice 11B; the dashboard-only data writes remain product-approval-gated.
