## Slice Handoff — Slice 4: Agno transcript parser/service + mapping sync

- **Date:** 2026-06-15
- **Owner (global agent):** `fullstack-builder-agent` (QA: `qa-review-agent`)
- **Status:** complete — parser + mapping sync built, applied to the real DB, verified, idempotent.
- **Workflows:** `02-tenant-channel-customer-conversation-mapping.md`,
  `03-agno-transcript-rendering.md`, `04-agno-session-indexing-mapping.md`,
  `06-retention-access-limit.md`, `07-pii-phone-masking.md`

## What shipped

A server-side, **read-only** Agno transcript parser and an **idempotent** mapping sync.
It reads `ai.agno_sessions` (agent `concierge`), maps each to PEPPER ST. /
`whatsapp-main`, and upserts ONLY dashboard-owned mapping rows
(`app_customers`, `app_customer_identities`, `app_conversations`). Transcripts are parsed
in memory only — **never persisted**; all contact/session ids are masked in output/logs.

## Skills followed

- **`tdd`** — `.claude/skills/tdd/SKILL.md`
  - How: wrote parser/mask/mapping specs **first** (RED — modules missing), then implemented
    to GREEN; covered system-exclusion, flatten, dedupe-by-id, `from_history`, null-safety,
    retention boundary, tool-hiding, masking, channel resolution, conversation values.
  - Proof: `lib/agno/{mask,parser,mapping}.test.ts` = 21 tests; **66/66** unit tests, no DB.
- **`review`** — `.claude/skills/review/SKILL.md`
  - How: reviewed sync against boundaries (read-only `ai.*`, dashboard-only writes, no
    forbidden tables, no transcript persistence) + idempotency; confirmed via `db:agno:verify`.
  - Proof: verify ALL PASS; second sync created 0 rows.
- **`handoff`** — `.claude/skills/handoff/SKILL.md` — this doc + decision log + plan status.
- **`diagnose`** — not needed (no failures; typecheck/test/build/sync all green first try).

## Files created/changed

**Created (`base-dashboard-app/`):**
- `lib/agno/types.ts` — read model for `ai.agno_sessions` (never written).
- `lib/agno/mask.ts` (+ `.test.ts`) — shared PII masker (country-agnostic; log-safe).
- `lib/agno/parser.ts` (+ `.test.ts`) — pure transcript parser (`parseTranscript`, `epochSecondsToDate`).
- `lib/agno/mapping.ts` (+ `.test.ts`) — pure helpers (`resolveChannelForAgent`, `buildConversationValues`, `deriveExternalContactId`).
- `lib/agno/sync.ts` — DB sync: read-only Agno read + idempotent dashboard upserts.
- `scripts/agno-inspect.ts` (read-only), `scripts/agno-sync.ts`, `scripts/agno-verify.ts` (read-only).

**Modified:** `package.json` — `db:agno:inspect` / `db:agno:sync` / `db:agno:verify`.

## Agno parser summary

`parseTranscript(session, { retentionDays, now, includeTool })`: flattens `runs[].messages[]`;
excludes `role='system'`; drops `from_history=true`; dedupes by message `id`; applies
retention cutoff (`raw_history_retention_days`; **NULL = unlimited**); orders by `created_at`
(fallback run/array index); maps roles (`user→customer`, `assistant→bot`, `tool→tool`,
tool **hidden by default** and never exposes raw tool args); derives `messageCount`,
`turnCount` (= `runs.length`), `lastActivityAt`. Null/missing/invalid runs are safe (no crash);
fully-expired retention returns an empty transcript, not an error.

## Mapping sync summary

`syncConcierge(db, pool)`: resolves the **active, exactly-one** channel for `agent_id`
(0 → unmapped, >1 → ambiguous; never guesses a tenant), then per session find-or-creates
customer + identity (unique `tenant_id+channel_id+external_contact_id`) and conversation
(unique `tenant_id+channel_id+agno_session_id`), refreshing `first_at`/`last_at`,
`status='open'`. `agno_session_id` stored as plain **text** (no FK into `ai.*`). Idempotent.

## Read-only Agno inspect (masked)

`db:agno:inspect`: total Agno sessions **13**; matching `agent_id='concierge'` **13**;
sample session ids (MASKED): `94•••••297, 94•••••273, 94•••••563, 94•••••815, 94•••••525`.
No full phone/session id printed.

## Dashboard mapping write summary

Sync **run 1**: considered 13, mapped 13, customersCreated 13, identitiesCreated 13,
conversationsCreated 13, conversationsUpdated 0.

## Idempotency verification

Sync **run 2**: customersCreated 0, identitiesCreated 0, conversationsCreated 0,
conversationsUpdated 13 → **no duplicates**. Verify: 13 conversations / 13 customers /
13 identities (1:1).

## Boundary confirmations

- **`ai.agno_*` read-only & untouched** — sync only `SELECT`s `ai.agno_sessions`; verify
  shows no `app_*` objects in the `ai` schema.
- **No forbidden tables / no transcript-message table** — `dashboard` still has exactly the
  6 tables; `app_conversation_messages` / `app_analytics_daily` / pricing / auth absent.
- **No transcript duplication** — messages parsed in memory only; nothing persisted.
- **PII masked** — single `maskContactId` util for UI + logs; raw ids never logged.
- **No Chat Monitor / Analytics UI; no fabricated metrics.** Slice 5 not started.

## Tests / typecheck / build (Node 20.20.2)

- `npm run typecheck` — ✅ clean
- `npm run test` — ✅ **66/66** (10 files; +21 Agno unit tests; no DB)
- `npm run build` — ✅ 6 routes
- `db:agno:inspect` / `db:agno:sync` ×2 / `db:agno:verify` — ✅ applied + idempotent + verified

## Risks / follow-ups

- **Find-or-create** is sequential (Phase 1 scale, 13 sessions); a rare race could orphan a
  customer if two syncs ran concurrently — acceptable now, revisit if sync is parallelized.
- Retention is applied at **read** (parser) per ADR-0006; sync indexes all sessions
  regardless (mapping rows may exist out-of-window; access is gated on read).
- `agno_session_id == external_contact_id` today; modelled separately for ADR-0008 divergence.

## Gate status

- **Gate 4** (per-slice QA + docs/handoff): satisfied for Slice 4. Slices 0–3 ✅; Gate 2 ✅.

## Next allowed step

**Slice 5 — Chat Monitor** (tenant-scoped conversation list ordered by `last_at`, + live
read-only transcript via `parseTranscript`, retention-gated list/access, masked). **Do not
start Slice 5 until directed.**
