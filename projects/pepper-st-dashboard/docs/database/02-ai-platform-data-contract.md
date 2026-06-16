# 02 — AI Platform (Agno) Data Contract (Gate 10)

- **Owner:** the **external AI platform** (Agno). Everything in schema `ai` is owned, written, and
  migrated by that platform. **The dashboard treats all of `ai.*` as READ-ONLY** (ADR-0001/0004).
- **Date:** 2026-06-16 · **Status:** the Agno schema was **upgraded** since Gate 9 — this contract
  supersedes the shape recorded in `docs/architecture/03-agno-mapping.md` for the parts noted below.
- **Gate 12 update (2026-06-16):** re-verified live (post-Slice-11B) and against the Jun-15 `ai`-only
  `pg_dump` — the `ai.*` structure is **unchanged** and the v2 identity/transcript/token contract is
  **stable across both snapshots**. **Scale dependency:** `ai.agno_sessions` has **no `agent_id` index**
  (only `session_id` PK + `created_at` + `session_type`), so `WHERE agent_id=$1` is a sequential scan;
  the dashboard should read by **`session_id` (PK)** for already-mapped conversations. See
  `docs/database/07-old-vs-current-db-comparison.md` and
  `docs/architecture/08-dashboard-data-loading-and-realtime-strategy.md`.

> Hard rules: never `INSERT/UPDATE/DELETE` `ai.*`; never create a cross-schema FK into `ai.*`;
> never copy raw transcripts/memories into `dashboard.*` or into docs. Couple **by value** and
> **defensively** — this schema changed once already and can change again.

---

## 1. Canonical sources (what to read for each concern)

| Concern | Canonical source (read-only) | Notes |
|---|---|---|
| **Transcript** | `ai.agno_sessions.runs[].messages[]` | role/content/id/created_at/from_history; parse in memory, never persist |
| **Turn count** | `jsonb_array_length(ai.agno_sessions.runs)` | one run = one turn (unchanged) |
| **Tokens / cost** | `ai.agno_sessions.session_data.session_metrics.{total_tokens,cost,…}` | path unchanged; now also input/output/cache/reasoning token splits |
| **Contact identity (phone)** | `ai.agno_sessions.user_id` | **CHANGED** — was `session_id`; now an 11-digit phone-like value (**PII**) |
| **Agno session key** | `ai.agno_sessions.session_id` | **CHANGED** — now a 32-char opaque token (not the phone) |
| **Agent identity** | `ai.agno_sessions.agent_id` = **`<tenant_id>:<channel_id>`** | **CONFIRMED** — the AI platform builds `agent_id` from the dashboard's `app_tenants.id` + `app_channels.id` (single `:`, tenant-first; live-verified). Dashboard **derives** it, never stores it. `agent_name='PEPPER ST. WhatsApp Concierge'` is display-only. |
| **Timestamps** | `created_at`/`updated_at` (session), `messages[].created_at` | **epoch seconds (`int8`/number)** — unchanged |
| **Daily aggregates** | `ai.agno_metrics` (`date`, `aggregation_period`, `token_metrics`, counts) | exists but **empty**; agent/team/workflow-scoped, not tenant-scoped |
| **Long-term memory** | `ai.agno_memories` | **PII**; per-`user_id` memory + input + topics |
| **Knowledge base** | `ai.agno_knowledge` (32 rows) | RAG documents; business KB, not customer PII |

---

## 2. `agno_sessions` grain & identifiers

- **Grain:** one row per Agno session (`session_type='agent'` observed). A session still aggregates
  multiple runs/turns (rolling thread) — consistent with ADR-0003.
- **Identifier changes (load-bearing):**
  1. `session_id` is now an **opaque 32-char token**, *not* the WhatsApp phone.
  2. The **WhatsApp phone moved to `user_id`** (11 digits, PII).
  3. `agent_id` is a **composite `<tenant_id>:<channel_id>`** built from the dashboard's own
     `app_tenants.id` + `app_channels.id` (single `:`, tenant-first; confirmed + live-verified). The
     human label `PEPPER ST. WhatsApp Concierge` is exposed only at `runs[].agent_name`.
- **New session columns** the dashboard does not yet read: `team_id`, `workflow_id`, `user_id`,
  `agent_data`, `team_data`, `workflow_data`.

## 3. `runs[]` / `messages[]` shape (transcript)

- `runs[]` element carries: `agent_id`, `agent_name`, `run_id`, `model`, `model_provider`,
  `status`, `metrics`, `input`, `content`, `messages[]`, `created_at`, `user_id`, `session_state`.
- `messages[]` element carries: `role`, `content`, `id`, `created_at` (epoch number), `from_history`,
  plus tool fields (`tool_calls`, `tool_name`, `tool_args`, `tool_call_id`, `tool_call_error`),
  `reasoning_content`, `metrics`, `provider_data`, `stop_after_tool_call`.
- **Parser compatibility:** the fields the in-memory parser depends on (`role`, `content`, `id`,
  `created_at`, `from_history`) are all still present; roles are still `user/assistant/tool/system`.
  The transcript parser therefore needs **no change** to keep working once sessions are reachable.

## 4. Other `ai.*` tables (ownership & sensitivity)

- **`agno_metrics`** — platform daily rollups (run/session/user counts, `token_metrics`,
  `model_metrics`, `date`, `aggregation_period`, `completed`). *Opportunity* for analytics, but
  agent/team/workflow-scoped (no tenant/channel column) and **currently empty**.
- **`agno_memories` / `agno_learnings`** — per-user memory/learning content keyed by `user_id`.
  **PII-bearing**; out of Phase 1 scope; if ever surfaced, must be masked + access-controlled.
- **`agno_knowledge`** — RAG KB documents (metadata/status). Business-confidential, not customer PII.
- **`agno_approvals`** — human-in-the-loop approval/pause records (`run_id`, `session_id`, `status`,
  `pause_type`). Relevant to a future "handover/approvals monitoring" feature.
- **`agno_components` / `_configs` / `_links`** — component/agent registry & config graph (empty).
  Likely the eventual home of a stable agent-id↔name mapping.
- **`agno_schedules` / `_runs`, `agno_eval_runs`, `agno_schema_versions`** — scheduling, evaluation,
  and Agno's own migration log. Not dashboard-relevant in Phase 1.

## 5. Stability guidance

- The Agno schema is **not under dashboard control and has already changed once** (identifier
  scheme + many new tables). Continue to: (a) couple by value only, (b) read defensively (treat
  every field as nullable/optional, as `lib/agno/types.ts` already does), and (c) re-run Gate 10
  discovery after any AI-platform change before trusting dashboard output.
