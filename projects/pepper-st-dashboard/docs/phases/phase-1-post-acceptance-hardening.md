# Phase 1 — Post-Acceptance Hardening (Gate 12 roadmap)

- **Project:** pepper-st-dashboard
- **Date:** 2026-06-16
- **Status:** **Planning only — approved nothing yet.** Slice 11B restored live data; Gate 12 analysed
  DB + product behaviour (`docs/database/07-…`, `docs/architecture/08-…`, `docs/product/05-…`). This doc
  breaks the findings into independently-approvable slices. **Implementation starts only after explicit
  per-slice approval.**

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

## Slice 12C — Filter / loading UX
- **Goal:** keep previous data visible with a clear localized "updating…" state; stream widgets
  independently so cheap sections (recent list) don't wait on heavy ones (analytics).
- **Allowed:** `<Suspense>` per section; inline `aria-busy`/spinner; keep `useTransition` + URL-as-state;
  custom-range inline validation.
- **Forbidden:** changing the URL-as-state model; client-side DB access; fake placeholder numbers.
- **DB writes:** none. **Migration:** none.
- **Risk:** 🟡 low — UI only; avoid hydration drift (keep deterministic formatting).
- **Verification:** Playwright: range click keeps old data + shows pending; widgets resolve
  independently; no document scroll regression.

## Slice 12D — Dashboard/Analytics performance (read-path)
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
