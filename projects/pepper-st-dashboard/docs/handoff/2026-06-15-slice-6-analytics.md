## Slice Handoff — Slice 6: Basic Analytics (live, real metrics, tz-aware, retention-capped)

- **Date:** 2026-06-15
- **Owner (global agent):** `fullstack-builder-agent` (QA: `qa-review-agent`)
- **Status:** complete — Analytics live on real data; verified in-browser + read-only SQL cross-check.
- **Related:** Workflow 05 (analytics filter), ADR-0006 (retention), ADR-0007 (real data only),
  `docs/architecture/03-agno-mapping.md`.

## What shipped

The Phase 1 **Analytics** page: tenant-scoped, date-filtered, **real** metrics computed live from
`ai.agno_sessions` (READ-ONLY) over the tenant's mapped conversations, in the tenant timezone, with
the analytics-retention window applied. No fabricated KPIs.

## Skills followed

- **`tdd`** — `.claude/skills/tdd/SKILL.md` — pure layer written test-first, vertical slices
  (ranges → aggregate → clamp). *Proof:* `lib/analytics/ranges.test.ts` (15) + `aggregate.test.ts`
  (8) = **23 analytics tests; 99 total**, no DB.
- **`review`** — `.claude/skills/review/SKILL.md` — applied the two-axis (Standards / Spec) lens
  inline (no git fixed-point given). It surfaced one real gap — the finite retention clamp lived in
  the service untested — which was fixed by extracting the pure, unit-tested `clampToRetention`.
- **`handoff`** — `.claude/skills/handoff/SKILL.md` — this doc + decision log + phase/scope/workflow.
- **`diagnose`** — used briefly: a dev-only `.next` cache corruption ("Cannot find module './833.js'")
  after adding many files; root cause = stale webpack runtime, fixed by clearing `.next` + restart.
  Not a code defect (production `build` was clean throughout).

## Architecture decision (resolved by a read-only probe)

Before coding, a one-off **read-only** probe confirmed the real `session_data.session_metrics`
shape (keys: `input_tokens, output_tokens, total_tokens, reasoning_tokens, cache_read_tokens, cost,
details`): `total_tokens` present in 15/15 concierge sessions, `cost` in 13/15. This avoided guessing
field names (ADR-0007). The probe was deleted after use.

- **Universe = mapped `app_conversations` (tenant + `whatsapp-main`)** joined by value to
  `ai.agno_sessions` — tenant-safe and consistent with Chat Monitor (explains 13 mapped vs 15 raw).
- **Token/cost** are **per-session lifetime totals** attributed to each session's latest-activity
  day; finer per-message attribution needs rollups (future). Cost is reported with **coverage**
  (`N/M reported`) so missing values are honest, never a confident zero.

## Files created/changed

**Created (`base-dashboard-app/`):**
- `lib/analytics/ranges.ts` (+ `ranges.test.ts`) — tz-aware ranges, `parseRangeParams`, `clampToRetention`.
- `lib/analytics/aggregate.ts` (+ `aggregate.test.ts`) — pure real-metric aggregation + daily series.
- `lib/analytics/service.ts` — server data flow (mapped convs ⊕ `ai.agno_sessions` read-only).
- `components/analytics/analytics.tsx` — client UI (range switch + KPI cards + bar chart).
- `scripts/analytics-verify.ts` — read-only verification (live == independent SQL).

**Modified:**
- `app/(dashboard)/analytics/page.tsx` — server page (`force-dynamic`, `searchParams`) + error state.
- `package.json` — `db:analytics:verify` script.

## Metric definitions vs sources (real only — ADR-0007)

| Metric | Definition | Source |
|---|---|---|
| Conversations | mapped conversations whose `last_at` ∈ `[from,to)` | `app_conversations` |
| New contacts | of those, `first_at` ∈ range | `app_conversations` |
| Returning | conversations − new | derived |
| Turns | `Σ len(runs)` (via parser) | `ai.agno_sessions.runs` |
| Messages | non-system, de-duplicated count (parser) | derived from `runs` |
| Total tokens | `Σ session_metrics.total_tokens` (+ coverage) | `session_data` |
| Est. cost (USD) | `Σ session_metrics.cost` (+ coverage) | `session_data` |
| First/last activity | min/max activity | `app_conversations` |
| Daily series | conversations + tokens per tenant-local day | derived |

**Explicitly NOT computed** (no source): AI-resolved %, intent, sentiment, priority,
issues/exchanges/follow-ups. A unit test asserts the totals object exposes *only* the real keys.

## Range & timezone behavior

Ranges Today/3D/7D/14D/30D/This-month/Custom, computed as `[from, to)` in `app_tenants.timezone`
(PEPPER ST. = `Asia/Colombo`, GMT+5:30). Range selection is URL-driven (`?range=…[&from&to]`); the
client only pushes the URL and the **Server Component recomputes** (server-first). "Last month" was
deferred (documented in Workflow 05). _(The screenshot dev session may still be running locally.)_

## Retention (analytics cap) behavior

`clampToRetention` (ADR-0006): when `analytics_retention_days` is finite, the range's lower bound is
clamped to `now − N days` and the out-of-window portion is **flagged** (amber banner), never shown as
a misleading zero; **`NULL` = unlimited** (PEPPER ST.) → no clamp. The clamp is a pure, unit-tested
function (null / older-than-window / within-window cases).

## Boundary confirmations

- **`ai.agno_*` read-only & untouched** — service only `SELECT`s; zero writes anywhere.
- **No transcript duplication / no message storage** — runs parsed in memory for counts only.
- **No forbidden tables / no migrations** — Slice 6 adds no tables (still the 6 `dashboard.app_*`).
- **No fabricated KPIs**; **no per-contact ids** in the analytics payload (aggregate only → PII-free).
- **No new dependencies** — Zod (validation) and a chart lib (recharts) were **avoided**; pure-TS
  validation + a hand-rolled bar chart instead. (ADR-0001 lists Zod in the locked stack but it is not
  installed; adding it needs approval. Flagged for Slice 7 / future.)

## Tests / typecheck / build / verification (Node 20.20.2)

- `npm run typecheck` — ✅ clean
- `npm run test` — ✅ **99/99** (13 files; +23 analytics; no DB)
- `npm run build` — ✅ `/analytics` is `ƒ (Dynamic)`; build opened no DB connection
- **Browser (Chrome DevTools):** `/analytics` renders real KPIs (7D: 13 convs, 62 turns, 154 msgs,
  688,192 tokens [13/13], $0.0532 [11/13]); range switch to 30D works (server-first, URL `?range=30d`);
  daily bars render; no console errors (after clearing the stale `.next` dev cache).
- `npm run db:analytics:verify` (read-only) — ✅ ALL CHECKS PASSED: live totals **==** independent
  SQL (13 convs, 62 turns, 688,192 tokens, $0.053188); only-real-keys; unlimited tenant not clamped.

## QA review (two-axis)

- **Standards:** PASS. Read-only boundary, no deps, no migrations, server-first, TDD, naming/layout
  match siblings. Judgement calls: pure-TS validation vs Zod; hand-rolled chart vs recharts (both to
  honor "no deps").
- **Spec:** PASS with minor noted deferrals — "Last month" range deferred; cross-tenant isolation not
  independently tested (single demo tenant, same as Slice 5); no Playwright e2e (consistent prior
  decision). The finite-clamp gap found in review was fixed (now unit-tested).

## Risks / follow-ups

- Token/cost are whole-session totals attributed to the latest-activity day (documented in-UI);
  per-message/day attribution needs rollups (future ADR) — also what enables analytics history beyond
  the retention window for capped tenants.
- Cross-tenant isolation and a finite-retention live demo need a second seeded tenant (future).
- Consider installing Zod (locked stack) in Slice 7 to align validation with ADR-0001.

## Gate status

- **Gate 4** (per-slice QA + docs/handoff): satisfied for Slice 6. Slices 0–5 ✅; Gate 2 ✅.

## Next allowed step

**Slice 7 — Demo hardening**: PEPPER ST. branding polish; remove any Bloomwire leaks; loading/empty/
error states across pages; PII audit; (optionally) install Zod + add Playwright smokes. **Do not start
Slice 7 until directed.**
