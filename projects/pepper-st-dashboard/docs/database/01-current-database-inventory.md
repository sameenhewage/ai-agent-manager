# 01 — Current Database Inventory (Gate 10)

- **Project:** pepper-st-dashboard
- **Gate:** 10 — Full Database Discovery / Data Contract (READ-ONLY discovery; no schema/data changes)
- **Date:** 2026-06-16
- **Method:** read-only introspection on a connection pinned to
  `default_transaction_read_only = on` (any stray write would be rejected by PG). Only
  `SELECT`/`SET` ran. Structure, counts, JSON key paths, and id *shapes* only — **no message
  content, no customer memories, no raw phone/session identifiers** are recorded here.
- **Reproduce:** `npx tsx scripts/db-discovery.ts` (schema inventory + coverage). Requires
  `DATABASE_URL`. Credentials are masked in all output (`maskDbUrl`).

> ⚠️ **Headline:** the AI platform has migrated Agno to a richer multi-table schema and the
> session data was reset. `ai.agno_sessions` holds **1** session under a new composite
> `agent_id` (the literal `'concierge'` is gone), and the dashboard's 13 mapped conversations
> are now **orphans**. Full impact in `04-feature-impact-map.md` / `05-risks-and-recommendations.md`.

---

## 1. Schemas (non-system)

| Schema | Tables | Views | Sequences | Owner | Dashboard access |
|---|---|---|---|---|---|
| `ai` | 13 | 0 | 0 | **External AI platform (Agno)** | **READ-ONLY** |
| `dashboard` | 6 | 0 | 0 | **This app** | read/write (app-owned) |
| `drizzle` | 1 | 0 | 1 | This app (migration bookkeeping) | written by `drizzle-kit` only |
| `public` | 0 | 0 | 0 | — (unused) | — |

No views or materialized views exist in any schema.

---

## 2. `ai.*` tables + exact row counts

| Table | Rows | Inferred purpose | PII risk |
|---|---|---|---|
| `agno_sessions` | **1** | Chat sessions: identifiers, `runs[]` (turns+messages), `session_data.session_metrics`, timestamps | **High** (`user_id`=phone; `runs[].messages[].content`) |
| `agno_knowledge` | 32 | RAG knowledge-base entries (name/description/type/size/status) | Low (business KB, not customer PII) |
| `agno_memories` | 1 | Per-user long-term memory (`memory` jsonb, `input` text, `topics`, `user_id`) | **High** (customer memory + input) |
| `agno_schema_versions` | 12 | Agno's own migration bookkeeping | None |
| `agno_learnings` | 0 | Agent learnings (`content` jsonb, `user_id`, `entity_*`) | Potential (empty now) |
| `agno_metrics` | 0 | **Daily rollups**: run/session/user counts, `token_metrics`, `model_metrics`, `date`, `aggregation_period` | None (aggregate; empty now) |
| `agno_components` | 0 | Component registry (`component_id`, `component_type`, `name`, `current_version`) | None (empty) |
| `agno_component_configs` | 0 | Component configuration | None (empty) |
| `agno_component_links` | 0 | Component relationship graph | None (empty) |
| `agno_approvals` | 0 | Human-in-the-loop approvals/pauses (`run_id`, `session_id`, `status`, `pause_type`) | Potential (empty now) |
| `agno_schedules` | 0 | Scheduled jobs (cron/endpoint/payload) | None (empty) |
| `agno_schedule_runs` | 0 | Schedule execution log | None (empty) |
| `agno_eval_runs` | 0 | Evaluation runs (`eval_data`, `eval_input`, `evaluated_component_name`) | None (empty) |

> Note: planner row-estimates are stale (e.g. `agno_sessions.reltuples≈19`); the counts above are
> exact `count(*)` values taken during discovery.

---

## 3. `ai.agno_sessions` columns (the dashboard's main external dependency)

| Column | Type | Null | Notes |
|---|---|---|---|
| `session_id` | `varchar` | NO | **32-char opaque token** (no dashes, not all-digits, not a UUID). **No longer the phone.** |
| `session_type` | `varchar` | NO | observed value `agent` |
| `agent_id` | `varchar` | YES | **composite `<uuid>:<uuid>` (73 chars)** — was the literal `concierge` |
| `team_id` | `varchar` | YES | **new** |
| `workflow_id` | `varchar` | YES | **new** |
| `user_id` | `varchar` | YES | **new — 11-digit phone-like = the WhatsApp contact (PII)** |
| `session_data` | `jsonb` | YES | keys: `session_metrics`, `session_state` |
| `agent_data` | `jsonb` | YES | **new** |
| `team_data` | `jsonb` | YES | **new** |
| `workflow_data` | `jsonb` | YES | **new** |
| `metadata` | `jsonb` | YES | null in current data |
| `runs` | `jsonb` | YES | array of runs (see §3.1) |
| `summary` | `jsonb` | YES | null in current data |
| `created_at` | `int8` | NO | **epoch seconds** |
| `updated_at` | `int8` | YES | **epoch seconds** |

### 3.1 `runs[]` element keys
`agent_id`, `agent_name`, `content`, `content_type`, `created_at`, `events`, `input`, `messages`,
`metrics`, `model`, `model_provider`, `model_provider_data`, `reasoning_content`, `run_id`,
`session_id`, `session_state`, `status`, `user_id`.
- `agent_name` observed = **`PEPPER ST. WhatsApp Concierge`** (config label, not customer PII).
- `runs` length for the live session = 4 (turn count = `jsonb_array_length(runs)`, unchanged contract).

### 3.2 `runs[].messages[]` keys
`role`, `content`, `id`, `created_at`, `from_history`, `metrics`, `provider_data`,
`reasoning_content`, `stop_after_tool_call`, `tool_args`, `tool_call_error`, `tool_call_id`,
`tool_calls`, `tool_name`.
- Roles observed: `assistant`, `tool`, `user`, `system` (parser maps user→customer, assistant→bot,
  tool→hidden, system→excluded — **still valid**).
- `messages[].created_at` is a JSON **number (epoch seconds)** — parser assumption **still valid**.

### 3.3 `session_data.session_metrics` keys
`total_tokens`, `cost`, `input_tokens`, `output_tokens`, `cache_read_tokens`, `reasoning_tokens`,
`details`. The analytics path `session_data->'session_metrics'->>'total_tokens'` and `->>'cost'`
are **still present and valid** (now with extra token breakdowns available).

---

## 4. `dashboard.*` tables + exact row counts

| Table | Rows | PK | Unique key(s) | FKs |
|---|---|---|---|---|
| `app_tenants` | 1 | `id` | `slug` | — |
| `app_channels` | 1 | `id` | `(tenant_id, channel_key)` | `tenant_id`→`app_tenants` |
| `app_customers` | 13 | `id` | — | `tenant_id` |
| `app_customer_identities` | 13 | `id` | `(tenant_id, channel_id, external_contact_id)` | `tenant_id`, `customer_id`, `channel_id` |
| `app_conversations` | 13 | `id` | `(tenant_id, channel_id, agno_session_id)` | `tenant_id`, `customer_id`, `customer_identity_id`, `channel_id` |
| `app_tenant_entitlements` | 1 | `id` | `(tenant_id)` | `tenant_id` |

- CHECK constraints intact: `app_tenants.status ∈ {active,suspended,archived}`,
  `onboarding_status ∈ {pending,in_progress,complete}`, `app_conversations.status ∈
  {open,resolved,archived}`, retention columns `IS NULL OR > 0`.
- Indexes intact (e.g. `app_conv_tenant_last_idx` on `(tenant_id, last_at desc)`,
  `app_conv_contact_idx`, identity/customer indexes).
- **No transcript-message table** and **no FK into `ai.*`** (link is by value: `agno_session_id`).

### 4.1 Seed / mapping state (slugs/keys only — no PII)
- Tenant `pepper-st` (active, `Asia/Colombo`); entitlement `enterprise`, fully enabled,
  retention `NULL/NULL` (unlimited).
- Channel `whatsapp-main` (type `whatsapp`, `source_agent_id = 'concierge'`, active).
- 13 conversations / 13 customers / 13 identities — **all left over from the previous Agno data**.

### 4.2 Mapping coverage vs current `ai` data
| Metric | Value |
|---|---|
| `ai.agno_sessions` with `agent_id='concierge'` | **0** |
| `dashboard.app_conversations` | 13 |
| Unmapped live `concierge` sessions | 0 |
| **Orphan conversations** (no matching live session) | **13 (100%)** |
| Live sessions currently visible to the dashboard | **0** |

`drizzle.__drizzle_migrations` holds the applied dashboard migration; `drizzle` also owns one
sequence. No dashboard tables leaked into `ai`.
