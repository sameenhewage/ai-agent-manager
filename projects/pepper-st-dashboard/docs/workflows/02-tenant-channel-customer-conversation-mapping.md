# Workflow 02 — Tenant / Channel / Customer / Conversation Mapping

- **Status:** Phase 1 — **updated for Slice 12D-D / ADR-0012** (customer/identity model removed)
- **Last updated:** 2026-06-16
- **Related:** ADR-0002, ADR-0003, **ADR-0012**, `docs/architecture/03-agno-mapping.md`

> **ADR-0012 update:** the dashboard no longer has `app_customers` / `app_customer_identities`. Mapping
> now ensures only a **channel** + a **conversation**; the contact is stored **by value** on
> `app_conversations.external_contact_id`. The customer/identity find-or-create steps are removed below.

> **⚠ ADR-0016 update (2026-06-17):** a conversation is a **customer/contact thread** (one
> `app_conversations` row **per contact**, keyed `tenant_id + channel_id + external_contact_id`); each
> Agno session is a **provider session** linked in **`app_conversation_sessions`** (`external_session_id`
> = `session_id`, by value). Below, "find-or-create conversation by `agno_session_id`" becomes
> **find-or-create the contact thread, then upsert the provider-session link** — the conversation is **no
> longer** keyed by `agno_session_id`.

## Goal

Turn a raw `ai.agno_sessions` row into the correct dashboard records, scoped to a
tenant: ensure a **channel** and a **conversation** exist (the contact is stored
by value as `external_contact_id` — **no customer/identity model**, ADR-0012).

## Inputs

- An `ai.agno_sessions` row: `session_id` (opaque token), `user_id` (the contact phone, PII),
  `agent_id` (derived `tenant_id:channel_id`; `concierge` is legacy), `created_at`, `updated_at`.

## Resolution order

```
agent_id / (future) business+phone-number id
        ──► app_channels (ACTIVE only, matching source-mapping; EXACTLY ONE)
                 ──► tenant_id (the channel's tenant)
external_contact_id (from session.user_id; stored BY VALUE, masked on read)
session_id
        ──► app_conversations (find-or-create the CONTACT THREAD by tenant+channel+external_contact_id)
        ──► app_conversation_sessions (upsert provider-session link: external_session_id = session_id)
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
3. **Find-or-create the contact thread, then link the provider session** (ADR-0016)
   - Look up the thread `app_conversations(tenant_id, channel_id, external_contact_id)`.
   - If missing: insert with `external_contact_id`, `status='open'`
     (CHECK: `open`/`resolved`/`archived`); roll `first_at`/`last_at` from the session.
   - **Upsert the provider session** `app_conversation_sessions(tenant_id, provider='agno',
     external_session_id=session_id, conversation_id=<thread>, started_at=to_timestamp(created_at),
     last_at=to_timestamp(updated_at))`; then roll the thread `last_at = max(session last_at)` and **bump
     `updated_at`**.

## Idempotency & uniqueness

- The thread "create" step relies on the **contact-thread uniqueness**
  `(tenant_id, channel_id, external_contact_id)` (ADR-0016) so re-running never duplicates threads.
- The provider-session link relies on `app_conversation_sessions` **`unique(tenant_id, provider,
  external_session_id)`** so re-running never duplicates session links.
- **Conversation identity is the contact thread** (`external_contact_id`), **not** `agno_session_id`
  (ADR-0016) — one thread may link **many** provider sessions.

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
