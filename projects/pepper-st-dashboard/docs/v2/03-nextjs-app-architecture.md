# V2 / 03 — Next.js App Architecture

> Paths are relative to `base-dashboard-app/`. The guiding rule: **server-only DB access**
> (the `pg` driver is imported only via services, so it can never reach the client bundle);
> **masking + DTO shaping happen in the service/presenter/endpoint seam**, never in the
> client.

## 1. Routes & pages (App Router)

| Path | Type | Role |
|---|---|---|
| `app/layout.tsx` | Server | Root layout (fonts, metadata). |
| `app/(dashboard)/layout.tsx` | Server | App shell (sidebar + topbar). |
| `app/(dashboard)/page.tsx` | **Server Component**, `force-dynamic` | Dashboard SSR: `Promise.all([getAnalyticsData, getConversationList])` → `<Dashboard/>`. |
| `app/(dashboard)/analytics/page.tsx` | **Server Component**, `force-dynamic` | Analytics SSR: `getAnalyticsData` → `<Analytics/>`. |
| `app/(dashboard)/chat-monitor/page.tsx` | **Server Component** (no data) | Renders the client `<ChatMonitor/>` shell only. |
| `app/(dashboard)/*/loading.tsx` | Server | Route-level skeletons shown on **navigation** (not on filter change). |

## 2. API routes (thin HTTP boundary, `force-dynamic`, `cache-control: no-store`)

| Route | Handler calls | Returns |
|---|---|---|
| `app/api/dashboard/route.ts` | `runDashboardEndpoint` → `getAnalyticsData` + `getConversationList` | `{ analytics, recent[], channelLabel, retentionLabel, restrictedCount }` |
| `app/api/analytics/route.ts` | `runAnalyticsEndpoint` → `getAnalyticsData` | `{ analytics }` |
| `app/api/chat-monitor/conversations/route.ts` | `getConversationList` | masked list (no bodies) |
| `app/api/chat-monitor/conversations/[id]/transcript/route.ts` | `getConversationTranscript` | masked single transcript (or 404) |

Handlers contain **no SQL**; they validate, call the injected service loader, and map
errors to a generic message (raw error/DB URL never returned; logged masked via
`maskDbUrl`).

## 3. Client components (presentation + filter/loader state)

| File | Role |
|---|---|
| `components/dashboard/dashboard.tsx` | Dashboard widgets; owns range state; client-fetches `/api/dashboard` on change. |
| `components/analytics/analytics.tsx` | Analytics widgets + custom range; client-fetches `/api/analytics`. |
| `components/chat-monitor/chat-monitor.tsx` | List + transcript panes; client-fetches both chat endpoints; caches transcripts per id. |
| `components/dashboard/dashboard-toolbar.tsx` | Shared `RangeToolbar` + `SegButton` + `UpdatingBadge` (the **single** spinner). |
| `components/shell/use-range-data.ts` | Client hook: fetch + keep-previous-data + pending + error/retry + URL sync. |
| `components/shell/pending-section.tsx` | Calm `aria-busy`-only wrapper (no dimming/overlay — Slice 12C-UX). |
| `components/shell/refresh-error.tsx` | Local, non-destructive error/retry banner. |

## 4. Server components / service layer

| File | Role | DB access |
|---|---|---|
| `lib/db/client.ts` | `getDb()` (Drizzle), `getPool()` (pg), `maskDbUrl()`. Reads `DATABASE_URL` from env only. | Connection owner |
| `lib/tenant/context.ts` | Resolve current tenant by slug (`pepper-st`). | reads `app_tenants` |
| `lib/analytics/service.ts` | `getAnalyticsData` — universe + read-only Agno read + aggregate. | `dashboard.*` + `ai.agno_sessions` (read) |
| `lib/chat-monitor/service.ts` | `getConversationList`, `getConversationTranscript`. | `dashboard.*` + `ai.agno_sessions` (read) |
| `lib/api/endpoints.ts` | Endpoint cores + `pickRecentItem` whitelist. | none (pure) |
| `lib/agno/sync.ts` | **Gated** Agno→dashboard upsert (`db:agno:sync`). | reads `ai.agno_sessions`, **writes `dashboard.app_conversations`** |

## 5. Pure libraries (no DB; unit-tested)

`lib/analytics/ranges.ts` (tz ranges, retention clamp, param parse) ·
`lib/analytics/aggregate.ts` (metric math) · `lib/analytics/universe.ts` (join-by-value
inputs) · `lib/agno/parser.ts` (transcript parse) · `lib/agno/mapping.ts`
(`deriveExpectedAgentId`, contact/session derivation) · `lib/agno/mask.ts` (masking) ·
`lib/agno/types.ts` · `lib/api/query.ts` (`parseAnalyticsQuery`, `isCustomRangeValid`,
`buildRangeQuery`) · `lib/dashboard/async-data.ts` (reducer) ·
`lib/dashboard/range-toolbar.ts` (toolbar state).

## 6. DTO boundaries (where raw data is dropped)

- **`lib/chat-monitor/presenter.ts`** — `ConversationListItem` / `TranscriptView` carry
  `maskedContact` only; raw `external_contact_id`/`agno_session_id` never included.
- **`lib/api/endpoints.ts::pickRecentItem`** — whitelists recent items to
  `{ id, maskedContact, status, firstAt, lastAt, turnCount }` (defense-in-depth).
- **`lib/analytics/service.ts::AnalyticsData`** — aggregate totals + series only; **no
  per-contact identifiers** (analytics is PII-free by construction).

## 7. Where masking happens

`lib/agno/mask.ts::maskContactId` is the single utility, applied in the **presenter**
(list) and **service** (transcript) before data leaves the server. The client renders
`maskedContact` verbatim and has no DB access.

## 8. Where state lives

- **Range/filter state:** client component state (`dashboard.tsx` / `analytics.tsx`),
  mirrored to the URL via `history.replaceState` (`buildRangeQuery`), validated by
  `lib/api/query.ts`, reduced by `lib/dashboard/async-data.ts`, toolbar state in
  `lib/dashboard/range-toolbar.ts`.
- **Loader state:** `use-range-data` (pending/error), surfaced by **one** `UpdatingBadge`
  spinner + `aria-busy` `PendingSection` (no per-card spinners — Slice 12C-UX).

## 9. Change-safety for the demo

**Safe to change (presentation / labels):** client components, `pending-section.tsx`,
`refresh-error.tsx`, `dashboard-toolbar.tsx`, metric **labels/copy**, styling/tokens.

**Change carefully (keep the contract):** service files + `endpoints.ts` (preserve masked
DTO shape + tenant-server-resolution), `ranges.ts`/`aggregate.ts` (metric semantics —
coordinate with `04`), `query.ts` (validation).

**Do NOT touch without explicit approval:** `lib/db/schema.ts`, `drizzle/` migrations,
`lib/agno/sync.ts` + `db:agno:*` / `db:seed` scripts (any DB write), the **`ai.*`
read-only boundary**, `lib/agno/mask.ts` (masking), and anything that would persist
transcript bodies (ADR-0004).
