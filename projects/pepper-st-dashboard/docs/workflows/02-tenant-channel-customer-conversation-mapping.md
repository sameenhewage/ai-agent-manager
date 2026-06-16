# Workflow 02 — Tenant / Channel / Customer / Conversation Mapping

- **Status:** Phase 1 — **updated for Slice 12D-D / ADR-0012** (customer/identity model removed)
- **Last updated:** 2026-06-16
- **Related:** ADR-0002, ADR-0003, **ADR-0012**, `docs/architecture/03-agno-mapping.md`

> **ADR-0012 update:** the dashboard no longer has `app_customers` / `app_customer_identities`. Mapping
> now ensures only a **channel** + a **conversation**; the contact is stored **by value** on
> `app_conversations.external_contact_id`. The customer/identity find-or-create steps are removed below.

## Goal

Turn a raw `ai.agno_sessions` row into the correct dashboard records, scoped to a
tenant: ensure a **channel** and a **conversation** exist (the contact is stored
by value as `external_contact_id` — **no customer/identity model**, ADR-0012).

## Inputs

- An `ai.agno_sessions` row: `session_id` (= phone), `agent_id` (= `concierge`),
  `created_at`, `updated_at`.

## Resolution order

```
agent_id / (future) business+phone-number id
        ──► app_channels (ACTIVE only, matching source-mapping; EXACTLY ONE)
                 ──► tenant_id (the channel's tenant)
external_contact_id (from session.user_id; stored BY VALUE, masked on read)
session_id
        ──► app_conversations (find or create; link agno_session_id + external_contact_id)
```

## Steps (idempotent "find-or-create")

1. **Resolve channel + tenant (active, exactly one)**
   - Find **active** `app_channels` (`is_active = true`) whose source-mapping
     matches the session's `agent_id` (Phase 1) → must resolve to **exactly one**
     channel, giving `channel_id` + `tenant_id`.
   - **0 matches → unmapped:** skip (log masked; never guess a tenant).
   - **>1 matches → ambiguous:** skip and log a **masked warning** (overlapping
     channel config); never pick arbitrarily, never guess a tenant.
   - (See `architecture/03-agno-mapping.md` → Channel resolution.)
2. **Derive the contact** (no identity row — ADR-0012)
   - `external_contact_id = session.user_id` (the WhatsApp phone, PII). If it is
     absent, **skip** the session (never create an empty-contact row).
3. **Find-or-create conversation**
   - Look up `app_conversations(tenant_id, channel_id, agno_session_id=session_id)`.
   - If missing: insert with `external_contact_id`,
     `first_at=to_timestamp(created_at)`, `last_at=to_timestamp(updated_at)`,
     `status='open'` (CHECK: `open`/`resolved`/`archived`); `created_at`/`updated_at`
     default to `now()`.
   - If present: refresh `last_at` from `updated_at` and **bump `updated_at`**.

## Idempotency & uniqueness

- The "create" step relies on the composite unique constraint
  `app_conv_agno_unique` `(tenant_id, channel_id, agno_session_id)` so re-running
  the mapping never duplicates rows.
- `app_conversations.external_contact_id` is **indexed, not unique** — a contact
  may own multiple conversations once session ids diverge from the phone
  (ADR-0008). Conversation identity comes from `agno_session_id`, not the contact.

## When does mapping run?

- **Phase 1:** on-demand/batch (e.g. when the operator opens Chat Monitor, or a
  scheduled reconcile) — since we read Agno live, mapping just keeps the index
  fresh. (Exact trigger decided at build gate.)
- **Future:** event/webhook-driven as the contract (ADR-0008) matures.

## Hard rules

- Never write to `ai.*`.
- Never create a tenant from an unmapped session (no guessing).
- Always carry `tenant_id` on every insert.

## Acceptance

- A `concierge` session yields exactly one conversation under PEPPER ST.
- Re-running mapping is a no-op (no duplicates).
- An unknown `agent_id` produces an unmapped/logged (masked) entry, not a bogus
  tenant.
- A session matching **more than one active channel** is skipped as **ambiguous**
  with a masked warning — never assigned to a guessed tenant.
