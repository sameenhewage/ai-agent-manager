# Workflow 04 — Agno Session Indexing / Mapping

- **Status:** Phase 1 (docs-first)
- **Last updated:** 2026-06-16
- **Related:** Workflow 02, ADR-0003, ADR-0008, **ADR-0012**, **ADR-0016**

> **⚠ ADR-0016 update (2026-06-17):** `app_conversations` is the **customer/contact thread** (one row
> **per contact**); each Agno session is a **provider session** indexed in **`app_conversation_sessions`**
> (`external_session_id` = `session_id`, by value). "One upsert per Agno session" below becomes
> **find-or-create the thread, then upsert the provider-session link**. Conversation identity = the
> contact thread, **not** `agno_session_id`.

## Goal

Keep `dashboard.app_conversations` **in sync as
an index** over the tenant's `ai.agno_sessions` rows (the contact is stored by
value as `external_contact_id` — no customer/identity rows, ADR-0012) — without copying transcripts
and without mutating Agno.

## Why an index at all (if we read live)?

- Fast tenant-scoped **listing/ordering** (`tenant_id, last_at DESC`) and
  uniqueness, without scanning Agno JSON each time.
- A stable place for **dashboard-owned** fields (`status`, cached timing) that
  Agno does not provide.
- A boundary that lets the contact↔conversation identity diverge later (ADR-0008).

## Reconcile procedure (idempotent)

For a given tenant + channel (e.g. PEPPER ST. / `concierge`):

1. **Select candidate Agno sessions** (read-only) for an **active** channel
   (`is_active = true`): rows where `agent_id` matches the channel's
   `source_agent_id` (Phase 1 rule).
2. For each session, run **Workflow 02** find-or-create (**conversation only** — no
   customer/identity model, ADR-0012) — which enforces the **active, exactly-one** channel resolution
   (0 → unmapped, >1 → ambiguous + masked warning; never guess a tenant).
3. **Refresh** `app_conversations.last_at = to_timestamp(updated_at)` and
   `first_at = to_timestamp(created_at)`; **bump `updated_at`**.
4. **Do not delete** dashboard conversations whose Agno row is missing — instead
   mark/flag (Agno is source of truth; absence may be transient). Deletion policy
   is a future decision.

## Triggers (Phase 1 options — pick at build gate)

- **Lazy:** reconcile the current tenant when Chat Monitor/Analytics loads.
- **Scheduled:** periodic reconcile job per tenant.
- **Future:** event/webhook from the bot (needs ADR-0008 contract).

## Indexing fields

- **Conversation (thread) identity (ADR-0016):** `(tenant_id, channel_id, external_contact_id)` — one
  thread per contact (was `(tenant_id, channel_id, agno_session_id)`).
- **Provider-session uniqueness:** `app_conversation_sessions (tenant_id, provider, external_session_id)`.
- Non-unique index: `(tenant_id, channel_id, external_contact_id)` (contact lookup;
  a contact may have several conversations — ADR-0008/0012).
- Order index: `(tenant_id, last_at DESC)` for the conversation list.

## Hard rules

- Read-only on `ai.*`.
- No transcript/message rows.
- Mapping must be **idempotent** (safe to re-run).
- Reconcile **active** channels only (`is_active = true`).
- Unmapped `agent_id` → logged (masked), never auto-creates a tenant.
- A session matching **>1 active channel** → **ambiguous**: skip + masked warning,
  never guess a tenant (fix the overlapping `app_channels` config).

## Acceptance

- After reconcile, every in-range `concierge` session has exactly one
  conversation under PEPPER ST.; re-running changes nothing (no dupes).
- `last_at` reflects the latest `updated_at`.
