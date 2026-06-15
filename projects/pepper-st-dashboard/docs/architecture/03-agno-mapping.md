# Architecture 03 — Agno → Dashboard Mapping

- **Project:** pepper-st-dashboard
- **Status:** Phase 1 (docs-first) — proposal
- **Last updated:** 2026-06-15
- **Related:** ADR-0003, ADR-0004, ADR-0006, ADR-0008

How dashboard concepts map to the **read-only** `ai.agno_sessions` table. Based
on Stage 1 read-only inspection (PostgreSQL 16.9).

## Source of truth: `ai.agno_sessions`

Columns (15): `session_id` (varchar PK), `session_type` (NOT NULL),
`agent_id`, `team_id`, `workflow_id`, `user_id`, `session_data` (jsonb),
`agent_data`, `team_data`, `workflow_data`, `metadata` (jsonb),
`runs` (jsonb), `summary` (jsonb), `created_at` (bigint), `updated_at` (bigint).

Observed in demo data:

- `session_id` = **WhatsApp phone number** (text, e.g. `9471…`). Global PK.
- `session_type = 'agent'`, `agent_id = 'concierge'` (single agent).
- `created_at` / `updated_at` = **epoch seconds**.
- `metadata` = **NULL**; `summary` = **NULL** (no AI summary/intent available).
- `session_data` = `{ session_state (empty), session_metrics }`.
- `runs` = array of per-turn runs (len 1–10).
- `runs[].messages[]` roles: `system|user|assistant|tool`; all `from_history=false`
  in current data; **system prompt repeats once per run**.
- `session_data.session_metrics` = `total_tokens, input_tokens, output_tokens,
  reasoning_tokens, cache_read_tokens, cost, details`.

## Field-by-field mapping

| Dashboard concept | Source in `ai.agno_sessions` | Notes |
|---|---|---|
| `app_conversations.agno_session_id` | `session_id` | Link by value; no cross-schema FK |
| `app_conversations.external_contact_id` | `session_id` | Same value in Phase 1 (phone) |
| `app_customer_identities.external_contact_id` | `session_id` | Phone; stored as TEXT, masked on display |
| `app_conversations.first_at` | `to_timestamp(created_at)` | epoch seconds → timestamptz |
| `app_conversations.last_at` | `to_timestamp(updated_at)` | epoch seconds → timestamptz |
| Channel binding | `agent_id` (+ future team/business/phone-number id) | matches an **active** `app_channels.source_agent_id`; must resolve to **exactly one** channel (see Channel resolution) |
| Transcript | `runs[].messages[]` | rendered live; never stored |
| Turn count | `jsonb_array_length(runs)` | derived |
| Token/cost | `session_data->'session_metrics'` | derived/aggregated |
| AI summary / intent / confidence / priority | **none** (`summary`, `metadata` NULL) | **parked — do not fabricate** |

## Channel resolution (active, exactly one)

Resolving an `ai.agno_sessions` row to its dashboard channel/tenant must be
**unambiguous**:

- Match **only active channels** (`app_channels.is_active = true`) whose
  source-mapping fields fit the session (Phase 1: `source_agent_id = agent_id`).
- The match must return **exactly one** channel:
  - **0 matches → unmapped:** skip the session (log a **masked** note); never
    create or guess a tenant.
  - **1 match → mapped:** use that channel's `tenant_id` to scope everything.
  - **>1 matches → ambiguous:** skip the session and log a **masked warning**;
    never pick arbitrarily and never guess a tenant.
- Ambiguity is a **configuration error** in `app_channels` (overlapping
  source-mapping) to fix, not something the mapper resolves heuristically. The
  future contract (ADR-0008) makes matches precise (business/channel/
  phone-number id).

## Conversation grain (locked)

**One `ai.agno_sessions` row (per phone) = one rolling `app_conversations`
record.** New turns append to `runs[]`; `updated_at` advances; `last_at` is
refreshed. Per-visit/per-day splitting is **parked** (`docs/phases/roadmap.md`).

## Transcript build algorithm (read-only)

Goal: a clean, ordered, human-readable transcript with no duplication and no
system noise.

1. Read the session by `agno_session_id` (= `session_id`).
2. Expand `runs[]` → for each run, expand `messages[]`.
3. **Exclude** `role = 'system'` (system prompt repeats per run).
4. **Dedupe by message `id`**; additionally drop `from_history = true` (replayed
   context) — both guards, since the flag may be used inconsistently.
5. Map roles to UI senders: `user → customer`, `assistant → bot`,
   `tool → system/tool note` (rendered subtly or hidden in Phase 1).
6. Order by message `created_at` (fallback: run order then array order).
7. **Apply retention**: drop messages with `created_at` older than
   `now - raw_history_retention_days` (from `app_tenant_entitlements`; if it
   **IS NULL** → unlimited, apply no cutoff).
8. Mask any contact identifiers in headers (never the raw phone).

### Reference read query (illustrative, read-only — not a migration)

```sql
-- Flatten + clean transcript for one session (system excluded, history excluded)
SELECT
    msg->>'role'                          AS role,
    msg->>'id'                            AS msg_id,
    to_timestamp((msg->>'created_at')::double precision) AS at,
    msg->>'content'                       AS content
FROM ai.agno_sessions s
CROSS JOIN LATERAL jsonb_array_elements(s.runs)              AS run
CROSS JOIN LATERAL jsonb_array_elements(run->'messages')     AS msg
WHERE s.session_id = $1
  AND msg->>'role' <> 'system'
  AND COALESCE((msg->>'from_history')::boolean, false) = false
  AND to_timestamp((msg->>'created_at')::double precision) >= now() - ($2 || ' days')::interval
ORDER BY at;
-- $1 = agno_session_id, $2 = raw_history_retention_days (e.g. 30; if NULL/unlimited, omit this predicate)
-- De-dupe by msg_id in the app layer (or wrap with DISTINCT ON (msg_id)).
```

## Analytics extraction (read-only)

- **Conversation count / range:** count `ai.agno_sessions` for the channel where
  `to_timestamp(updated_at)` (or `created_at`) falls in range.
- **New vs returning:** by first-seen `external_contact_id`.
- **Turns:** `jsonb_array_length(runs)`.
- **Tokens/cost:** sum `session_data->'session_metrics'->>'total_tokens'` and
  `->>'cost'` across in-range sessions.
- Epoch conversion via `to_timestamp(created_at)`.

See `docs/workflows/05-analytics-filter.md`.

## Hard rules

- **Read-only**: no `INSERT/UPDATE/DELETE` on `ai.*`.
- **No duplication**: transcripts/messages are never written to `dashboard.*`.
- **No fabrication**: fields absent in Agno are omitted, not invented.
- **PII**: `session_id`/phone masked on display and in logs (ADR-0005).

## Production divergence (why fields are modelled separately)

Today `agno_session_id == external_contact_id == phone`. Because
`ai.agno_sessions.session_id` is a **global** PK and merely a phone number, it is
unsafe for multi-tenant SaaS. The **future contract** (ADR-0008,
`docs/workflows/09-...`) requires Agno sessions to become tenant/channel-scoped
or globally unique (agent/team/business/phone-number-id or a `metadata`
contract). When that lands, `agno_session_id` and `external_contact_id` diverge
with **no dashboard migration** (already separate fields).
