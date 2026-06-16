# V2 / 00 — System Overview (PEPPER ST. Dashboard)

> **Gate V2-DOCS (2026-06-16).** Documentation/audit only — **no code, DB, schema,
> migration, seed, sync, or `ai.*`/`dashboard.*` writes were made to produce this.**
> All DB facts come from **read-only** SQL (`SET default_transaction_read_only = on`).
> Where something is not proven, it is marked **UNKNOWN / TO VERIFY**.

This folder (`docs/v2/`) is the **end-to-end** description of the *total* system the
app touches — both the dashboard-owned `dashboard` schema **and** the AI-platform
`ai` schema it reads. The older `docs/database/*` and `docs/architecture/*` describe
the dashboard-owned side only; start here for the whole picture.

Read in order: `00` (this) → `01` inventory → `02` relationships/flows → `03` app
architecture → `04` metrics source-of-truth → `05` chat monitor + customer display →
`06` demo readiness.

---

## 1. What the app is

A **multi-tenant SaaS operations dashboard** built **on top of an existing Agno
WhatsApp AI agent**. The Agno bot chats with customers on WhatsApp and writes its
state to PostgreSQL (`ai.agno_sessions`, `ai.customers`, …). This dashboard **reads
and organises** that activity into three operator surfaces. It is a *read-and-
organise* layer, **not** the bot, **not** a message store, **not** a Shopify
integration.

- **Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind · shadcn/ui
  (restyled) · Drizzle ORM · PostgreSQL · `pg` driver. (`base-dashboard-app/`.)
- **Tenancy:** multi-tenant from day one; every dashboard row carries `tenant_id`.
  Auth is parked — the current tenant is resolved by slug (`pepper-st`) server-side
  (`lib/tenant/context.ts`), a temporary stand-in for real auth.
- **Same database, two schemas:** the dashboard self-hosts **adjacent to** the Agno
  Postgres. It **owns and writes only** the `dashboard` schema; it **only reads** the
  `ai` schema. There is **no cross-schema foreign key** — cross-schema links are
  **by value** (e.g. `agno_session_id` = `ai.agno_sessions.session_id`).

## 2. Current demo goal

Show a client a **calm, real-data** operations console for their WhatsApp AI agent:

- **Dashboard** — dense KPIs + two charts + recent conversations for a chosen range.
- **Analytics** — date-filtered real metrics (conversations, turns, tokens, cost).
- **Chat Monitor** — tenant-scoped conversation list + live, **masked**, read-only
  transcripts.

The data must be **real** (no fabricated KPIs — ADR-0007), **masked** (no raw phone /
session id — ADR-0005), and **calm** (one updating indicator, not loader spam —
Slice 12C-UX / ADR-0013).

## 3. Main app surfaces

| Surface | Route | Loading model | Status |
|---|---|---|---|
| **Dashboard** | `app/(dashboard)/page.tsx` → `components/dashboard/dashboard.tsx` | SSR initial paint (`getAnalyticsData` + `getConversationList`), then **client fetch** `GET /api/dashboard?range=` on filter change | Implemented |
| **Analytics** | `app/(dashboard)/analytics/page.tsx` → `components/analytics/analytics.tsx` | SSR initial paint (`getAnalyticsData`), then **client fetch** `GET /api/analytics?range=&from=&to=` | Implemented |
| **Chat Monitor** | `app/(dashboard)/chat-monitor/page.tsx` → `components/chat-monitor/chat-monitor.tsx` | Fully **client fetch**: list `GET /api/chat-monitor/conversations`, then transcript `GET …/[id]/transcript` | Implemented |
| Onboarding / Settings / Auth | — | — | **Not implemented** (parked; auth + tenant onboarding are future phases) |

## 4. Ownership boundary

| Concern | Owner | This app's policy |
|---|---|---|
| `dashboard.*` (4 tables) | **This dashboard app** | Read + write (writes only via approval-gated `migrate`/`seed`/`sync`/`archive` scripts; **runtime is read-only**) |
| `ai.agno_sessions` (transcripts, runs, token/cost) | **AI platform (Agno)** | **Read-only** — the source of transcripts + token/cost |
| `ai.customers` (contact registry incl. `name`) | **AI platform (Agno)** | **Read-only** — *not read yet*; candidate for customer-name display |
| `ai.agno_metrics` + other `ai.*` tables | **AI platform (Agno)** | **Never touch** — not read, not written |
| WhatsApp message delivery / the bot itself | **AI platform (Agno) + WhatsApp** | Out of scope |
| **Shopify** (catalogue, checkout, orders) | **Shopify** (referenced only inside transcript text) | **Out of scope** — no integration; the dashboard never calls Shopify. Product links appear only as text the bot already sent. |

## 5. Implemented vs pending

**Implemented:** the three surfaces above; tenant/channel/entitlement resolution;
range filtering (tenant-timezone, retention-clamped); real KPIs/series; masked,
IDOR-safe, retention-aware Chat Monitor transcripts; internal API routes with
keep-previous-data + error/retry; consolidated "Updating…" loader (Slice 12C-UX);
read-only verifier scripts (`db:agno:verify`, `db:chat:verify`, `db:analytics:verify`).

**Pending / not built:** auth + real tenant selection; customer-name display (the
data exists in `ai.customers.name` but no code reads it); accurate **date-sliced**
token/cost (current totals are session-lifetime — see `04`); `ai.agno_metrics`-based
metrics (table is **empty**); chat pagination; cost/token expansion (Slice 12B);
onboarding/settings surfaces; real-time/polling.

## 6. Hard boundaries (carry into every future slice)

- **Never write `ai.*`.** Never duplicate transcript message bodies into `dashboard.*`
  (ADR-0004). No `app_conversation_messages` / message index / content cache.
- **Never reintroduce** `dashboard.app_customers` / `dashboard.app_customer_identities`
  (removed in Slice 12D-D / ADR-0012). `ai.customers` is a **different**, AI-owned table.
- **Never expose raw PII** — no raw phone, `user_id`, `external_contact_id`, or Agno
  `session_id` in any client payload (ADR-0005). Masked label only.
- Cross-schema links stay **by value** (no FK into `ai.*`).
