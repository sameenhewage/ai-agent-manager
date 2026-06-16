# Technical Decision Log

- **Project:** pepper-st-dashboard
- **Purpose:** running, phase/version-wise log of technical decisions. Newest
  first. Each entry links to the authoritative ADR/workflow.
- **Last updated:** 2026-06-16

> Living document. **No feature is complete unless this log (and the relevant
> ADR/workflow/handoff) is updated.**

---

## 2026-06-16 — Gate 12: Full DB re-analysis + product-behaviour gap review (READ-ONLY; no schema/data/app changes)

### TD-068 — Live DB re-verified post-11B; no migration; hardening roadmap 12A–12G drafted
Read-only gate — **no `ai.*`/`dashboard.*` writes, no migration/seed/sync**. Re-ran `db:agno:reconfirm`
+ the three hardened verifiers (all **PASS**: live 4 / mapped 4 / active orphans 0 / archived 13;
analytics totals == independent SQL — conv 4, turns 29, tokens 630,305, cost $0.0635) and parsed the
historical `/home/sameen/papper_full_dump.sql` locally (**DDL only — no data rows read**). **Findings:**
(1) the dump is an **`ai`-schema-only** export that is **already v2-shaped** (13 `agno_*` tables;
`agno_sessions` carries the full v2 columns), so the pre-v2 `concierge`/phone-`session_id` shape isn't
even in it and the v2 identity/transcript/token contract is **stable across the Jun-15 dump and Jun-16
live** (re-confirms ADR-0011). (2) `ai.*` structure unchanged vs the dump; `dashboard.*` (Drizzle-owned)
isn't in the dump. (3) All six `dashboard.app_*` tables + mapping logic re-verify green → **no schema
migration warranted**. (4) **Scale risks:** `ai.agno_sessions` has **no `agent_id` index** (only
`session_id` PK + `created_at` + `session_type`) → `WHERE agent_id=$1` is a seq scan (~0.5s
list/transcript at just 4 sessions); analytics ships+parses the **full `runs` JSONB for every session**
per request with no SQL date filter. Safe dashboard-side fix (no `ai.*` change): read by
**`session_id = ANY($mappedIds)`** (PK) + SQL `jsonb_array_length` for turns. (5) **Product gaps:**
shallow cost/token view (token splits/cost-day/averages/coverage-warning unused), subtle filter feedback
+ whole-page recompute, no real-time, and a **static full-load transcript** (no scroll-up paging). (6)
**PII:** 13 v1 leftover customer/identity rows retain historical phone (archived only; purge = separate
approval). `typecheck` clean; **114/114** tests. **Decisions:** no migration; defer rollups/message-index
until scale demands (JSONB **parse-and-slice first**; content duplication needs a **new ADR superseding
ADR-0004**); real-time = **polling** (list/counters) + optional SSE for the chat tail — **no WebSocket /
no DB triggers / no send-reply / no fabricated metrics**. Hardening split into approval-gated slices
**12A–12G** (`docs/phases/phase-1-post-acceptance-hardening.md`). New docs:
`docs/database/07-old-vs-current-db-comparison.md`,
`docs/architecture/08-dashboard-data-loading-and-realtime-strategy.md`,
`docs/product/05-dashboard-analytics-chat-gaps.md`. **Gate 12 verdict: PASS** (analysis complete,
roadmap ready). Deploy data-blocker (Gate 10/11A) **cleared**; revisit deploy after the perf/real-time
hardening slices. **No implementation performed in this gate.**

---

## 2026-06-16 — Slice 11B: Agno v2 re-alignment — dashboard writes EXECUTED + verified (approval granted)

### TD-067 — Orphan archival + re-sync done; live data restored; all verifiers PASS
Product approval granted under strict governance (`dashboard.*` only, **no `ai.*` writes**, no migration,
no unrelated seed, **archive-not-delete**). Executed command-by-command: (1) `db:agno:reconfirm` pre-write
snapshot — **4** live sessions under the derived tenant-first `agent_id`, `user_id` 0 nulls, 13 dashboard
orphans / 0 mapped; (2) new `db:agno:archive-orphans` (reads a pre-count + reason, then dashboard-only
`status='archived'`) — **archived 13** v1 orphan conversations (their `agno_session_id`s are v1 phone-based
ids that no longer exist post-migration); (3) `db:agno:sync` (now `syncAllActiveChannels`, derived agent
key) — **considered 4 / mapped 4**, unmapped/ambiguous/skippedNoContact 0, **2 customers / 2 identities**
(1 identity : N), **4 conversations created**. Hardened verifiers all **PASS**: `db:agno:verify`
(live 4 / mapped 4 / archived 13 / **active orphans 0**), `db:chat:verify` (4 masked, **non-empty
transcripts 4/4**, no system/tool, no raw-id leaks, IDOR-safe), `db:analytics:verify` (totals match the
independent agent-filtered SQL exactly; coverage 4/4). Browser smoke (Dashboard / Chat Monitor /
Analytics): real live data, contacts masked (`94•••••784`), transcripts render from `ai.agno_sessions.runs`
JSONB, "real data only" / no fabricated KPIs, read-only — no console errors (only a home-page favicon 404).
New code (dashboard-only, no schema): exclude `status='archived'` from the Chat Monitor list, the Analytics
universe, and the verifier orphan check; `lib/db/seed.ts` `source_agent_id=null`. `typecheck` clean,
**114/114** unit tests. Follow-ups (out of scope, optional): 13 v1 `app_customers`/`app_customer_identities`
rows remain (v1 phone PII, retained by the archive-not-delete choice) — purging needs a separate hard-delete
approval; a few assistant messages with tool-only content render as empty bubbles (cosmetic). The Gate
9/11A data blocker is cleared, so deploy readiness can be revisited.

---

## 2026-06-16 — Slice 11B: Agno v2 re-alignment — contract CONFIRMED + code/verify (dashboard writes still approval-gated)

### TD-066 — `agent_id` is DERIVED `${tenant_id}:${channel_id}`; ADR-0011 Accepted
AI dev confirmed and live `db:agno:reconfirm` **proved** the v2 contract: `ai.agno_sessions.agent_id` is
the composite **`<app_tenants.id>:<app_channels.id>`** (len 73, single `:`, both halves UUID-shaped;
ordering **tenant-first** — `strict_tenant_then_channel=1`, reversed `=0`), and the live session's
`agent_id` equals the **current** `pepper-st`/`whatsapp-main` tenant+channel UUIDs (no ID-coordination
blocker). `user_id` = 11-digit mobile (PII, 0 nulls) = contact; `session_id` = 32-hex opaque key.
**Decision:** the mapping seam **derives** the agent key (`deriveExpectedAgentId(tenantId, channelId)`) and
matches live `agent_id`; **no stored opaque value, no env var, no `agent_name` scan**; `source_agent_id`
demoted to an optional derived/legacy cache. Resolves the TD-065 open sub-decision; **ADR-0011 → Accepted**.
Slice 11B lands the §4.1 logic/config change set + verify-script hardening (derived-agent + live-coverage +
empty-transcript checks) as **code-only** — **no DB writes**. Dashboard-only writes (archive 13 orphans →
`db:agno:sync` → hardened verifies + browser smoke) stay **product-approval-gated** (§7). `ai.*` stays
read-only; link by-value; no transcript duplication. Docs updated: `docs/database/06`, ADR-0011,
`docs/database/02/03/05`, `CONTEXT.md`. Env note: dev `node` default is v10 (too old for `tsx`) — run DB
scripts with an nvm node ≥18.

---

## 2026-06-16 — Gate 11A: Agno v2 re-alignment DESIGN / approval gate (READ-ONLY; no schema/data/app changes)

### TD-065 — No dashboard migration needed; re-alignment is logic+config behind the mapping seam
Design/approval gate only — **no DB writes, no migration, no seed, no sync, no app changes**. Re-confirmed
the live contract read-only via a new permanent tool `db:agno:reconfirm` (`scripts/agno-reconfirm.ts`,
session pinned read-only): **1** session; `agent_id` composite `<uuid>:<uuid>` (73 chars), `agent_name=
'PEPPER ST. WhatsApp Concierge'`; `session_id` = 32-char hex (not phone); **`user_id` = 11-digit phone
(0 nulls)**; `session_data.session_metrics.{total_tokens,cost}` present; roles user/assistant/tool/system;
coverage **13 conversations / 0 mapped / 13 orphans** (configured agent still `concierge`). **Decision: NO
dashboard schema migration** — the existing schema already carries the three v2 identifiers as distinct
columns: `app_channels.source_agent_id` (agent key, value-only change), `app_conversations.agno_session_id`
(opaque `session_id`, no change), `app_customer_identities.external_contact_id` (← `user_id`, derivation
source change). Rejected `source_session_id`/`source_user_id`/`source_agent_key` (already represented);
deferred `source_contract_version` + explicit orphan-status (orphans can be archived via existing
`status='archived'` or deleted). Re-alignment = an 11-point logic/config change set (consolidate the v2
contract into `lib/agno/mapping.ts`: `deriveExternalContactId`→`user_id`, session key=`session_id`, drop
the scattered `'concierge'` literal, agent key from config/env) + dashboard-only orphan cleanup + re-sync
+ **verify-script hardening** (`db:agno:verify`/`db:chat:verify` currently **false-PASS** on stale data;
the v1 **1:1** identity↔conversation invariant becomes **1:N** in v2). One sub-decision **pending AI dev**:
agent-filter strategy (composite `agent_id` default vs `runs[].agent_name`). Evidence (read-only):
`typecheck` clean, **106/106** tests, `db:analytics:verify` **FAIL** (`live=13 sql=0`) = drift confirmed.
Deploy **remains BLOCKED** (Gate 9 superseded). Plan: `docs/database/06-agno-v2-realignment-plan.md`;
ADR-0011 updated (still **Proposed**). **Verdict: Gate 11A PASS** (design ready for approval). Added
read-only `db:agno:reconfirm`; no other changes.

---

## 2026-06-16 — Gate 10: Full database discovery / data contract (READ-ONLY; no schema/data/app changes)

### TD-064 — Agno platform migrated; current data contract documented; live data BLOCKED
Read-only introspection (session pinned `default_transaction_read_only=on`; structure/counts/JSON-paths
only — no content/PII) found the external AI platform **migrated Agno to a richer schema and reset the
data**. `ai` now has **13 tables** (was effectively just `agno_sessions`): + `agno_knowledge` (32),
`agno_memories` (1, PII), `agno_metrics` (daily-rollup, empty), components/learnings/schedules/evals/
approvals. `ai.agno_sessions` now holds **1** session with **breaking identifier changes**: `agent_id`
is a composite `<uuid>:<uuid>` (literal `concierge` gone; label lives at `runs[].agent_name='PEPPER ST.
WhatsApp Concierge'`), `session_id` is a 32-char opaque token, and the **phone moved to the new
`user_id`** column. Unchanged: `runs[].messages[]` shape (role/content/id/created_at/from_history),
epoch `int8` timestamps, and the `session_data.session_metrics.{total_tokens,cost}` path → the parser
needs no change. **Mapping coverage collapsed 13/13 → 0**: all 13 `app_conversations` are orphans, the
1 live session is invisible (channel resolves `source_agent_id='concierge'`). Evidence: `db:agno:inspect`
concierge=0; `db:analytics:verify` **FAIL** (live=13 sql=0); `db:agno:verify`/`db:chat:verify` gave a
**misleading PASS** (don't check live coverage). `typecheck` clean, **106/106** unit tests pass — this is
**data-contract drift, not a code bug**. Verdict: **Gate 10 PASS** (DB understood + documented) but a
**deploy BLOCKER** is now open — supersedes the Gate 9 "ready" status until re-mapping is approved.
Docs: `docs/database/01..05`, ADR-0011 (Proposed). No schema/seed/sync/app changes made.

---

## 2026-06-15 — Gate 9: Deploy readiness / deploy-target recommendation (no app code changes)

### TD-063 — Recommend self-hosted long-running Node/Docker (adjacent to Agno PostgreSQL)
Gate 9 is a decision gate — **no app code changed, nothing deployed, no prod migrate/seed**. Reviewed
the runtime shape: `/` + `/analytics` are `force-dynamic` (per-request PG reads), `/chat-monitor` is a
`○ Static` shell + two `no-store` API routes, all backed by a **singleton `pg` pool** (`lib/db/client.ts`,
no explicit `ssl`/`max`) against the **same PostgreSQL that hosts read-only `ai.agno_sessions`** (which
holds PII — phone-number session ids). Because that DB is shared + sensitive and the pool is a warm
singleton, the recommended target is a **single long-running Node process (self-host: VPS/Docker/`next
start`) co-located on the Agno DB's private network** for both demo and (hardened) production —
**not** serverless (which would churn per-invocation pools on a shared PII DB and need a pooler +
public DB exposure). Production hardening tracked separately: `output:'standalone'`, read-only `ai.*`
DB role, explicit pool SSL + bounded `max`, PgBouncer at scale, the deferred analytics rollup, and real
auth replacing `DEMO_TENANT_SLUG`. Env contract confirmed minimal + server-only (`DATABASE_URL` secret,
optional `DEMO_TENANT_SLUG`; **no `NEXT_PUBLIC_*`**; `db/client` never imported client-side). Re-ran
typecheck + 106 tests + build green; prod `next start` browser smoke (3 surfaces) clean (only favicon
404). Boundaries re-confirmed: `ai.*` read-only, **no WhatsApp/AI-send code**, no DB writes during
checks, no fake metrics, no transcript duplication. **Verdict: Gate 9 PASS** (ready to deploy after
approval). -> `docs/deployment/01-deploy-readiness.md`, `docs/adr/0010-deployment-target.md` (Proposed).

---

## 2026-06-15 — Slice 7C: Dashboard + Analytics visual/product parity (no new features)

### TD-061 — Dashboard rebuilt as a dense, real-data operations console
The Slice 7B Dashboard was a centered nav "link hub" with no metrics (and `○ Static`). Rebuilt it in
the demo's grammar using the EXISTING real data: `/` is now `force-dynamic` and reads the same
`getAnalyticsData` aggregate + the masked `getConversationList`, then server-renders a `.phead`
(greeting + real-data badge + range segmented toolbar that only sets `?range=`), a dense 8-card KPI
grid (conversations, new/returning, messages, turns+avg, tokens+coverage, cost+coverage, last
activity), two real charts (conversations + tokens per day), a masked Recent-conversations panel, a
Coverage/window panel, and ONE honest "Not tracked in Phase 1" panel. A thin **pure** presenter
(`lib/dashboard/presenter.ts`) shapes the KPIs and exposes `FORBIDDEN_METRIC_KEYS`; a DB-free test
(`presenter.test.ts`, 7 cases) fails CI if any fabricated metric (intent/sentiment/AI-resolution/
priority/orders/exchanges/revenue/CSAT…) is ever emitted. No new data source, no migrations, no
writes; PII stays masked. Added `app/(dashboard)/loading.tsx`. -> `app/(dashboard)/page.tsx`,
`components/dashboard/{dashboard,dashboard-toolbar}.tsx`, `lib/dashboard/presenter.ts(+test)`.

### TD-062 — Shared AreaChart + Analytics two-chart report row
Extracted a dependency-free, hook-free `components/charts/area-chart.tsx` (the demo's gradient-area
grammar) usable in BOTH server and client trees. Analytics swapped its single CSS bar chart for this
component and gained a second real chart (**Tokens per day**, from `series.tokens`), giving the demo's
two-chart report row; all existing analytics logic (ranges incl. Custom, retention clamp, timezone,
KPIs) is unchanged. The Dashboard reuses the same component. Chat Monitor untouched — `/chat-monitor`
stays `○ Static` and still fetches exactly one transcript lazily (verified). 106 tests green;
typecheck + build green. -> `components/charts/area-chart.tsx`, `components/analytics/analytics.tsx`,
`app/(dashboard)/analytics/loading.tsx`.

---

## 2026-06-15 — Slice 7B: UI workspace / layout correction (no new features)

### TD-059 — App shell becomes a fixed viewport frame
Root cause of the document-scroll bug: `app-shell.tsx` used `min-h-screen` + sticky chrome, so a long
transcript grew the whole document and the user scrolled the entire page. Deepened the shell into the
single module that owns the viewport frame: `flex h-dvh overflow-hidden`, stable sidebar/topbar, and
exactly ONE scroll region (`<main className="min-h-0 flex-1 overflow-y-auto">`). The document
(html/body) can no longer scroll (`htmlScrollable === 0`). -> `components/shell/app-shell.tsx`.

### TD-060 — Page layout intents: workspace vs flowing (+ Dashboard/Analytics polish)
Established two page shapes against the new frame. (a) WORKSPACE — Chat Monitor fills `h-full` and
splits into a `grid-rows-[minmax(0,1fr)]` two-pane layout where each pane is
`min-h-0 flex-1 overflow-y-auto`; removed the brittle `calc(100vh-210px)` / `max-h-[75vh]` magic
numbers; the redundant read-only banner was folded into the header to maximise transcript room.
(b) FLOWING — Dashboard + Analytics scroll inside `main`. Dashboard rebuilt as a compact,
vertically-centered honest overview (entry + capability cards; no fake KPIs; removes the ~353px
bottom void). Analytics gained a report toolbar, an `OVERVIEW · <range>` label, and a chart baseline
+ real peak/total captions (no new/fake data). The hybrid lazy Chat Monitor split is preserved
(static shell + lazy `/api/chat-monitor/*` routes; only the selected transcript is fetched). 99
tests + typecheck + build green; scroll behavior proven via runtime DOM assertions; `db:chat:verify`
ALL PASS. -> `app/(dashboard)/chat-monitor/{page,loading}.tsx`,
`components/chat-monitor/chat-monitor.tsx`, `app/(dashboard)/page.tsx`,
`components/analytics/analytics.tsx`.

---

## 2026-06-15 — Slice 7: Demo hardening + Chat Monitor performance

### TD-057 — Chat Monitor lazy split (instant shell + on-demand transcript)
The Chat Monitor wait was caused by the old `getChatMonitorData` reading `runs` for ALL sessions and
parsing EVERY transcript before first paint (~2–3s). Split into a deep two-path module:
`getConversationList` (one indexed dashboard read + a cheap `jsonb_array_length(runs)` aggregate; NO
transcript transfer/parsing; carries a turn count only) and `getConversationTranscript` (parses ONE
tenant/channel-scoped session; IDOR-safe via uuid guard + tenant filter, returns null otherwise).
Exposed as server route handlers `GET /api/chat-monitor/conversations` and `.../[id]/transcript`
(server-only — import `pg` via the service; masked, `cache-control: no-store`). The page is now a
**static shell**; the client lazily fetches list → selected transcript with skeleton / error / retry
and per-id caching. Measured: shell `GET /chat-monitor` ~32ms (was ~2–3s); list ~377ms warm;
single transcript ~459ms warm. Presenter list contract dropped message bodies/counts (turn count
only; `ConversationListPayload` + `TranscriptPayload` replace the old combined `ChatMonitorData`).
`ai.*` read-only; nothing persisted. -> `lib/chat-monitor/{presenter,service}.ts` (+ presenter test),
`app/api/chat-monitor/**`, `components/chat-monitor/chat-monitor.tsx`,
`app/(dashboard)/chat-monitor/{page,loading}.tsx`, `scripts/chat-monitor-verify.ts`.

### TD-058 — Demo hardening: honest Dashboard hub + loading skeletons
Replaced the stale placeholder Dashboard ("Shell preview / connects in later slices / after Slice 6")
with an honest, instant overview that routes to the two live surfaces — **no fabricated metrics, no
slow query**. Added route-level `loading.tsx` skeletons for Chat Monitor + Analytics. Audited: no
Bloomwire/dummy leaks in app/components, masking intact, no fake KPIs/statuses, no console errors
(unrelated favicon 404 aside). Stale status lines refreshed (CONTEXT.md, phase-1, implementation
plan). -> `app/(dashboard)/page.tsx`, `app/(dashboard)/{chat-monitor,analytics}/loading.tsx`,
`CONTEXT.md`, `docs/phases/*`.

---

## 2026-06-15 — Slice 6: Basic Analytics (live, real metrics, tz-aware, retention-capped)

### TD-055 — Pure analytics ranges + aggregation (Slice 6)
`lib/analytics/ranges.ts`: timezone-aware `[from,to)` for Today/3D/7D/14D/30D/This-month/Custom in
the tenant `timezone` (default Asia/Colombo), dependency-free `parseRangeParams` (**Zod not
installed** → pure validation), and a pure `clampToRetention` (ADR-0006; **NULL = unlimited**).
`lib/analytics/aggregate.ts`: pure aggregation of REAL metrics only (ADR-0007) — conversation
volume, new/returning split, turns, displayed messages, token/cost sums with honest **coverage**
counts, activity bounds, and a continuous per-local-day series. TDD: 23 analytics tests (99 total).
-> `lib/analytics/{ranges,aggregate}.ts` (+ tests).

### TD-056 — Server analytics service + server-first UI (Slice 6)
`lib/analytics/service.ts` resolves PEPPER ST. + `whatsapp-main` + `analytics_retention_days`;
universe = the MAPPED `app_conversations` joined by value to `ai.agno_sessions` (**READ-ONLY**: runs
+ `session_data.session_metrics.total_tokens`/`cost`), parses runs in memory for turn/message counts,
clamps the range, and returns an **aggregate, serializable, PII-free** payload (no per-contact ids).
`app/(dashboard)/analytics/page.tsx` is `force-dynamic` + reads `searchParams`; client
`components/analytics/analytics.tsx` holds only range-selection state and pushes it to the URL (the
Server Component recomputes), rendering KPI cards + a **dependency-free** daily bar chart (no
recharts). Verified in-browser (7D/30D switch) + read-only `db:analytics:verify` (live totals ==
independent SQL: 13 convs, 62 turns, 688,192 tokens, $0.053188). `ai.*` untouched; no fabricated
KPIs. -> `lib/analytics/service.ts`, `app/(dashboard)/analytics/page.tsx`,
`components/analytics/analytics.tsx`, `scripts/analytics-verify.ts`, `package.json`.

---

## 2026-06-15 — Slice 5: Chat Monitor (live, read-only, masked)

### TD-053 — Chat Monitor presenter + server data service (Slice 5)
Pure `lib/chat-monitor/presenter.ts` shapes the UI payload: `maskContactId` on every contact,
`last_at`-desc ordering, retention windowing (`isWithinRetention`; **NULL = unlimited**;
out-of-window excluded + counted), and transcript view-state (`ok|empty|restricted`). Server
`lib/chat-monitor/service.ts` resolves PEPPER ST. (Slice 3 resolver) + `whatsapp-main`, reads
dashboard mappings + `ai.agno_sessions` **read-only**, parses transcripts in memory (Slice 4
parser, retention applied), and returns a fully-masked, serializable payload (no raw
contact/session id, no DB handle). TDD: 10 presenter tests (76 total). ->
`lib/chat-monitor/{presenter,service}.ts` (+ `presenter.test.ts`).

### TD-054 — Server-first Chat Monitor page + client UI (Slice 5)
`app/(dashboard)/chat-monitor/page.tsx` is a `force-dynamic` Server Component (so `build` never
opens a DB connection) with error/empty states; client `components/chat-monitor/chat-monitor.tsx`
holds only selection + mobile-toggle state and renders the masked list + live transcript
(Customer/AI bubbles; empty/restricted states; deterministic UTC timestamps to avoid hydration
drift). Read-only `db:chat:verify` proves no raw id leaks into the payload. Verified in-browser
(13 conversations, masked, real transcript, no fabricated metrics); `ai.*` untouched; no transcript
persisted. -> `app/(dashboard)/chat-monitor/page.tsx`, `components/chat-monitor/chat-monitor.tsx`,
`scripts/chat-monitor-verify.ts`, `package.json`.

---

## 2026-06-15 — Slice 4: Agno transcript parser/service + mapping sync

### TD-051 — Read-only Agno transcript parser + shared PII masker (Slice 4)
Added pure, in-memory modules under `base-dashboard-app/lib/agno/`: `parser.ts`
(`parseTranscript` — flatten `runs[].messages[]`, exclude `system`, drop `from_history`,
dedupe by id, retention cutoff [`NULL` = unlimited], order by `created_at`, hide tool
messages + never expose raw tool args, derive message/turn counts + last activity),
`mask.ts` (country-agnostic `maskContactId` for UI **and** logs; never logs a raw phone),
and `mapping.ts` (active exactly-one channel resolution; conversation values with
`agno_session_id` as text). TDD: specs first (RED→GREEN), 21 Agno tests; 66/66 total.
-> `lib/agno/{types,parser,mask,mapping}.ts` (+ tests),
`handoff/2026-06-15-slice-4-agno-parser-mapping.md`.

### TD-052 — Idempotent Agno→dashboard mapping sync applied (Slice 4)
`lib/agno/sync.ts` reads `ai.agno_sessions` (agent `concierge`) **read-only** and upserts
ONLY `app_customers` / `app_customer_identities` / `app_conversations` (find-or-create on the
composite uniques; `first_at`/`last_at` from epoch; `status='open'`). Scripts:
`db:agno:inspect` (read-only, masked), `db:agno:sync`, `db:agno:verify` (read-only). Applied
to the real DB: **13** concierge sessions → 13 conversations/customers/identities; re-run
created **0** (idempotent). Verify ALL PASS; `ai.*` untouched; no forbidden/message tables;
no transcript persisted; ids masked in all output. -> `lib/agno/sync.ts`,
`scripts/agno-{inspect,sync,verify}.ts`, `package.json`.

---

## 2026-06-15 — Slice 3: migration applied + PEPPER ST. seeded + tenant context

### TD-048 — Server-side DB access + idempotent seed + demo tenant resolver (Slice 3)
Added `base-dashboard-app/lib/db/client.ts` (pg Pool + Drizzle from `DATABASE_URL`, masked
logging), `lib/db/seed.ts` (pure `buildSeedPayload()` + idempotent `seedPepperSt(db)` via
`onConflictDoNothing`), and `lib/tenant/context.ts` (Phase-1 demo resolver by slug
`pepper-st`; temporary stand-in for auth). Unit-tested without DB (45/45). Secrets via a
gitignored `.env`; `.env.example` added. -> `lib/{db,tenant}/*`, `scripts/{seed,verify}.ts`,
`handoff/2026-06-15-slice-3-apply-seed-tenant.md`.

### TD-049 — Gate-2 migration applied to the real DB + verified (Slice 3)
Enabled apply (env-gated `dbCredentials` in `drizzle.config.ts`; scripts `db:migrate` /
`db:seed` / `db:verify`; never `push`). Applied `0000` -> created `dashboard` + 6 `app_*`
tables; seeded PEPPER ST. tenant + `whatsapp-main`/`concierge` channel + enterprise
entitlement (retention `NULL` = unlimited). Read-only `db:verify` PASSED all checks; `ai.*`
untouched; no forbidden tables. drizzle-kit created its standard `drizzle.__drizzle_migrations`
ledger (outside `dashboard`). -> `drizzle.config.ts`, `package.json`, `migration-proposal-0000.md`.

### TD-050 — Stale "Skills parked" project docs corrected (no governance duplication)
Replaced the stale "skills empty/parked/optional" wording in `docs/agents/README.md`,
`docs/workflows/gate-0-subagent-readiness.md`, and the stage-1 handoff with a factual
pointer to **root** governance (`AGENTS.md`, `CLAUDE.md`, `docs/agents/skill-alignment.md`,
`.claude/skills/*/SKILL.md`). No skills/governance duplicated into project docs.

---

## 2026-06-15 — Slice 2: Drizzle schema + migration proposal (PROPOSED, not applied)

### TD-046 — Dashboard Drizzle schema authored to match the SQL proposal (Slice 2)
Implemented the dashboard-owned Drizzle schema (`base-dashboard-app/lib/db/schema.ts`):
the 6 `dashboard.app_*` tables exactly matching `02-schema-proposal.sql.md` — slug-unique
tenants (+ `timezone` default `Asia/Colombo`), `(tenant_id, channel_key)` channel
uniqueness, customer-identity uniqueness `(tenant_id, channel_id, external_contact_id)`,
conversation mapping with `agno_session_id` as **text and no FK into `ai.*`**, and 1:1
`app_tenant_entitlements` with **no hidden defaults** (plan_code / is_fully_enabled NOT
NULL; retention nullable; `NULL` = unlimited). TDD: schema-shape + migration specs first
(RED→GREEN), **39/39** tests, typecheck + build green (Node 20).
-> `base-dashboard-app/{lib/db/schema.ts,lib/db/schema.test.ts,lib/db/migration.test.ts}`,
`handoff/2026-06-15-slice-2-drizzle-schema.md`.

### TD-047 — Migration generated for review only; apply is Gate-2-gated (Slice 2)
Used a **generate-only** Drizzle setup: `drizzle.config.ts` has **no `dbCredentials`** and
only a `db:generate` script (no `migrate`/`push`, no DB driver), so no connection can
happen. `drizzle-kit generate` produced `drizzle/0000_perpetual_james_howlett.sql` (DDL
only — no seed). Parity reviewed vs the SQL proposal and packaged for **Gate 2** in
`docs/architecture/migration-proposal-0000.md`. Nothing applied; `ai.agno_*` untouched.
-> `base-dashboard-app/{drizzle.config.ts,drizzle/0000_*.sql,package.json}`,
`architecture/migration-proposal-0000.md`.

---

## 2026-06-15 — Slice 1: app shell + UI foundation (build started)

### TD-044 — Next.js app shell scaffolded (Slice 1; UI-only)
The Phase 1 build began with the app shell in `base-dashboard-app/`: Next.js (App Router) +
TypeScript + Tailwind + shadcn/ui (restyled). Delivered the sidebar + topbar + dashboard
frame and the three approved nav surfaces (Dashboard / Chat Monitor / Analytics);
Chat Monitor + Analytics are placeholders and Dashboard shows honest empty/placeholder
states. No DB, no Drizzle, no migrations, no seed, no Agno reads, no fabricated metrics;
`ai.agno_*` untouched. -> `base-dashboard-app/{app,components,lib}`,
`handoff/2026-06-15-slice-1-app-shell.md`, `phases/phase-1*.md`.

### TD-045 — Prototype tokens carried into Tailwind via CSS variables (resolves tech-stack Q4)
Demo tokens are defined as CSS variables in `app/globals.css` (mapped 1:1 from the
prototype) and referenced from `tailwind.config.ts` `theme.extend`; shadcn primitives are
restyled to those variables, not the default theme. Fonts (Plus Jakarta Sans + JetBrains
Mono) load via a Google Fonts `<link>`. Resolves open question #4 in `05-tech-stack.md`.
-> `base-dashboard-app/{app/globals.css,tailwind.config.ts,lib/tokens.ts}`, `05-tech-stack.md`.

---

## 2026-06-15 — Gate 0 executed: subagent readiness (PASS)

### TD-041 — Gate 0 PASS: global agents present & usable
Verified the **7 global agents** in `.claude/agents/` (`webapp-orchestrator`,
`product-discovery-agent`, `solution-architect-agent`, `prototype-agent`,
`fullstack-builder-agent`, `qa-review-agent`, `handoff-agent`) are present and
well-formed. The earlier "empty `.claude/*`" finding (TD-039) was **stale**. **No
global agents were duplicated or modified.** → `phases/phase-1-implementation-plan.md`,
`docs/agents/README.md`, `handoff/2026-06-15-stage-1-bootstrap.md`.

### TD-042 — PEPPER ST. agent coordination is project-scoped
PEPPER ST.-specific coordination lives under `projects/pepper-st-dashboard/docs/`,
**not** in global `.claude/`: `docs/agents/` (README roster + slice ownership;
`agent-boundaries.md`), `docs/workflows/` (gate-0-subagent-readiness, phase-1-slice,
schema-migration-review, qa-handoff), `docs/templates/` (slice-plan, slice-handoff,
qa-report, migration-proposal). Global `.claude/` stays generic and reusable per the
`AGENTS.md` multi-project rule. → `docs/agents/`, `docs/workflows/`, `docs/templates/`.

### TD-043 — Skills parked
Global `.claude/skills/` contains empty skill subfolders; **no project skills** are
defined for PEPPER ST. Skills are optional and **non-blocking** for Gate 0; revisit
only when a stable convention is confirmed. → `docs/agents/README.md`.

---

## 2026-06-15 — Entitlement defaults removed + Phase 1 implementation plan + subagent gate

### TD-037 — No hidden entitlement defaults (explicit insert at onboarding)
Removed column defaults on `app_tenant_entitlements`: `plan_code` and
`is_fully_enabled` are now `NOT NULL` with **no default** (must be inserted
explicitly); `raw_history_retention_days` / `analytics_retention_days` have **no
default** (omit → `NULL` → unlimited). Avoids baking in a `standard`/30-day pricing
assumption while pricing is parked; any temporary default must be documented as
temporary. → `02-schema-proposal.sql.md`, `01-data-model.md`, `04-multitenancy.md`,
ADR-0006, Workflow 01/05/06, CONTEXT, `product/02-core-flows.md`.

### TD-038 — Phase 1 implementation plan (Slices 0–7)
Added `docs/phases/phase-1-implementation-plan.md`: a **planning-only**, slice-by-slice
build plan (0 readiness · 1 shell · 2 Drizzle schema/migration proposal · 3 seed +
tenant context · 4 Agno parser · 5 Chat Monitor · 6 analytics · 7 demo hardening),
each with goal / owner / files / scope / tests / docs / gate / handoff.
→ `phases/phase-1.md`.

### TD-039 — Subagent readiness is the first pre-build gate (Gate 0)
Before any implementation, `.claude/{agents,workflows,templates,skills}` must be
populated and usable. **Finding (2026-06-15):** these dirs exist but are **empty** →
the `AGENTS.md` agents are not actually available; restoring/creating them is the
first gated step. → `phases/phase-1-implementation-plan.md` (Slice 0),
`phases/phase-1.md` (Gate 0), `AGENTS.md`. **Update (TD-041):** on execution the
global agents were in fact **present & usable**; only project-scoped coordination +
skills remained. **Gate 0 = PASS.**

### TD-040 — Analytics wording finalized (raw access vs analytics detail)
Phase 1 **raw chat access** is controlled by `raw_history_retention_days`; **analytics
detail** by `analytics_retention_days`; `NULL` = unlimited; longer analytics history
needs future rollups / a plan feature. Supersedes the earlier "analytics capped by
`raw_history_retention_days`" wording (TD-024). → `phases/roadmap.md`, ADR-0006,
Workflow 05/06.

---

## 2026-06-15 — Entitlements rename + tenant timezone (pre-Gate 2 cleanup)

### TD-031 — Rename `app_subscription_limits` → `app_tenant_entitlements`
The table represents the tenant's **current access/entitlement** configuration, **not**
a finalized pricing/billing model. Pricing is decided later by the internal team; the
future pricing model is **parked**. → `02-schema-proposal.sql.md`, `01-data-model.md`,
`04-multitenancy.md`, ADR-0002, ADR-0006, Workflow 01/05/06, CONTEXT, README.

### TD-032 — Entitlement fields + 1:1 relationship
Fields: `id`, `tenant_id`, `plan_code` (non-final label, e.g. `standard`/`enterprise`),
`is_fully_enabled`, `raw_history_retention_days`, `analytics_retention_days`,
`created_at`, `updated_at`. **One current row per tenant** (`UNIQUE (tenant_id)`,
**`app_tenants 1───1 app_tenant_entitlements`**); plan/subscription history parked.

### TD-033 — `NULL` retention = unlimited; PEPPER ST. seeded enterprise
Retention columns are **nullable**; CHECKs are `... IS NULL OR ... > 0`. Standard
tenants default to **30**; **`NULL` = unlimited** (enterprise / fully enabled). Seed:
PEPPER ST. = `plan_code='enterprise'`, `is_fully_enabled=true`,
`raw_history_retention_days=NULL`, `analytics_retention_days=NULL`.
→ `02-schema-proposal.sql.md`, ADR-0006, Workflow 01/06, PRD, phase-1.

### TD-034 — `analytics_retention_days` is a separate analytics cap
Analytics detail is capped by `analytics_retention_days` (distinct from raw-history
access); `NULL` = unlimited (no clamp). Replaces the earlier "analytics capped by
`raw_history_retention_days`". → ADR-0006, Workflow 05/06, roadmap.

### TD-035 — Tenant timezone
`app_tenants.timezone text NOT NULL DEFAULT 'Asia/Colombo'` drives the **Today / Month
/ Custom** analytics boundaries (future tenants may be in other countries). **No
locale/currency tables.** → `02-schema-proposal.sql.md`, `01-data-model.md`,
`04-multitenancy.md`, Workflow 01/05, CONTEXT, feature-scope.

### TD-036 — Conversation `status` clarification (PRD)
Do **not** state "status does not exist" generally. Correct: no **Agno-derived**
intent/summary/confidence/priority/business-status is shown; a **dashboard-owned**
conversation `status` exists internally (`open`/`resolved`/`archived`) but Phase 1
does not surface it as a meaningful AI/business signal because it defaults to `open`.
→ `04-prd-first-slice.md`.

---

## 2026-06-15 — Phase 2: live human handover + canonical transcript ownership

### TD-026 — Live WhatsApp human chat + AI→human handover is MANDATORY for Phase 2
Promoted from parked/Phase 4. When the AI **cannot complete a task** it hands over to
a human operator who can **see the conversation**, **see the handover reason**, **take
the next action**, and **reply to the customer** via the WhatsApp-connected dashboard.
→ ADR-0009, Workflow 08, `phases/roadmap.md`, `product/03-feature-scope.md`,
`product/01-users-and-roles.md`.

### TD-027 — Canonical transcript ownership = Agno/WhatsApp pipeline
Exactly **one** canonical transcript, owned **upstream**; the dashboard renders it
**live, read-only** (ADR-0004 holds). To reply, the dashboard **calls the bot/WhatsApp
send API**; the bot persists; the dashboard re-reads. Never a transcript source, never
a writer of `ai.*`. → ADR-0009, ADR-0004.

### TD-028 — Dashboard stores handover/control/send-status METADATA ONLY
Allowed: handover events (reason/direction/actor/time), conversation control/ownership
state, outbound **send status** (keyed by **upstream message id**). **Not** allowed:
message bodies. Human-vs-AI attribution is derived by **correlation**, not duplication.
→ ADR-0009.

### TD-029 — No message duplication without a dedicated ADR
Storing message text (incl. outbound human replies) in `dashboard.*` is **forbidden**
until a separate explicit ADR approves it; the only anticipated trigger is the pipeline
**not echoing** dashboard-sent replies back (preferred fix = the outbound contract).
→ ADR-0009 §D, ADR-0008.

### TD-030 — Phase 2 control-plane schema deferred to a migration gate
The metadata tables (handover events, conversation control, outbound send status) are
**conceptual** now; their DDL is authored in a **Phase 2 schema proposal** and applied
behind its **own gate**. **No tables added now.** → ADR-0009 §E, Workflow 08.

---

## 2026-06-15 — Schema hardening + retention/analytics access semantics

### TD-020 — Audit `updated_at` on conversations & customers
Added `updated_at` to `app_conversations` and `app_customers` (other mutable
tables already had it). Mapping **bumps** a conversation's `updated_at` when it
refreshes `last_at`/`status`. → `architecture/02-schema-proposal.sql.md`,
`architecture/01-data-model.md`, ADR-0003, Workflow 02/04.

### TD-021 — CHECK constraints on enum-like columns
`app_tenants.status` IN ('active','suspended','archived');
`app_tenants.onboarding_status` IN ('pending','in_progress','complete');
`app_conversations.status` IN ('open','resolved','archived');
`app_subscription_limits.raw_history_retention_days > 0` *(later renamed to
`app_tenant_entitlements` and relaxed to `IS NULL OR > 0` — see TD-031 / TD-033)*.
→ `architecture/02-schema-proposal.sql.md`, `architecture/01-data-model.md`, CONTEXT.

### TD-022 — Channel resolution: active + exactly one
Resolving an Agno session to a channel/tenant matches **active** channels only and
must return **exactly one**: 0 → unmapped (skip), >1 → **ambiguous** (skip + masked
warning); **never guess a tenant**. Ambiguity = `app_channels` config error.
→ `architecture/03-agno-mapping.md`, Workflow 02/04/09.

### TD-023 — Retention is an access limit (list + transcript)
Retention gates **access**, not deletion: both the Chat Monitor **list** and the
**transcript** respect the window. A conversation whose `last_at` is older than the
cutoff is out-of-window — not shown as normal history; direct access → **restricted/
empty retention state**. Index rows may still exist. → ADR-0006, Workflow 06,
`phases/phase-1.md`, `product/04-prd-first-slice.md`.

### TD-024 — Phase 1 analytics capped by retention
No analytics rollup table exists yet, so analytics detail is **capped at the
tenant's `raw_history_retention_days`**; ranges are clamped to the window. Longer
historical analytics needs **future rollups / a plan feature**. → ADR-0006,
Workflow 05, `phases/roadmap.md`. **Superseded by TD-034 / TD-040:** analytics detail
is capped by `analytics_retention_days` (a separate knob; `NULL` = unlimited), **not**
`raw_history_retention_days`.

### TD-025 — Seed SQL is a one-time migration seed
The demo seed block is **not rerunnable as-is** (re-run violates
`app_tenants_slug_key`). Documented an **idempotent upsert** variant
(`ON CONFLICT DO NOTHING` / Drizzle `onConflictDoNothing`) as the form the
implementation should use. → `architecture/02-schema-proposal.sql.md`.

---

## 2026-06-15 — Stack lock + schema-proposal corrections

### TD-014 — App stack LOCKED (supersedes TD-012)
**Next.js (latest) + TypeScript + Tailwind + shadcn/ui + Drizzle ORM +
PostgreSQL + Zod.** Migrations are **Drizzle migrations (`drizzle-kit`)** authored
to match the SQL proposal (which stays the **review artifact**); raw `pg` is used
**only** as Drizzle's driver, not as the data-access layer. → ADR-0001,
`architecture/05-tech-stack.md`.

### TD-015 — shadcn/ui must match the demo UI, not override it
The dashboard must visually match the demo closely (colors, layout, spacing,
radius, shadows, typography). Prototype tokens are mapped into the Tailwind theme
and shadcn components are **restyled**; the default shadcn theme is **not**
adopted. → `architecture/05-tech-stack.md`.

### TD-016 — Tenant lifecycle fields
`app_tenants` adds `status` (`active`/`suspended`/`archived`), `onboarding_status`
(`pending`/`in_progress`/`complete`), and `updated_at`. → `architecture/01-data-model.md`,
`architecture/02-schema-proposal.sql.md`.

### TD-017 — Channels keyed by `(tenant_id, channel_key)`
`app_channels` adds a stable `channel_key` (+ `updated_at`); uniqueness is
`(tenant_id, channel_key)` **not** `(tenant_id, type)`, so a tenant may run
**multiple** WhatsApp channels. Source-mapping fields (`source_agent_id`,
`source_team_id`, `external_business_id`, `external_phone_number_id`) confirmed
present; Phase 1 sets only `source_agent_id`. → ADR-0002, ADR-0008.

### TD-018 — Conversation identity + `customer_identity_id`
`app_conversations` adds `customer_identity_id`. Uniqueness is
`(tenant_id, channel_id, agno_session_id)` **only**; `external_contact_id` is
**indexed, not unique** (a contact may own several conversations once sessions
diverge from the phone). → ADR-0003, ADR-0008.

### TD-019 — One current subscription-limits row per tenant
`app_subscription_limits` uses `UNIQUE (tenant_id)` (+ `updated_at`): exactly one
current row per tenant, updated in place. Multi-row plan **history** is parked
(would need a separate history table). → ADR-0006. **Superseded by TD-031** (table
renamed to `app_tenant_entitlements`; the 1:1-per-tenant rule still holds).

---

## 2026-06-15 — Phase 1 docs-first bootstrap

### TD-001 — Read-and-organize, never mutate Agno
Dashboard reads `ai.agno_sessions`; never writes to `ai.*`, never copies raw
messages. → ADR-0001, ADR-0004.

### TD-002 — Same DB, new `dashboard` schema, `app_` prefix
No tenant-specific or channel-specific schemas/tables. No FK from `dashboard.*`
into `ai.*`. → ADR-0001, ADR-0002, `architecture/02-schema-proposal.sql.md`.

### TD-003 — Multi-tenancy mandatory from day one
Shared schema + row-level `tenant_id` on every operational table; auth parked.
Tenant ≠ session; `session_id` never on `app_tenants`. → ADR-0002.

### TD-004 — Conversation grain = one rolling Agno row per phone
One `ai.agno_sessions` row (per phone) = one rolling conversation. Per-visit
splitting parked. → ADR-0003.

### TD-005 — Dual identifiers modelled separately
`agno_session_id` and `external_contact_id` are separate fields (equal in Phase 1
= the phone) so they can diverge without migration. → ADR-0003, ADR-0008.

### TD-006 — Transcript rendered live, cleaned
Flatten `runs[].messages[]`, drop `role=system`, drop `from_history=true`, dedupe
by `id`, order by `created_at`. No transcript storage. → ADR-0004, Workflow 03.

### TD-007 — Show only real data in Phase 1
No fabricated intent/summary/confidence/priority/business-category/issue/
exchange/follow-up/AI-resolved metrics. Nav = Dashboard, Chat Monitor, Analytics;
other prototype screens hidden; visual style kept. → ADR-0007, `product/03-feature-scope.md`.

### TD-008 — PII masking by default
`session_id`/phone is sensitive; masked in UI list views, transcript headers,
exports, and logs. Store real value, mask on read; admin reveal is future. → ADR-0005, Workflow 07.

### TD-009 — Retention at query level (30 days default)
`raw_history_retention_days=30` per tenant; filter transcript messages/runs by
timestamp; never delete `ai.agno_sessions`. → ADR-0006, Workflow 06.

### TD-010 — `app_channels` reserves source-mapping fields
`source_agent_id`, `source_team_id`, `external_business_id`,
`external_phone_number_id`. Demo: `concierge` → PEPPER ST. WhatsApp. → ADR-0002, `architecture/01-data-model.md`.

### TD-011 — Future tenant/source contract required for production
Phone-only global `session_id` is unsafe for multi-tenant SaaS; require Agno
sessions to become tenant/channel-scoped or globally unique (metadata contract
preferred). → ADR-0008, Workflow 09.

### TD-012 — Proposed stack (SUPERSEDED by TD-014)
Originally proposed TypeScript + Next.js + Tailwind + `pg` + **plain SQL
migrations** + `node --test`/Vitest. **Superseded 2026-06-15 by TD-014**: Drizzle
ORM + Drizzle migrations + shadcn/ui + Zod; `pg` demoted to driver only.
→ TD-014, ADR-0001, `architecture/05-tech-stack.md`.

### TD-013 — Schema SQL is a proposal, not applied
`architecture/02-schema-proposal.sql.md` requires a separate migration approval
gate (Gate 2) before any DDL runs. → `phases/phase-1.md`.

---

## Grounding facts (Stage 1 read-only DB inspection, 2026-06-15)

- Schemas: `ai`, `public`. PostgreSQL 16.9. `dashboard` does not exist yet.
- `ai.agno_sessions`: `session_id` (varchar PK) = WhatsApp phone; `session_type`
  NOT NULL (`agent`); jsonb `session_data/.../runs/summary`; `created_at`/
  `updated_at` = **epoch seconds**.
- `metadata` and `summary` are **NULL** on all rows.
- `session_data` = `{ session_state (empty), session_metrics }`;
  `session_metrics` = tokens + cost.
- `runs` = array (1–10, avg 4.7); `runs[].messages[]` = `{role, content, id,
  created_at, from_history, ...}`; `system` repeats per run; `from_history` all
  false in current data.
- Demo volume: 11 sessions, 1 agent (`concierge`), dates 2026-06-11..06-15.

> Inspection was read-only and masked; no `ai.*` mutation; credentials not stored.

---

## Template for new entries

```
## YYYY-MM-DD — <phase/slice>
### TD-NNN — <short title>
<decision in 1–3 sentences> → <ADR/workflow links>
```
