# ADR-0003 — Agno Session Mapping & Conversation Grain

- **Status:** Accepted
- **Date:** 2026-06-15
- **Related:** ADR-0004, ADR-0008, **ADR-0016 (revises the grain)**, `docs/architecture/03-agno-mapping.md`

> **⚠ GRAIN REVISED (2026-06-17) — ADR-0016.** The grain below ("one Agno `session_id` = one
> `app_conversations` row") is **superseded**: a dashboard **conversation is now a customer/contact
> thread** (one row **per contact**), and each Agno session is a **provider session** in the new
> `app_conversation_sessions` table (`external_session_id` == `ai.agno_sessions.session_id` by value, no
> FK). **`1 Agno session = 1 dashboard conversation` no longer holds.** The by-value/read-only link and
> the no-message-table boundary (ADR-0004) are unchanged. See **ADR-0016** + `docs/architecture/09`.

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

## Update — Slice 12D-B (2026-06-16): Agno v2 reaffirmation

The **grain decision stands**: **one `ai.agno_sessions` row (one `session_id`) = one
`app_conversations` row.** But this ADR's *Context*/*Consequences* described the **v1** world and is
**superseded by ADR-0011 (Agno v2)** on these points:

- `session_id` is **no longer the phone** — it is an **opaque 32-char token**; the WhatsApp phone is now
  `ai.agno_sessions.user_id` (PII). `app_conversations.agno_session_id` links by value to that opaque
  token; `external_contact_id` is the phone.
- A returning customer does **NOT** reuse the same session row. The AI platform creates a **new**
  `session_id` for the new conversation. Therefore **one contact (`user_id`) → many Agno sessions → many
  `app_conversations` rows**, all sharing **one** `app_customer_identities` row
  (`(tenant_id, channel_id, external_contact_id)`).
  - Conversation uniqueness stays `(tenant_id, channel_id, agno_session_id)` → never merge sessions.
  - `external_contact_id` is **indexed, not unique** (Decision §3 already anticipated this divergence).
  - "Returning customer" is detected by reusing the identity across sessions, **not** by a reused
    session row.
- §6 "Demo binding (`agent_id='concierge'`)" is superseded: `agent_id` is **derived**
  `"<tenant_id>:<channel_id>"` (ADR-0011).
- **Transcript boundary unchanged (ADR-0004):** message bodies stay canonical in
  `ai.agno_sessions.runs[].messages[]`. The dashboard stores **no** message content, has **no**
  `app_conversation_messages` table / message index / content cache, and any future webhook/trigger sync
  updates **mapping/metadata/index only** — it never copies messages. Verified by `schema.test.ts`
  (FORBIDDEN tables + the grain lock-tests) and the read-only verifiers.

## Update — Slice 12D-D (2026-06-16): identity model removed (ADR-0012)

The **grain decision still stands** (one Agno `session_id` = one `app_conversations` row, unique on
`(tenant_id, channel_id, agno_session_id)`). But Decision **§4** ("a conversation also stores
`customer_identity_id`") and every reference to `customer_id` are **superseded by ADR-0012**:
`dashboard.app_customers` and `dashboard.app_customer_identities` were **dropped**, along with
`app_conversations.customer_id` / `customer_identity_id`. The contact now lives **only** as
`app_conversations.external_contact_id` (TEXT, NOT NULL, **indexed not unique**) — the AI platform
(`ai.agno_sessions.user_id` / `ai.customers`) is the contact registry of record. "Returning vs new
contact" is derived from `external_contact_id` over `app_conversations`, not from an identity row. The
transcript boundary (ADR-0004) and the by-value/read-only link are unchanged.
