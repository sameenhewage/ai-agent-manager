# Workflow 05 — Analytics Filter

- **Status:** Phase 1 (docs-first)
- **Last updated:** 2026-06-15
- **Related:** ADR-0007, `docs/architecture/03-agno-mapping.md`

## Goal

Compute **real** analytics for a tenant over a selected date range, reading
`ai.agno_sessions` (epoch seconds) and the dashboard index — **no fabricated
metrics**.

## Supported ranges (match the prototype)

`Today (1d)`, `Last 3 days`, `Last 7 days`, `Last 14 days`, `Last 30 days`,
`This month`, `Custom (from–to)`. (Prototype also has "Last month".)

## Range → bounds

- Compute `[from_ts, to_ts)` in the **tenant's timezone** (`app_tenants.timezone`,
  default `Asia/Colombo` GMT+5:30). The timezone defines the **Today / Month /
  Custom** day boundaries, so future tenants in other countries get correct local
  boundaries with no code change.
- Convert Agno epoch seconds with `to_timestamp(created_at)` /
  `to_timestamp(updated_at)` for comparison.

## Retention cap (Phase 1)

Analytics are computed **live** from `ai.agno_sessions` within the tenant's
**analytics retention** (`analytics_retention_days`; set **explicitly at onboarding**,
**`NULL` = unlimited** for enterprise / fully enabled). There is **no analytics
rollup/aggregate table yet**, so:

- When `analytics_retention_days` is set (A), a selected range is **clamped** to
  `now - A days`: the older portion has **no accessible detail** and is reported as
  out-of-window (not as a misleading zero).
- When `analytics_retention_days IS NULL` (unlimited, e.g. PEPPER ST.), **no clamp
  is applied** — the full requested range is served from live reads.
- **Longer historical analytics for capped tenants** (ranges beyond A) require
  **future rollups / a plan feature** (see roadmap and ADR-0006).

## Phase 1 real metrics

| Metric | Definition | Source |
|---|---|---|
| Conversations in range | sessions for the channel active in `[from,to)` | `ai.agno_sessions` |
| New contacts | identities first-seen in range | dashboard + Agno |
| Returning contacts | active contacts seen before range | dashboard + Agno |
| Turns | `Σ jsonb_array_length(runs)` | `ai.agno_sessions` |
| Messages (displayed) | non-system, de-duplicated count | derived |
| Total tokens | `Σ session_metrics.total_tokens` | `session_data` |
| Cost | `Σ session_metrics.cost` | `session_data` |
| First/last activity | min/max timestamps | `ai.agno_sessions` |

## Explicitly NOT computed (no source — parked)

AI-resolved %, intents breakdown, issues/exchanges/follow-ups/tasks KPIs,
confidence, priority mixes. These are **omitted**, not faked (ADR-0007).

## Procedure

1. Resolve tenant → channel(s).
2. Derive `[from_ts, to_ts)` from the chosen range (in the tenant timezone), then
   **clamp** `from_ts` to `>= now - analytics_retention_days` and flag when the
   request exceeded it. **If `analytics_retention_days IS NULL` (unlimited), do not
   clamp.**
3. Query in-range sessions (tenant/channel scoped).
4. Aggregate the metrics above (epoch-converted).
5. Return a typed result; the UI shows only present metrics. Empty range → zeros,
   not placeholders implying missing features.

## Performance

- Fine at current volume (11 sessions). At scale, consider a materialized rollup
  table (future ADR) — **not** built now. Rollups are also what would enable
  analytics **history beyond the retention window** (ADR-0006).

## Test intent

- Range boundaries (inclusive/exclusive) around `created_at`/`updated_at`.
- Token/cost summation matches a known fixture.
- Tenant scoping: tenant B excluded.
- Unsupported metrics are absent from the payload (no nulls masquerading as data).
- Analytics cap: with `analytics_retention_days` set, a range exceeding it returns
  only in-window detail and flags the out-of-window portion; with it **NULL**
  (unlimited), the full range is served (no clamp).
