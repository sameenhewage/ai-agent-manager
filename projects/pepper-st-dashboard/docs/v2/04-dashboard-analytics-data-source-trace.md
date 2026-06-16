# 04 — Dashboard & Analytics Data-Source Trace (Gate V2-DATA-SOURCE)

- **Project:** `pepper-st-dashboard` · **App root:** `base-dashboard-app/`
- **Gate:** V2-DATA-SOURCE — audit/report ONLY. **No** implementation, code, DB, migration, seed, sync, archive, loader, or metric changes were made. Read-only SQL only.
- **Date:** 2026-06-16
- **Method:** static read of the listed code + docs, plus **read-only** live inspection of the `papper` PostgreSQL DB on a session pinned `default_transaction_read_only = on` (any stray write is rejected by PG), plus live `GET` calls to the running app's internal API routes (Node 22, dev server on a throwaway port). Connection string is **never printed**; all examples are **masked**; no raw phone / `user_id` / `session_id` / transcript content appears here.
- **Verdict (one line):** Logic is **internally consistent** (app totals == independent SQL, exact, every range) and **PII-safe**, but the metric **grain is session-level** (filter by `app_conversations.last_at`, then count the *whole* session) and **token/cost is the cumulative per-session lifetime total** — both are **structurally unsliceable by date**. They look correct **today only because all live activity is on a single local day (2026-06-16)**; they will drift the moment a session spans days or a date sub-window is requested.

> **Live snapshot used for this report (read-only):** DB `papper`; `ai.agno_sessions` = **6**, all under the PEPPER ST. derived agent; `ai.agno_metrics` = **0 (empty)**; `ai.customers` = **5 (all named)**; `dashboard.app_conversations` = **17 (4 active / 13 archived)**. The analytics/dashboard **universe = 4 active mapped conversations** = 4 of the 6 live sessions (**2 live sessions are not yet mapped**). All 249 non-system messages fall on **2026-06-16** (one local day).

---

# 1. Executive Summary

Plain wording (Sinhala-style simple):

- **Dashboard eke / Analytics eke data koheda enne?** — UI eka **kෙලින්ම DB එකෙන් data ගන්නේ නෑ**. Browser eka Next.js **internal API routes** දෙකකට call කරනවා: `GET /api/dashboard` සහ `GET /api/analytics` (Slice 12C-API / ADR-0013). Page eka මුලින්ම load වෙද්දි **server-side** (SSR) එම same service ම call කරලා data render කරනවා.
- **API route → service layer:** route handler eka thin — eya `range`/`from`/`to` විතරක් validate කරලා, **tenant/channel server-side resolve කරලා**, service layer eka call කරනවා (`getAnalyticsData`, `getConversationList`).
- **Service layer → DB:** service eka **two schemas** කියවනවා — `dashboard.*` (mapping/index: tenant, channel, conversations, entitlements) සහ **read-only** `ai.agno_sessions` (runs + `session_data.session_metrics`). `ai.*` ට කවදාවත් ලියන්නේ නෑ.
- **Safe DTO:** UI ට යන්නේ masked, PII-free DTO එකක් විතරයි (raw phone / `session_id` කවදාවත් යන්නේ නෑ).
- **Filter click kalama:** client `fetch(/api/...?range=…)` කරනවා → **same service, same SQL** → previous data screen eke තියාගෙන අලුත් එක swap කරනවා.
- **Metrics waradi wenna puluwan ඇයි?** — Range eka **session/conversation level** (`last_at`) filter කරලා, ඊට පස්සේ ඒ session එකේ **ඔක්කොම** messages/turns/tokens ගණන් කරනවා. Session එකක් **දවස් කිහිපයකට විහිදුණොත්** (messages span multiple dates), Today/7D/Custom වැරදි වෙනවා. Tokens/cost නම් **whole-session cumulative total** නිසා **date එකකට කපන්න බෑ**. දැන් data ඔක්කොම එක දවසයි (2026-06-16) නිසා මේක තාම පේන්නේ නෑ — but structural risk එක තියෙනවා.

What is **correct** today: tenant/channel scoping, masking, real-data-only (no fabricated KPIs), tenant-timezone ranges, and exact self-consistency (app == independent SQL).

---

# 2. Dashboard Data Flow

### 2.1 Browser / UI

| Item | Value |
|---|---|
| Page file | `base-dashboard-app/app/(dashboard)/page.tsx` (Server Component, `dynamic = "force-dynamic"`) |
| Client component | `base-dashboard-app/components/dashboard/dashboard.tsx` (`"use client"`) |
| Client fetch hook | `base-dashboard-app/components/shell/use-range-data.ts` |
| Props/state | `<Dashboard initialData={…} initialRange={key} />`; live payload held in `useRangeData` reducer state `payload = { analytics, recent, restrictedCount }` |
| Displayed cards | KPI grid via `buildDashboardKpis()` — Conversations, New contacts, Returning, Messages, Turns, Total tokens, Est. cost (USD), Last activity |
| Displayed charts | `Conversations over time` + `Tokens per day` (`buildDashboardChartSeries()` → `AreaChart`) |
| Other panels | `Recent conversations` (masked list, top 6), `Coverage & window` (channel, tz, analytics window, token/cost coverage, first/last activity), `Not tracked in Phase 1` (honest static list — ADR-0007) |

### 2.2 Client fetch

| Item | Value |
|---|---|
| Hook | `useRangeData` (`components/shell/use-range-data.ts`) |
| Request URL | `GET /api/dashboard?range=<key>` (Dashboard toolbar has **no custom range**; only `today/3d/7d/14d/30d/this_month`) |
| Query params | `range` only (Dashboard); `buildRangeQuery()` in `lib/api/query.ts` |
| When it fires | On range-button click (`select({key})`); **not** on first paint (first paint uses SSR `initialData`); URL synced via `history.replaceState` (no server round-trip) |
| Loading behaviour | keep-previous-data; latest-request-wins; user-safe error + retry (`lib/dashboard/async-data.ts`) |

### 2.3 API route

| Item | Value |
|---|---|
| Route path | `GET /api/dashboard` |
| File | `base-dashboard-app/app/api/dashboard/route.ts` (`dynamic = "force-dynamic"`, `cache-control: no-store`) |
| Handler core | `runDashboardEndpoint()` in `base-dashboard-app/lib/api/endpoints.ts` (dependency-injected, DB-free) |
| Validation | `parseAnalyticsQuery()` (`lib/api/query.ts`) — bad/unknown range or invalid custom → **400**; tenant/channel from client are **ignored** |
| Injected loaders | `loadAnalytics → getAnalyticsData(getDb(), getPool(), …)`, `loadRecent → getConversationList(getDb(), getPool())` |
| Safe DTO | `{ analytics, recent: recent.map(pickRecentItem), channelLabel, retentionLabel, restrictedCount }` — `pickRecentItem` whitelists `[id, maskedContact, status, firstAt, lastAt, turnCount]` |

### 2.4 Service layer

| Item | Value |
|---|---|
| Analytics | `getAnalyticsData()` in `base-dashboard-app/lib/analytics/service.ts` |
| Recent list | `getConversationList()` in `base-dashboard-app/lib/chat-monitor/service.ts` |
| Range resolve | `resolveRange()` + `clampToRetention()` in `lib/analytics/ranges.ts` |
| Universe build | `collectSessionIds()` + `buildAnalyticsInputs()` in `lib/analytics/universe.ts`; parse via `parseTranscript()` in `lib/agno/parser.ts` |
| Aggregation | `aggregateAnalytics()` in `lib/analytics/aggregate.ts` |
| Tenant/agent | `resolveCurrentTenant()` (`lib/tenant/context.ts`, slug `pepper-st`); `deriveExpectedAgentId(tenantId, channelId)` = `"<tenantId>:<channelId>"` (`lib/agno/mapping.ts`) |

### 2.5 DB source

- **`dashboard.app_tenants`** — tenant row (name `PEPPER ST.`, `timezone='Asia/Colombo'`).
- **`dashboard.app_channels`** — `channel_key='whatsapp-main'`, `display_name='PEPPER ST. WhatsApp'`.
- **`dashboard.app_tenant_entitlements`** — `analytics_retention_days` (NULL = unlimited here).
- **`dashboard.app_conversations`** — the **range/universe table**: `last_at`, `first_at`, `status`, `agno_session_id`, `external_contact_id`. Indexed `(tenant_id, last_at DESC)`.
- **`ai.agno_sessions`** (READ-ONLY) — joined **by value** `session_id = app_conversations.agno_session_id`, scoped by derived `agent_id`. Reads `runs` (jsonb) + `session_data->'session_metrics'->>'total_tokens'` / `->>'cost'`.
- **Relationship keys:** `app_conversations.agno_session_id == ai.agno_sessions.session_id` (by value, no FK); `agent_id` derived from `app_tenants.id` + `app_channels.id`.

### 2.6 Per-metric trace (Dashboard)

| UI Label | Component/File | API Field | Service Field | DB Source | Formula | Range Applied At | Notes / Risks |
|---|---|---|---|---|---|---|---|
| Conversations | `dashboard.tsx` → `buildDashboardKpis` | `analytics.totals.conversations` | `aggregate.ts` `conversations` | `dashboard.app_conversations` rows | count of active convs with `last_at ∈ [from,to)` | **conversation/session** (`last_at`) | Universe = **mapped** convs (4), not live sessions (6) → undercount until sync |
| New contacts | `presenter.ts` | `totals.newContacts` | `aggregate.ts` `newContacts` | `app_conversations.first_at` | count where `first_at ∈ [from,to)` | conversation (`first_at`) | "new vs range start"; per-conversation, not per-distinct-contact |
| Returning | `presenter.ts` | `totals.returningContacts` | `aggregate.ts` | derived | `conversations − newContacts` | conversation | — |
| Messages | `presenter.ts` | `totals.messages` | `aggregate.ts` `messages` ← `parseTranscript.messageCount` | `ai.agno_sessions.runs[].messages[]` | sum over in-range sessions of (non-system, non-`from_history`, user/assistant, **deduped by id**) message count | **session-selected, message-counted** | **All messages of an in-range session count, regardless of message date** (`retentionDays:null`) → wrong if multi-day |
| Turns | `presenter.ts` | `totals.turns` | `aggregate.ts` `turns` ← `parseTranscript.turnCount` | `jsonb_array_length(runs)` | sum over in-range sessions of `runs.length` | session-selected, run-counted | Same multi-day risk |
| Total tokens | `presenter.ts` | `totals.totalTokens` | `aggregate.ts` `totalTokens` | `session_data.session_metrics.total_tokens` | sum of **cumulative per-session** token totals | session-selected | **Cumulative lifetime total — not sliceable by date**; coverage 4/4 |
| Est. cost (USD) | `presenter.ts` | `totals.cost` | `aggregate.ts` `cost` | `session_data.session_metrics.cost` | sum of **cumulative per-session** cost | session-selected | Same; `costCoverage` 4/4; `$x.toFixed(4)` |
| Last activity | `presenter.ts` `fmtDateTime` | `totals.lastActivityAt` | `aggregate.ts` | `app_conversations.last_at` (max) | max `last_at` of in-range sessions, shown in tenant tz | — | — |
| Conversations-over-time chart | `dashboard.tsx` `buildDashboardChartSeries` | `analytics.series[].conversations` | `aggregate.ts` series | `app_conversations.last_at` | per-local-day count, bucketed by `tzDayKey(last_at)` | day = `last_at` day | A whole session lands on its `last_at` day |
| Tokens-per-day chart | `dashboard.tsx` | `analytics.series[].tokens` | `aggregate.ts` series | `session_metrics.total_tokens` | per-day sum bucketed by `tzDayKey(last_at)` | day = `last_at` day | **Entire session's lifetime tokens dumped on one day** |
| Recent conversations | `dashboard.tsx` | `recent[]` | `getConversationList` | `app_conversations` + `jsonb_array_length(runs)` | masked list, `last_at DESC`, top 6 | retention windowed | `turnCount` from SQL `jsonb_array_length` (not parsed messages) |
| Token/Cost coverage | `dashboard.tsx` Meta | `totals.tokenCoverage`/`costCoverage` | `aggregate.ts` | `session_metrics` presence | # in-range sessions reporting the field | session | honest coverage (4/4) |
| Restricted count | `dashboard.tsx` | `restrictedCount` | `getConversationList` | `app_conversations.last_at` vs retention | # convs older than raw-history cutoff | read-time | 0 (unlimited tenant) |

**Not present on the Dashboard (by design, ADR-0007):** resolution rate, AI-resolved, escalations, intent, sentiment, priority, leads, revenue, CSAT, orders/exchanges/issues, handover. Listed in a "Not tracked in Phase 1" panel.

---

# 3. Analytics Data Flow

Identical backbone to the Dashboard but **analytics-only** payload and **custom range supported**.

### 3.1 Files

| Item | Value |
|---|---|
| Page file | `base-dashboard-app/app/(dashboard)/analytics/page.tsx` (Server Component, `force-dynamic`) |
| Client component | `base-dashboard-app/components/analytics/analytics.tsx` (`"use client"`) |
| Client fetch | `useRangeData` → `GET /api/analytics?range=&from=&to=` |
| Route | `base-dashboard-app/app/api/analytics/route.ts` → `runAnalyticsEndpoint()` (`lib/api/endpoints.ts`) → `getAnalyticsData()` |
| Validation | `parseAnalyticsQuery()` — invalid range / incomplete/inverted custom → **400** |
| DTO | `{ analytics }` only (no `recent`, no contact ids — analytics is PII-free by construction) |

### 3.2 Per-metric trace (Analytics)

| UI Label | Component/File | API Field | Service Field | DB Source | Formula | Range Applied At | Notes / Risks |
|---|---|---|---|---|---|---|---|
| Conversations | `analytics.tsx` | `totals.conversations` | `aggregate.ts` | `app_conversations` | count active convs `last_at ∈ [from,to)` | conversation (`last_at`) | universe = mapped (4), not live (6) |
| New contacts | `analytics.tsx` | `totals.newContacts` | `aggregate.ts` | `first_at` | `first_at ∈ [from,to)` | conversation (`first_at`) | per-conversation |
| Returning | `analytics.tsx` | `totals.returningContacts` | derived | — | `conversations − newContacts` | conversation | — |
| Turns | `analytics.tsx` | `totals.turns` | `parseTranscript.turnCount` | `jsonb_array_length(runs)` | sum of `runs.length` for in-range sessions | session-selected | multi-day risk |
| Messages | `analytics.tsx` | `totals.messages` | `parseTranscript.messageCount` | `runs[].messages[]` | sum of deduped non-system user/assistant msgs | session-selected, message-counted | **no per-message date filter** |
| Total tokens | `analytics.tsx` | `totals.totalTokens` | `aggregate.ts` | `session_metrics.total_tokens` | sum of cumulative session totals | session-selected | cumulative (not date-sliceable) |
| Est. cost (USD) | `analytics.tsx` | `totals.cost` | `aggregate.ts` | `session_metrics.cost` | sum of cumulative session costs | session-selected | cumulative |
| Avg turns / chat | `analytics.tsx` (inline) | derived | — | — | `turns / conversations` | derived | — |
| Active contacts | `analytics.tsx` (inline) | reuses `totals.conversations` | — | `app_conversations` | **= conversations** (label only) | conversation | **Not distinct contacts** — it is the conversation count relabelled; misleading if 1 contact has many sessions |
| Conversations/day chart | `analytics.tsx` | `series[].conversations` | `aggregate.ts` | `last_at` | per-day count by `tzDayKey(last_at)` | day = `last_at` day | — |
| Tokens/day chart | `analytics.tsx` | `series[].tokens` | `aggregate.ts` | `session_metrics.total_tokens` | per-day sum by `tzDayKey(last_at)` | day = `last_at` day | full session tokens on one day |
| Range label | `analytics.tsx` | `range.label` | `resolveRange` | — | `RANGE_OPTIONS` label | — | — |
| Clamp banner | `analytics.tsx` | `clamped` / `requestedFromISO` | `clampToRetention` | `analytics_retention_days` | clamp lower bound to `now − retention` | range | never fires for PEPPER ST. (unlimited) |
| Custom range | `analytics.tsx` inputs → `go("custom",…)` | `range.key='custom'` | `resolveRange('custom')` | — | `[startOfDay(from), startOfDay(to)+1d)` | range | `to` day is **inclusive** |

The Analytics footer text already concedes: *"Token & cost are per-session lifetime totals … attributed to each session's latest activity day. Finer per-message attribution needs rollups (future)."* — this report finds finer attribution is in fact possible from existing `runs[].metrics` (see §6/§7/§11).

---

# 4. Initial Page Load vs Filter Click

| Aspect | Initial load (SSR) | Filter click (client) |
|---|---|---|
| Entry file | `app/(dashboard)/page.tsx` / `analytics/page.tsx` | `components/shell/use-range-data.ts` → `app/api/{dashboard,analytics}/route.ts` |
| Function called | `getAnalyticsData()` (+ `getConversationList()` for Dashboard) directly | `runDashboardEndpoint`/`runAnalyticsEndpoint` → **same** `getAnalyticsData()` / `getConversationList()` |
| Same service? | **Yes** — single source of truth | **Yes** |
| Same range parser? | `parseRangeParams()` (lenient) then `resolveRange()` | `parseAnalyticsQuery()` (strict) then `resolveRange()` |
| Same DTO? | Dashboard SSR passes the service objects straight to `<Dashboard/>`; Analytics SSR wraps `{ analytics: data }` | API wraps identical shapes; `recent` additionally **whitelisted** by `pickRecentItem` |
| Custom range? | Analytics SSR **passes** `from/to`; **Dashboard SSR passes only `key`** (no custom) | Analytics client sends `from/to`; Dashboard client sends `range` only |

**Answers:**

- **Does initial load and `/api/dashboard` use the same source of truth?** **Yes** — both call `getAnalyticsData` + `getConversationList`.
- **Does initial load and `/api/analytics` use the same source of truth?** **Yes** — both call `getAnalyticsData`.
- **Could filter-click metrics differ from first-load metrics?** Not from logic. They can differ only because of:
  1. **`now` drift** — `today`/`3d`/…/`this_month` use `to = now`; SSR `now` and the later client-fetch `now` differ by seconds–minutes, so a session whose `last_at` sits in that gap could flip in/out.
  2. **Live data change** between SSR and the fetch (new/updated sessions, or a sync run).
  3. **Validation leniency mismatch:** a bad `?range=` deep-link renders the **default (7d)** under SSR (`parseRangeParams` falls back) but the API would answer **400** for the same string (`parseAnalyticsQuery`). In practice the client only emits valid keys, so this is latent, not user-visible.
  No metric-definition difference exists between the two paths.

---

# 5. Range Filter Logic

- **File:** `base-dashboard-app/lib/analytics/ranges.ts` (`resolveRange`, `startOfDay`, `startOfMonth`, `clampToRetention`, `parseRangeParams`); HTTP validation in `lib/api/query.ts` (`parseAnalyticsQuery`, `isCustomRangeValid`).
- **Timezone:** the **tenant** timezone `app_tenants.timezone` (default + current = **`Asia/Colombo`**, UTC+5:30), via `Intl.DateTimeFormat`. **Not** UTC, **not** the browser tz.
- **Boundaries:** **`[from, to)`** — lower **inclusive**, upper **exclusive** (`inRange`: `t >= from && t < to`).

| Range | `from` | `to` | Notes |
|---|---|---|---|
| `today` | local `startOfDay(now)` | `now` | partial day up to current instant |
| `3d`/`7d`/`14d`/`30d` | `startOfDay(now) − (n−1)·86400000` | `now` | inclusive of today; lower bound = start of the `(n−1)`-days-ago local day |
| `this_month` | local `startOfMonth(now)` | `now` | — |
| `custom` | local `startOfDay(from)` | `startOfDay(to) + 1 day` | **`to` day fully included** |

- **How `from`/`to` are parsed:** custom dates are `YYYY-MM-DD` strings interpreted as **tenant-local** day keys (`parseDayKey` → `zonedDayStartInstant`).
- **Invalid range behaviour:**
  - **API** (`parseAnalyticsQuery`): unknown `range` → `400 {"error":"Invalid range."}`; custom missing/`from > to` → `400 {"error":"Custom range requires valid from/to dates (from ≤ to)."}` (**both confirmed live**).
  - **SSR page** (`parseRangeParams`): unknown/invalid → silent fallback to **default `7d`** (no error).
- **Custom range behaviour:** Apply is disabled and **no request fires** unless `isCustomRangeValid` (both valid `YYYY-MM-DD` and `from ≤ to`); the server re-checks defensively.
- **Retention clamp:** `clampToRetention` lifts `from` to `now − analytics_retention_days` when exceeded; `NULL` = unlimited = no clamp. PEPPER ST. is unlimited → **never clamped** (`clamped:false` on all live calls).

**Answers:**

- **UTC or `Asia/Colombo`?** `Asia/Colombo` (tenant tz).
- **`[from,to)` or inclusive?** `[from, to)` (upper exclusive). Custom's `to` *day* is included because the bound is pushed to next local midnight.
- **Does the DB query use the tenant timezone?** Indirectly: bounds are computed in tenant tz in JS, then passed to SQL as **absolute UTC instants** compared against `app_conversations.last_at` (`timestamptz`). The comparison itself is instant-based (tz-correct).
- **Does the browser timezone affect it?** **No** for the numbers (server uses tenant tz). The browser only affects nothing material; day labels are rendered at UTC-noon to avoid label shift.

---

# 6. Metric Calculation Grain

| Metric | Calculated at | Evidence |
|---|---|---|
| Conversation count | **conversation/session level** | `service.ts` selects `app_conversations` by `last_at`; `aggregate.ts` `conversations++` per in-range session |
| Message count | **message level COUNT, but session-level SELECTION** | `universe.ts:toAnalyticsInput` → `parseTranscript(session, {retentionDays:null})`; counts all messages of the selected session, **no per-message date filter** |
| Turn count | **run level COUNT, session-level SELECTION** | `parser.ts` `turnCount = runs.length`; selected by session `last_at` |
| Token count | **cumulative session level** | `service.ts` reads `session_data->'session_metrics'->>'total_tokens'` (whole-session lifetime) |
| Cost | **cumulative session level** | `session_data->'session_metrics'->>'cost'` |
| Daily chart values | **session level, bucketed by `last_at` day** | `aggregate.ts` `tzDayKey(s.lastAt)` for both conversations and tokens |
| Average values | **derived** | `turns / conversations` (presenter/component) |

**Specific answers:**

- **Does the logic select sessions/conversations by date, then count all messages inside the session?** **Yes.** `getAnalyticsData` filters `app_conversations` by `last_at ∈ [from,to)`, then `parseTranscript` counts every run/message in each selected session (with `retentionDays:null`, i.e. **no message-date cutoff**).
- **Can this make Today/7D/Custom wrong when a session contains messages from multiple dates?** **Yes — structurally.** A session is attributed *entirely* to the window/day of its `last_at`; messages/turns/tokens that actually happened on other days are mis-counted/mis-bucketed. **Currently dormant:** live data shows `span_multi_day = 0` and all 249 messages on `2026-06-16`, so the session-grain count (139) and the message-date-grain count (139) are **identical right now** (see §9). The bug surfaces only once a real session crosses a local-day boundary or a sub-day window excludes part of a session.
- **Does `ai.agno_sessions.runs[].messages[].created_at` exist and is it used for message-level filtering?** **Exists** (epoch-seconds number; `lib/db` discovery + live confirm). **Used only** for the retention cutoff inside `parseTranscript` and for Chat Monitor transcript ordering — **not** for analytics range slicing (analytics passes `retentionDays:null`).
- **Does `session_metrics` exist?** **Yes** — `total_tokens, cost, input_tokens, output_tokens, cache_read_tokens, reasoning_tokens, details`.
- **Is `session_metrics` cumulative for the full session?** **Yes** — per-session lifetime totals (the UI states this).
- **Is token/cost timestamped per message/run/event?** **At the session_metrics path the app uses: No** (one cumulative blob, no timestamp). **But `runs[].metrics` and `messages[].metrics` DO exist and carry the same token/cost fields, alongside `runs[].created_at` / `messages[].created_at`** (live: 65/65 runs have both `created_at` and `metrics`). So per-run and per-message token/cost **are** timestamped in the source — the app just doesn't read them.
- **Can token/cost be accurately sliced by date range?** **Not via `session_metrics`** (cumulative, untimestamped). **Yes via `runs[].metrics` / `messages[].metrics`** (timestamped). **Not via `ai.agno_metrics`** (empty + unscoped — see §7).

---

# 7. `ai.agno_metrics` Audit

Inspected live, read-only.

### 7.1 Columns (live)

| Column | Type | Null |
|---|---|---|
| `id` | `character varying` (PK) | NO |
| `agent_runs_count` | `bigint` | NO |
| `team_runs_count` | `bigint` | NO |
| `workflow_runs_count` | `bigint` | NO |
| `agent_sessions_count` | `bigint` | NO |
| `team_sessions_count` | `bigint` | NO |
| `workflow_sessions_count` | `bigint` | NO |
| `users_count` | `bigint` | NO |
| `token_metrics` | `jsonb` | NO |
| `model_metrics` | `jsonb` | NO |
| `date` | `date` | NO |
| `aggregation_period` | `character varying` | NO |
| `created_at` | `bigint` (epoch) | NO |
| `updated_at` | `bigint` (epoch) | YES |
| `completed` | `boolean` | NO |

### 7.2 Facts

- **Row count:** **0** (empty).
- **Sample shape:** **none** — table is empty; `token_metrics` / `model_metrics` JSON key shapes are `UNKNOWN / TO VERIFY` until rows exist.
- **Indexes:** `agno_metrics_pkey (id)`; `agno_metrics_uq_metrics_date_period (date, aggregation_period)` UNIQUE; `idx_agno_metrics_date (date)`.

### 7.3 Keys available

| Key | Present? |
|---|---|
| `session_id` | **No** |
| `run_id` | **No** |
| `agent_id` | **No** (only `agent_runs_count`/`agent_sessions_count` aggregates — no agent identifier) |
| `user_id` | **No** (only `users_count`) |
| tenant/channel | **No** |
| `created_at` | Yes (epoch row-write time, not activity attribution) |
| activity date | Yes — `date` (DATE) + `aggregation_period` |
| metric name/type | `aggregation_period` (e.g. period granularity) |
| token fields | inside `token_metrics` jsonb (keys `UNKNOWN`) |
| cost fields | likely inside `token_metrics` (`UNKNOWN / TO VERIFY`) |
| model/provider | inside `model_metrics` jsonb (keys `UNKNOWN`) |

### 7.4 Relationship to `ai.agno_sessions`

- **None structural.** No `session_id` / `agent_id` / `user_id` / tenant / channel column → **cannot join or attribute to a session, agent, tenant, or channel.** The unique key `(date, aggregation_period)` shows it is a **single platform-global daily rollup**, not a per-tenant series.
- **Timestamp granularity for date filters:** has `date` + `aggregation_period` → suitable for date filtering **if populated**, but only at **platform-global daily** grain.

### 7.5 Answers

- **Should Dashboard/Analytics currently use `ai.agno_metrics`?** **No.**
- **If yes, for which metrics?** **None right now.** (Hypothetically, platform-wide daily token/cost trends — but only after it is populated **and** gains a tenant/channel/agent dimension via a stable upstream contract, ADR-0008.)
- **If no, why not?** (1) **Empty (0 rows)** — nothing to show. (2) **No tenant/channel/agent/session scoping** — multi-tenant attribution to PEPPER ST. is impossible. (3) It is a **global rollup**, conceptually different from per-conversation metrics.
- **What remains unknown:** the `token_metrics` / `model_metrics` JSON shape; whether/when the platform will populate it; whether it will ever carry tenant/channel scope; where cost lives within it.

---

# 8. Current Metric Wrongness Hypothesis (RCA — report only, no fix)

| Possible Cause | Evidence Found | Impact | Confidence | Next Fix Needed |
|---|---|---|---|---|
| **(A) Universe = mapped conversations, not live sessions** | live sessions = **6**, mapped/active convs = **4** (verifier: `live=6 joined=4`); 2 live sessions not in `app_conversations` | Dashboard/Analytics undercount vs live reality (e.g. turns 48 shown vs 65 live across 6 sessions) until an **approved** `db:agno:sync` runs | **High** | Sync cadence / freshness indicator (NOT in this gate) |
| **(B) Session-level selection + whole-session message/turn counting** | `service.ts` filters by `last_at`; `parseTranscript(retentionDays:null)` counts all messages; live `span_multi_day = 0` so **not yet triggered** | Today/7D/Custom over/under-count once a session spans days | **High (structural) / Low (today)** | Message-level (`messages[].created_at`) range filtering |
| **(C) Cumulative `session_metrics` for tokens/cost** | tokens/cost read from `session_data.session_metrics` (lifetime totals); chart buckets full total on `last_at` day | Token/cost **cannot** be correctly sliced by date or attributed per day; sub-day/multi-day windows wrong | **High (structural) / Low (today)** | Run/message-level metric attribution (`runs[].metrics`) |
| **(D) Rolling Agno sessions** | grain = one `session_id` → one conversation; a session is a rolling thread (`updated_at` advances) | A long thread's earlier-day activity rides on its latest day | **Medium (structural)** | Same as (B)/(C) |
| **(E) Timezone boundaries** | ranges in `Asia/Colombo`; `firstActivityAt = 2026-06-15T19:27:08Z` = `2026-06-16 00:57` Colombo (today) but `2026-06-15` in UTC | A UTC-thinking operator may read a "today" number as wrong | **Medium (perception)** | None (working as designed); optional tz cue |
| **(F) Initial SSR vs API mismatch** | both call same service; only `now` drift + lenient-vs-strict validation differ | Tiny boundary flips between first paint and a refetch; bad deep-link renders 7d under SSR but 400 via API | **Low** | Align validation leniency (optional) |
| **(G) Dashboard vs Analytics mismatch** | same `getAnalyticsData`; Dashboard has no custom range, "Active contacts" on Analytics = conversations relabelled | "Active contacts" misleads (not distinct contacts); Dashboard ignores custom deep-link | **Low–Medium** | Relabel / compute distinct contacts |
| **(H) Non-use of `ai.agno_metrics`** | table empty + unscoped (§7) | Not a current cause; not usable yet | **N/A** | Defer until populated + scoped |

**Most likely *currently perceived* wrongness:** **(A)** (universe lag: 4 shown vs 6 live) and **(E)** (timezone perception). **(B)/(C)/(D)** are the **high-structural-risk** causes that are dormant only because all live data is single-day.

---

# 9. Verification SQL / Independent Count

Independent, read-only SQL over the **same mapped universe** at the **app's exact returned bounds** (session-grain, mirroring `db:analytics:verify`). Tokens/cost **were** independently computable (no PII) because they are aggregate `session_metrics` sums.

| Range | App Conv | SQL Conv | App Turns | SQL Turns | App Tokens | SQL Tokens | App Cost | SQL Cost | Match? |
|---|---|---|---|---|---|---|---|---|---|
| Today | 4 | 4 | 48 | 48 | 1,077,990 | 1,077,990 | 0.102961772 | 0.102961772 | ✅ |
| 7D | 4 | 4 | 48 | 48 | 1,077,990 | 1,077,990 | 0.102961772 | 0.102961772 | ✅ |
| 30D | 4 | 4 | 48 | 48 | 1,077,990 | 1,077,990 | 0.102961772 | 0.102961772 | ✅ |
| Custom 06-01..06-16 | 4 | 4 | 48 | 48 | 1,077,990 | 1,077,990 | 0.102961772 | 0.102961772 | ✅ |

- All ranges return identical totals because **every mapped session's `last_at` is on 2026-06-16** (single day).
- The project verifier `db:analytics:verify` (30D) reports **ALL CHECKS PASSED** (parity exact; `live sessions = 6`, `joined = 4`).
- **Messages independent check (7D):** session-grain deduped = **139**; message-DATE-grain (`messages[].created_at ∈ [from,to)`) = **139** → **equal today** (proves the grain difference is currently dormant, not that the grain is correct).

> **Important caveat:** this parity proves the app is **self-consistent with its own session-grain definition** — it does **not** prove date-correctness. The independent SQL deliberately uses the same session-grain, so a multi-day session would be mis-attributed by **both** the app and this check.

---

# 10. DTO / Security Boundary

Live-confirmed response shapes.

- **`GET /api/analytics`** → `{ analytics }` where `analytics = { tenantName, channelLabel, timeZone, analyticsRetentionDays, retentionLabel, range:{key,label,fromISO,toISO}, clamped, requestedFromISO, totals:{conversations,newContacts,returningContacts,turns,messages,totalTokens,tokenCoverage,cost,costCoverage,firstActivityAt,lastActivityAt}, series:[{date,conversations,tokens}] }`.
- **`GET /api/dashboard`** → `{ analytics, recent:[…], channelLabel, retentionLabel, restrictedCount }`.
- **`recent[]` item keys (whitelisted by `pickRecentItem`):** `id` (internal dashboard UUID), `maskedContact` (e.g. `94•••••784`), `status`, `firstAt`, `lastAt`, `turnCount`.

| Must NOT be present | Present in DTO? |
|---|---|
| raw phone | **No** (masked `94•••••784`) |
| raw `user_id` | **No** |
| raw `external_contact_id` | **No** (masked) |
| raw `agno_session_id` | **No** |
| raw transcript | **No** (analytics has none; recent has none) |
| `customer_id` | **No** (does not exist — ADR-0012) |
| `customer_identity_id` | **No** (does not exist — ADR-0012) |

- **Server-authoritative confirmed:** injecting `?tenant_id=…` returned PEPPER ST. data (ignored), HTTP 200.
- **Error mapping:** failures return a generic `{"error":"…"}`; no DB URL/secret/stack ever returned; masked server logs only (`maskDbUrl`).

---

# 11. Final Recommendation (report only — do NOT implement in this gate)

### 11.1 Ranked next steps

1. **Metric correctness fix (highest priority).** Move range filtering from **session-grain** to **message/run-grain** so Today/7D/Custom count only the activity that actually occurred in the window.
2. **Loader / freshness policy correction.** Surface that the universe is **mapped** conversations (4) not **live** sessions (6); decide sync cadence / a "last synced" cue so operators aren't surprised by the gap. (Cause **A**.)
3. **Customer name display from `ai.customers.name`.** Names are **populated** (5/5 non-null) and join by `phone == user_id == external_contact_id` (4 match active dashboard contacts). Feasible behind masking/PII policy; tenant/channel scoping of `ai.customers` is `UNKNOWN / TO VERIFY` (join by phone works today).
4. **Demo polish.** Relabel Analytics "Active contacts" (it is conversation count, not distinct contacts); let the Dashboard honor a custom deep-link or document that it doesn't.
5. **Cost/token expansion — only after the metric source is confirmed.** Add input/output/reasoning/cache splits + cost/day + averages, sourced from real fields once the grain decision (below) is made.

### 11.2 Recommended metric-fix approach

Choose **message/run-level range filtering using `ai.agno_sessions.runs[].messages[].created_at` (and `runs[].metrics` / `messages[].metrics` for tokens/cost)** — a **hybrid** that fixes counts and unlocks date-sliceable tokens/cost from data that **already exists**:

- **Counts (turns/messages):** filter `messages[].created_at ∈ [from,to)` instead of selecting whole sessions by `last_at`. (`messages[].created_at` confirmed present; the parser already reads it for retention.)
- **Tokens/cost:** sum `runs[].metrics.total_tokens` / `.cost` (and the splits) for runs whose `runs[].created_at ∈ [from,to)` — confirmed present for **65/65** runs. This makes per-day token/cost **accurate**, removing the current "needs rollups (future)" disclaimer.
- **Bucketing:** bucket each run/message by **its own** local day, not the session's `last_at` day.

**Why this is best:**

- **`ai.agno_metrics` (metric-event-level) is not viable:** empty + no tenant/channel/agent/session scoping (§7).
- **Pure `messages[].created_at` (counts only) fixes turns/messages but not tokens/cost** — `session_metrics` stays cumulative; the hybrid additionally reads `runs[].metrics` which is the **only** real, timestamped token/cost source today.
- It needs **no new table, no `ai.*` write, no upstream contract** — only a read-path change, consistent with ADR-0001/0004.

**Limitation warning to keep:** if a future session has runs/messages **without** `metrics` or `created_at`, those must be reported as **coverage gaps** (honest, ADR-0007), never estimated. Until the fix ships, keep the current "per-session lifetime, attributed to latest activity day" disclaimer.

---

# Appendix A — Read-only SQL executed (PII-free)

All on a session pinned `default_transaction_read_only = on`; connection string never printed.

- **Inventory / indexes / counts / FKs** — the four required queries (columns, indexes, row counts, FKs) over schemas `ai` + `dashboard`. Outputs in §1, §6, §7, and below.
- **Row counts (live):** `ai.agno_sessions=6`, `ai.agno_metrics=0`, `ai.customers=5`, `dashboard.app_conversations=17` (4 active).
- **FKs:** `dashboard.app_channels.tenant_id→app_tenants.id`; `app_conversations.{tenant_id→app_tenants.id, channel_id→app_channels.id}`; `app_tenant_entitlements.tenant_id→app_tenants.id`. **No FK from `dashboard.*` into `ai.*`** (link by value).
- **`ai.agno_sessions` indexes:** `pkey(session_id)`, `idx_agno_sessions_created_at`, `idx_agno_sessions_session_type` — **no `agent_id` index** (documented scale risk).
- **`ai.customers` PK:** `(tenant_id, channel_id, phone)`; `name` nullable but **5/5 populated** live.
- **Multi-day spread (pepper sessions):** `sessions_with_msgs=6`, `span_multi_day=0`, `max_days_one_session=1`, `sessions_with_msgs_before_bucket=0`; all 249 non-system messages on `2026-06-16`.
- **Run/message metric availability:** `runs[].metrics` keys = `{cache_read_tokens, cost, details, duration, input_tokens, output_tokens, reasoning_tokens, time_to_first_token, total_tokens}`; `total_runs=65`, `runs_with_created_at=65`, `runs_with_metrics=65`; `messages[].metrics` keys = same minus `details`.
- **Independent range aggregates** at the app's exact bounds (§9): all four ranges = conv 4 / turns 48 / tokens 1,077,990 / cost 0.102961772.

# Appendix B — Live API checks

| Call | HTTP | Result |
|---|---|---|
| `GET /api/dashboard?range=today` | 200 | conv 4, turns 48, msgs 139, tokens 1,077,990, cost 0.102961772; recent masked |
| `GET /api/dashboard?range=7d` | 200 | same totals |
| `GET /api/dashboard?range=30d` | 200 | same totals |
| `GET /api/analytics?range=today` | 200 | from `2026-06-15T18:30Z` to now; same totals |
| `GET /api/analytics?range=7d` | 200 | from `2026-06-09T18:30Z`; same totals |
| `GET /api/analytics?range=30d` | 200 | from `2026-05-17T18:30Z`; same totals |
| `GET /api/analytics?range=custom&from=2026-06-01&to=2026-06-16` | 200 | from `2026-05-31T18:30Z` to `2026-06-16T18:30Z`; same totals |
| `GET /api/analytics?range=__bad__` | **400** | `{"error":"Invalid range."}` |
| `GET /api/analytics?range=custom&from=2026-06-16&to=2026-06-01` | **400** | `{"error":"Custom range requires valid from/to dates (from ≤ to)."}` |
| `GET /api/dashboard?range=7d&tenant_id=<uuid>` | 200 | tenant_id **ignored** (PEPPER ST. returned) |

# Appendix C — Static checks

- `npm run typecheck` → **clean (exit 0)**.
- `npm run db:analytics:verify` → **ALL CHECKS PASSED** (read-only; parity exact; `live=6 joined=4`).
- **No** `db:migrate`, `db:seed`, `db:agno:sync`, `db:agno:archive-orphans`, or any write script was run. **No** `ai.*` or `dashboard.*` writes. **No** application code changed — only this report file was created.

