# Workflow 06 — Retention / Access Limit

- **Status:** Phase 1 (docs-first)
- **Last updated:** 2026-06-15
- **Related:** ADR-0006, ADR-0004, `docs/architecture/03-agno-mapping.md`

## Goal

Enforce per-tenant raw-history limits **at the dashboard query/access level**,
without deleting or mutating `ai.agno_sessions`.

## Policy source

- `app_tenant_entitlements.raw_history_retention_days` (transcript + list access)
  and `analytics_retention_days` (analytics) per tenant — **set explicitly at
  onboarding** (no column default); **`NULL` = unlimited** (enterprise / fully
  enabled).

## Rule

Retention is a dashboard **access limit**, not deletion. A single Agno row is a
**rolling thread**; we never delete it or any `ai.*` data. Access is gated at read
time at **two levels**:

- **Transcript:** filter messages/runs by timestamp (drop `created_at < cutoff`).
- **List (Chat Monitor):** a conversation whose latest activity (`last_at`) is
  older than the cutoff is **out of window** — excluded from the normal list and,
  on direct access, shown as a **restricted/empty retention state**.

Mapping/index rows in `dashboard.*` may still exist; only **access** is limited.

## Procedure (read path)

1. Resolve the tenant's `raw_history_retention_days` (R). **If `R IS NULL`
   (unlimited), skip the retention filtering below — nothing is out-of-window.**
2. Otherwise compute `cutoff = now - R days`.
3. When building a transcript (Workflow 03) or counting raw history, **exclude**
   messages whose `created_at < cutoff`.
4. **Chat Monitor list:** include a conversation only if `last_at >= cutoff`.
   Conversations with `last_at < cutoff` are **out of window** — excluded from the
   normal list; **direct access** renders a **restricted/empty retention state**.
5. **Analytics** are computed live (no rollup table yet) and capped by the
   **separate** `analytics_retention_days` knob (`NULL` = unlimited) — see
   Workflow 05 / ADR-0006.
6. If everything is older than cutoff → render "No messages within your
   retention window" (not an error).

## What is NOT done

- ❌ No `DELETE`/`UPDATE` on `ai.agno_sessions`.
- ❌ No pruning copies into `dashboard.*` (we don't store messages at all).
- ❌ No per-message storage to "expire".

## Plan changes

- Raising/lowering retention is a row update on `app_tenant_entitlements`; it
  changes what reads return immediately (no data migration). Setting a value to
  `NULL` makes that dimension **unlimited**.
- Future: different entitlement tiers (e.g. 7/30/90 days, or unlimited), enforced
  the same way.

## Test intent

- Boundary: message at `cutoff` included; just before excluded.
- Whole-thread-expired → friendly empty state, session row untouched.
- Changing R changes visible range without touching Agno.
- List: a conversation with `last_at < cutoff` is **absent** from the normal list;
  direct access shows the **restricted/empty retention state**.
- Analytics over a range beyond `analytics_retention_days` returns only in-window
  detail; **NULL** = unlimited (full range served).

## Access vs retention (note)

Retention here is a **viewing-window** limit. True access control (who may view a
tenant, reveal phone, etc.) arrives with auth (parked) and layers on top of this
filter.
