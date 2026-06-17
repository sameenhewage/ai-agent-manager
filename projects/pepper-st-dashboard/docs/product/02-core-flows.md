# 02 — Core Flows

- **Project:** pepper-st-dashboard
- **Status:** Phase 1 (docs-first)
- **Last updated:** 2026-06-15

High-level product flows for Phase 1. Detailed, technical step-by-step versions
live in `docs/workflows/`.

---

## Flow A — Onboard a business (tenant)

1. A new business (e.g. PEPPER ST., ABC Fashion) is registered as a **tenant**.
2. A **channel** (WhatsApp) is created for that tenant, carrying source-mapping
   fields that bind it to the upstream Agno agent (e.g. `source_agent_id =
   concierge`).
3. The tenant's **entitlements** row is set **explicitly** (`app_tenant_entitlements`;
   PEPPER ST. = enterprise / fully enabled, retention **NULL** = unlimited). No hidden
   defaults — `plan_code` and `is_fully_enabled` are always provided at onboarding.
4. The operator opens the dashboard **scoped to that tenant** and sees a **fresh,
   empty** dashboard until conversations map in.

Phase 1: this is a **documented seed/manual workflow** (no onboarding UI yet).
See `docs/workflows/01-tenant-onboarding.md`.

---

## Flow B — A conversation appears

1. The Agno bot handles a WhatsApp chat and writes/updates a row in
   `ai.agno_sessions` (its `session_id` is an **opaque token**; the contact phone is `user_id` — ADR-0011).
2. The dashboard's **mapping workflow** resolves that session to the right
   tenant + channel, **finds-or-creates the customer/contact thread** (`app_conversations`, one row per
   contact, keyed by `external_contact_id` = `user_id`), and **links the provider session** to it
   (`app_conversation_sessions.external_session_id` = `session_id`) — ADR-0012/0016 (no
   `app_customers` / `app_customer_identities`; the contact is stored **by value**, masked).
3. The conversation now shows in **Chat Monitor** for that tenant, with the
   contact id **masked**.

See `docs/workflows/02-...` and `docs/workflows/04-...`.

---

## Flow C — Read a transcript (Chat Monitor)

1. Operator selects a conversation in the list (masked contact + last-activity
   time + turn count).
2. The dashboard reads the thread's linked Agno/provider session(s) **live**, builds the **Transcript**
   (**merge all linked sessions**, flatten `runs[].messages[]`, drop `system`, dedupe by `id`, order by
   time — ADR-0016), and renders it in the prototype's 3-column style.
3. **Retention** is applied at read time: messages older than the tenant's
   window are not shown.

See `docs/workflows/03-agno-transcript-rendering.md`.

---

## Flow D — Analytics with date filters

1. Operator opens **Analytics** and picks a range (Today/3/7/14/30/This
   month/Custom).
2. The dashboard computes **only real metrics** for that tenant + range:
   conversation counts, turn/message counts, token/cost totals, new vs returning
   contacts.
3. Unsupported prototype metrics (AI-resolved %, intents, issues, etc.) are
   **omitted**, not faked.

See `docs/workflows/05-analytics-filter.md`.

---

## Flow E — Dashboard summary

1. Operator opens **Dashboard**.
2. Sees headline cards built from the **same real metrics** as Analytics for the
   selected range, plus a recent-conversations list.
3. No parked-domain KPIs (exchanges/issues/follow-ups/tasks) are shown.

---

## Parked flows (documented, not built in Phase 1)

- Per-visit / per-day conversation splitting.
- Live human takeover / replying to WhatsApp from the dashboard.
- Reveal full phone (admin), staff management, billing enforcement.
- Rich AI metadata (intent/summary/priority) once the bot emits a contract.

See `docs/phases/roadmap.md`.
