# Handoff — Mini Slice 12C-UX: Loader Consolidation / Pending-State Cleanup

- **Date:** 2026-06-16
- **Type:** UI-only polish (refines ADR-0013). **No** DB / schema / migration / API-contract / `ai.*` / `dashboard.*` changes.
- **Decision log:** TD-075. **Authoritative ADR:** `docs/adr/0013-client-side-data-loading-via-internal-api-routes.md`.

## Why

Slice 12C-API (TD-073) shipped the API-driven filter path but fired **too many** pending
cues at once. On a single range click the Dashboard showed: a per-button spinner **+** the
toolbar "Updating…" badge **+** a floating overlay chip **+** three dimmed (`opacity-50`)
card regions (Analytics: two). The UI felt noisy. Product decision: **one** small updating
indicator, keep previous data fully visible, no card-blanking, no multi-spinner noise.

## Loader policy implemented

1. **Initial route load** — existing route-level `loading.tsx` skeletons (fire on
   navigation only, not on filter clicks). Unchanged.
2. **Filter refresh** — keep previous real data **fully visible**; show **one** small
   "Updating…" badge near the toolbar; clicked filter gets a **subtle** pending cue
   (`aria-busy`, full opacity vs. soft-dimmed siblings); **no** layout shift.
3. **No** card blanking, **no** per-card/per-chart skeletons or overlays, **no** multiple
   spinners (exactly **one** spinner, inside `UpdatingBadge`).
4. **Local error/retry** (`RefreshError`) only when a specific request fails. Unchanged.
5. **Chat Monitor** — regression-checked only, not refactored.

## Files changed (UI only)

- `components/shell/pending-section.tsx` — now a **calm `aria-busy`-only** wrapper; removed
  dimming, pointer-block, and the `overlayLabel` chip (no `Spinner` import).
- `components/dashboard/dashboard.tsx` — **3 → 1** `PendingSection` around the dynamic
  region; previous data stays visible.
- `components/analytics/analytics.tsx` — **2 → 1** `PendingSection`; removed the `Spinner`
  import, the per-button spinners, and the custom-Apply spinner; reuses
  `isCustomRangeValid`.
- `components/dashboard/dashboard-toolbar.tsx` — `SegButton` spinner removed (clicked button
  marked `aria-busy`); single spinner now only in `UpdatingBadge`.
- `lib/api/query.ts` — extracted pure **`isCustomRangeValid(from,to)`** shared by the route
  guard (`parseAnalyticsQuery`) and the Analytics custom-range UI.
- `lib/api/query.test.ts` — **+4** unit tests for `isCustomRangeValid`.
- Comment-only honesty fixes (spinner → pending cue): `lib/dashboard/range-toolbar.ts`,
  `lib/dashboard/range-toolbar.test.ts`, `lib/dashboard/async-data.ts`,
  `components/shell/use-range-data.ts`.

## Dashboard / Analytics behavior — before → after

- **Before:** filter click → per-button spinner + toolbar badge + overlay chip + every card
  region dims to 50%. Multiple spinners + dim across the whole page.
- **After:** filter click → previous data stays at full opacity; **one** "Updating…" badge
  (1 spinner) near the toolbar; clicked button subtly marked busy; URL syncs; data swaps in
  on success. Identical calm behavior on both surfaces.

## Verification

- `npm run typecheck` clean · `npm run test` **163/163** (+4) · `npm run build` green.
- `db:agno:verify` PASS (4 tables; no forbidden tables; 0 active orphans).
- `db:chat:verify` PASS (masked; no raw-id leaks; no system/tool msgs; IDOR-safe; 4/4
  transcripts non-empty).
- `db:analytics:verify` PASS — parity exact vs independent SQL (convs 4 / turns 48 /
  tokens 1,077,990 / cost $0.102961772).
- **Browser smoke** (`localhost:3216`):
  - Dashboard filter click — mid-flight sampled: `spinners:1`, `dimmed:0`, previous data
    present, clicked button `aria-busy`+`aria-pressed`; settled: URL `?range=14d`, data
    updated, cues cleared.
  - Analytics filter click — same calm behavior; settled URL `?range=30d`.
  - Invalid custom range (`from > to`) — Apply **disabled**, **0** requests fired, URL
    unchanged. Valid custom range — Apply fires one request, URL syncs
    (`?range=custom&from=…&to=…`), heading "Overview · Custom".
  - Chat Monitor — list + transcript switching work; contacts masked (`94•••••273`);
    transcript API uses internal UUIDs; no console errors; **no PII/session-id leaks**.

## No contract changes

API routes (`/api/dashboard`, `/api/analytics`, `/api/chat-monitor/*`) and their safe,
masked DTOs are byte-for-byte unchanged. `isCustomRangeValid` is a pure refactor of the
existing inline check (behavior identical). 4-table schema respected; no customer/identity
model; no transcript duplication.

## Next recommended step

**Slice 12B — cost/token metric expansion.** Stop after this cleanup.
