# Handoff — Slice 12C: Dashboard/Analytics Filter + Loading UX Polish

- **Project:** pepper-st-dashboard
- **Date:** 2026-06-16
- **Owner (global agent):** `fullstack-builder-agent` (impl + tests) + `qa-review-agent` (verify) +
  `handoff-agent` (this doc)
- **Type:** **UI/UX-only vertical slice.** No schema migration, no DB writes, `ai.*` untouched, no new
  product features/metrics, no toolbar/visual redesign, no change to the URL-as-state model.
- **Status:** complete — **PASS**. Localized pending feedback shipped on Dashboard + Analytics; all gates
  green. Per-widget `<Suspense>` streaming + API split **deferred** (overlaps Slice 12D).
- **Decision log:** TD-071 (`docs/changelog/technical-decision-log.md`).

---

## 1. Problem

Range/filter clicks on the Dashboard and Analytics already pushed `?range=…` to the URL inside a
`useTransition`, letting the Server Component recompute every real metric. But the **only** in-flight
feedback was a blanket `opacity-60` on the toolbar. During the ~1.3s server recompute the page felt
**frozen** — no clear signal that the click registered, which control was loading, or that the visible
numbers were about to change. The data was always correct; the *perceived responsiveness* was the gap
(product gap **G2** in `docs/product/05-…`).

## 2. What shipped (all client/presentational — no data path touched)

- **`lib/dashboard/range-toolbar.ts`** — pure, DB-free state helper `rangeButtonState(...)` returning
  `{ isActive, isPending, isDisabled }` for one toolbar button (custom-range aware), plus the shared
  `RANGE_BUTTONS` list. Single source of truth for toolbar button states across both surfaces.
- **`lib/dashboard/range-toolbar.test.ts`** — 9 TDD tests: active/custom-active logic, spinner only on the
  clicked button, soft-disable-all-while-pending, button-set drift guard, and a **no-numeric-metric-keys**
  guard (the toolbar carries labels only — no fabricated values).
- **`components/ui/spinner.tsx`** — small inline spinner; `aria-hidden`, `motion-reduce:animate-none`
  (respects reduced-motion). Decorative only; the accessible announcement lives on the status region.
- **`components/shell/pending-section.tsx`** — `PendingSection` wrapper that keeps the **previous real
  children mounted** (no blank flash, no layout jump), dims + blocks pointer input, sets `aria-busy`, and
  optionally floats one centered "Updating…" chip. No data access; only re-presents its children.
- **`components/dashboard/dashboard-toolbar.tsx`** — refactored into a shared **`RangeToolbar`** +
  `SegButton` + `UpdatingBadge` (polite `role="status"` `aria-live` region). The Dashboard's existing
  **segmented-pill** look is preserved exactly; the only additions are the spinner, soft-disable, and the
  "Updating…" status.
- **`components/dashboard/dashboard.tsx`** — now a client component owning `useTransition` + `pendingKey`;
  KPI grid, charts, and recent-conversations panel are each wrapped in `PendingSection`.
- **`components/analytics/analytics.tsx`** — gets the **same loading language** (spinner on the clicked
  range, soft-disable all buttons, `UpdatingBadge`, two `PendingSection`s over KPIs + charts) driven by the
  shared pure helper, **while keeping its existing panel-bar toolbar visual and the custom date-range
  control** (toggle + from/to inputs + Apply, which now soft-disables and spins during its transition).

## 3. Key design decision — consistency vs. "no redesign"

The two surfaces started with **different** base toolbar visuals: Dashboard = a compact segmented pill
(solid-accent active button); Analytics = a full panel bar with outlined buttons + a Custom toggle + date
inputs. The slice asked for "consistent visual language" **and** forbade visual redesign. Forcing one
look onto the other would be a redesign. Resolution: **unify the loading/pending *language*** (spinner on
the clicked control, soft-disable, per-region `aria-busy` dim, polite "Updating…") across both, and keep
each surface's **base toolbar identity**. The shared pure helper + `Spinner`/`PendingSection`/`UpdatingBadge`
primitives are reused by both, so behaviour is identical even though the two toolbars look as they did
before.

## 4. Explicitly NOT done (deferred, unchanged)

- **Independent per-widget `<Suspense>` streaming** (cheap recent list resolving before heavy analytics)
  and the **API split** — these overlap Slice 12D's deferred "Post-deploy" API split and were **not**
  implemented here. The current model recomputes server-side per range and shows one shared pending state
  per surface (regionally dimmed). Pick this up in a future slice if/when the API is split.

## 5. Files changed

**New**
- `base-dashboard-app/lib/dashboard/range-toolbar.ts`
- `base-dashboard-app/lib/dashboard/range-toolbar.test.ts`
- `base-dashboard-app/components/ui/spinner.tsx`
- `base-dashboard-app/components/shell/pending-section.tsx`

**Modified**
- `base-dashboard-app/components/dashboard/dashboard-toolbar.tsx` (→ shared `RangeToolbar`)
- `base-dashboard-app/components/dashboard/dashboard.tsx` (client component; `PendingSection` wraps)
- `base-dashboard-app/components/analytics/analytics.tsx` (same pending language; visual identity kept)

**Docs**
- `docs/changelog/technical-decision-log.md` (TD-071)
- `docs/phases/phase-1-post-acceptance-hardening.md` (Slice 12C → DONE + outcome; status line)
- `docs/architecture/08-dashboard-data-loading-and-realtime-strategy.md` (§8 12C done)
- `docs/product/05-dashboard-analytics-chat-gaps.md` (G2 addressed)
- `CONTEXT.md` (stage line)
- this handoff

## 6. Environment note (important for the next agent)

The shell's **default `node` is v10.24.1**, which **cannot** run vitest 2.x / Next 15 (you get
`SyntaxError: Unexpected string` on `import './dist/cli.js'`). The repo requires Node ≥18.18. Run all
checks with a modern Node via nvm **without** a global switch, e.g.:

```bash
PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" npm run typecheck
PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" npm run test
PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" npm run build
PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH" npm run dev   # localhost:3000
```

## 7. Verification (all on Node 22)

- **`typecheck`** — clean (the IDE may still show stale `lib/analytics/universe.test.ts` "Cannot find
  module './universe'" diagnostics; `universe.ts` exists and `tsc` + vitest are green — restart the TS
  server to clear).
- **`test`** — **135/135** across 16 files (+9 `range-toolbar`; schema suite 19; `universe` 9).
- **`build`** — `next build` green (`/` 3.8 kB, `/analytics` 3.13 kB First Load JS).
- **Read-only DB verifiers — all PASS:** `db:agno:reconfirm` (no writes) · `db:agno:verify`
  (1 identity : N convs; 6 dashboard tables; no transcript tables) · `db:chat:verify` (masked `94•••••…`,
  no raw-id leaks, IDOR-safe, no system/tool) · `db:analytics:verify` (parity exact: conv **4** /
  turns **30** / messages **85** / tokens **648,405** [4/4] / cost **$0.065330944** [4/4]).
- **Browser smoke (chrome-devtools, Slow 3G to expose the in-flight state; in-page `MutationObserver`
  confirmed the transient state):**
  - **Dashboard** — clicking a new range: **3** `PendingSection` regions go `aria-busy` together, the
    clicked range shows a spinner, the "Updating…" badge appears, previous numbers stay on screen, then it
    settles to the new range. No console errors.
  - **Analytics** — **2** `aria-busy` regions + spinner + badge; the **custom range still applies**
    (`?range=custom&from=2026-06-10&to=2026-06-16`, heading "Overview · Custom"). No console errors.
  - **Chat Monitor regression** — contacts masked; DOM scan found **0 UUIDs**, **0** forbidden id keys
    (`user_id`/`session_id`/`external_contact_id`/…), **no raw mobile** (the only long digit runs are
    Shopify image `?v=` cache-busters in legitimate message content); no system/tool messages; no console
    errors.

## 8. Risks / watch-items

- **Perceived-only fix:** the server still recomputes the whole surface per range; this slice improves the
  *feel*, not the compute time. The real latency fix is Slice 12D (done) + the deferred API split/streaming.
- **Single shared pending flag per surface:** all regions dim together (not independently). Acceptable for
  now; revisit when widgets are split behind `<Suspense>`/separate endpoints.
- **Stale TS-server diagnostics** on `universe.test.ts` are cosmetic (see §7).

## 9. Next recommended step

Pick the next **approval-gated** hardening slice — e.g. **12B** (cost/token depth, read-only) or **12E**
(WhatsApp-like transcript paging). The per-widget `<Suspense>` streaming + API split can be folded into
whichever slice splits the data endpoints. **Do not** start any slice without explicit per-slice approval.

## Stop

Slice 12C complete. **Stopping here — no further slice started.**
