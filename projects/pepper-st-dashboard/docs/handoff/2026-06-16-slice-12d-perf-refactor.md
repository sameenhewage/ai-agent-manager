## Slice Handoff — Slice 12D: Dashboard/Analytics Performance Read-Path Refactor

- **Date:** 2026-06-16
- **Owner (global agent):** `fullstack-builder-agent` (QA: `qa-review-agent`, Handoff: `handoff-agent`)
- **Type:** **Performance refactor of the read path — NOT new feature work.** No new data source, no
  migrations, no DB writes, no new tables, no new index on `ai.*`, no UI redesign, no Phase 2.
- **Status:** complete — Dashboard/Analytics and the Chat Monitor list now read `ai.agno_sessions` by
  `session_id` (PK) for the active/in-range universe instead of scanning by `agent_id`; the date window
  is pushed into SQL on the indexed `app_conversations.last_at`. Displayed numbers are unchanged.
- **Related:** Gate 12 analysis (`docs/architecture/08-…` §4 fix-ladder "Immediate" tier),
  `docs/phases/phase-1-post-acceptance-hardening.md` (Slice 12D), TD-069, ADR-0011 (v2 identity),
  ADR-0004/0007 (canonical transcript / real-data-only).

## Skills followed

- **`improve-codebase-architecture`** — extracted the universe construction into a pure, DB-free
  **seam** (`lib/analytics/universe.ts`) reused by the analytics service, instead of growing a second
  query path; the deletion test holds (helpers are small, named, independently testable).
- **`tdd`** — wrote `lib/analytics/universe.test.ts` (9 tests) **first**: active-filter, session-id
  collection, by-value indexing, PII-free analytics-input construction, honest zero/null on missing
  session, archived-cannot-leak — all DB-free.
- **`diagnose`** — used to isolate a browser-smoke 500 to a stale-dev-server `.next` vendor-chunk
  conflict (environment), not the refactor.
- **`review`** — two-axis (Standards + Spec) below.
- **`handoff`** — this doc.

## Root problem (from Gate 12)

1. **R1 — unindexed `agent_id` scan.** Every read filtered `ai.agno_sessions WHERE agent_id=$1`; Agno
   indexes only `session_id` (PK), `created_at`, `session_type` → **sequential scan**, unfixable in
   `ai.*` (we never write/alter `ai.*`).
2. **R2 — full-`runs` parse with no SQL date filter.** The analytics read shipped + parsed the entire
   `runs` JSONB for **every** session under the agent on **every** request, then applied the range in
   memory — so narrowing the range saved nothing.

## What changed (read-only, `ai.*` untouched)

- **Analytics (`lib/analytics/service.ts`):**
  - **SQL date pre-filter** — the universe is the tenant/channel's **active (non-archived)**
    `app_conversations` narrowed at the DB by `last_at ∈ [from, to)` using the indexed
    `(tenant_id, last_at desc)`. This is the **same** `[from, to)` bound the aggregate applied in memory
    and the same one `db:analytics:verify` checks → totals unchanged.
  - **PK fetch, not `agent_id` scan** — `readSessionMetricsByIds` selects only this universe's sessions
    via `WHERE session_id = ANY($1::text[]) AND agent_id = $2` (PK lookup; `agent_id` retained only as a
    defensive scope filter for mapping parity).
  - Analytics **still parses `runs` in memory** (`toAnalyticsInput` → `parseTranscript`) **because it
    also needs the de-duped, non-system `messages` count** — turns ride along that single required parse
    rather than a redundant SQL `jsonb_array_length`. The parse now runs over the **narrowed in-range
    universe** only, not every agent session.
- **Chat Monitor list (`lib/chat-monitor/service.ts`):** turn counts already came from SQL
  `jsonb_array_length(runs)`; the fetch is now **by `session_id` (PK)** for the active universe (still no
  `runs` bodies transferred, still no parse on the list path).
- **New pure seam (`lib/analytics/universe.ts`):** `isActiveConversation`, `collectSessionIds`,
  `indexSessionsById`, `toAnalyticsInput`, `buildAnalyticsInputs` — encode "active universe joined
  by-value to PK-fetched session rows; archived can never leak; missing session → honest zero/null;
  no contact PII in analytics inputs."
- **Verifier (`scripts/analytics-verify.ts`):** added a **read-only** perf probe (informational; does
  not affect pass/fail) — `getAnalyticsData` timing, universe size, and OLD `agent_id` vs NEW
  `session_id = ANY` timing + `EXPLAIN` top plan.

## Metrics parity (unchanged numbers)

Same real sources as before (no new/changed KPIs): turns = `jsonb_array_length(runs)` /
parsed-turn-count; messages = de-duped non-system parsed messages; tokens/cost =
`session_data.session_metrics.{total_tokens,cost}`; new/returning by first-seen-in-range. No fabricated
KPIs (ADR-0007 guard intact).

## Tests / typecheck / build (Node 22.22.2)

- `npm run typecheck` — ✅ clean (`tsc --noEmit`).
- `npx vitest run` — ✅ **123/123** (15 files; **+9** new `lib/analytics/universe.test.ts`; all prior green).
- `npm run build` — ✅ `/` + `/analytics` `ƒ Dynamic`, `/chat-monitor` `○ Static`, API routes `ƒ Dynamic`
  (hybrid split intact).

## DB verification (read-only, same session)

- `db:agno:reconfirm` — no writes; derived `agent_id` ordering tenant-first confirmed; live sessions 5.
- `db:agno:verify` — **ALL PASS** (live 5 / mapped 4 / archived 13 / **active orphans 0**; 6 dashboard
  tables; no forbidden/leaked tables).
- `db:chat:verify` — **ALL PASS** (retention Unlimited; 4 in window; LIST 552ms no-parse; masked
  `94•••••784/398/273/768`; non-empty 4/4; no system/tool; IDOR-safe; no raw-id leaks).
- `db:analytics:verify` — **ALL PASS**, totals **== independent SQL byte-for-byte**: conv **4**, new 4,
  returning 0, turns **30**, messages **85**, tokens **648,405** [4/4], cost **$0.065330944** [4/4].
  **Perf probe:** `getAnalyticsData` 804ms; OLD `WHERE agent_id` 1400ms/**5 rows** vs NEW
  `session_id = ANY` 1366ms/**4 rows** — both seq-scan at this tiny size; the PK path wins as
  `ai.agno_sessions` grows (no `agent_id` index). Absolute ms are network-RTT-bound (remote DB).

## Browser verification (Chrome DevTools, clean prod build :3100)

- **Dashboard** — real values matching the verifier (Conversations 4, Messages 85, Turns 30 / 7.5 avg,
  Total tokens 648,405 [4/4], Est. cost $0.0653 [4/4], Last activity Jun 16 10:25 Asia/Colombo); 4 masked
  recent rows (turns 7/12/3/8 = 30); honest "Not tracked in Phase 1" panel; range toolbar round-trips
  (`?range=today`, button `pressed`, server recompute). No raw phone / no session token leaked.
- **Analytics** — full KPI set + two real charts, "OVERVIEW · LAST 30 DAYS", real-data-only; numbers
  match Dashboard + verifier; **no console errors**.
- **Chat Monitor** — list of 4 masked conversations with correct turn counts; auto-loaded transcript
  (CUSTOMER/AI AGENT, no system/tool, masked); transcript API 200 using **internal dashboard UUIDs**
  (not the Agno token/phone); clicking a second conversation fetches its transcript (200). **No console
  errors** (only a home-page favicon 404).

## Boundary confirmations

- **No DB writes / no migrations / no new tables / no new `ai.*` index** — both services `SELECT` only.
- **`ai.agno_*` read-only / untouched** — no INSERT/UPDATE/DELETE; transcripts not persisted.
- **No displayed-number change** — exact parity proven by `db:analytics:verify` + browser cross-check.
- **No fabricated metrics** — `FORBIDDEN_METRIC_KEYS` guard + test intact; honest not-tracked panel.
- **PII-safe** — analytics inputs carry no contact ids by construction; list/transcript stay masked; no
  raw `session_id`/phone in payloads or transcript-API URLs (internal UUIDs only).
- **Tenant/channel-scoped + IDOR-safe** — `agent_id` retained as a defensive scope filter; unknown/
  malformed ids return null.

## Review (two-axis)

- **Standards: PASS** — server-side DB only (client bundle has no `pg`); read-only `ai.*`; pure, tested
  seam reused by the service; imports at top; no new deps; no comment churn.
- **Spec: PASS** — removed the `agent_id` scan (PK lookup) and pushed the date filter into SQL on
  `last_at`; list turns in SQL; analytics parse confined to the in-range universe and justified by the
  required `messages` count; exact parity; UI/markup unchanged; tenant-safe; build/tests/verifiers/
  browser green.

## Risks / follow-ups

- **Analytics still parses `runs`** for the in-range universe (needed for `messages`). At large scale
  this is the next bottleneck → Slice **12G** rollups (per tenant/channel/day) or a content-free message
  index, both **dashboard-only writes behind an ADR** (do **not** add until live-parse latency is
  user-visible and the Agno contract has stayed stable).
- **Optional API split / `<Suspense>` streaming / TTL-cache** (the "Post-deploy" rows) were **not** done
  in 12D — they overlap Slice **12C**; deferred.
- **One live session is currently unmapped** (live 5 / mapped 4): a new session arrived since the last
  sync. It is **not** an orphan; it will map on the next **approved** `db:agno:sync`. The refactor
  correctly counts only the 4 mapped active conversations (same universe as before).
- **Env note (process, not code):** browser smoke initially 500'd because a **stale dev server** from a
  prior session shared the project's `.next` build dir with `next start`, corrupting vendor chunks
  (`Cannot find module './vendor-chunks/tailwind-merge.js'`). Fixed by stopping both Next processes,
  `rm -rf .next`, a clean `next build`, then a single `next start`. **The `:3000` dev server was stopped;
  run `npm run dev` to restore it.** A `:3100` prod server (`next start`) may still be running.
- A stale TS-language-server diagnostic ("Cannot find module './universe'") may show in the IDE on
  `universe.test.ts`; `tsc --noEmit` resolves it cleanly (123/123 tests pass). Reload the TS server to clear.

## Gate status

- **Gate 4** (per-slice QA + docs/handoff): satisfied for Slice 12D. Read path is faster and structurally
  ready to scale (PK + indexed pre-filter) with **zero** change to displayed data or boundaries.

## Next recommended step

Pick the next approval-gated hardening slice — recommended order **12B** (cost/token depth, read-only) or
**12C** (filter UX / per-widget streaming, which also delivers 12D's deferred API split). **12G**
(rollups/index) only when scale demands and with a fresh ADR. **Do not** start any slice without explicit
per-slice approval.
