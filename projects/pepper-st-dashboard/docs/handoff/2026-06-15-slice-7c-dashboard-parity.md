## Slice Handoff — Slice 7C: Dashboard + Analytics Visual/Product Parity

- **Date:** 2026-06-15
- **Owner (global agent):** `fullstack-builder-agent` (QA: `qa-review-agent`, Handoff: `handoff-agent`)
- **Type:** **Dashboard/Analytics visual-product correction — NOT new feature work.** No new
  data source, no migrations, no DB writes, no new tables, no Phase 2.
- **Status:** complete — the Dashboard is now a dense, real-data SaaS operations console; Analytics
  has a matching two-chart report row.
- **Related:** Slice 7B handoff (`2026-06-15-slice-7b-ui-workspace.md`), ADR-0007 (real-data-only),
  `docs/product/03-feature-scope.md` ("Dashboard summary — headline real metrics + recent
  conversations" is explicitly in-scope/derived).

## Skills followed

- **`improve-codebase-architecture`** — reused the existing **deep** Analytics aggregate
  (`getAnalyticsData`) and Chat Monitor list (`getConversationList`) as the Dashboard's data
  spine instead of adding a parallel query path; the only new logic is a thin **pure presenter**.
- **`tdd`** — wrote `lib/dashboard/presenter.test.ts` first (7 tests): only real keys, a
  forbidden-fake-metric guard, correct derivation — all DB-free.
- **`review`** — two-axis (Standards + Spec) below.
- **`handoff`** — this doc.
- **`diagnose`** — not needed (no failures).

## Demo/reference inspected (no memory)

Found at repo root: **`demo_site/bloomwire ai chat designs/`** (plain HTML/CSS/JS). Inspected:
`index.html` (shell + `.phead` + range `.seg`), `views.js` (`VIEWS.dashboard`: `.phead` greeting +
range segment → dense `.grid.kpis` of 12 KPI cards → `.gd2`/`.gd3` chart+panel rows → priority queue
/ feed / workload), `ui.js` (`UI.areaChart` gradient-area grammar, `bars`, `donut`), `styles.css`
(`.kpis` 6-col, `.kpi` icon-chip card, `.gd2 1.35fr/1fr`, `.card .ch/.ct/.cb`, `.seg`), `README.md`.
The demo's headline KPIs (AI-resolved, needs-staff, escalations, intent donut, exchange trend, staff
workload, etc.) are **dummy** — its **grammar** is reused, its **numbers are not** (ADR-0007).

## Exact problem found

The Slice 7B Dashboard was a **centered "link hub"** — a greeting, two big nav cards (Chat Monitor /
Analytics, already in the sidebar), three capability blurbs, and a tracked/not-tracked strip, all
vertically centered with whitespace. It rendered **zero metrics** and ran **no query** (it was `○
Static`). Against the demo's dense operational grammar it did not read as a dashboard at all. Yet the
real metrics already existed (Analytics aggregate) and were simply not surfaced on the landing page.

## Dashboard correction (rebuild)

A dense, server-rendered operations overview (`/` is now `ƒ Dynamic`, `force-dynamic`) that reads the
**same real Analytics aggregate** + the **masked Chat Monitor list**, composed in the demo's grammar:

- **`.phead`** — title "AI Chat Operations" + subtext (channel · range · timezone · read-only) +
  **Real-data-only** badge + a **range toolbar** segmented control (`Today/3D/7D/14D/30D/Month`)
  that only sets `?range=` (server recomputes everything; timezone-aware, retention-clamped).
- **Dense KPI grid** (8 cards, 4-up) with demo-style top-right icon chips (rose = business view,
  violet = AI-produced): Conversations, New contacts, Returning, Messages, Turns (+avg/chat), Total
  tokens (+coverage), Est. cost (+coverage), Last activity.
- **Two real charts** (`.gd2`): "Conversations over time" + "Tokens per day" (shared `AreaChart`,
  gradient-area like the demo), each with peak/total + coverage captions.
- **Recent conversations** panel (masked, top 6 by last activity, turn count, time) → links to Chat
  Monitor ("View all"); **Coverage & window** panel (channel, timezone, analytics window, token/cost
  coverage, first/last activity).
- **One honest "Not tracked in Phase 1" panel** — chips for Intent, Sentiment, AI-resolution rate,
  Priority, Orders, Exchanges, Customer issues, Follow-ups, Staff tasks, Revenue, CSAT — named, never
  faked (ADR-0007 says hide parked metrics; a single honest note ≠ a grid of empty placeholder cards).
- **Navigation is secondary** now (inline "View all" / "Full report" links), not the page content.
- Added a route-level `loading.tsx` skeleton (the page is dynamic now) so navigation never flashes.

## Analytics correction (parity polish)

- Replaced the lone CSS bar chart with the shared **`AreaChart`** and added a second real chart so
  Analytics now has the demo's **two-chart report row**: **Conversations per day** + **Tokens per
  day** (`series.tokens` is real), each with peak/total + coverage captions.
- Kept all existing real logic (range toolbar incl. **Custom** dates, `OVERVIEW · <range>` label,
  8 KPI cards, retention clamp banner, timezone-awareness). Updated `analytics/loading.tsx` to the
  two-chart skeleton.

## Metrics used + real source

| KPI / element | Source (all real, already computed) |
|---|---|
| Conversations | `AnalyticsTotals.conversations` (mapped `app_conversations` in range) |
| New / Returning contacts | `newContacts` / `returningContacts` (first-seen in range) |
| Messages | `messages` (non-system, de-duped; parser) |
| Turns + avg/chat | `turns` (`jsonb_array_length(runs)`), `turns/conversations` |
| Total tokens + coverage | `totalTokens` / `tokenCoverage` (`session_metrics.total_tokens`) |
| Est. cost + coverage | `cost` / `costCoverage` (`session_metrics.cost`) |
| Last / First activity | `lastActivityAt` / `firstActivityAt` |
| Conversations-over-time, Tokens-per-day | `series[].conversations`, `series[].tokens` (per local day) |
| Recent conversations | `getConversationList` → masked contact, turn count, `lastAt` |
| Coverage & window | channel label, tenant timezone, `retentionLabel`, coverage counts |

## Metrics intentionally NOT used (would be fabricated — ADR-0007)

AI-resolution rate, AI-resolved vs needs-staff, escalations, intent breakdown/top intents, sentiment,
confidence, priority, lead conversion, revenue/sales, satisfaction/CSAT/NPS, orders, exchanges,
customer issues, follow-ups, staff tasks/workload, human-handover metrics. These have **no source**
in `ai.agno_sessions` (`metadata`/`summary` are NULL). They are named in the honest panel and guarded
in code by `FORBIDDEN_METRIC_KEYS` + a unit test.

## Visual parity notes

- **Matches the demo grammar:** `.phead` greeting + range segmented control; dense KPI-card grid with
  top-right icon chips and rose/violet AI-vs-business accents; `.gd2` chart row using the same
  gradient-area chart; card `header (title + badge) / body` structure; recent-activity + meta panels;
  full-page app viewport (no document scroll; content scrolls in `main`).
- **Intentionally differs (Phase 1 read-only/real-data-only):** ~8 real KPIs instead of the demo's 12
  fabricated ones; no donut/intent/issue/exchange/workload widgets; the demo's many operational
  sections are replaced by **one honest "Not tracked" panel**; Dashboard range omits **Custom** (lives
  on Analytics); recent rows link to Chat Monitor rather than opening a fake order/issue modal.

## Boundary confirmations

- **No DB writes / no migrations / no new tables** — only the two existing read-only services
  (`getAnalyticsData`, `getConversationList`); both `SELECT` only. No schema/Drizzle changes.
- **`ai.agno_*` read-only / untouched** — no INSERT/UPDATE/DELETE anywhere; transcripts not persisted.
- **No fake metrics** — every rendered number maps to a real field; `FORBIDDEN_METRIC_KEYS` + test
  prevent regressions; the not-tracked panel is honest, not placeholder cards.
- **PII-safe** — Dashboard payload carries only masked contacts (`94•••••297`); no raw phone/session
  id; analytics payload has no per-contact ids at all. No secrets in the client.
- **Chat Monitor untouched** — hybrid performance split preserved (see regression below).

## Tests / typecheck / build (Node 20.20.2)

- `npm run typecheck` — ✅ clean
- `npm run test` — ✅ **106/106** (14 files; +7 new dashboard presenter tests; all prior green)
- `npm run build` — ✅ `/` now `ƒ Dynamic` (live metrics); **`/chat-monitor` still `○ Static`**;
  API routes still `ƒ Dynamic` (hybrid split intact)

## Browser verification (Chrome DevTools, dev :3003)

- **Dashboard** — dense composition renders with real values (Conversations 13, Messages 178, Turns
  70 / 5.4 avg, Total tokens 819,378 [13/13], Est. cost $0.0639 [11/13], Last activity Jun 15 19:00);
  two area charts; 6 masked recent rows; coverage panel; honest not-tracked panel. Range toolbar:
  clicking **30D** → URL `?range=30d`, button pressed, all labels update (server recompute). No
  document scroll (`docOverflowBy 0`); content scrolls in `main`; **no dead space**. Console: only an
  unrelated **favicon 404** (all app CSS/JS/fonts/doc are 200).
- **Analytics** — two real area charts (Conversations + Tokens per day), KPIs, toolbar, clamp logic;
  **no console errors**.

## Chat Monitor regression check

- Build: `/chat-monitor` remains **`○ Static`** (instant shell). Warm dev timings: shell `GET
  /chat-monitor` **248ms**; list API **743ms**; single transcript **764ms**.
- Logs show **exactly one** transcript fetch (the auto-selected first conversation), **not 13** →
  lazy split preserved. Internal pane scroll intact (list 172px, transcript 468px; `docOverflowBy 0`).
  Masked list of 13; no console errors. **No regression.**

## Files

- **New:** `lib/dashboard/presenter.ts`, `lib/dashboard/presenter.test.ts`,
  `components/charts/area-chart.tsx`, `components/dashboard/dashboard.tsx`,
  `components/dashboard/dashboard-toolbar.tsx`, `app/(dashboard)/loading.tsx`.
- **Changed:** `app/(dashboard)/page.tsx` (rebuilt → dynamic, real data), `components/analytics/
  analytics.tsx` (area charts + tokens/day), `app/(dashboard)/analytics/loading.tsx` (two-chart
  skeleton).
- **Docs:** this handoff, `docs/changelog/technical-decision-log.md` (TD-061/062),
  `docs/phases/phase-1.md`, `docs/product/03-feature-scope.md`, `CONTEXT.md`.

## Review (two-axis)

- **Standards: PASS** — server-first; DB stays server-side (client bundle has no `pg`); read-only
  `ai.*`; reuses existing deep services; pure tested presenter; Tailwind tokens only; imports at top;
  no new deps.
- **Spec: PASS** — Dashboard is no longer a link hub; dense real KPI cards + chart/report sections +
  recent activity + honest unavailable section; no fake metrics; no dead space; Analytics polished;
  Chat Monitor not regressed; sidebar nav works; PII-safe; build/tests green.

## Risks / follow-ups

- `/` is now dynamic: it computes the analytics aggregate (parses 13 transcripts) + the list per
  request — comparable to Analytics (~sub-second warm); a `loading.tsx` covers navigation. If session
  volume grows materially, the documented **analytics rollup** (future ADR) would speed both pages.
- Dashboard range intentionally has no Custom picker (kept on Analytics) to stay an overview.
- Dev server currently on **:3003** (3000–3002 were held by other processes) — stop when done.

## Gate status

- **Gate 4** (per-slice QA + docs/handoff): satisfied for Slice 7C. Phase 1 Dashboard + Analytics are
  now visually/product-acceptable; Phase 1 remains feature-complete (this was quality only).

## Next recommended step

Phase 1 is feature-complete and now demo-grade on all three surfaces. New session: a full **Phase-1
acceptance review** (+ optional deploy-target decision), or **Phase 2** discovery (live AI→human
handover, ADR-0009). **Do not start Phase 2 without explicit direction.**
