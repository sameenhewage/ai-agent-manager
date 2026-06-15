# ADR-0006 — Query-level Retention

- **Status:** Accepted
- **Date:** 2026-06-15
- **Related:** ADR-0003, ADR-0004, `docs/workflows/06-retention-access-limit.md`

## Context

A tenant's **entitlements** cap how much history the dashboard exposes, via two
nullable knobs on `app_tenant_entitlements`: `raw_history_retention_days`
(raw chat access — transcript + list) and `analytics_retention_days` (analytics
detail). Both are **set explicitly at onboarding** (no column default); **`NULL`
means unlimited** (enterprise / fully enabled). But a single `ai.agno_sessions` row is a **rolling thread** owned by
Agno — we must not delete it, and deleting a whole session to enforce retention
would destroy current activity too.

## Decision

1. **Retention knobs live on `app_tenant_entitlements`** (renamed from
   `app_subscription_limits`), the tenant's **single current** entitlement row
   (`UNIQUE (tenant_id)`): `raw_history_retention_days` and
   `analytics_retention_days`, **set explicitly at onboarding** (no column default);
   **`NULL` = unlimited** (enterprise / fully enabled). Changing a value is an
   in-place update (bump `updated_at`).
2. **Retention is a dashboard *access limit*, not Agno deletion.** Enforce it at
   the query/access level; **never** delete or mutate data. Mapping/index rows in
   `dashboard.*` may still exist, but **access** to history respects the window.
3. **Transcript access:** when rendering a transcript or counting raw history,
   exclude messages with `created_at < now - raw_history_retention_days` (never
   drop the session row). **If `raw_history_retention_days IS NULL` (unlimited),
   apply no cutoff.**
4. **List access (Chat Monitor):** a conversation whose most recent activity
   (`last_at`) is **older than the cutoff** is **outside the window** — it is **not**
   presented in the normal Chat Monitor list as accessible history, and **direct
   access** to it shows a **restricted/empty retention state** (not an error).
   Phase 1 must not present out-of-window conversations as normal accessible
   history. **If `raw_history_retention_days IS NULL` (unlimited), nothing is
   out-of-window.**
5. **Never delete or modify `ai.agno_sessions`** (or any `ai.*`).
6. **Analytics (Phase 1) are capped by `analytics_retention_days`** (a knob
   **separate** from raw history). Because there is **no analytics rollup/aggregate
   table yet**, analytics are computed live and cannot report detail beyond the
   tenant's `analytics_retention_days`; **`NULL` = unlimited** (no analytics cap —
   e.g. enterprise / PEPPER ST.). **Longer historical analytics for capped tenants
   requires future rollups / a plan feature** (roadmap; new ADR when picked up).

## Consequences

- Retention is a **read-time access filter** parameterized by the tenant's
  **entitlements** (`app_tenant_entitlements`); `NULL` = unlimited.
- Agno remains the untouched source of truth; retention is a dashboard policy.
- The transcript builder takes `retention_days` as an input and is tested for the
  boundary (messages just inside/outside the window).
- The **conversation list** applies the same window: out-of-window conversations
  are excluded/Restricted, not shown as normal accessible history.
- **Analytics detail is bounded by `analytics_retention_days`** (NULL = unlimited)
  until rollups exist; for capped tenants, ranges beyond the window cannot be
  served from raw live reads.

## Alternatives considered

- **Delete old Agno data**: rejected — destroys upstream-owned, still-active
  rolling threads; violates the read-only boundary.
- **Copy + prune into dashboard storage**: rejected — duplication (ADR-0004) and
  added complexity; query-level filtering is sufficient for Phase 1.
