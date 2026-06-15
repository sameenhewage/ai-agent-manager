# ADR-0003 — Agno Session Mapping & Conversation Grain

- **Status:** Accepted
- **Date:** 2026-06-15
- **Related:** ADR-0004, ADR-0008, `docs/architecture/03-agno-mapping.md`

## Context

`ai.agno_sessions.session_id` is the WhatsApp phone number and the table's global
primary key. A session is a **rolling thread**: new turns append to `runs[]` and
`updated_at` advances. There is one row per phone number. We must decide how a
dashboard "conversation" maps to this.

## Decision

1. **Grain:** **one `ai.agno_sessions` row (per phone) = one rolling
   `app_conversations` record.** Do not split into per-visit/per-day
   conversations in Phase 1 (parked).
2. **Linkage by value:** `app_conversations.agno_session_id = session_id`. **No
   cross-schema foreign key** into `ai.*`.
3. **Dual identifiers, separate fields:** store both `agno_session_id` and
   `external_contact_id`. In Phase 1 they are equal (the phone); modelled
   separately so they can diverge under ADR-0008 with no migration.
   **Conversation uniqueness is `(tenant_id, channel_id, agno_session_id)` only;**
   `external_contact_id` is **indexed, not unique**, because one contact may own
   several conversations once session ids diverge from the phone.
4. **Identity link:** a conversation also stores `customer_identity_id` (the exact
   `app_customer_identities` row resolved during mapping), not just `customer_id`.
5. **Cached timing:** `first_at = to_timestamp(created_at)`,
   `last_at = to_timestamp(updated_at)` (epoch seconds → timestamptz); the
   dashboard's own `updated_at` is bumped whenever mapping refreshes
   `last_at`/`status`.
6. **Demo binding:** sessions with `agent_id = 'concierge'` map to the PEPPER ST.
   WhatsApp channel.

## Consequences

- Conversation list = mapped Agno rows ordered by `last_at`.
- "Returning customer" detection is by `external_contact_id` (now an indexed,
  non-unique column), naturally, since the same phone reuses the same session row.
- Per-visit analytics (e.g. "conversations today" as distinct visits) is **not**
  available yet; only "active sessions in range" is. Documented as a limitation.

## Alternatives considered

- **Per-run or per-day conversations**: deferred — requires a derivation/segmenting
  rule (time-gap heuristic). Parked to roadmap to avoid premature complexity.
- **FK to `ai.agno_sessions`**: rejected — would couple/own Agno data; violates the
  read-only boundary.
