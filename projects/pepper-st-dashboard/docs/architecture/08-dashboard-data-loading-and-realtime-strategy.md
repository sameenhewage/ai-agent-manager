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

> **V2 full-system docs (Gate V2-DOCS, 2026-06-16):** for the end-to-end data flow across
> **both** schemas (dashboard + the read-only `ai.*` the app depends on), the metric
> source-of-truth, and demo readiness, see [`docs/v2/`](../v2/00-system-overview.md) —
> especially [`02-relationships-and-data-flow.md`](../v2/02-relationships-and-data-flow.md)
> and [`04-metrics-and-analytics-source-of-truth.md`](../v2/04-metrics-and-analytics-source-of-truth.md).

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

This is **UX polish on top of a sound seam**. *(Update — Slice 12C-API / ADR-0013: the dynamic data path
was subsequently moved to internal `/api/*` routes consumed by client widgets; the URL is now kept in sync
via `history.replaceState` rather than driving a server navigation. **Initial paint remains
server-rendered.**)*

---

## 4. Dashboard / Analytics performance strategy

**Root causes (measured: ~0.5s list/transcript at only 4 sessions):**

1. **R1 — unindexed `agent_id` scan.** Every query filters `ai.agno_sessions WHERE agent_id=$1`; Agno
   indexes only `session_id` (PK), `created_at`, `session_type`. → sequential scan, unfixable in `ai.*`.
2. **R2 — full-`runs` parse for counts.** `readAnalyticsRows` ships the entire `runs` JSONB for **every**
   session and `parseTranscript`s each just to count turns/messages — on every request, with **no
   SQL-level date filter** (range is applied in memory afterwards), so narrowing the range saves nothing.

**Fix ladder (each a candidate slice).**

> **✅ Implemented in Slice 12D (2026-06-16, TD-069) — the three _Immediate_ rows below.** Both
> Dashboard/Analytics and the Chat Monitor list now read `agno_sessions` by
> **`session_id = ANY($mappedIds)`** (PK, scoped by the derived `agent_id`) instead of a
> `WHERE agent_id=$1` scan, and the date window is pushed into SQL via the indexed
> `app_conversations.last_at` (`(tenant_id,last_at desc)`). The **Chat Monitor list** computes
> turns **purely in SQL** (`jsonb_array_length(runs)`; no `runs` transferred or parsed).
> **Analytics** still parses the in-range `runs` in memory **because it also needs the
> de-duped, non-system `messages` count** — so turns ride along that single _required_ parse
> rather than a redundant SQL call — but it now parses **only the narrowed active/in-range
> universe**, never every session under the agent. The pure join/filter logic was extracted to
> `lib/analytics/universe.ts` (TDD: `universe.test.ts`, 9 tests). `db:analytics:verify` confirms
> **byte-for-byte** parity (conv 4 / turns 30 / messages 85 / tokens 648,405 / cost $0.065330944);
> perf probe: OLD `agent_id` seq-scan **5 rows** vs NEW PK **4 rows** (both seq-scan at this tiny
> size; the PK path wins as `ai.agno_sessions` grows). The **Post-deploy** (API split / `<Suspense>`
> streaming / TTL cache) and **Production-scale** rows remain **proposals** (12C/12G).

| Tier | Change | Why safe / effect |
|---|---|---|
| **Immediate** | Query `agno_sessions` by **`session_id = ANY($mappedIds)`** (PK-indexed) instead of `agent_id` scan; the dashboard already holds the mapped `session_id`s in `app_conversations` | avoids R1 entirely; ownership already established at sync; keeps `ai.*` read-only |
| **Immediate** | Compute turns in SQL via `jsonb_array_length(runs)` (as the chat list already does); only fetch `runs` when message-level counts are actually needed | removes most of R2's parse cost for the common KPI path |
| **Immediate** | Push the date window into the dashboard side: filter `app_conversations` by `last_at` (indexed `(tenant_id,last_at desc)`) **before** touching `ai.*` | smaller working set per range; smaller `ANY($ids)` |
| **Post-deploy ✅ (Slice 12C-API / ADR-0013, TD-073)** | Dynamic data moved to internal `GET /api/dashboard` + `GET /api/analytics` consumed by **client widgets** (native `fetch` + keep-previous-data reducer). A **grouped endpoint per surface** (not separate summary/timeseries) avoids double-parsing the aggregate; a server-side TTL/`revalidate` cache was **not** added (deferred). | snappier filters; keep-previous-data + retry; foundation for 12F polling |
| **Post-deploy** | Short server-side cache (e.g. 15–30s `revalidate` or in-memory TTL) for analytics aggregates | smooths repeated range toggles; still "live enough" for monitoring |
| **Production-scale** | Dashboard-owned **analytics rollup** table (per tenant/channel/day: conversations, turns, tokens, cost) refreshed by the sync job; or adopt `ai.agno_metrics` **iff** it becomes tenant/channel-scoped | O(days) reads instead of O(sessions·messages); introduce only when live-parse latency is user-visible **and** the contract is stable |

**Do not** build rollups yet: the source contract just stabilised and volume is tiny. Rollups are a
materialisation of already-correct live math — add them when scale demands, not before.

---

## 5. Real-time dashboard strategy

> **Product decision (2026-06-16, TD-081): realtime monitoring is MANDATORY, not optional.** Manual
> `npm run db:agno:sync` is **not acceptable during customer use** — the console must reflect live
> WhatsApp AI operations on its own. This **supersedes** the earlier "polling recommended; SSE
> optional; webhook deferred" stance. **Design only — implementation is the approval-gated Slice 12F
> and must start with failing tests (CONTEXT.md §7). No realtime code in this gate; no WebSocket
> without explicit approval.**

> **Realtime architecture decided + extended (2026-06-16).** The 12F transport/detector decision is
> **ADR-0014**: **the current 12F implementation uses an in-process polling detector; the Agno webhook is
> the future-preferred migration path; the browser transport remains SSE.** The realtime **scope** is
> then extended by **ADR-0015 / `architecture/09`** (multi-business model): events become **scope-aware**
> — `tenant_id`, `business_id`, `location_id` *(nullable)*, `channel_id`, `conversation_id` — and update
> the UI via **safe deltas/patches** (no whole-API refetch per message). A durable **`app_realtime_outbox`**
> table is the target backing for the in-memory bus (delivery/recovery). **Transport stays SSE; no
> WebSocket; no `LISTEN/NOTIFY` on `ai.*`; no Redis/queue.** §5 below is the original single-business
> design; the multi-business **scope** (tenant → business → optional location → channel → conversation)
> layers on top per ADR-0015 — it does **not** revert to the old `tenant → channel → conversation` model.
>
> **Contact-thread boundary (2026-06-17 — ADR-0016):** the realtime `conversation_id` is the **customer
> contact thread**, not a provider session. A new Agno/provider session for an existing contact is a
> **thread update, never a new row**; the browser patches the thread by `conversation_id`. The
> `external_contact_id`, `agno_session_id`/`external_session_id`, and `provider_session_id` stay
> **server-side only** — never in any payload.

**Boundary reminder:** the dashboard **monitors**; the AI platform owns message processing and replies.
So real-time here means *"freshly observed read state"*, never bi-directional control.

### 5.1 Goal (Slice 12F — Realtime Monitoring + Automatic Agno Sync)
- **No manual sync during normal use** — new Agno sessions/runs become visible **automatically**.
- The **browser receives live updates via SSE** (one-way, read-only stream).
- The **server keeps the mapping fresh automatically** — a change **detector** triggers the existing
  read-only `syncAllActiveChannels` (writes **only** `dashboard.app_conversations` metadata/index).
- The **coverage banner remains a safety net** ("Showing N of M… run sync"), **not** the normal state.

### 5.2 Realtime surfaces (must update without a manual reload)
- **Chat Monitor conversation list** (new/updated threads, turn counts, last-message preview).
- **Selected-chat transcript tail** (new messages at the bottom; see §6 paging).
- **Dashboard KPI counters.**
- **Analytics counters / charts.**
- **Coverage / mapped-session status** (the safety-net banner state).

### 5.3 Target event flow

```txt
Agno session/run changes
  → server detects change            (webhook if Agno provides it, else short-interval read-through poll)
  → sync dashboard.app_conversations metadata/index   (read-only ai.* → syncAllActiveChannels)
  → publish a SAFE event             (event type + internal conversation UUID = the CONTACT THREAD (ADR-0016); + business/location/channel SCOPE ids and safe deltas per ADR-0015)
  → browser receives the SSE event
  → client PATCHES the affected thread + safe UI state from the event delta (PREFERRED)
        — safe delta/patch only; do NOT refetch the whole dashboard/analytics/chat-monitor API per message
        — a targeted single-surface refetch is a FALLBACK only
          (/api/dashboard · /api/analytics · /api/chat-monitor/conversations · …/[id]/transcript)
```

### 5.4 Transport decision

| Transport | Role | Verdict |
|---|---|---|
| **SSE** (server→client) | browser live updates for a read-only dashboard | **Decided — ADR-0014** (mandatory transport for 12F; unchanged by ADR-0015) |
| **Backend polling / read-through sync** | server-side change **detector + freshness** | **Current detector — ADR-0014** (in-process polling); UX still realtime via SSE/refetch |
| **AI-platform webhook/event** | cleanest change detector | **Future-preferred — ADR-0014/0015** (swaps the detector without changing the SSE contract); not assumed |
| **WebSocket** | bi-directional | **Rejected** unless/until human-handover send/reply is approved (ADR-0009, Phase 2). **No WS without explicit approval.** |
| **DB `LISTEN/NOTIFY`** | needs the writer to emit notifies | **Rejected** unless Agno (the writer) emits notifications |

### 5.5 Safety rules (non-negotiable)
- `ai.*` stays **read-only**.
- `dashboard.app_conversations` **metadata/index** write allowed **only** for sync (no other writes).
- **No** transcript-body copy; **no** message table / `app_conversation_messages` (ADR-0004 + the
  boundary lock below).
- **No raw PII** in any SSE payload or API — no phone / `user_id` / `external_contact_id` / Agno
  `session_id` / `external_session_id` / `provider_session_id` / raw `runs` / `session_data`. The current
  12F event carries a **safe event type** + the **internal conversation UUID** (the **contact thread** —
  ADR-0016); under **ADR-0015** it additionally carries the **safe scope ids**
  (`business_id`/`location_id`/`channel_id`) and may carry **safe UI-ready deltas** (e.g. last-message
  preview/text — already shown in Chat Monitor, **not** raw identifiers). Raw ids remain forbidden.
- A **lock** prevents duplicate concurrent syncs; on sync **failure** the coverage warning stays and
  the UI does not crash.

### 5.6 TDD acceptance (future implementation must start RED)
1. an unmapped new Agno session becomes **mapped automatically**;
2. SSE **emits a safe update event**;
3. Dashboard/Analytics **refetch** after an event;
4. Chat Monitor **list updates**;
5. the **selected transcript tail updates**;
6. **no** raw phone / `user_id` / `external_contact_id` / Agno `session_id` in event or API;
7. a **lock** prevents duplicate concurrent syncs;
8. on sync **failure** the coverage warning stays and the UI does not crash.

> **Boundary lock (Slice 12D-B, 2026-06-16).** Whatever the transport — polling, SSE, or a future
> AI-platform **webhook/DB-trigger** sync — the dashboard only updates its **mapping/metadata/index**
> (`app_conversations` rows, `last_at`, `status`, identity reuse). It **never** copies
> `ai.agno_sessions.runs[].messages[]` into `dashboard.*`. The **canonical transcript stays in
> `ai.agno_sessions.runs`** (ADR-0004); there is **no** `app_conversation_messages` table, **no** message
> index, and **no** content cache. **Grain (ADR-0016):** `app_conversations` = the **customer/contact
> thread** (one row per contact); `app_conversation_sessions` = the **provider/Agno session links**
> (`external_session_id = ai.agno_sessions.session_id`, by value). **One contact thread may link many
> provider sessions**, and a **new provider session for an existing contact updates the same thread — not
> a new Chat Monitor row** (no `app_customer_identities` since 12D-D / ADR-0012). A message index/content
> cache would require a **new ADR superseding ADR-0004** (tracked as the conditional Slice 12G) and is
> explicitly **out of scope** here.

---

## 6. Chat Monitor — WhatsApp-like transcript pagination

> **✅ Implemented — Slice 12E (2026-06-16, TD-079).** The WhatsApp-like paginated transcript shipped:
> latest page on open + **scroll-up loads older pages** via an **opaque cursor**, auto-scroll to bottom,
> a "Load older messages" affordance, internal-pane scroll, masked, system/tool hidden. **Cursor used =
> base64url of a stable absolute message index** (oldest = 0) — chosen over the `(runIdx,msgIdx)`
> candidate below; it is opaque and de-dupes pages with no overlap. The **Chat Monitor UX validation
> fix** (customer-LEFT / assistant-RIGHT bubbles, full-width rows, consolidated WhatsApp/Read-only
> badges) is recorded in **TD-080**. The realtime *tail* (new messages without a manual reload) is the
> mandatory **Slice 12F** (§5). The design below is retained as the original proposal/rationale.

**Original behaviour (now fixed):** opening a conversation fetched the **entire** transcript
(`getConversationTranscript` parses all `runs`), rendered every bubble oldest→bottom in an internal
scroll pane — **no** scroll-to-bottom, **no** load-older-on-scroll-up, **no** cursor, **no**
new-message indicator (the "loads/holds everything" behaviour, now resolved by 12E).

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
- **12C** filter loading UX — **✅ DONE 2026-06-16 (TD-071)**: localized pending (keep previous data
  mounted + per-region `aria-busy` dim + spinner on the clicked range + polite "Updating…") on Dashboard
  + Analytics. **The deferred API split is now also ✅ DONE — Slice 12C-API (TD-073 / ADR-0013):** dynamic
  data flows through internal `GET /api/dashboard` + `GET /api/analytics` consumed by client widgets
  (keep-previous-data + localized pending + error/retry); initial paint stays SSR; URL synced via
  `history.replaceState`. Per-widget `<Suspense>` streaming + a server TTL cache remain deferred. No DB writes.
- **12D** performance (query by `session_id` PK; SQL `jsonb_array_length` turns on the list; `last_at`
  date pre-filter) — **✅ DONE 2026-06-16 (TD-069)**. The optional API split / `<Suspense>` streaming /
  TTL-cache part is **deferred** (overlaps 12C). No DB writes.
- **12E** WhatsApp-like transcript pagination (`limit`+`before` opaque cursor, scroll anchor, load-older) —
  **✅ DONE 2026-06-16 (TD-079)**; the **Chat Monitor UX validation fix** (customer-LEFT / assistant-RIGHT
  bubbles, full-width rows, consolidated WhatsApp/Read-only badges) is **TD-080**. No DB writes.
- **12F** **Realtime Monitoring + Automatic Agno Sync** — **mandatory SSE** browser updates + **automatic**
  server-side sync freshness (detector → read-only `syncAllActiveChannels`, metadata/index only); the
  coverage banner is a **safety net** only. **Redefined 2026-06-16 (TD-081)** — supersedes the old
  "polling; SSE optional". See §5 for surfaces, event flow, transport, safety, and TDD acceptance.
  **Dashboard-write = metadata/index only; no message copy.** Approval-gated; **not implemented**.
- **12G** (production-scale, conditional) analytics rollup table and/or message index — **dashboard-only** writes, needs ADR(s).
