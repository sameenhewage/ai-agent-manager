# 08 — Dashboard Data-Loading, Performance & Real-Time Strategy (Gate 12)

- **Project:** pepper-st-dashboard
- **Gate:** 12 — design/analysis only. **No code in this gate.** Every change below is a *proposal*
  for an approval-gated slice (see `docs/phases/phase-1-post-acceptance-hardening.md`).
- **Date:** 2026-06-16
- **Boundary (unchanged):** monitor/read only. **No** WhatsApp/AI send-reply logic. **No** fabricated
  metrics. `ai.*` stays read-only; the transcript stays canonical upstream (no duplication) unless an
  explicit ADR supersedes ADR-0004.

Architecture vocabulary follows the `improve-codebase-architecture` skill (module / interface / **seam**
/ depth / deletion test); domain terms follow `CONTEXT.md`.

---

## 1. Current data-loading architecture (as built)

| Surface | Entry | Loading model | Heavy work |
|---|---|---|---|
| **Dashboard** (`app/(dashboard)/page.tsx`) | Server Component, `force-dynamic` | `Promise.all([getAnalyticsData, getConversationList])` → one server render; `loading.tsx` skeleton on navigation | parses **all** sessions' `runs` |
| **Analytics** (`analytics/page.tsx`) | Server Component, `force-dynamic` | `getAnalyticsData` → render; own `loading.tsx` | parses **all** sessions' `runs` |
| **Chat Monitor** (`chat-monitor/page.tsx`) | shell + **client** `ChatMonitor` | client fetch `/api/.../conversations`, then `/api/.../[id]/transcript` | transcript parses **one** full session |
| Range filter | `DashboardToolbar` / `Analytics` (client) | `useTransition` + `router.push(?range=)`; toolbar dims while pending | re-runs the full server compute |

**What is already good:** the range toolbars use `React.useTransition`, so the **previous data stays
visible** and the toolbar dims (`opacity-60`) during a range change — there is no blank flash. Each
route has a tailored `loading.tsx`. Chat Monitor already lazy-loads (list first, transcript on demand)
and caches transcripts per id client-side. Masking/IDOR/no-leak guarantees live in the service+presenter
seam.

**The core problem is server compute, not missing skeletons** (§4).

---

## 2. Cost / token / metric support analysis

**Available at `session_data.session_metrics`:** `total_tokens`, `cost`, plus `input_tokens`,
`output_tokens`, `reasoning_tokens`, `cache_read_tokens`, `details`. Per-run `runs[].model` /
`runs[].model_provider` / `runs[].metrics` also exist. `ai.agno_metrics` (daily rollups,
`token_metrics`/`model_metrics`) exists but is **empty** and is agent/team-scoped (not tenant/channel).

| Capability | Today | Should support (Phase 1.5, real data only) | Source exists? |
|---|---|---|---|
| Total tokens KPI + coverage | ✅ | keep | ✅ |
| Est. cost KPI + coverage | ✅ | keep; **decimal-safe** sum (avoid float drift) | ✅ |
| Tokens/day chart | ✅ | keep | ✅ |
| **Cost/day chart** | ❌ | add (mirror tokens/day) | ✅ |
| **Input/output/reasoning/cache token split** | ❌ | add KPI/secondary cards | ✅ |
| **Avg cost / conversation, avg tokens / turn** | ❌ | add (derived from existing sums) | ✅ |
| **Per-model / per-provider cost** | ❌ | possible later (parse `runs[].model*`) | ✅ (richer parse) |
| **Cost-missing warning** | partial (`x/y reported`) | explicit banner when coverage < conversations | ✅ |
| Per-contact cost | ❌ | **defer** (PII-sensitive; only masked + access-gated if ever) | ✅ but gated |

**Guardrails:** no invented KPIs (no intent/sentiment/AI-resolution/CSAT/revenue — they have no
source). Cost is a per-session lifetime total attributed to the session's latest-activity day; finer
per-message attribution needs rollups. Treat `cost` as fixed-precision (store/sum as integer
micro-units or a decimal lib) to avoid floating-point penny drift in display.

---

## 3. Filters / loading UX analysis

**Findings:** range click → client `router.push(?range=)` inside `useTransition`; the Server Component
recomputes; old data stays visible; toolbar dims. So the *feedback* exists but is **subtle** and the
*whole page* recomputes as one unit (KPIs + charts + recent list together), so a slow analytics parse
blocks the cheap recent-list and vice-versa.

| Gap | Recommendation (approval-gated) |
|---|---|
| Whole-page recompute couples cheap + expensive widgets | split into independently-streamed widgets (`<Suspense>` per section) so KPIs/recent render as each resolves |
| Pending affordance is only a global dim | keep previous data + show a localised inline spinner/`aria-busy` on the affected cards/charts |
| No “stale while refreshing” marker | mark refreshing widgets explicitly (subtle “updating…”) rather than only dimming |
| Concurrent rapid range clicks | `useTransition` already coalesces; ensure the latest `?range=` wins (URL is the single source of truth — already true) |
| Custom-range apply has no validation feedback | inline validate (from ≤ to) before push (logic already guards server-side) |

This is **UX polish on top of a sound seam** — the URL-as-state design is correct; do not rewrite it.

---

## 4. Dashboard / Analytics performance strategy

**Root causes (measured: ~0.5s list/transcript at only 4 sessions):**

1. **R1 — unindexed `agent_id` scan.** Every query filters `ai.agno_sessions WHERE agent_id=$1`; Agno
   indexes only `session_id` (PK), `created_at`, `session_type`. → sequential scan, unfixable in `ai.*`.
2. **R2 — full-`runs` parse for counts.** `readAnalyticsRows` ships the entire `runs` JSONB for **every**
   session and `parseTranscript`s each just to count turns/messages — on every request, with **no
   SQL-level date filter** (range is applied in memory afterwards), so narrowing the range saves nothing.

**Fix ladder (each a candidate slice; none implemented here):**

| Tier | Change | Why safe / effect |
|---|---|---|
| **Immediate** | Query `agno_sessions` by **`session_id = ANY($mappedIds)`** (PK-indexed) instead of `agent_id` scan; the dashboard already holds the mapped `session_id`s in `app_conversations` | avoids R1 entirely; ownership already established at sync; keeps `ai.*` read-only |
| **Immediate** | Compute turns in SQL via `jsonb_array_length(runs)` (as the chat list already does); only fetch `runs` when message-level counts are actually needed | removes most of R2's parse cost for the common KPI path |
| **Immediate** | Push the date window into the dashboard side: filter `app_conversations` by `last_at` (indexed `(tenant_id,last_at desc)`) **before** touching `ai.*` | smaller working set per range; smaller `ANY($ids)` |
| **Post-deploy** | Split Dashboard into `summary` / `timeseries` / `recent` API routes + `<Suspense>` streaming; `revalidate`/cache the summary briefly | parallel, independently-cached widgets; snappier filters |
| **Post-deploy** | Short server-side cache (e.g. 15–30s `revalidate` or in-memory TTL) for analytics aggregates | smooths repeated range toggles; still "live enough" for monitoring |
| **Production-scale** | Dashboard-owned **analytics rollup** table (per tenant/channel/day: conversations, turns, tokens, cost) refreshed by the sync job; or adopt `ai.agno_metrics` **iff** it becomes tenant/channel-scoped | O(days) reads instead of O(sessions·messages); introduce only when live-parse latency is user-visible **and** the contract is stable |

**Do not** build rollups yet: the source contract just stabilised and volume is tiny. Rollups are a
materialisation of already-correct live math — add them when scale demands, not before.

---

## 5. Real-time dashboard strategy

**Boundary reminder:** the dashboard **monitors**; the AI platform owns message processing and replies.
So real-time here means *"freshly observed read state"*, never bi-directional control.

| Approach | Fit | Verdict |
|---|---|---|
| **Polling** (client re-fetch on interval) | simple, stateless, works with `force-dynamic` + API routes | **Recommended** for Dashboard/Analytics counters and the Chat Monitor list |
| **SSE** (server-sent events) | one-way server→client stream; good for "new message" nudges | **Optional** for Chat Monitor live tail (Phase 2) |
| **WebSocket** | bi-directional | **Rejected** for Phase 1.5 — we have no outbound/control actions; revisit only if/when human-handover send is approved (ADR-0009, Phase 2) |
| **DB `LISTEN/NOTIFY`** | needs a writer to emit notifications | **Rejected** — we don't own `ai.*` writes; can't rely on Agno emitting notifies |
| **AI-platform webhook/event feed** | cleanest if it exists | **Deferred** — depends on an AI-dev-provided contract (none today) |

**Recommended Phase 1.5 shape:**
- **Polling** with a visible "Live • updated HH:MM" indicator and a manual refresh:
  - Chat Monitor **list**: poll ~10–15s (cheap: indexed read + `jsonb_array_length`).
  - Dashboard/Analytics counters: poll ~30–60s, pause when tab hidden (`visibilitychange`), keep
    previous data while refreshing.
- **What "real-time" updates:** (a) conversation list (new/updated threads, new turn counts),
  (b) selected transcript tail (new messages — see §6), (c) KPI counters, (d) token/cost as sessions
  update. Cadence is per-surface; all read-only; all respect retention/masking.
- **No** WebSocket, **no** DB triggers in Phase 1.5.

---

## 6. Chat Monitor — WhatsApp-like transcript pagination

**Current behaviour (the gap):** opening a conversation fetches the **entire** transcript
(`getConversationTranscript` parses all `runs`), renders every bubble oldest→bottom in an internal
scroll pane. There is **no** scroll-to-bottom on open, **no** load-older-on-scroll-up, **no** cursor,
**no** new-message indicator. It is a static, fully-loaded transcript — exactly the "loads/holds
everything" behaviour to fix.

**Target UX (like WhatsApp Web):** newest at the bottom and visible on open; scrolling **up** lazily
loads older pages; the pane scrolls internally (never the document); new incoming messages appear at
the bottom; system/tool messages hidden; PII masked.

**Proposed transcript API (read-only, by-value, no duplication):**
- `GET /api/chat-monitor/conversations/[id]/transcript?limit=N&before=<cursor>`
  - initial load returns the **newest N** messages + a `nextBefore` cursor + `hasMore`.
  - scroll-up sends `before=<oldest-loaded cursor>` → returns the previous N older messages.
- **Cursor candidate:** a composite **`(runIdx, msgIdx)`** position (stable, monotonic, derived purely
  from array order) — robust even when several messages share a `created_at` second. `created_at` alone
  is insufficient (ties); message `id` is good for dedupe but not for ordering.
- **Server flattens once, slices to the page** (parser already orders + dedupes + hides system/tool +
  applies retention). Only the page's masked messages cross the wire.

**Client behaviour:**
- maintain a **scroll anchor**: when prepending older messages, restore `scrollTop` by the height delta
  so the viewport doesn't jump;
- **auto-scroll to bottom** on first open and when the user is already near the bottom and new messages
  arrive; otherwise show a **"new messages ↓"** pill;
- keep per-conversation paging state in the existing client cache.

---

## 7. JSONB limitation — when (not) to add a derived message index

**The constraint:** a conversation's messages live as one `runs` JSONB value in a single
`agno_sessions` row. Postgres cannot cheaply return "messages 50–75 oldest-first" without reading the
**whole** `runs` value — there is no nested-array index. So **every** transcript page parses the full
`runs` (O(total messages)) even to return a small slice. The win from §6 paging is **payload size**
(client renders/holds less), not server parse cost.

| Conversation size | JSONB-only parse-and-slice | Verdict |
|---|---|---|
| small/medium (≤ a few hundred msgs) | fast (current 0.5s includes the unindexed scan, fixable via §4) | **fine — do this first** |
| large (thousands of msgs, long-lived threads) | re-parsing full `runs` on every scroll-up becomes wasteful | consider a derived index |

**Decision rule — introduce a dashboard-owned derived structure ONLY when all hold:** (i) real
conversations are large enough that scroll-up latency is user-visible **after** the §4 fixes, (ii) the
Agno `runs` contract has stayed stable for a meaningful period, (iii) product needs server-side search
across messages.

**If introduced, prefer the least-coupling option:**
- **Option A — message *index* (no content):** `app_conversation_messages_idx(session_id, run_idx,
  msg_idx, msg_id, created_at, sender)` — locates slices fast, stores **no message bodies** → does not
  violate "no transcript duplication" (ADR-0004). Bodies still come from `ai.*`. (Still needs a parse to
  fetch bodies, so this mainly helps ordering/search, not body retrieval.)
- **Option B — content cache:** copies message bodies for true pagination/search performance. This
  **duplicates the canonical transcript** → requires a **new ADR superseding ADR-0004**, plus explicit
  **ownership = cache (not source of truth)**, **TTL aligned to `raw_history_retention_days`**,
  **masking at read**, **rebuildable from `ai.*`**, and a backfill/refresh path in the sync job.

**Recommendation:** ship §6 paging on **parse-and-slice (no new table)** first; treat Option A/B as a
**production-scale** slice gated by the decision rule and (for B) a fresh ADR. Do not duplicate
transcripts lightly.

---

## 8. Summary of proposed slices (detail in `docs/phases/phase-1-post-acceptance-hardening.md`)

- **12B** cost/token support (splits, cost/day, averages, coverage warning) — read-only.
- **12C** filter loading UX (per-widget streaming + localized pending) — no DB writes.
- **12D** performance (query by `session_id` PK, SQL turn counts, date pre-filter, API split/cache) — no DB writes.
- **12E** WhatsApp-like transcript pagination (`limit`+`before` cursor, scroll anchor, new-msg pill) — no DB writes.
- **12F** real-time via polling (list/counters), SSE optional — no DB writes.
- **12G** (production-scale, conditional) analytics rollup table and/or message index — **dashboard-only** writes, needs ADR(s).
