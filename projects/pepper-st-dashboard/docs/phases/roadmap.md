# Roadmap — Beyond Phase 1

- **Project:** pepper-st-dashboard
- **Status:** living
- **Last updated:** 2026-06-15

> Parked items are intentionally out of Phase 1. Each will get its own scope, ADR
> update(s), and approval gate when picked up.

## Phase 2 — Live human handover (mandatory) + identity & auth

- **Live WhatsApp human chat + AI→human handover — MANDATORY** (ADR-0009,
  Workflow 08): when the AI **cannot complete a task** it hands over to a human
  operator who can see the conversation, see the **handover reason**, take the next
  action, and **reply to the customer via the WhatsApp-connected dashboard**. The
  **canonical transcript stays upstream** (Agno/WhatsApp); the dashboard stores
  **handover/control/send-status metadata only** — **no message duplication**
  without a separate ADR. Depends on auth + the contracts below; the control-plane
  schema lands behind its **own migration gate**.
- **Tenant/source + outbound contract** (ADR-0008, Workflow 09): adopt `metadata`
  or unique session ids so multi-tenant routing is collision-safe, **and** define
  the **send + pause/resume + handover-signal** APIs live chat requires. **Blocks**
  onboarding a second WhatsApp tenant on overlapping numbers.
- **Auth & roles** (`docs/product/01-users-and-roles.md`): Tenant Operator/Admin,
  Platform Operator. Enables tenant login, scoping enforcement, and **who may take
  over / reply**.
- **Reveal phone (admin-only)**: authorization check on top of stored real value
  (no migration needed — ADR-0005).
- **Onboarding UI** for Platform Operators (replaces seed/manual Workflow 01).

## Phase 3 (candidate) — Operational depth

- **Per-visit / per-day conversation splitting** (revisits ADR-0003): segment a
  rolling Agno thread by time gap into distinct conversations for analytics.
- **Rich AI metadata** once the bot emits a stable contract: intent, AI summary,
  confidence, priority, business category — slot into existing surfaces (ADR-0007).
- **Analytics rollups**: materialized aggregates if live querying outgrows the
  current volume (new ADR). Rollups are the prerequisite for **analytics history
  beyond the retention window**. In Phase 1, **raw chat access** is controlled by
  `raw_history_retention_days` and **analytics detail** by `analytics_retention_days`
  (`NULL` = unlimited); because no rollup table exists yet, longer analytics history
  needs these rollups / a plan feature (ADR-0006).

## Phase 4 (candidate) — Ops depth & advanced human-in-the-loop

- **Advanced human-in-the-loop** (builds on the Phase 2 live chat, Workflow 08):
  canned replies, multi-operator routing/assignment, supervisor view, SLA timers.
  (Core take-over/reply is **Phase 2 — mandatory**, not here.)
- **Parked prototype screens** as real features *only if* backed by real data:
  Orders/Order Conversations, Customer Issues, Exchange Requests, Future
  Follow-ups, Custom Items, Staff Tasks, advanced Bot Status, full Settings.
- **Billing/plan enforcement** beyond retention (limits, metering from token/cost).

## Cross-cutting (ongoing)

- Keep living docs current (decision log, ADRs, workflows) — part of "done".
- Maintain read-only boundary to `ai.*` and PII masking in every new surface.
- Re-validate assumptions as data volume and tenant count grow (current sample:
  11 sessions, 1 agent).

## Explicitly still out of scope

- Building/tuning the AI bot; Shopify/commerce/checkout/payments/orders.
- Any direct mutation of `ai.agno_*`.
- Duplicating raw chat messages into dashboard storage.
