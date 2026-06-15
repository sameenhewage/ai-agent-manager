## Slice Handoff — Slice 5: Chat Monitor (live, read-only, masked)

- **Date:** 2026-06-15
- **Owner (global agent):** `fullstack-builder-agent` (QA: `qa-review-agent`)
- **Status:** complete — Chat Monitor live on real data; verified in-browser + read-only script.
- **Delivers:** `docs/product/04-prd-first-slice.md` (the first vertical slice).
- **Related:** ADR-0004 (read-only transcript), ADR-0005 (masking), ADR-0006 (retention),
  Workflows 02/03/06/07.

## What shipped

The Phase 1 **Chat Monitor**: a tenant-scoped conversation list + live, read-only transcript
for PEPPER ST., built **server-first**. Data is read from the dashboard mapping tables and
`ai.agno_sessions` (READ-ONLY), transcripts are parsed **in memory** (never persisted), all
contact/session ids are **masked**, and retention is applied at read time.

## Skills followed

- **`tdd`** — `.claude/skills/tdd/SKILL.md` — wrote the pure presenter spec first (RED: ordering,
  masking, empty list, retention windowing, transcript view-states), then implemented to GREEN.
  *Proof:* `lib/chat-monitor/presenter.test.ts` = 10 tests; **76/76** total, no DB.
- **`review`** — `.claude/skills/review/SKILL.md` — reviewed boundaries (read-only `ai.*`, no
  transcript persistence, masked payload, no fabricated fields) + the client/server split (no
  `pg` in the client bundle). *Proof:* `db:chat:verify` ALL PASS; build shows `/chat-monitor` as
  dynamic with no DB access at build.
- **`handoff`** — `.claude/skills/handoff/SKILL.md` — this doc + decision log + phase status.
- **`diagnose`** — not needed (green throughout; the one console `404` is an unrelated favicon).

## Files created/changed

**Created (`base-dashboard-app/`):**
- `lib/chat-monitor/presenter.ts` (+ `presenter.test.ts`) — pure UI shaping (mask, order, retention, view-state).
- `lib/chat-monitor/service.ts` — server data flow (dashboard + `ai.agno_sessions` read-only → masked payload).
- `components/chat-monitor/chat-monitor.tsx` — client component (selection + mobile toggle only).
- `scripts/chat-monitor-verify.ts` — read-only verification (no raw id leak proof).

**Modified:**
- `app/(dashboard)/chat-monitor/page.tsx` — server page (`force-dynamic`) + error/empty states.
- `package.json` — `db:chat:verify` script.

## Chat Monitor UI summary

Two-pane responsive layout matching the Slice 1 shell (rose accent, violet AI, WhatsApp green):
left **conversation list** (masked contact, last activity, turn/msg counts), right **detail** with
a read-only **transcript** (Customer left / AI-agent right bubbles). A read-only banner states
transcripts are never stored and contacts are masked, plus the retention window. States: list
**empty**, transcript **empty**, transcript **restricted** (out-of-window), page **error**, and a
mobile back button. **No** fabricated intent/priority/sentiment/resolution/conversion fields.

## Server-side data flow summary

`page.tsx` (Server Component, `force-dynamic`) → `getChatMonitorData(getDb(), getPool())`:
resolves PEPPER ST. (Slice 3 resolver) + the active `whatsapp-main` channel + entitlement
(`raw_history_retention_days`), loads `app_conversations` for tenant+channel, reads
`ai.agno_sessions` for the channel agent **read-only**, parses each transcript in memory
(retention applied), and returns a **fully-masked, serializable** payload. The client receives
only masked strings + counts — **no DB handle, no raw contact/session id**.

## Transcript rendering summary

Uses the Slice 4 `parseTranscript`: excludes `role='system'`, drops `from_history=true`, dedupes
by message `id`, orders by `created_at`, hides `tool` messages by default (raw tool args never
shown), and applies the retention cutoff (**`NULL` = unlimited**). The view shows real message
content, derived **turn**/**message** counts, and last activity (deterministic UTC timestamps).

## PII masking proof

Single shared `maskContactId` (ADR-0005) used for every contact in list + detail (e.g.
`94•••••273`). `db:chat:verify` loads the exact client payload, fetches the raw
`external_contact_id`/`agno_session_id` values, and asserts **none appear** in the serialized
payload → PASS. Browser snapshot shows only masked ids; server logs route through `maskDbUrl`.

## Retention behavior summary

Read-time access limit (ADR-0006). PEPPER ST. is enterprise/unlimited (`NULL`) → nothing excluded
(13/13 shown, 0 restricted). The windowing logic is implemented + unit-tested: a finite
`raw_history_retention_days` excludes out-of-window conversations from the list (counted as
`restrictedCount`) and renders a **restricted** state on direct access; old messages are dropped
from transcripts. `ai.agno_sessions` is never modified or deleted.

## Boundary confirmations

- **`ai.agno_*` read-only & untouched** — service only `SELECT`s `ai.agno_sessions`; no writes anywhere.
- **No transcript duplication** — parsed in memory only; no message table; nothing persisted to `dashboard.*`.
- **No forbidden tables** — Slice 5 adds **no** tables/migrations (still the 6 `dashboard.app_*`).
- **No human reply / no WhatsApp send / no Analytics / no SSE.** Slice 6 not started.

## Tests / typecheck / build / verification (Node 20.20.2)

- `npm run typecheck` — ✅ clean
- `npm run test` — ✅ **76/76** (11 files; +10 presenter; no DB)
- `npm run build` — ✅ `/chat-monitor` is `ƒ (Dynamic)`; build opened no DB connection
- **Browser (Chrome DevTools):** `/chat-monitor` loads 13 masked conversations ordered by last
  activity; opening one renders the real transcript (11 turns / 24 msgs), read-only badges/banner,
  no full numbers; only console message is an unrelated favicon `404`.
- `npm run db:chat:verify` (read-only) — ✅ ALL CHECKS PASSED (no raw id leak; no system/tool msgs).

## Risks / follow-ups

- Whole-session transcripts are passed to the client (fine at 13 sessions); revisit pagination /
  per-conversation fetch + SSE at larger scale (Phase 2).
- Message **content** is shown verbatim (the actual chat); identifier masking covers the PII
  requirement — content-level phone scrubbing is out of scope for Phase 1.
- Dev server may still be running locally (started for the browser check) — stop it when done.

## Gate status

- **Gate 4** (per-slice QA + docs/handoff): satisfied for Slice 5. Slices 0–4 ✅; Gate 2 ✅.

## Next allowed step

**Slice 6 — Basic analytics**: timezone-aware date ranges; **real** metrics only (volume, turns,
tokens, cost from `ai.agno_sessions`); capped by `analytics_retention_days` (`NULL` = unlimited);
no rollup table; no fake KPIs. **Do not start Slice 6 until directed.**
