# ADR-0008 — Future Tenant/Source Contract (Agno ↔ Dashboard)

- **Status:** Proposed (future; required before true production multi-tenancy)
- **Date:** 2026-06-15
- **Related:** ADR-0002, ADR-0003, ADR-0009 (live handover depends on the outbound
  side of this contract), `docs/workflows/09-future-tenant-source-contract.md`

## Context

`ai.agno_sessions.session_id` is **globally** the primary key and is currently
just a **WhatsApp phone number**. For a single demo tenant (PEPPER ST.) this is
workable. For real multi-tenant SaaS it is unsafe:

- The same phone could contact **two different businesses** → session id collision.
- A phone could be **reused** across businesses over time.
- There is **no tenant/channel/business** identifier on the session itself
  (`metadata` is NULL; resolution currently relies on `agent_id`).

## Decision (target contract — not implemented in Phase 1)

Define a required **AI-bot ↔ dashboard contract** so Agno sessions become
**tenant/channel-scoped or globally unique**, via one of:

1. **Composite/namespaced session id**, e.g.
   `{business_id}:{channel}:{phone}` or a UUID session id with the phone stored
   separately; **or**
2. **A `metadata` contract** on `ai.agno_sessions` carrying stable identifiers:
   `business_id` / `external_business_id`, `channel` / `external_phone_number_id`,
   `agent_id`, `team_id`, and the contact phone as a distinct field.

The dashboard's `app_channels` already carries the binding fields
(`source_agent_id`, `source_team_id`, `external_business_id`,
`external_phone_number_id`) to consume this contract. In Phase 1 only
`source_agent_id` (`'concierge'`) is set; the rest await the contract. The stable
`channel_key` also lets a tenant hold multiple channels as the contract lands.

## Consequences

- Once adopted, `agno_session_id` and `external_contact_id` **diverge**; the
  dashboard model already separates them, so **no dashboard migration** is needed
  — only the resolution rule changes (match on business/channel/phone-number id).
- Tenant resolution stops depending on `agent_id` alone and becomes robust.
- Until then, production onboarding of a second WhatsApp tenant on the same number
  space is a **known risk** and should be gated.

## Alternatives considered

- **Keep phone-only session id**: rejected for production — collision/reuse risk.
- **Dashboard-side disambiguation only** (e.g. prefix by tenant when reading):
  insufficient — cannot resolve genuine upstream collisions; the fix must be in
  the bot's session identity or metadata.

## Action required (future)

- Agree the contract with the AI-bot team.
- Document the exact `metadata`/session-id shape here and in
  `docs/workflows/09-future-tenant-source-contract.md`.
- Add a migration/resolution-rule change behind its own approval gate.
- **For Phase 2 live human handover (ADR-0009):** extend this contract with the
  **outbound** side — a **send-message** API, **pause/resume AI** per session, a
  **handover signal + reason**, and **delivery callbacks** — so replies route
  unambiguously and the bot persists them into the canonical transcript.
