# ADR-0013 — Client-side data loading for Dashboard/Analytics via internal API routes

- **Status:** **Accepted** (Slice 12C).
- **Date:** 2026-06-16
- **Relation:** Works with ADR-0012 (4-table schema), ADR-0001 (read-and-organize, link by value),
  ADR-0004 (read-only transcript), ADR-0005 (masking). **Consciously revises** the
  `docs/architecture/08` §3 guidance ("URL-as-state is correct; do not rewrite it") — this is the
  deferred §4 *Post-deploy* "API split", now approved with **product sign-off** (the earlier Slice-12C
  decision to defer it to a later ADR is superseded by this ADR).

## Context

Dashboard/Analytics filter changes (Today/3D/7D/14D/30D/Month/Custom) drove a **full RSC navigation**
(`router.push("?range=")` + `useTransition`). The data path was correct, but:

- the pending feedback was **too subtle** — the page felt frozen during the server recompute;
- the **whole page** recomputed as one unit (cheap recent list coupled to the heavy analytics parse);
- there was **no per-widget pending**, **no keep-previous-data on error**, and **no retry**;
- the product now wants a path toward **polling/near-real-time** (Slice 12F), which is far simpler on a
  client-fetch + internal-API foundation.

## Decision

Move **dynamic** Dashboard/Analytics data loading to **internal Next.js API routes consumed by client
widgets**, while keeping the first paint server-rendered.

1. **Initial paint stays server-rendered** (real-data-first, deep-linkable `?range=`, no skeleton flash).
   The page Server Components call the existing services for the initial range and pass the result to the
   client widget as `initialData`.
2. **All filter-driven refetches go through internal route handlers:**
   - `GET /api/dashboard?range=` → `{ analytics, recent, restrictedCount }`
   - `GET /api/analytics?range=&from=&to=` → `{ analytics }`
3. **Strict boundary (no logic in routes):**
   - `app/api/**/route.ts` = HTTP boundary + input validation + safe error mapping + masked logging;
   - `lib/**/service.ts` = data/business logic (**unchanged — the single source of truth**);
   - `lib/db/**` = DB client/schema. Route cores are **dependency-injected** (`lib/api/endpoints.ts`)
     so they are unit-testable without a DB.
4. **Security (server-authoritative):** the client sends **only** `range`/`from`/`to`. The server
   resolves tenant/channel/retention; it **never** reads a client-supplied `tenant_id`/`channel_id`.
   Responses are **masked, safe DTOs only** — never raw `external_contact_id`, never raw
   `agno_session_id`, never `customer_id`/`customer_identity_id` (they no longer exist — ADR-0012),
   never DB URLs/secrets/internal error text. A whitelist mapper (`pickRecentItem`) enforces this even
   if a service ever returned extra fields (defense-in-depth).
5. **Client engine (no new dependency):** React 19 `fetch` + a **pure reducer**
   (`lib/dashboard/async-data.ts`): keep-previous-data, **latest-request-wins**, immediate pending,
   user-safe error + **retry**. No TanStack/SWR added. The URL is kept in sync via
   `history.replaceState` (shareable/refreshable range **without** a server round-trip).

## Consequences

- **Snappier filters**, localized pending, retries, and a reusable API surface for Slice 12F.
- **Metric logic is unchanged** — both the page (initial) and the routes (dynamic) call the **same**
  `getAnalyticsData` / `getConversationList`, so `db:analytics:verify` parity is preserved.
- Two call-sites invoke the services (page SSR + API), but there is **one** logic source.
- **No schema/DB/`ai.*`/`dashboard.*` changes**; no migration; transcript boundary (ADR-0004) and
  masking (ADR-0005) intact; 4-table schema (ADR-0012) respected.
- Back/forward no longer cycles ranges (we use `replaceState`, not history pushes) — an acceptable,
  intentional trade for avoiding server round-trips.

## Alternatives considered

- **A — Server streaming (`<Suspense>`), keep URL-as-state, no API:** lower-risk and was the earlier
  pick, but does not give client-side keep-previous-data/retry and is a weaker base for 12F polling.
  **Superseded by product direction.**
- **C — `/api/*` routes consumed server-side + Suspense:** keeps URL-as-state but still re-renders via
  the server on every filter; rejected for the same perceived-performance reason.

## Boundaries preserved

- 4-table dashboard schema (`app_tenants`, `app_channels`, `app_conversations`,
  `app_tenant_entitlements`); **no** customer/identity/profile tables; **no** `app_conversation_messages`.
- `ai.*` read-only; canonical transcript stays in `ai.agno_sessions.runs`; contacts masked on read.
- No realtime/SSE/WebSocket/polling **yet** (this ADR only enables the foundation; 12F decides transport).
