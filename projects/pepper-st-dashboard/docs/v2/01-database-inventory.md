# V2 / 01 — Database Inventory (read-only audit)

> **Source:** live read-only audit on **2026-06-16** against DB `papper`
> (`SET default_transaction_read_only = on`; `pg_tables`, `information_schema.columns`,
> `pg_indexes`, FK/PK catalog queries, and `count(*)`). **No values containing PII were
> selected** — only catalog metadata, counts, and metric-key presence. **No writes.**
> Row counts marked *(est)* come from `pg_class.reltuples` and are `-1` (never
> `ANALYZE`d) → **UNKNOWN exact**; counts without *(est)* are exact `count(*)`.

## 0. Schemas present

| Schema | Owner | Notes |
|---|---|---|
| `dashboard` | **This app** | 4 `app_*` tables. The only schema the app writes. |
| `ai` | **AI platform (Agno)** | 14 base tables. **Read-only** for this app. |
| `public`, `drizzle` | mixed / tooling | `drizzle` holds migration metadata; not a product schema. Out of scope for this inventory. |

**Removed (do not recreate):** `dashboard.app_customers` and
`dashboard.app_customer_identities` were **dropped** in Slice 12D-D / ADR-0012 (migration
`0001`). They are **gone from the live DB** and confirmed absent by `db:agno:verify`'s
forbidden-table check. `ai.customers` is a **separate, AI-owned** table — *not* a
replacement the dashboard owns. The dashboard **must not** recreate a dashboard-side
customer/identity model, and **must not** migrate or write any `ai.*` table.

---

## 1. `dashboard` schema — app-owned (4 tables)

> Source of truth: `lib/db/schema.ts`. Runtime app **reads** all four; **writes** happen
> only through approval-gated scripts (`db:migrate`, `db:seed`, `db:agno:sync`,
> `db:agno:archive-orphans`) — never at request time.

### `dashboard.app_tenants` — 1 row
- **Owner:** dashboard app · **Purpose:** the business/client using the dashboard (NOT a chat session, NOT a customer).
- **PK:** `id` (uuid) · **Unique:** `slug` · **FKs:** none (referenced by the other 3).
- **Main columns:** `id`, `name`, `slug`, `status` (active|suspended|archived), `onboarding_status`, `timezone` (default `Asia/Colombo`), `created_at`, `updated_at`.
- **Read by app:** **Yes** (`lib/tenant/context.ts` resolves by `slug`). **Written by app:** seed only (gated). **Policy:** app-owned write.

### `dashboard.app_channels` — 1 row
- **Owner:** dashboard app · **Purpose:** a tenant's source/integration (Phase 1: WhatsApp).
- **PK:** `id` · **Unique:** `(tenant_id, channel_key)` · **Indexes:** `(tenant_id)` · **FK:** `tenant_id → app_tenants.id`.
- **Main columns:** `id`, `tenant_id`, `type`, `channel_key` (`whatsapp-main`), `display_name` (`PEPPER ST. WhatsApp`), `source_agent_id` (**legacy/dead** — agent key is now derived), `source_team_id`, `external_business_id`, `external_phone_number_id`, `is_active`, timestamps.
- **Read by app:** **Yes** (analytics/chat services). **Written by app:** seed (gated). **Policy:** app-owned write.

### `dashboard.app_conversations` — 17 rows
- **Owner:** dashboard app · **Purpose:** lightweight **index/status** row for ONE Agno session. **No message bodies.**
- **PK:** `id` · **Unique:** `(tenant_id, channel_id, agno_session_id)` · **FKs:** `tenant_id → app_tenants.id`, `channel_id → app_channels.id`.
- **Indexes:** `(tenant_id, last_at DESC NULLS LAST)` (range filter), `(tenant_id, channel_id, external_contact_id)` (**not unique**).
- **Main columns:** `id`, `tenant_id`, `channel_id`, `agno_session_id` (TEXT — link by value to `ai.agno_sessions.session_id`), `external_contact_id` (TEXT NOT NULL — the contact phone/`user_id`, **masked on read**), `status` (open|resolved|archived), `first_at`, `last_at`, timestamps.
- **Read by app:** **Yes** (chat list + analytics universe). **Written by app:** `db:agno:sync` (upsert one per session) + `db:agno:archive-orphans` (status) — both gated. **Policy:** app-owned write.
- **Live note:** 17 rows = ~4 active + ~13 archived (orphans of the pre-v2 mapping). Only **4** currently join a live `ai.agno_sessions` row; **15** distinct `external_contact_id`.

### `dashboard.app_tenant_entitlements` — 1 row
- **Owner:** dashboard app · **Purpose:** per-tenant CURRENT access/limits (1:1 with tenant).
- **PK:** `id` · **Unique:** `(tenant_id)` · **FK:** `tenant_id → app_tenants.id`.
- **Main columns:** `id`, `tenant_id`, `plan_code`, `is_fully_enabled`, `raw_history_retention_days` (nullable; **NULL = unlimited**), `analytics_retention_days` (nullable; **NULL = unlimited**), timestamps. PEPPER ST. = unlimited (both NULL).
- **Read by app:** **Yes** (retention clamp + labels). **Written by app:** seed (gated). **Policy:** app-owned write.

**Dashboard FKs (all internal, no cross-schema):** `app_channels.tenant_id`,
`app_conversations.tenant_id`, `app_conversations.channel_id`,
`app_tenant_entitlements.tenant_id` → `app_tenants`/`app_channels`.

---

## 2. `ai` schema — AI-platform owned (14 base tables, READ-ONLY)

> **Policy for every `ai.*` table: read-only.** The app currently reads **exactly one**
> (`ai.agno_sessions`). The rest are AI-platform internals the dashboard must not touch.

| Table | Rows | Read by app? | Purpose (observed) | Policy |
|---|---|---|---|---|
| **`agno_sessions`** | **6** | **YES (read-only)** | Canonical sessions: `runs` (transcript), `session_data.session_metrics` (tokens/cost), `user_id` (contact), `agent_id` | **read-only** |
| **`customers`** | **5** | **No (candidate)** | Contact registry incl. **`name`** — PK `(tenant_id, channel_id, phone)` | **read-only** |
| **`agno_metrics`** | **0 (empty)** | No | Per-period rollup (`date`, `aggregation_period`, `token_metrics`, `model_metrics`, counts) | **read-only** |
| `agno_knowledge` | 32 *(est)* | No | Agno knowledge base | never touch |
| `agno_memories` | UNKNOWN *(est -1)* | No | Agno agent memory | never touch |
| `agno_learnings` | UNKNOWN *(est -1)* | No | Agno learnings | never touch |
| `agno_components` | UNKNOWN *(est -1)* | No | Agno component registry | never touch |
| `agno_component_configs` | UNKNOWN *(est -1)* | No | Component versions | never touch |
| `agno_component_links` | UNKNOWN *(est -1)* | No | Component graph | never touch |
| `agno_eval_runs` | UNKNOWN *(est -1)* | No | Eval runs | never touch |
| `agno_approvals` | UNKNOWN *(est -1)* | No | Approvals | never touch |
| `agno_schedules` | UNKNOWN *(est -1)* | No | Schedules | never touch |
| `agno_schedule_runs` | UNKNOWN *(est -1)* | No | Schedule runs | never touch |
| `agno_schema_versions` | UNKNOWN *(est -1)* | No | Agno migration metadata | never touch |

### `ai.agno_sessions` (the one AI table the app reads)
- **PK:** `session_id` (varchar) · **Indexes:** `agno_sessions_pkey(session_id)`, `idx_agno_sessions_created_at`, `idx_agno_sessions_session_type`. **No `agent_id` index** (scale risk — see `04`).
- **Columns:** `session_id`, `session_type`, `agent_id` (`"<tenantId>:<channelId>"`), `team_id`, `workflow_id`, `user_id` (phone, **PII**), `session_data` (jsonb — holds `session_metrics.total_tokens`/`cost`), `agent_data`, `team_data`, `workflow_data`, `metadata`, `runs` (jsonb — transcript), `summary`, `created_at` (bigint epoch s), `updated_at` (bigint epoch s).
- **App reads:** `runs`, `session_data->'session_metrics'->>'total_tokens'|'cost'`, `created_at`, `updated_at`, `user_id` (sync only), `agent_id` (defensive scope). **Code:** `lib/analytics/service.ts`, `lib/chat-monitor/service.ts`, `lib/agno/sync.ts` (gated), verifier scripts.
- **Profile:** 6 sessions, 1 distinct `agent_id`, **6/6 have tokens, 6/6 have cost**.

### `ai.customers` (candidate for customer-name display — see `05`)
- **PK:** `(tenant_id, channel_id, phone)` (`customers_pkey`).
- **Columns:** `tenant_id` (text), `channel_id` (text), `phone` (text, **PII**), **`name` (text, nullable)**, `created_at` (tz), `updated_at` (tz).
- **`name` coverage:** **5 / 5 rows populated.** Join to the dashboard is **by value**: `(tenant_id, channel_id, phone)` ↔ `app_conversations.(tenant_id::text, channel_id::text, external_contact_id)` — **CONFIRMED** (6 conversations match; see `02`).
- **Not read by any code** today. Could be read **read-only** later for names.

### `ai.agno_metrics` (candidate date-sliced metric source — currently empty)
- **PK:** `id` (varchar).
- **Columns:** `id`, `agent_runs_count`, `team_runs_count`, `workflow_runs_count`, `agent_sessions_count`, `team_sessions_count`, `workflow_sessions_count`, `users_count`, `token_metrics` (jsonb), `model_metrics` (jsonb), `date` (date), `aggregation_period` (varchar), `created_at` (bigint), `updated_at` (bigint), `completed` (bool).
- **Rows: 0 (EMPTY).** Shape *looks* ideal for accurate per-day token/cost slicing, but it **cannot be used until the AI platform populates it** — and even then the dashboard must read it **read-only**. **TO VERIFY** with the AI dev: will Agno populate `agno_metrics`, at what `aggregation_period`, and what is the per-day `token_metrics` structure + the join key (date + agent/tenant)?

**`ai` internal FKs (informational; not the dashboard's concern):**
`agno_component_configs.component_id → agno_components`; `agno_component_links.*` →
`agno_components`/`agno_component_configs`; `agno_schedule_runs.schedule_id → agno_schedules`.

---

## 3. Read/write policy summary

- **Runtime app (pages + `/api/*` routes) = READ-ONLY on the DB.** It reads the 4
  `dashboard.app_*` tables + `ai.agno_sessions`. Nothing else.
- **Dashboard writes happen only in approval-gated CLI scripts**, never at request time:
  `db:migrate` (DDL), `db:seed` (tenant/channel/entitlement), `db:agno:sync`
  (`app_conversations` upsert), `db:agno:archive-orphans` (`app_conversations.status`).
  **All target `dashboard.*` only.**
- **`ai.*` is never written** by any path (app or script). `lib/agno/*` and the verifier
  scripts only `SELECT` from `ai.agno_sessions`.

## 4. Notes / risks

- **Stale mapping drift:** 17 conversations but only 4 live-session-mapped; 13 archived.
  Metric/Chat surfaces exclude archived, so historical ranges undercount (see `04`).
- **`ai.customers` partial coverage:** 5 customers vs 15 distinct historical contacts —
  only current contacts have a name; older conversations will fall back to masked id.
- **`ai.agno_metrics` empty:** the "correct" date-sliced metric source is not yet
  available.
- **No `agent_id` index** on `ai.agno_sessions` (the app already mitigates by reading via
  `session_id` PK — Slice 12D).
