## Slice Handoff — Slice 7: Demo Hardening + Chat Monitor Performance

- **Date:** 2026-06-15
- **Owner (global agent):** `fullstack-builder-agent` (QA: `qa-review-agent`, Handoff: `handoff-agent`)
- **Status:** complete — Phase 1 feature-complete. Chat Monitor no longer blocks on a blank page.
- **Related:** ADR-0004 (read-only transcript), ADR-0005 (masking), ADR-0006 (retention),
  ADR-0007 (real data only), Workflow 03 (transcript rendering).

## Priority 1 — Chat Monitor performance/loading UX

**Root cause (diagnosed):** the old `getChatMonitorData` read `runs` (full jsonb) for **every**
session and parsed **every** transcript before the page rendered — a single server `await` that
blocked first paint (~2–3s in dev). The page was a Server Component that waited on all of it.

**Fix — a deep two-path split + lazy client:**
- `getConversationList(db, pool)` — one indexed dashboard read + a cheap `jsonb_array_length(runs)`
  aggregate (the DB returns ints; `runs` bodies never cross the wire; **no parsing**). Returns a
  masked, ordered list with a turn count only.
- `getConversationTranscript(db, pool, id)` — loads ONE conversation (tenant + channel scoped;
  **IDOR-safe**: uuid-guarded, returns `null` for unknown/malformed ids), reads ONLY that session,
  parses in memory with retention applied.
- Server route handlers: `GET /api/chat-monitor/conversations` and
  `GET /api/chat-monitor/conversations/[id]/transcript` (server-only — they import `pg` via the
  service; responses are masked + `cache-control: no-store`).
- The page is now a **static shell** (header + read-only banner) with a `loading.tsx` skeleton; the
  client `<ChatMonitor/>` lazily fetches the list, auto-selects the first conversation, then fetches
  the selected transcript — each with **skeleton / error + retry** states and per-id caching.

## Architecture change summary

- **Server-side direct kept** for Analytics (single aggregate; fast enough) and the cheap list/
  transcript services — DB/Agno access stays server-only.
- **API routes added** specifically to improve *perceived* performance: they let the static shell
  paint immediately and stream the list/transcript in afterwards, instead of one blocking await.
- Presenter contract deepened: `ConversationListPayload` (no message bodies/counts) +
  `TranscriptPayload` replace the old combined `ChatMonitorData`.

## Before / after performance (dev, Node 20.20.2)

| Metric | Before | After |
|---|---|---|
| `GET /chat-monitor` (shell) | ~2–3s (parsed all transcripts) | **~32ms** (static shell) |
| Conversation list | (part of the blocking fetch) | `GET /api/.../conversations` **~377ms** warm |
| Selected transcript | (all parsed up-front) | `GET /api/.../[id]/transcript` **~459ms** warm |
| All transcripts parsed before first paint? | **Yes** | **No** — only the selected one |
| `db:chat:verify` timing | — | list 946ms (incl. cold connect); slowest single transcript 717ms |

**Acceptable for the Phase 1 demo:** yes — first useful paint is immediate; data streams in with
visible skeletons.

## Loading / skeleton UX proof

- `app/(dashboard)/chat-monitor/loading.tsx` — route skeleton (two-pane).
- In-client: `ListSkeleton`, `TranscriptSkeleton`, `DetailSkeleton`, `InlineError` (retry).
- `app/(dashboard)/analytics/loading.tsx` — analytics skeleton.
- Browser: shell + banner appear instantly; list shows skeleton rows then masked conversations;
  selecting a conversation shows a transcript skeleton then the messages.

## PII masking proof

- List + transcript headers show only masked contacts (e.g. `94•••••297`). API **paths** use the
  conversation UUID, never the phone. Server logs route through `maskDbUrl`.
- `db:chat:verify` (read-only) asserts **no raw `external_contact_id` / session id** appears in the
  list payload **or** any transcript payload → PASS.

## Confirmations

- **`ai.agno_*` read-only & untouched** — both services only `SELECT`; zero writes anywhere.
- **No DB writes** in this slice (no `INSERT`/`UPDATE`/`DELETE` added).
- **No new migrations / tables** — schema unchanged (still the 6 `dashboard.app_*`).
- **No transcript duplication** — parsed in memory per request; nothing persisted to `dashboard.*`.
- **No fake KPIs/statuses; no Bloomwire/dummy leaks** (grep clean in `app/` + `components/`).
- **No human reply / WhatsApp send / SSE / post-Phase-1 features.**

## Dashboard / Analytics regression check

- **Dashboard** rebuilt as an honest, instant hub routing to Chat Monitor + Analytics (removed the
  stale "Shell preview / connects in later slices / after Slice 6" copy and the empty "—" cards).
- **Analytics** unchanged and verified live (13 conversations, 65 turns, 166 messages, 756,822
  tokens, $0.0585; range switch works). `db:analytics:verify` remains valid.

## Skills followed

- **`improve-codebase-architecture`** — `.claude/skills/improve-codebase-architecture/SKILL.md` —
  applied the deepening lens (deletion test): the all-in-one fetch was shallow and untestable for
  perf; splitting concentrated the two real concerns (cheap list vs single transcript) behind small
  interfaces.
- **`tdd`** — updated the presenter spec FIRST to the lazy contract (list has no message bodies/
  counts), then refactored to green. 10 presenter tests; 99 total.
- **`review`** — two-axis below.
- **`diagnose`** — root-caused the wait (bulk `runs` transfer + parse) and a dev-only `.next` stale
  chunk (cleared + restarted); production build was always clean.
- **`handoff`** — this doc (repo convention: `docs/handoff/`, not the OS temp dir).

## Review (two-axis + performance)

- **Standards: PASS** — DB stays server-side (routes import `pg` via the service; client bundle has
  no `pg`); read-only `ai.*`; no new deps; tenant scoping + masking upheld; matches conventions.
- **Spec: PASS** — PRD/masking/retention/read-only/real-data honored; list/transcript split as the
  request specified; IDOR-safe.
- **Performance: PASS** — no blank wait (shell ~32ms); list and transcript split and lazy; only the
  selected transcript is parsed.

## Tests / typecheck / build (Node 20.20.2)

- `npm run typecheck` — ✅ clean
- `npm run test` — ✅ **99/99** (13 files; no DB)
- `npm run build` — ✅ `/chat-monitor` now **`○ Static`** (instant shell); `/api/chat-monitor/*` are
  `ƒ Dynamic`; `/analytics` `ƒ Dynamic`. Build opened no DB connection.
- `npm run db:chat:verify` (read-only) — ✅ ALL CHECKS PASSED (split contract, ordering, masking,
  no leaks in list **or** transcripts, no system/tool, IDOR + malformed → null, timings).
- **Browser (Chrome DevTools, :3001):** shell instant; skeleton → list → lazy transcript; masked;
  range/regression on Analytics + Dashboard OK; only console msg = unrelated favicon `404`.

## Risks / follow-ups

- **Analytics still parses transcripts** for the displayed-message count (one server await). It's
  behind a `loading.tsx` skeleton and acceptable at demo volume; the same cheap-SQL treatment (or a
  rollup) is the follow-up if it grows.
- No realtime updates — the list/transcript are fetched on load/selection (no SSE; out of scope).
- Zod still not installed (validation is pure TS) — align with ADR-0001 stack when convenient.
- Cross-tenant isolation / finite-retention live demo still need a second seeded tenant (carried
  from Slices 5–6).
- Dev server is running on **:3001** (a child held :3000 during restart) — stop it when done.

## Gate status

- **Gate 4** (per-slice QA + docs/handoff): satisfied for Slice 7. **Phase 1 build complete** —
  Slices 0–7 all ✅; Gates 0–4 satisfied.

## Suggested skills for the next session

- `review` (full Phase-1 acceptance pass), `handoff` (Phase-1 → Phase-2 entry), and
  `grill-with-docs` / `to-prd` when scoping **Phase 2** (live AI→human handover, ADR-0009).

## Next recommended step

Phase 1 is feature-complete (Dashboard, Chat Monitor, Analytics — all real-data, read-only). Options
for a new session: a **full Phase-1 acceptance review** + optional deploy-target decision, or begin
**Phase 2** discovery (live handover). **Do not start Phase 2 work without explicit direction.**
