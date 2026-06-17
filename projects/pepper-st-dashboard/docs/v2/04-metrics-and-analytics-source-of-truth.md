# V2 / 04 — Metrics & Analytics: Source of Truth (CRITICAL)

> Documentation only — **no fix is implemented here.** This explains exactly where the
> numbers come from, the precise range logic, **why some figures can be misleading**, and
> what the correct source would be. Source files: `lib/analytics/service.ts`,
> `lib/analytics/universe.ts`, `lib/analytics/aggregate.ts`, `lib/analytics/ranges.ts`.

> **⚠ Pre-ADR-0016 (2026-06-17).** This describes the **current** pre-ADR-0016 metrics behavior. **After
> ADR-0016**, "conversations" mean **customer/contact threads**; provider sessions/visits are **separate
> child records** (`app_conversation_sessions`) — so a "conversations" count becomes per-contact, and a
> per-session/visit count is a distinct metric. Target: ADR-0016 / `docs/architecture/09`.

## 1. Current metric source (as built)

Both the **Dashboard** and **Analytics** surfaces call the **same** function:
`getAnalyticsData()` (`lib/analytics/service.ts`). Its sources:

| Metric | Source | Notes |
|---|---|---|
| Universe (which conversations count) | **`dashboard.app_conversations`** | `status != 'archived'` **AND** `last_at ∈ [from, to)` (filtered in SQL via the `(tenant_id, last_at DESC)` index) |
| `conversations` | count of in-range universe rows | conversation/session grain |
| `turns` | `ai.agno_sessions.runs` → `runs.length` | **whole-session** count (parsed) |
| `messages` | `ai.agno_sessions.runs` → parsed, non-system, de-duped, retention-cut | **whole-session** count |
| `totalTokens` / `cost` | **`ai.agno_sessions.session_data.session_metrics.total_tokens` / `.cost`** | **session LIFETIME totals** |
| `newContacts` / `returningContacts` | `firstAt ∈ range` vs not, per conversation | per-**conversation**, not per-contact |
| daily `series` | one bucket per local day; a conversation is added to its **`last_at`** day | tokens for the whole session land on that one day |

It does **NOT** use:
- **`ai.agno_metrics`** — the purpose-built per-period rollup — because it is **empty (0
  rows)**.
- per-message or per-run timestamps for token/cost (token/cost are only available as a
  per-session lifetime total in `session_metrics`).

> So the answer to "which source?": **`app_conversations` (universe) + `ai.agno_sessions.runs`
> (turns/messages) + `ai.agno_sessions.session_data.session_metrics` (token/cost)**, bucketed
> by `last_at`. **Not** `ai.agno_metrics`.

## 2. Exact range logic (`lib/analytics/ranges.ts`)

All bounds are computed in the **tenant timezone** (`app_tenants.timezone`, default
`Asia/Colombo`). `to` is **exclusive**. `now` is the request time.

| Range key | `from` | `to` |
|---|---|---|
| `today` | start of **today** (local) | `now` |
| `3d` | start of day, `now − 2 days` (i.e. 3 calendar days incl. today) | `now` |
| `7d` | start of day, `now − 6 days` | `now` |
| `14d` | start of day, `now − 13 days` | `now` |
| `30d` | start of day, `now − 29 days` | `now` |
| `this_month` | start of the **current month** (local) | `now` |
| `custom` | start of local day `from` | start of local day `to` **+ 1 day** (inclusive end date) |

- **Default** range key = `7d`. Invalid/incomplete custom (`from`/`to` not `YYYY-MM-DD`,
  or `from > to`) falls back to the default and **fires no request** (`isCustomRangeValid`).
- **Retention clamp (`clampToRetention`, ADR-0006):** `from` is clamped to
  `now − analytics_retention_days`. **NULL = unlimited** (no clamp). PEPPER ST. = unlimited,
  so today no clamp occurs.

## 3. At what grain do filters apply?

**Conversation / session level, keyed on `last_at`.** Specifically:

- A conversation is **in-range** iff its `last_at ∈ [from, to)` (SQL) **and** re-checked in
  memory by `aggregateAnalytics` (`inRange(lastAt)`).
- Filters do **NOT** apply at message-, run-, or metric-event level. There is **no**
  per-message or per-run date filtering for tokens/cost.

## 4. Why current metrics may be wrong / misleading

1. **Token/cost are session-LIFETIME totals.** `session_metrics.total_tokens`/`cost` is the
   running total for the whole session. If a session's `last_at` falls in the range, its
   **entire** lifetime token/cost is counted — even if most of that usage happened *before*
   the range. Token/cost therefore **cannot be accurately sliced by date** with this source.
2. **Turns/messages are whole-session counts.** A multi-day session shown under "Today"
   reports **all** its historical turns/messages, not just today's.
3. **The daily series mis-attributes.** Every conversation is bucketed on its single
   `last_at` day, so a session spanning many days dumps **all** its conversations/tokens on
   one day — the per-day chart is not a true daily distribution.
4. **Archived conversations are excluded.** 13 of 17 conversations are archived; longer
   historical ranges **undercount** because only ~4 active+live-mapped conversations
   contribute.
5. **Live-mapping drift.** Only conversations that still join a live `ai.agno_sessions` row
   (R2 = 4) get turns/tokens; an active conversation whose session is gone yields honest
   zeros (no fabrication — ADR-0007), which can read as "missing" data.
6. **new/returning is per-conversation, not per-contact.** Because one Agno session = one
   conversation (rolling grain), a returning *customer* with a new session counts as a new
   conversation; "returning" here means "conversation whose `firstAt` predates the range",
   which is not the same as "returning customer". **(ADR-0016 changes this — describes the current,
   pre-ADR-0016 behavior.)** Once a **conversation = a customer/contact thread** (one row per contact;
   sessions become `app_conversation_sessions` children), new/returning is naturally **per-contact** and
   this distortion disappears.

> **Net:** for **short ranges where each counted session lived entirely inside the range**
> (e.g. *Today* with fresh sessions), the totals are effectively correct. The distortion
> grows with **longer ranges** and **older multi-day sessions**.

## 5. Should `ai.agno_metrics` become the metric source?

**Eventually yes for date-sliced token/cost — but it is not usable today.**

- Its shape is built for this: `date`, `aggregation_period`, `token_metrics` (jsonb),
  `model_metrics` (jsonb), plus run/session/user counts. That is the correct grain for
  **accurate per-day** token/cost (unlike per-session lifetime totals).
- **Blocker:** it currently has **0 rows**. The dashboard **must not** populate or write it
  (it is `ai.*`). Using it requires the **AI platform** to populate it.
- **TO VERIFY with the AI dev:** (a) will Agno populate `agno_metrics`? (b) at what
  `aggregation_period` (daily?)? (c) exact `token_metrics`/`model_metrics` JSON structure?
  (d) the join/scoping key (date + agent_id/tenant?)? (e) is cost included or only tokens?

## 6. Can token/cost be sliced accurately by date range today?

**No.** With the current `session_metrics` lifetime totals, date slicing is approximate
(see §4). Accurate slicing needs either (a) a populated `ai.agno_metrics` per-day rollup
(read-only), or (b) per-run/per-message token attribution if Agno exposes it in `runs`
(**TO VERIFY** — the parser does not currently see per-run token fields).

## 7. What is safe for the demo / what must be fixed first

**Safe for demo (no code change):**
- *Today* and short recent ranges where sessions are fresh → totals are effectively correct.
- Conversation **counts**, **turns**, and **transcripts** are reliable for the active set.

**Must fix before a metrics-heavy demo (document now, implement later — NOT in this gate):**
- Decide the token/cost story: either **label** current figures honestly (e.g. "lifetime
  totals for sessions active in range") **or** move to a date-sliced source.
- Decide how to present **archived/historical** ranges (currently undercounted).
- Re-frame **new/returning** as contact-level if that is what the client expects (would use
  `ai.customers` / distinct `external_contact_id`).

**Recommendation (for `06`):** the metric-correctness decision is the **#1** pre-demo item.
Do not start Slice 12B (cost/token expansion) until the source-of-truth question is settled.
