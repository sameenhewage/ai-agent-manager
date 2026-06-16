# Handoff — Slice 12C-API: API-driven Dashboard/Analytics Filter + Loading UX

- **Date:** 2026-06-16
- **Status:** ✅ DONE — **PASS**. No schema/DB/`ai.*` changes; all gates + verifiers + browser smoke green.
- **Decision:** ADR-0013 · **Log:** TD-073 · **Approach chosen: B** (internal API routes + client fetch) —
  a product-approved override of the earlier **A** (server-streaming/Suspense) decision.

## What & why

Slice 12C (TD-071) shipped the localized-pending UI but **deferred** the API split. This slice moves the
**dynamic** Dashboard/Analytics data path to **internal Next.js route handlers consumed by client widgets**,
so filter changes keep the previous data visible, show localized pending, and gain user-safe error/retry —
and lay the foundation for Slice 12F polling. **Initial paint stays server-rendered** (real-data-first,
deep-linkable `?range=`, no flash).

## API contract (thin HTTP boundary → existing services)

- `GET /api/dashboard?range=` → `{ analytics, recent, restrictedCount }`
- `GET /api/analytics?range=&from=&to=` → `{ analytics }`
- Client sends **only** `range`/`from`/`to`; tenant/channel are resolved **server-side**; any
  `tenant_id`/`channel_id` in the query is **ignored**.
- Invalid range / incomplete-or-inverted custom range → **400** (safe message; masked logs).
- Recent items whitelisted to `[id, maskedContact, status, firstAt, lastAt, turnCount]` — no raw
  `external_contact_id` / `agno_session_id`, no `customer_id` / `customer_identity_id`.

## Files

**New**
- `lib/api/query.ts` — `parseAnalyticsQuery` (safe validation) + `buildRangeQuery`.
- `lib/dashboard/async-data.ts` — pure async-data reducer (keep-previous-data / pending / error).
- `lib/api/endpoints.ts` — DI endpoint cores (`runDashboardEndpoint`, `runAnalyticsEndpoint`,
  `pickRecentItem` whitelist).
- `app/api/dashboard/route.ts`, `app/api/analytics/route.ts` — thin handlers → services.
- `components/shell/use-range-data.ts` — client fetch hook (latest-request-wins, URL sync via
  `history.replaceState`).
- `components/shell/refresh-error.tsx` — non-destructive error banner + Retry.
- `docs/adr/0013-client-side-data-loading-via-internal-api-routes.md`.
- Tests: `lib/api/query.test.ts` (11), `lib/dashboard/async-data.test.ts` (4), `lib/api/endpoints.test.ts` (6).

**Changed**
- `components/dashboard/dashboard.tsx`, `components/analytics/analytics.tsx` — consume the hook +
  `initialData`; keep-previous-data + pending + error/retry; Analytics custom-range guard.
- `app/(dashboard)/page.tsx`, `app/(dashboard)/analytics/page.tsx` — build the SSR initial payload + render
  the client widgets (deep-link initial range preserved).
- Docs: `CONTEXT.md`, `docs/architecture/08-…`, `docs/product/05-…`,
  `docs/phases/phase-1-post-acceptance-hardening.md`, `docs/changelog/technical-decision-log.md`.

## Behaviour before → after

- **Dashboard / Analytics:** before — range click = full RSC navigation (whole-page recompute, subtle
  dim). After — range click = client `GET /api/*`, **previous data stays**, localized pending, URL synced,
  user-safe **error + Retry**.
- **Custom range (Analytics):** Apply is disabled and **no request fires** unless `from ≤ to` and both
  dates are valid; the server also returns 400 defensively.
- **Chat Monitor:** unchanged — regression-checked (list masked, transcript from `ai.agno_sessions.runs`).

## Tests / gates (Node 20 via `.nvmrc`)

- `npm run typecheck` clean · `npm run test` **159/159** (138 + 21 new) · `npm run build` green.

## DB verifiers (read-only; all PASS)

- `db:agno:reconfirm` — no writes performed.
- `db:agno:verify` — 4 tables; no forbidden tables; contacts 15 ≤ conversations 17.
- `db:chat:verify` — masked `94•••••784…`; no raw id leaks; transcripts 4/4 from `runs`; IDOR-safe.
- `db:analytics:verify` — **parity exact**: conv 4 / turns 44 / tokens 1,010,101 / cost $0.097590316.

## Browser smoke (prod server `:3215`)

- Range click fires `GET /api/dashboard?range=…` / `GET /api/analytics?range=…[&from&to]`; URL syncs;
  previous data stays; **no console errors/warnings**.
- In-page fetch checks: `rawPhone=false`, `rawSession=false`, no leak keys; recent items expose exactly the
  6 safe keys; masked contact present.
- `range=__bad__` → **400**; custom `from>to` → **400**; injected `tenant_id`/`channel_id` → **200 ignored**
  (no leak).

## Risks / notes

- New HTTP surface — mitigated by DI-tested cores, a DTO whitelist, server-side validation, and the full
  re-verify above.
- `history.replaceState` URL sync means **back/forward no longer cycles ranges** (intentional — avoids a
  server round-trip on every filter; deep-link + refresh still work).
- A **stale dev server from a prior session is still on `:3210`** (old build); this slice was verified on a
  fresh production server on **`:3215`**.
- The active shell Node is **v10**; use **Node 20** (`.nvmrc`) — e.g. prefix
  `PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"` — to run `test`/`build`/verifiers.

## Next (STOP after 12C — do not auto-start)

- **Slice 12B** — cost/token metric expansion (real `session_metrics` splits, cost/day, averages,
  coverage warning), or
- **Slice 12E** — WhatsApp-like chat pagination (`limit`+`before` cursor, scroll anchor, new-msg pill).
- Real-time/polling (**12F**) now has an API foundation; still needs its own approval (and likely a small
  ADR for the transport).
