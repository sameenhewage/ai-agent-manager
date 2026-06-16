# CONTEXT — PEPPER ST. Dashboard

> Domain glossary and shared context for the PEPPER ST. AI Chat Operations
> Dashboard. This is the **single source of truth for vocabulary**. When any
> doc, ADR, issue, test, or code names a domain concept, use the term exactly as
> defined here. Do not drift to synonyms.

> **V2 full-system docs (2026-06-16, Gate V2-DOCS):** for the **end-to-end** system —
> including the AI-owned `ai.*` tables the app reads (`ai.agno_sessions`, `ai.customers`,
> `ai.agno_metrics`) — start at
> [`docs/v2/00-system-overview.md`](./docs/v2/00-system-overview.md) and the DB inventory
> [`docs/v2/01-database-inventory.md`](./docs/v2/01-database-inventory.md). This
> `CONTEXT.md` remains the **vocabulary** source of truth.

- **Project:** `pepper-st-dashboard`
- **Status:** Phase 1 — Slices 0–7C built (dense real-data **Dashboard** [KPIs + charts + recent], Chat Monitor [lazy-loaded `○ Static` shell, full-height workspace], Analytics report [two real charts]; full-page SaaS layout, real-data only, no document scroll)
- **Last updated:** 2026-06-16
- **Stage:** Phase 1 build complete + **Slice 11B COMPLETE** (Agno v2 re-alignment executed: live data
  restored — mapped 4 / active orphans 0 / **13 orphans archived**; all hardened verifiers + browser
  smoke green). **Gate 8 ✅**, **Gate 9 ✅** (self-host adjacent to the Agno PostgreSQL), **Gate 10 ✅**,
  **Gate 11A ✅ + ADR-0011 Accepted** (no schema migration; agent key **DERIVED**
  `<tenant_id>:<channel_id>`, contact = `user_id`, opaque `session_id`). **Gate 12 ✅ PASS** — full DB
  re-analysis (vs the Jun-15 `ai`-only `pg_dump`) + product-behaviour gap review: DB + mapping logic
  re-verified live, **no migration warranted**; found scale risks (no `agent_id` index on
  `ai.agno_sessions`; per-request full-`runs` parse) and product gaps (cost/token depth, filter
  responsiveness, real-time, WhatsApp-like chat paging). Hardening roadmap **12A–12G drafted**.
  **Slice 12D (read-path performance) EXECUTED** (2026-06-16, TD-069): read `ai.agno_sessions` by
  **`session_id` PK** (`= ANY($mappedIds)`, scoped by derived `agent_id`) instead of an `agent_id`
  seq-scan, push the date window into SQL via the indexed `app_conversations.last_at`, and compute
  Chat-list turns via SQL `jsonb_array_length` (Analytics keeps the parse only because it also needs
  the de-duped non-system `messages` count, now over the narrowed in-range universe). **No DB writes,
  no migration, `ai.*` untouched, displayed numbers unchanged**; exact metric parity, all verifiers +
  browser smoke green. **Slice 12D-B COMPLETE** (2026-06-16, TD-070): read-only **Agno transcript
  boundary** audit — **all 12 goals PASS, no bug**. Locked that messages stay canonical in
  `ai.agno_sessions.runs`, `dashboard.*` is index/metadata only (no `app_conversation_messages` / message
  index / content cache), **one Agno `session_id` → one conversation**, **one contact → many sessions →
  many conversations** (one identity), future webhook/trigger sync = metadata-only. Added 3 schema grain
  lock-tests → **126/126**; no production code changed. **Slice 12C COMPLETE** (2026-06-16, TD-071):
  **filter/loading UX polish (UI-only)** — range/filter clicks now keep previous KPI/chart/recent data
  mounted while the server recomputes, dim each region with `aria-busy`, show a spinner on the clicked
  range, soft-disable all buttons, and announce a polite "Updating…" badge; applied to **both** Dashboard
  and Analytics (Analytics keeps its panel-bar toolbar + custom range — only the loading language was
  unified, no toolbar redesign). Built on a pure `lib/dashboard/range-toolbar.ts` helper (9 TDD tests) +
  reusable `Spinner`/`PendingSection`/shared `RangeToolbar`. **No DB writes, no migration, `ai.*`
  untouched, no new metrics, URL-as-state unchanged**; per-widget `<Suspense>` streaming + API split
  **deferred** (overlaps 12D). `typecheck` clean, **135/135** tests, `next build` green, all 4 read-only
  verifiers + reconfirm PASS (parity exact), browser smoke green (masked, no id leaks, no console errors).
  **Slice 12D-D COMPLETE** (2026-06-16, TD-072 / ADR-0012): **dashboard v2 schema simplification** — dropped
  the duplicate, unused customer/identity model (`app_customers` + `app_customer_identities` tables and
  `app_conversations.customer_id`/`customer_identity_id`); the contact now lives **only** as
  `app_conversations.external_contact_id` (TEXT NOT NULL, indexed **not** unique). **The dashboard now owns
  exactly 4 tables** (`app_tenants`, `app_channels`, `app_conversations`, `app_tenant_entitlements`).
  Migration `0001` **APPLIED to the live DB** (product-approved; full backup
  `backups/2026-06-16-dashboard-pre-12dd.sql` taken; raw PII dumps gitignored); `ai.*` untouched; grain +
  transcript boundary (ADR-0004) + masking (ADR-0005) unchanged; sync does one upsert per Agno session (no
  find-or-create). `typecheck` clean, **138/138** tests, `build` green; all 4 read-only verifiers +
  reconfirm PASS (parity exact: conv 4 / turns 38 / messages 110 / tokens 828,005 / cost $0.077716308);
  browser smoke green (masked, **no raw phone/session leak** in HTML or API payloads).
  **Slice 12C-API COMPLETE** (2026-06-16, TD-073 / ADR-0013): **API-driven Dashboard/Analytics data
  loading** — completed the deferred half of Slice 12C. Dynamic data now flows through internal
  `GET /api/dashboard` + `GET /api/analytics` route handlers consumed by **client widgets** (native
  `fetch` + a pure `async-data` reducer): **initial paint stays SSR** (real-data-first, deep-link), each
  range/custom change refetches on the client, **keeps the previous data visible** with localized pending
  + user-safe **error/retry**, and syncs the URL via `history.replaceState`. Routes are a **thin HTTP
  boundary** over the existing services (no SQL in handlers); **client never sends tenant/channel**
  (server-resolved; injected ids ignored); **safe masked DTOs only** (whitelisted recent items — no raw
  `external_contact_id`/`agno_session_id`, no `customer_id`/`customer_identity_id`); bad/incomplete-custom
  ranges → **400**. **No schema/DB/`ai.*` writes, no migration; 4-table schema intact; no realtime/polling;
  real metrics unchanged.** `typecheck` clean, **159/159** tests (21 new), `build` green; all 4 verifiers +
  reconfirm PASS (parity exact: conv 4 / turns 44 / tokens 1,010,101 / cost $0.097590316); browser smoke
  green (range→API fetch, URL sync, prev data stays, no PII leaks, no console errors).
  **Slice V2-TRUTH COMPLETE** (2026-06-16, TD-077/078): Business-Truth TDD Gate (see §7) + honest
  metric-universe **coverage** (`liveValid`/`mapped`/`excluded`, masked refs) on `/api/dashboard` +
  `/api/analytics` with a safety-net banner; empty assistant messages excluded. **Slice 12E COMPLETE**
  (2026-06-16, TD-079): WhatsApp-like Chat Monitor pagination (opaque absolute-index cursor, scroll-up
  loads older, **no message table**) **+ customer-name display** (`ai.customers.name`, masked fallback)
  + the **Chat Monitor UX validation fix** (customer-LEFT / assistant-RIGHT bubbles, consolidated
  WhatsApp/Read-only badges; TD-080). **Slice 12F REDEFINED** (2026-06-16, TD-081) as **_Realtime
  Monitoring + Automatic Agno Sync_** — realtime is now **MANDATORY** (no manual `db:agno:sync` during
  customer use; **SSE** browser updates + automatic sync freshness; the coverage banner is a safety net
  only; design in `docs/architecture/08` §5). **That was a docs-only gate; 12F + 12A/12B remain
  approval-gated, 12G conditional.** **Deploy data-blocker cleared**; revisit deploy after the realtime
  slice. Parser intact. See
  `docs/database/07-old-vs-current-db-comparison.md`,
  `docs/architecture/08-dashboard-data-loading-and-realtime-strategy.md`,
  `docs/product/05-dashboard-analytics-chat-gaps.md`,
  `docs/phases/phase-1-post-acceptance-hardening.md`,
  `docs/handoff/2026-06-16-slice-12c-dashboard-analytics-loading-ux.md`,
  `docs/handoff/2026-06-16-slice-12d-b-agno-transcript-boundary-review.md`,
  `docs/handoff/2026-06-16-slice-12d-perf-refactor.md`,
  `docs/handoff/2026-06-16-slice-12d-d-schema-simplification.md`,
  `docs/database/08-dashboard-v2-schema-simplification.md`,
  `docs/handoff/2026-06-16-slice-12c-api-driven-filter-loading-ux.md`,
  ADR-0011/**ADR-0012**/**ADR-0013**; deploy docs `docs/deployment/`.
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
`external_business_id`, `external_phone_number_id`). The dashboard binds a session to a channel by **deriving** the Agno
`agent_id = "${app_tenants.id}:${app_channels.id}"` (tenant-first; confirmed + live-verified) and
matching it against `ai.agno_sessions.agent_id`. `source_agent_id` is an optional legacy cache only —
the v1 literal `concierge` is obsolete.

### Customer (end customer)
A **person who chats with the tenant's bot**. The **registry is AI-owned**
(`ai.customers` / `ai.agno_sessions.user_id`) — the dashboard's old `app_customers`
table was **removed in Slice 12D-D (ADR-0012)** and is **not** reintroduced; the
dashboard identifies a contact only by the masked `external_contact_id` value on
`app_conversations`.

### Customer Identity *(removed — historical)*
The v1 link between a Customer and an external contact id on a channel. The
`app_customer_identities` table was **removed in Slice 12D-D (ADR-0012)**; there is
**no dashboard-side identity table**. The external contact id now lives **by value**
on `app_conversations.external_contact_id` (one value may appear in many
conversations); the contact registry is AI-owned.

### Conversation
The dashboard's **mapping record** for one Agno session. Stored in
`app_conversations`. **Grain: one `ai.agno_sessions` row (keyed by the opaque
`session_id`) = one Conversation;** a single contact (`user_id`) may own **many** sessions
(one contact : N conversations). It holds `agno_session_id` (the link to Agno),
`external_contact_id` (the masked contact, stored **by value** — no
`customer_id`/`customer_identity_id` since ADR-0012), and cached
timing (`first_at`, `last_at`) — **never** message bodies. Dashboard-owned
`status` is one of `open`/`resolved`/`archived` (CHECK-constrained), and
`updated_at` is bumped when mapping refreshes `last_at`/`status`. Uniqueness is
`(tenant_id, channel_id, agno_session_id)`; `external_contact_id` is **indexed,
not unique**. Per-visit / per-day splitting is **parked** (see roadmap).

### Agno Session
A row in **`ai.agno_sessions`** (external, read-only to us). Its **`session_id` is an opaque
32-char token** (the table's primary key) — **no longer the phone**. The WhatsApp contact (phone,
PII) is in **`user_id`**, and `agent_id` = `<tenant_id>:<channel_id>`. A session is a **rolling
thread**: new turns append to `runs[]` and `updated_at` advances. We treat `user_id` (and any phone)
as **sensitive PII** and mask it.

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
The contact's id on a channel: the WhatsApp phone (text), sourced from
**`ai.agno_sessions.user_id`**. Stored **by value** on
`app_conversations.external_contact_id` (TEXT, NOT NULL, indexed **not** unique — no
separate identity table since ADR-0012). **Never stored as a number; never assumed to start with `94`; always masked.**

### Agno Session ID
The value linking `app_conversations` → `ai.agno_sessions.session_id` (the opaque 32-char token).
It is **distinct from** `external_contact_id` (the contact phone, from `user_id`) — in v2 they have
**diverged**: one contact (`user_id`) can own many `session_id`s.

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
Phone numbers (the contact `user_id`) are **masked by default** in list views and logs
(e.g. `94•••••815`); the opaque `session_id` is never shown raw either. Full visibility is a
**future admin-only** capability.

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

---

## 7. Engineering rules

### Business-Truth TDD Gate (permanent)

> **Before any feature/fix implementation starts, tests must prove the real
> business contract, not just the current implementation path.**

For Dashboard/Analytics this means:

- The **source-of-truth universe must be defined before implementation.**
- If `ai.agno_sessions` has **valid tenant/channel sessions** for a date range,
  Dashboard/Analytics must **either**:
  1. **include** those sessions in the totals, **or**
  2. **return/report explicit exclusion reasons** for every missing session.
- A test that only proves `dashboard.app_conversations` has 4 rows and the UI
  shows 4 is **not enough**.
- **Parity tests** must compare app API results against **independent
  source-of-truth fixtures or SQL** — never against the implementation's own
  output.
- **PASS is not allowed unless business-truth tests pass.**

**Example**

- **Bad test:** "Given 4 `app_conversations`, dashboard shows 4."
- **Good test:** "Given **6 valid PEPPER ST Agno sessions today**, Dashboard/
  Analytics either count all 6 **or** explain exactly why 2 are excluded."

**Note on live data:** the live `ai.*` dataset grows in real time, so
business-truth tests are **fixture-based + invariant/parity** assertions — they
must **not** pin to a snapshot's absolute counts (those drift within minutes).
