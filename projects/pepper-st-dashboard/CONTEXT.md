# CONTEXT — PEPPER ST. Dashboard

> Domain glossary and shared context for the PEPPER ST. AI Chat Operations
> Dashboard. This is the **single source of truth for vocabulary**. When any
> doc, ADR, issue, test, or code names a domain concept, use the term exactly as
> defined here. Do not drift to synonyms.

- **Project:** `pepper-st-dashboard`
- **Status:** Phase 1 — docs-first bootstrap (no application code yet)
- **Last updated:** 2026-06-15
- **Stage:** Stage 1 analysis approved → docs/ADRs/schema-proposal only
- **Stack (locked):** Next.js + TypeScript + Tailwind + **shadcn/ui** (restyled to
  match the demo UI) + **Drizzle ORM** + PostgreSQL + **Zod**. Migrations via
  **Drizzle**; raw `pg` only as Drizzle's driver. See `docs/architecture/05-tech-stack.md`.

---

## 1. What this product is

A **multi-tenant SaaS operations dashboard** that sits **on top of an existing
Agno WhatsApp AI agent**. The AI agent already talks to customers on WhatsApp and
already writes its sessions to PostgreSQL (`ai.agno_sessions`). This dashboard
**reads and organizes** that activity into a usable operations console:
conversation monitoring, transcript history, and analytics.

**This dashboard does NOT:**

- build, host, or modify the AI bot;
- integrate with Shopify, payments, checkout, or orders;
- own or mutate the `ai.agno_*` tables;
- duplicate raw chat messages into its own storage.

It is a **read-and-organize layer** with its own **`dashboard` schema** that
**maps to** Agno data by reference.

---

## 2. System boundary (who owns what)

| Concern | Owner | Notes |
|---|---|---|
| WhatsApp conversation + AI replies | **Agno bot** (external) | Writes `ai.agno_sessions` |
| Raw transcript (`runs[].messages[]`) | **Agno** (`ai` schema) | Dashboard reads, never copies |
| Tenant / channel / customer / conversation mapping | **Dashboard** (`dashboard` schema) | `app_*` tables |
| Analytics, masking, retention enforcement | **Dashboard** | Query/access layer |
| Products, checkout, orders | **Shopify** (external) | Out of scope entirely |

---

## 3. Glossary (canonical terms)

### Tenant
A **business/client** that uses the dashboard (e.g. **PEPPER ST.**, ABC Fashion,
XYZ Auto Care). A tenant is **not** a chat session and **not** a customer.
Onboarding a new business creates a **fresh tenant** with a **fresh, empty,
tenant-scoped dashboard**. Stored in `app_tenants`. Multi-tenancy is **mandatory
from day one**, even though login/auth is parked.

### Channel
A **source/integration** through which a tenant receives conversations
(Phase 1: **WhatsApp**). Stored in `app_channels`, scoped to a tenant, and
identified by a stable **`channel_key`** (uniqueness is `(tenant_id, channel_key)`,
**not** `(tenant_id, type)`) so a tenant can hold **more than one** WhatsApp
channel later. A channel carries **source-mapping fields** that bind dashboard
records to the upstream bot (`source_agent_id`, `source_team_id`,
`external_business_id`, `external_phone_number_id`; Phase 1 sets only
`source_agent_id`). For the demo, the Agno `agent_id = concierge` maps to the
**PEPPER ST. → WhatsApp** channel.

### Customer (end customer)
A **person who chats with the tenant's bot** — tenant-scoped. Stored in
`app_customers`. The dashboard rarely knows a real name (Agno has none), so
`display_name` is nullable.

### Customer Identity
The link between a **Customer** and an **external contact id on a channel**.
Stored in `app_customer_identities` as `(channel, external_contact_id)`.
In Phase 1, `external_contact_id` is the **WhatsApp phone number**.

### Conversation
The dashboard's **mapping record** for one Agno session. Stored in
`app_conversations`. **Phase 1 grain: one `ai.agno_sessions` row (per phone) =
one rolling Conversation.** It holds `agno_session_id` (the link to Agno),
`customer_identity_id` (the exact identity resolved during mapping), and cached
timing (`first_at`, `last_at`) — **never** message bodies. Dashboard-owned
`status` is one of `open`/`resolved`/`archived` (CHECK-constrained), and
`updated_at` is bumped when mapping refreshes `last_at`/`status`. Uniqueness is
`(tenant_id, channel_id, agno_session_id)`; `external_contact_id` is **indexed,
not unique**. Per-visit / per-day splitting is **parked** (see roadmap).

### Agno Session
A row in **`ai.agno_sessions`** (external, read-only to us). Its **`session_id`
is currently the WhatsApp phone number** and is the table's global primary key.
A session is a **rolling thread**: new turns append to `runs[]` and `updated_at`
advances. We treat `session_id` as **sensitive** (it is PII).

### Run
One element of `ai.agno_sessions.runs[]` — a **single agent invocation/turn**:
`input`, `content`, `messages[]`, `model`, `metrics`, `created_at`, `status`.

### Message
One element of `runs[].messages[]`: `{ role, content, id, created_at,
from_history, ... }`. Roles seen: `system`, `user`, `assistant`, `tool`.

### Transcript
The **rendered conversation** built live from Agno: flatten `runs[].messages[]`,
**exclude `role=system`**, **dedupe by message `id`** / honor `from_history`,
order by `created_at`. The dashboard renders this on demand — it is **not stored**.

### Turn / Message count
Derived metrics: turns = `jsonb_array_length(runs)`; message count = count of
displayed (non-system, de-duplicated) messages.

### Token/Cost Metrics
Real usage data from `session_data.session_metrics`
(`total_tokens`, `input_tokens`, `output_tokens`, `reasoning_tokens`,
`cache_read_tokens`, `cost`). The only reliable "usage" signal available today.

### External Contact ID
The contact's id on a channel. Phase 1: the WhatsApp phone (text). Stored on
`app_customer_identities` and cached on `app_conversations`. **Never stored as a
number; never assumed to start with `94`.**

### Agno Session ID
The value linking `app_conversations` → `ai.agno_sessions.session_id`. In Phase 1
it equals the `external_contact_id` (both are the phone). They are modelled as
**distinct fields** because they will diverge in production.

### Tenant Entitlements
The tenant's **current access/limits** configuration: `app_tenant_entitlements`
(renamed from `app_subscription_limits`), **one current row per tenant** (1:1). Holds
`plan_code` (non-final label, e.g. `standard`/`enterprise`), `is_fully_enabled`, and
the retention knobs. It is **not** a finalized pricing/billing model — pricing is
**parked** for the internal team to decide later.

### Tenant Timezone
`app_tenants.timezone` (default `Asia/Colombo`). Drives the **Today / Month / Custom**
analytics day boundaries so tenants in other countries get correct local ranges. No
locale/currency tables in Phase 1.

### Retention Window
Per-tenant retention on `app_tenant_entitlements`: `raw_history_retention_days`
(transcript + Chat Monitor list) and `analytics_retention_days` (analytics).
Both are **set explicitly at onboarding** (no hidden column default); **`NULL` =
unlimited** (enterprise / fully enabled — e.g. PEPPER ST.). It is an **access limit**, not deletion: a conversation whose `last_at`
is older than the raw-history cutoff is out-of-window → **restricted/empty**, and
analytics detail is capped at `analytics_retention_days` (no rollup table yet). When
a knob is `NULL`, that dimension is unlimited. **We never delete `ai.agno_sessions`.**

### Masking
Phone numbers / `session_id` are **masked by default** in list views and logs
(e.g. `94•••••815`). Full visibility is a **future admin-only** capability.

### Canonical Transcript
The **single authoritative** record of a conversation's messages, **owned upstream**
by the Agno / WhatsApp pipeline. The dashboard **renders it live, read-only**
(ADR-0004/0009) and **never** holds a second copy — all message content lives here,
not in `dashboard.*`.

### Handover (AI → Human)
When the AI bot **cannot complete a task** it hands the conversation to a **human
operator**, emitting a **reason**. A **Phase 2 (mandatory)** capability (ADR-0009,
Workflow 08). The dashboard records the handover as **metadata** (reason, direction,
actor, time) — not message content.

### Conversation Control / Ownership
Dashboard-owned **control-plane** state for who is currently handling a conversation
(**AI** vs a **human operator**) and whether the AI is paused — e.g. `ai_active`,
`human_requested`, `human_active`, `resolved`. Metadata only.

### Outbound Reply / Send Status
A human reply **sent via the WhatsApp-connected dashboard** by calling the
bot/WhatsApp API (the bot persists it into the **Canonical Transcript**). The
dashboard stores only **send-status metadata** (`queued`/`sent`/`delivered`/`read`/
`failed`) + the **upstream message id** — **never the message body** (ADR-0009).

### Parked
A feature intentionally **out of Phase 1 scope**, documented for later (e.g.
Orders, Issues, Exchanges, Follow-ups, Custom Items, Staff Tasks, advanced Bot
Status, login/auth, per-visit conversation splitting). *(Live human chat is no
longer parked — it is **Phase 2, mandatory**; see Handover above.)*

---

## 4. Phase 1 scope in one paragraph

Show **only real, available data** from `ai.agno_sessions`, tenant-scoped:
the **contact/session id** (masked), the **transcript**, **timestamps**,
**turn/message counts**, and **token/cost metrics**. Three nav surfaces only:
**Dashboard**, **Chat Monitor**, **Analytics**. Keep the prototype's visual
style. **Do not fabricate** intent, AI summary, confidence, priority, business
category, issue/exchange/follow-up links, or AI-resolved KPIs — those are parked
until the bot emits them through a stable contract.

---

## 5. Vocabulary we deliberately avoid (anti-synonyms)

- Don't say "user" for an end customer — say **Customer** (and "Tenant user" for
  future staff/admins).
- Don't say "session" loosely — distinguish **Agno Session** (external row) vs
  **Conversation** (our mapping record).
- Don't call a tenant a "store", "account-as-session", or "workspace-as-session".
- Don't call the phone an "id number" — it's an **External Contact ID** (text).

---

## 6. Pointers

- Product intent → `docs/product/`
- Architecture & schema proposal → `docs/architecture/`
- Decisions → `docs/adr/` and `docs/changelog/technical-decision-log.md`
- Step-by-step processes → `docs/workflows/`
- Phase/version planning → `docs/phases/`
