# 07 — Old Dump vs Current Live DB + `app_*` Re-verification (Gate 12)

- **Project:** pepper-st-dashboard
- **Gate:** 12 — Full DB re-analysis + product-behaviour gap review (**READ-ONLY**; no schema/data/app changes)
- **Date:** 2026-06-16
- **Status:** Slice 11B landed (Agno v2 re-alignment + live data restored). This doc re-inventories the
  live DB, compares it against the historical SQL dump, and re-verifies the six `dashboard.app_*`
  tables and the mapping logic against live data.
- **Superseded in part by Slice 12D-D / ADR-0012 (2026-06-16):** the dashboard now owns **4** tables —
  `app_customers` + `app_customer_identities` and `app_conversations.customer_id`/`customer_identity_id`
  were **dropped** (the contact lives by value on `app_conversations.external_contact_id`). Any row/column
  counts below that mention those tables are a **historical pre-12D-D snapshot**, not the current schema.

> **Hard boundary (unchanged):** the dashboard **monitors/reads** only. No writes to `ai.*`, no writes
> to `dashboard.*` were made for this gate, no migration, no seed, no sync. The dashboard never sends
> WhatsApp/AI replies. All identifiers below are **shapes/counts only** — no raw phone numbers, no
> `session_id`s, no transcript content.

---

## 1. Method & sources

| Source | What it gave | Write? |
|---|---|---|
| `npm run db:agno:reconfirm` | live `agno_sessions` shape, counts, token/cost paths, role mix, agent derivation probe | **read-only** (session pinned `default_transaction_read_only=on`) |
| `npm run db:agno:verify` / `db:chat:verify` / `db:analytics:verify` | dashboard table counts, mapping coverage, masking/IDOR, analytics-vs-SQL parity | read-only |
| `/home/sameen/papper_full_dump.sql` (Jun 15, ~1.08 MB) | historical **`ai`-schema-only** `pg_dump` — parsed locally for DDL/indexes/COPY headers (no data rows read) | read-only file parse |
| `lib/db/schema.ts` (Drizzle) | authoritative `dashboard.*` structure | n/a |
| `npm run typecheck` / `npm run test` | code health: clean + **114/114** | n/a |

---

## 2. Current live DB re-inventory (Gate 12, 2026-06-16)

### 2.1 Schemas
`ai` (13 tables, external Agno — **READ-ONLY**), `dashboard` (6 tables, app-owned), `drizzle` (migration
bookkeeping), `public` (unused). No views/materialised views.

### 2.2 `ai.*` tables (13)
`agno_sessions` is the **only** table Phase 1 reads. The other 12 remain present and (operationally)
empty or reference data: `agno_knowledge` (RAG KB), `agno_memories` / `agno_learnings` (PII),
`agno_metrics` (daily rollups — empty), `agno_approvals` (handover/approval — empty),
`agno_components`/`_configs`/`_links`, `agno_schedules`/`_runs`, `agno_eval_runs`,
`agno_schema_versions`. (Exact non-session counts use the Gate-10 baseline in `01-…`; not material to
Phase 1, which only joins `agno_sessions`.)

### 2.3 `ai.agno_sessions` — structure (confirmed live == dump DDL)
| Column | Type | Notes |
|---|---|---|
| `session_id` | `varchar` **PK** | 32-char opaque hex (live: 32/32 len, all-hex, **not** phone) |
| `session_type` | `varchar` | `agent` |
| `agent_id` | `varchar` | **composite `<tenant_id>:<channel_id>`** (live: 73 chars, single `:`, tenant-first) |
| `team_id`, `workflow_id` | `varchar` | unused by dashboard |
| `user_id` | `varchar` | **WhatsApp contact phone (PII)** — live: 11-digit, all-digits, **0 nulls** |
| `session_data` | `jsonb` | `session_metrics` (tokens/cost) + `session_state` |
| `agent_data`/`team_data`/`workflow_data`/`metadata`/`summary` | `jsonb` | mostly null |
| `runs` | `jsonb` | array of turns → `messages[]` (the transcript source) |
| `created_at` | `bigint NOT NULL` | **epoch seconds** |
| `updated_at` | `bigint` | epoch seconds |

- **Indexes (Agno-owned):** PK on `session_id`, plus `idx_agno_sessions_created_at`,
  `idx_agno_sessions_session_type`. **There is NO index on `agent_id`** (or `user_id`) — see §7 R1.
- **JSON paths still valid:** `jsonb_array_length(runs)` = turns; `runs[].messages[]` =
  `{role,content,id,created_at,from_history,…}`; tokens/cost at
  `session_data->'session_metrics'->>'{total_tokens,cost,input_tokens,output_tokens,reasoning_tokens,cache_read_tokens}'`.
- **Live role mix (4 sessions):** assistant 54, tool 30, user 29, system 29 (parser shows
  user→customer, assistant→bot; tool/system hidden).

### 2.4 `dashboard.*` tables (6) — live counts
| Table | Rows | Active / Archived | Notes |
|---|---|---|---|
| `app_tenants` | 1 | — | `pepper-st`, active, `Asia/Colombo` |
| `app_channels` | 1 | — | `whatsapp-main`; `source_agent_id='concierge'` is a **dead legacy cache** (agent key is derived) |
| `app_customers` | 15 | — | 2 live + **13 v1 leftovers** (see §7 R3) |
| `app_customer_identities` | 15 | — | 1:1 with customers here |
| `app_conversations` | **17** | **4 open / 13 archived** | archived = retired v1 orphans (Slice 11B) |
| `app_tenant_entitlements` | 1 | — | `enterprise`, fully enabled, retention `NULL/NULL` (unlimited) |

### 2.5 Mapping coverage (live)
`live sessions (derived agent_id) = 4`, `mapped = 4`, **active orphans = 0**, `archived = 13`.
Analytics (30d) totals match independent SQL exactly: conv 4, turns 29, messages 83, tokens 630,305,
cost $0.0635, coverage 4/4. (Token totals climb between runs — real, live accumulation.)

---

## 3. Old SQL dump analysis (`papper_full_dump.sql`, Jun 15)

- **Scope:** the dump contains **only `CREATE SCHEMA ai;`** and the 13 `ai.agno_*` tables. There is
  **no `dashboard` schema, no `public` tables, no `app_*` tables** in it — it is an **AI-platform-only
  export**. The dashboard's own schema is owned by Drizzle and is not represented here.
- **Already v2-shaped:** the dump's `agno_sessions` COPY header lists the full v2 column set
  (`session_id, session_type, agent_id, team_id, workflow_id, user_id, session_data, agent_data,
  team_data, workflow_data, metadata, runs, summary, created_at, updated_at`). The 13-table multi-table
  Agno layout (components, schedules, approvals, metrics, memories, learnings, eval_runs, …) is present.
- **Therefore the pre-v2 shape (`agent_id='concierge'`, `session_id`=phone, single-table) is NOT in
  this dump.** The Agno migration to v2 had already happened by the dump date; the dashboard's old v1
  assumptions predate even this baseline.
- **Indexes (dump):** `agno_sessions` PK `session_id`; secondary indexes only on `created_at` and
  `session_type`. Rich secondary indexes exist on other tables (e.g. `agno_approvals` indexes
  `agent_id`/`session_id`/`status`/`pause_type`/…; `agno_metrics` indexes `date`).
- **`agno_metrics` DDL (future analytics source):** `agent_runs_count, team_runs_count,
  workflow_runs_count, agent_sessions_count, team_sessions_count, workflow_sessions_count, users_count,
  token_metrics jsonb, model_metrics jsonb, date, aggregation_period, completed` — agent/team/workflow
  scoped, **not** tenant/channel scoped.
- **`agno_approvals` DDL (future handover source):** `run_id, session_id, status, source_type,
  approval_type, pause_type, tool_name, tool_args, agent_id, user_id, resolution_data, resolved_by,
  resolved_at, run_status, …`.
- **Volume:** ~10 `agno_sessions` data rows in the dump (no data rows were printed/read).

---

## 4. Old (dump) vs current (live) comparison

| Dimension | Old dump (Jun 15) | Current live (Jun 16) | Class |
|---|---|---|---|
| `ai` schema tables | 13 `agno_*` | 13 `agno_*` (identical) | **Irrelevant** (no change) |
| `agno_sessions` columns/types | full v2 set | identical | **Irrelevant** (stable) |
| Identity rules | `agent_id`=`tenant:channel`, contact=`user_id`, key=`session_id` | identical | **Compatible** (re-confirms ADR-0011) |
| Transcript JSON | `runs[].messages[]` | identical | **Irrelevant** |
| Token/cost paths | `session_data.session_metrics.*` | identical (+ token splits available) | **Opportunity** (splits unused) |
| `agno_sessions` indexes | `session_id` PK, `created_at`, `session_type` | identical | **Breaking-at-scale** (no `agent_id` index — §7 R1) |
| `dashboard.*` | **absent from dump** | 6 `app_*` tables (Drizzle) | **Irrelevant** (different owner) |
| `agno_metrics` / `agno_approvals` | present, empty | present, empty | **Opportunity** (future rollups / handover) |
| Session data volume | ~10 rows | 4 under our agent (live, growing); v1 ids gone | **Compatible** (reset; mapping re-aligned) |

**Breaking changes:** none *new* (the v1→v2 break was already handled in Slice 11B). The only
scale-sensitive structural fact is the **missing `agent_id` index** on `agno_sessions` (§7 R1).
**Compatible:** identity model + transcript + token paths are stable across both snapshots — strong
evidence the v2 contract is durable. **Opportunities:** token splits, `agno_metrics`, `agno_approvals`.
**Irrelevant:** `ai.*` structure is unchanged; the dump simply doesn't contain dashboard tables.

---

## 5. `dashboard.app_*` re-verification (vs live, post-Slice-11B)

| Table | Purpose | Live | Expected after 11B | v1 leftovers? | PII | Key indexes/constraints |
|---|---|---|---|---|---|---|
| `app_tenants` | the business/client | 1 | 1 | no | none | `slug` unique; status/onboarding CHECKs |
| `app_channels` | source integration (WhatsApp) | 1 | 1 | no | none | `(tenant_id,channel_key)` unique; `source_agent_id` now a dead cache |
| `app_customers` | end customer | 15 | 2 live | **yes: 13** (archived-convs' customers) | none (no name) | `tenant_idx` |
| `app_customer_identities` | contact-on-channel | 15 | 2 live | **yes: 13** | **`external_contact_id` = phone** | `(tenant,channel,contact)` unique |
| `app_conversations` | mapping for one session | 17 | 4 active + 13 archived | retired, not deleted | cached phone | `(tenant,channel,agno_session_id)` unique; `status` CHECK; `(tenant,last_at desc)` idx; contact idx |
| `app_tenant_entitlements` | access limits | 1 | 1 | no | none | `(tenant_id)` unique; retention CHECKs |

**Onboarding flow support (unchanged, still valid):** dashboard creates tenant → creates WhatsApp
channel → (AI bot becomes ready upstream) → dashboard access enabled → Agno sessions identified by the
**derived** `agent_id="${app_tenants.id}:${app_channels.id}"`, contact from `user_id`, session by
`session_id`. The schema carries three distinct columns for the three v2 identifiers; **no migration
needed** (ADR-0011). The schema also already supports **multi-channel per tenant** (uniqueness on
`channel_key`, not `type`) and **1 identity : N conversations** (`external_contact_id` indexed, not
unique).

---

## 6. Current logic re-verification (live evidence)

| Logic | Status | Evidence |
|---|---|---|
| Agent derivation `tenant:channel` (tenant-first) | ✅ | reconfirm: `strict_tenant_then_channel=1`, reversed=0; 4/4 sessions resolve |
| `user_id` → `external_contact_id` (skip null) | ✅ | sync mapped 4, skippedNoContact 0; `user_id` 0 nulls |
| `session_id` → `agno_session_id` (by value, no FK) | ✅ | unique `(tenant,channel,agno_session_id)`; mapped 4 |
| JSONB transcript source (`runs[].messages[]`) | ✅ | chat:verify non-empty 4/4; no system/tool shown |
| Analytics universe = mapped, non-archived | ✅ | analytics totals == independent SQL (conv/turns/tokens/cost) |
| Archive handling excluded from reads/verifier | ✅ | list = 4 in window; agno:verify active orphans 0 / archived 13 |
| Verifiers truthful (no false-PASS) | ✅ | hardened in 11B: live-coverage + empty-transcript + derived-agent checks all assert |
| Masking / IDOR / no-leak / no-fabricated-KPI | ✅ | chat:verify + analytics:verify all PASS |

---

## 7. DB-layer risks & opportunities

- **🟠 R1 — `ai.agno_sessions` has no `agent_id` index.** Every dashboard surface filters
  `WHERE agent_id = $1`; with only `created_at`/`session_type`/PK indexes this is a **sequential scan**.
  At 4 sessions it already shows ~0.5s list/transcript latency (mostly scan + JSONB transfer + RTT); it
  degrades linearly with total session count. We **cannot** add the index (`ai.*` is read-only).
  *Mitigation (dashboard-side, safe):* query `agno_sessions` by **`session_id = ANY($ids)`** (PK,
  indexed) for the already-mapped conversations instead of scanning by `agent_id`. See `08-…` §4.
- **🟠 R2 — per-request full-`runs` parse.** Analytics/Dashboard ship and parse the **entire `runs`
  JSONB for every session** just to count turns/messages. No SQL date filter; range changes don't
  reduce work. Scale fix in `08-…` §4 (SQL `jsonb_array_length` for turns; rollups later).
- **🟡 R3 — 13 v1 leftover `app_customers`/`app_customer_identities` rows** carry historical phone PII
  (referenced only by archived conversations). Excluded from active reads. A hard purge needs a separate
  approval (archive-not-delete decision, Slice 11B).
- **🟢 Opportunities:** token splits (input/output/reasoning/cache), `runs[].model`/`model_provider`
  for per-model cost, `agno_metrics` daily rollups (if tenant-scopable), `agno_approvals` for handover
  monitoring — all read-only, all out of current Phase 1 scope.

---

## 8. Takeaway & Gate-12 DB verdict

The live DB **matches the documented v2 contract and the Jun-15 dump structurally**, Slice 11B's data
fix holds (mapped 4 / active orphans 0 / archived 13), and all six `dashboard.app_*` tables + the
mapping logic re-verify green against live data. **No schema migration is warranted.** The only
material findings are **performance/scale** (R1 unindexed `agent_id`; R2 full-parse) and **PII
hygiene** (R3 leftovers) — addressed as design in `08-dashboard-data-loading-and-realtime-strategy.md`
and scheduled in `docs/phases/phase-1-post-acceptance-hardening.md`. **DB verdict: PASS.**
