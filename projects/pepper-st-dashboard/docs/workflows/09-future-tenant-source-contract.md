# Workflow 09 — Future: Tenant / Source Contract (Agno ↔ Dashboard)

- **Status:** PROPOSED (future) — required before true production multi-tenancy
- **Last updated:** 2026-06-15
- **Related:** ADR-0008, ADR-0002, `docs/architecture/03-agno-mapping.md`

## Problem recap

`ai.agno_sessions.session_id` is a **global primary key** that is currently just a
**WhatsApp phone number**. `metadata` is NULL, so a session carries **no
tenant/business/channel** identity of its own. Today the dashboard resolves a
session to a tenant via `agent_id = 'concierge'` only. This breaks for real
multi-tenant SaaS:

- Same phone contacting **two businesses** → id collision.
- Phone **reused** across businesses over time.
- No stable business/channel identity on the session.

## Target contract (one of)

### Option A — Namespaced / unique session id
Agno sets `session_id` to a globally unique value (e.g. UUID, or
`{external_business_id}:{channel}:{phone}`), and stores the **phone separately**.

### Option B — `metadata` contract (preferred, least invasive)
Agno populates `ai.agno_sessions.metadata` with a stable shape, e.g.:

```json
{
  "external_business_id": "pepper-st",
  "channel": "whatsapp",
  "external_phone_number_id": "<wa-phone-number-id>",
  "agent_id": "concierge",
  "team_id": null,
  "contact_phone": "<phone>"
}
```

The dashboard then resolves tenant/channel from `metadata`, and uses
`contact_phone` as the masked `external_contact_id`.

## Dashboard readiness (already in place)

`app_channels` carries the binding fields to consume either option:
`source_agent_id`, `source_team_id`, `external_business_id`,
`external_phone_number_id` (Phase 1 sets only `source_agent_id`). Its stable
`channel_key` (uniqueness `(tenant_id, channel_key)`) also lets one tenant hold
several channels. `app_conversations` keeps `agno_session_id` and
`external_contact_id` as **separate** fields (contact id **indexed, not unique**),
so they can **diverge with no dashboard migration**.

## Migration/resolution change (future, gated)

1. Agree the contract (Option A or B) with the AI-bot team; pin the exact shape
   here.
2. Update the **resolution rule** (Workflow 02/04) to match on
   business/channel/phone-number id instead of `agent_id` alone — still requiring
   **exactly one active channel** (0 → unmapped, >1 → ambiguous + masked warning,
   never guess). The precise contract should make `>1` matches effectively
   impossible.
3. Backfill `external_business_id` / `external_phone_number_id` on existing
   `app_channels`.
4. No change needed to dashboard table structure (fields already separated).

## Until then

- Onboarding a **second** WhatsApp tenant on overlapping number space is a
  **known risk** and should be **gated/avoided**.
- Single-tenant demo (PEPPER ST.) is safe under the `agent_id` rule.

## Acceptance (when adopted)

- A session resolves to exactly one tenant via the contract, independent of phone.
- Collisions/reuse no longer mis-route conversations.
- `agno_session_id` ≠ `external_contact_id` is handled cleanly end to end.
