# Phase 1 — Post-Acceptance Hardening (Gate 12 roadmap)

- **Project:** pepper-st-dashboard
- **Date:** 2026-06-16
- **Status:** **Slice 12D EXECUTED (2026-06-16, TD-069); 12D-B boundary locked (TD-070); 12C EXECUTED
  (2026-06-16, TD-071 — filter/loading UX polish, UI-only); 12D-D EXECUTED (2026-06-16, TD-072 / ADR-0012 —
  dashboard v2 schema simplification, DROP migration APPLIED to the live DB); 12A/12B/12E/12F/12G remain
  planning.** Slice
  11B restored live data; Gate 12 analysed DB + product behaviour (`docs/database/07-…`,
  `docs/architecture/08-…`, `docs/product/05-…`). This doc breaks the findings into
  independently-approvable slices. **Each remaining slice starts only after explicit per-slice approval.**

> **Global guardrails for every slice below:** monitor/read only — **no WhatsApp/AI send-reply logic**;
> **no fabricated metrics**; `ai.*` stays **read-only**; transcripts stay **canonical upstream** (no
> duplication unless a slice explicitly carries a new ADR); follow TDD + the standard report
> (files/tests/risks). Each slice is a thin vertical slice and must keep `typecheck` + tests green.

---

## Sequencing & dependencies

```
12A (docs/status)  ──▶ independent, do first
12D (performance)  ──▶ unblocks/precedes 12C, 12E, 12F (cheaper reads first)
12B (cost/token)   ──▶ independent (read-only widgets)
12C (filter UX)    ──▶ benefits from 12D
12E (chat paging)  ──▶ benefits from 12D
12F (real-time)    ──▶ after 12D + 12E (cheap reads + paged tail)
12G (rollups/index)──▶ conditional, last (only if scale demands; needs ADR)
```

Recommended order: **12A → 12D → 12B → 12C → 12E → 12F → (12G if/when needed).**

---

## Slice 12A — Docs & status cleanup after Slice 11B
- **Goal:** make the docs reflect the post-11B live reality (this gate's deliverable).
- **Allowed:** edit docs only (`CONTEXT.md`, decision log, deploy-readiness, contracts 02/03, this set).
- **Forbidden:** any code or DB change.
- **DB writes:** none. **Migration:** none.
- **Risk:** 🟢 negligible.
- **Verification:** doc review; links resolve; counts match the latest verifier output.

## Slice 12B — Cost / token / metric support
- **Goal:** surface the **real** extra metrics — input/output/reasoning/cache token splits, a cost/day
  chart, avg cost/conversation + avg tokens/turn, and an explicit "cost missing for N sessions" warning.
- **Allowed:** read additional `session_data.session_metrics.*` fields; extend
  `lib/analytics/aggregate.ts` + presenters + Analytics/Dashboard widgets; decimal-safe cost summation.
- **Forbidden:** per-model/provider parse (defer), per-contact cost (PII-gated, defer), any invented KPI.
- **DB writes:** none. **Migration:** none.
- **Risk:** 🟡 low — purely additive reads; watch float/penny precision on cost.
- **Verification:** unit tests on aggregate (splits, averages, coverage); `db:analytics:verify` still
  matches independent SQL; browser smoke shows coverage + warning honestly.

## Slice 12C — Filter / loading UX — ✅ DONE (2026-06-16, TD-071)
- **Goal:** keep previous data visible with a clear localized "updating…" state; stream widgets
  independently so cheap sections (recent list) don't wait on heavy ones (analytics).
- **Allowed:** `<Suspense>` per section; inline `aria-busy`/spinner; keep `useTransition` + URL-as-state;
  custom-range inline validation.
- **Forbidden:** changing the URL-as-state model; client-side DB access; fake placeholder numbers.
- **DB writes:** none. **Migration:** none.
- **Risk:** 🟡 low — UI only; avoid hydration drift (keep deterministic formatting).
- **Verification:** Playwright: range click keeps old data + shows pending; widgets resolve
  independently; no document scroll regression.
- **Outcome (delivered):** the **localized-pending** half of the goal shipped (UI-only, no DB writes,
  `ai.*` untouched, no new metrics, no toolbar redesign, URL-as-state unchanged). Range/filter clicks now
  give **immediate, accessible** feedback: previous KPI/chart/recent data stays mounted while the server
  recomputes, each region dims with `aria-busy`, the clicked range button shows a spinner, all buttons
  soft-disable, and a polite `role="status"` "Updating…" badge announces the change. Built on a pure
  `lib/dashboard/range-toolbar.ts` state helper (`range-toolbar.test.ts`, 9 tests) + reusable
  `Spinner`/`PendingSection`/shared `RangeToolbar`; applied to **both** Dashboard and Analytics (Analytics
  keeps its panel-bar toolbar + custom range; only the loading language was unified — see TD-071 for the
  consistency-vs-no-redesign call). **Deferred (unchanged):** independent per-widget `<Suspense>`
  streaming + the API split (recent list resolving before heavy analytics) — overlaps 12D's deferred API
  split; **not** done here. `typecheck` clean; **135/135** tests; `next build` green; all 4 read-only
  verifiers + reconfirm PASS (parity exact conv 4 / turns 30 / messages 85 / tokens 648,405 / cost
  $0.065330944); browser smoke green (Dashboard 3 + Analytics 2 `aria-busy` regions, custom range applies,
  Chat Monitor masked / no id leaks / no console errors). Handoff:
  `docs/handoff/2026-06-16-slice-12c-dashboard-analytics-loading-ux.md`.

## Slice 12C-API — API-driven Dashboard/Analytics data loading — ✅ DONE (2026-06-16, TD-073 / ADR-0013)
- **Goal:** complete the **deferred** half of Slice 12C — move dynamic Dashboard/Analytics data to internal
  `/api/*` routes + client fetch so filter changes keep previous data, show localized pending, and gain
  user-safe error/retry (a foundation for 12F polling). **Product-approved override** of the earlier
  "defer the client-fetch shift to a later ADR" call (ADR-0013).
- **Allowed (carried ADR-0013):** `GET /api/dashboard` + `GET /api/analytics` (thin HTTP boundary →
  existing services); client `fetch` + a pure reducer; keep-previous-data/pending/retry; URL sync via
  `history.replaceState`; custom-range client guard.
- **Forbidden:** SQL/business logic in route handlers; client-supplied tenant/channel; raw PII in DTOs;
  any schema/DB/`ai.*` write; realtime/SSE/WebSocket/polling; chat pagination; cost/token expansion;
  fabricated metrics; visual redesign.
- **DB writes:** none. **Migration:** none.
- **Risk:** 🟡 low–medium — new HTTP surface; mitigated by DI-tested endpoint cores, a DTO whitelist,
  server-side validation (400s), and a full verifier + browser-smoke re-check.
- **Verification:** `typecheck`; **159/159** tests (21 new); `build`; all 4 verifiers + reconfirm PASS
  (parity exact: conv 4 / turns 44 / tokens 1,010,101 / cost $0.097590316); browser smoke — range click
  fires the API, URL syncs, prev data stays, `400` on bad/incomplete-custom range, injected tenant/channel
  ignored, no PII leaks, no console errors.
- **Outcome (delivered):** dynamic data flows through `/api/dashboard` + `/api/analytics`; initial paint
  stays SSR (real-data-first, deep-link); client widgets keep previous data + localized pending + retry.
  New: `lib/api/query.ts`, `lib/dashboard/async-data.ts`, `lib/api/endpoints.ts` (+ tests),
  `app/api/{dashboard,analytics}/route.ts`, `components/shell/use-range-data.ts` + `refresh-error.tsx`.
  Handoff: `docs/handoff/2026-06-16-slice-12c-api-driven-filter-loading-ux.md`.

## Slice 12D — Dashboard/Analytics performance (read-path) — ✅ DONE (2026-06-16, TD-069)
- **Goal:** remove the unindexed-`agent_id` scan and the per-request full-`runs` parse.
- **Allowed (read-only, `ai.*` untouched):** query `agno_sessions` by **`session_id = ANY($mappedIds)`**
  (PK) using the mapped `app_conversations`; compute turns via SQL `jsonb_array_length(runs)`; pre-filter
  conversations by `last_at` (indexed) for the range; optionally split summary/timeseries/recent API
  routes + short `revalidate`/TTL cache.
- **Forbidden:** writing to `ai.*`; adding indexes to `ai.*`; rollup tables (that's 12G); changing
  displayed numbers.
- **DB writes:** none. **Migration:** none.
- **Risk:** 🟠 medium — must preserve exact totals + retention/tenant scoping (regression risk).
- **Verification:** `db:analytics:verify` byte-for-byte parity before/after; latency measured (expect
  big drop from the ~0.5s baseline); unit tests for the new query shape; IDOR still safe.
- **Outcome (delivered):** read by `session_id = ANY($ids)` (PK, scoped by derived `agent_id`) +
  SQL `last_at` pre-filter on `app_conversations`; Chat list turns via SQL `jsonb_array_length` (no
  parse). Analytics keeps the in-memory parse **only** because it also needs the de-duped non-system
  `messages` count, but now over the narrowed in-range universe. Pure helpers `lib/analytics/universe.ts`
  + `universe.test.ts` (9 tests, TDD). All 3 hardened verifiers + reconfirm PASS; parity exact (conv 4 /
  turns 30 / messages 85 / tokens 648,405 / cost $0.065330944); perf probe OLD 5 rows vs NEW 4 rows (PK
  wins at scale). `typecheck` clean; **123/123** tests; `next build` green; browser smoke green. The
  **optional** API split / TTL-cache was **not** done (deferred; overlaps 12C). No DB writes; `ai.*`
  untouched; no displayed-number change; no new fabricated metrics. Handoff:
  `docs/handoff/2026-06-16-slice-12d-perf-refactor.md`.

## Slice 12D-D — Dashboard v2 schema simplification — ✅ DONE (2026-06-16, TD-072 / ADR-0012)
- **Goal:** remove the duplicate, **unused** customer/identity model so the dashboard stores only what it
  owns (the AI platform owns the contact registry).
- **Allowed (this slice carries ADR-0012 + an approved migration):** drop `app_customers`,
  `app_customer_identities`, and `app_conversations.customer_id`/`customer_identity_id`; keep
  `external_contact_id` by value; simplify sync; update tests/verifiers/docs.
- **Forbidden:** any `ai.*` change; transcript duplication; new customer/profile tables; re-adding the
  model; changing displayed numbers or masking.
- **DB writes:** the **approved DROP migration only** (`drizzle/0001_clumsy_rawhide_kid.sql`).
  **Migration:** yes (DDL-only; no `INSERT`; no `ai.*`).
- **Risk:** 🟠 medium (destructive on a **live shared** DB) — mitigated by full backup + explicit approval
  gate + `ai.*`-untouched + full verifier/browser re-check + idempotent (`IF EXISTS`) drops.
- **Verification:** migration applied; live DB confirmed **4 tables** + the 2 columns dropped +
  `external_contact_id` preserved; `db:agno:reconfirm` (read-only) + `db:agno:verify` + `db:chat:verify` +
  `db:analytics:verify` all PASS; `typecheck` clean, **138/138** tests, `build` green; browser smoke green
  (Dashboard/Analytics/Chat Monitor render, masked, **no raw phone/session** in HTML or API).
- **Outcome (delivered):** dashboard = 4 tables; contact lives only on
  `app_conversations.external_contact_id`; sync does **one upsert per Agno session** (no find-or-create, no
  `customersCreated`/`identitiesCreated`). Parity exact (conv 4 / turns 38 / messages 110 / tokens 828,005
  / cost $0.077716308). Backup `backups/2026-06-16-dashboard-pre-12dd.sql`. Handoff:
  `docs/handoff/2026-06-16-slice-12d-d-schema-simplification.md`; DB review:
  `docs/database/08-dashboard-v2-schema-simplification.md`.

## Slice 12D-B — Agno transcript boundary review/lock — ✅ DONE (2026-06-16, TD-070)
- **Goal:** after an AI-platform clarification (Agno owns the transcript; a returning customer gets a
  **new** `session_id`), confirm + **lock** the boundary: messages live only in `ai.agno_sessions.runs`;
  `dashboard.*` is index/metadata only; one session → one conversation; one contact → many conversations.
- **Type:** read-only review (no feature work).
- **Allowed:** read code/docs; run read-only verifiers; update docs; add lock-tests; minimal fix only if a
  real boundary bug is found.
- **Forbidden:** migrations; new tables; `app_conversation_messages`; message index/content cache; copying
  `runs[].messages[]` into `dashboard.*`; any `ai.*`/`dashboard.*` write; seed/sync/archive; webhook impl;
  realtime/SSE/WebSocket; filter/loading UX; cost/token expansion; chat pagination; visual redesign.
- **DB writes:** none. **Migration:** none.
- **Risk:** 🟢 negligible (audit + test/doc clarification).
- **Outcome (delivered):** **all 12 goals PASS — no boundary bug.** No production code changed. Added **3**
  DB-free grain lock-tests to `lib/db/schema.test.ts` (unique `(tenant,channel,agno_session_id)`;
  `external_contact_id` NOT unique; no transcript/message-content column) → **126/126**. `typecheck` clean;
  `db:agno:reconfirm`/`verify` + `db:chat:verify` + `db:analytics:verify` all PASS (1 identity : N
  conversations; parity exact; masked, no raw id leaks, IDOR-safe). `build` not run (no shipped code
  changed). Docs locked: ADR-0003 (v2 note), `docs/architecture/08` §5 (webhook=metadata-only),
  `docs/database/03`, decision log (TD-070), CONTEXT, handoff
  `docs/handoff/2026-06-16-slice-12d-b-agno-transcript-boundary-review.md`.

## Slice 12E — Chat Monitor WhatsApp-like transcript pagination
- **Goal:** newest-at-bottom, auto-scroll on open, **scroll-up loads older** pages with a stable scroll
  anchor and a "new messages ↓" pill.
- **Allowed:** add `?limit=N&before=<runIdx,msgIdx>` to the transcript API (server flattens once, slices
  page); client paging state + scroll-anchor + near-bottom autoscroll; keep masking + hide system/tool.
- **Forbidden:** transcript duplication / new tables (that's 12G Option B); exposing raw ids; document
  scroll.
- **DB writes:** none. **Migration:** none.
- **Risk:** 🟠 medium — scroll-anchor correctness; cursor stability on ties (use `(runIdx,msgIdx)`).
- **Verification:** `db:chat:verify` still PASS (masking/IDOR/no-leak/non-empty); Playwright for
  scroll-up paging + anchor + new-message pill; large-conversation fixture test on the slice helper.

## Slice 12F — Real-time monitoring (polling; SSE optional)
- **Goal:** auto-refresh the conversation list + counters (and optionally tail the open transcript)
  without manual reload; show "Live • updated HH:MM".
- **Allowed:** client polling on a sensible cadence (list ~10–15s, counters ~30–60s), pause on hidden
  tab, keep previous data while refreshing; **optional** SSE endpoint for the transcript tail.
- **Forbidden:** WebSocket; DB `LISTEN/NOTIFY`; any outbound/control action; dependence on an
  AI-platform webhook that doesn't exist yet.
- **DB writes:** none. **Migration:** none.
- **Risk:** 🟡 low–medium — connection/load hygiene (interval cleanup, backoff on error).
- **Verification:** Playwright: list updates on poll; hidden-tab pause; counters refresh; no duplicate
  fetch storms; read-only confirmed.

## Slice 12G — (Conditional, production-scale) rollups / message index
- **Goal:** O(days) analytics and/or fast message paging once live-parse latency is user-visible **after
  12D**, and the Agno contract has proven stable.
- **Allowed (dashboard-only writes, behind sync):** an analytics **rollup** table (per
  tenant/channel/day: conversations/turns/tokens/cost) refreshed by the sync job; and/or a message
  **index without content** (`session_id, run_idx, msg_idx, msg_id, created_at, sender`).
- **Forbidden:** copying transcript **content** unless a new ADR supersedes ADR-0004 with explicit
  ownership=cache, TTL=`raw_history_retention_days`, masking-at-read, rebuild-from-`ai.*`; any write to
  `ai.*`.
- **DB writes:** **yes (dashboard-only)**. **Migration:** **yes** (new dashboard table[s]).
- **Risk:** 🟠 medium–high — new write path + materialisation correctness + drift vs live.
- **Verification:** new ADR(s) accepted first; rollup totals reconciled against live-parse
  (`db:analytics:verify`-style); backfill idempotent; hardened verifier extended.

---

## Entry criteria before any slice
- This gate's docs are accepted (12A).
- Per-slice product approval is explicit.
- A failing test exists first (TDD), and the relevant read-only verifier(s) are green at baseline.

## Out of scope for the whole roadmap
WhatsApp/AI reply sending, fabricated KPIs, schema changes to `ai.*`, per-contact PII surfacing,
handover/approvals/knowledge features (parked, ADR-0007/0008/0009).
