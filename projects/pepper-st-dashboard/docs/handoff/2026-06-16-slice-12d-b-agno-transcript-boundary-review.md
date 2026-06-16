## Slice Handoff — Slice 12D-B: Agno Transcript Boundary Review / Lock

- **Date:** 2026-06-16
- **Owner (global agent):** `qa-review-agent` (review) + `fullstack-builder-agent` (lock-tests) +
  `handoff-agent` (this doc)
- **Type:** **Architecture boundary review/lock — NOT feature work, NOT Slice 12C.** No migrations, no new
  tables, no `ai.*`/`dashboard.*` writes, no seed/sync/archive, no webhook impl, no realtime, no UI work.
- **Status:** complete — **PASS**. All 12 review goals confirmed; no boundary bug; boundary locked by 3
  new schema tests + docs.
- **Trigger:** AI-platform clarification — `ai.agno_sessions.runs` is the actual transcript; a returning
  customer gets a **new** `session_id`, so one mobile can own **many** Agno sessions.
- **Related:** ADR-0003 (grain, now carrying a v2 reaffirmation), ADR-0004 (read-only transcript),
  ADR-0011 (v2 identity), TD-070, `docs/architecture/08` §5, `docs/database/02`+`03`, Slice 12D handoff.

## Boundary decision (LOCKED)

- **Actual chat messages are NOT stored in the dashboard schema.** `dashboard.*` holds mapping/metadata
  only.
- **`ai.agno_sessions.runs` is the canonical transcript source.** The dashboard renders it live,
  read-only, and never persists it.
- **`app_conversations` is an index/metadata record only** — it links to Agno by value via
  `agno_session_id` (TEXT, no FK into `ai.*`) and caches `first_at`/`last_at`/`status`. No message bodies.
- **The same customer can have multiple Agno sessions** (`user_id` is stable; `session_id` is new per
  conversation).
- **The same customer identity can have multiple app conversations** — one
  `app_customer_identities` row → many `app_conversations` rows.
- **A future webhook/trigger sync updates metadata/index only** — it must never copy `runs[].messages[]`.
- **No message index / content cache / `app_conversation_messages` table was added** (and none is
  proposed; a content store would require a new ADR superseding ADR-0004 — the conditional Slice 12G).

## Relationship contract (verified in code + schema)

```
app_customer_identities  1 ──< many  app_conversations  1 ── 1  ai.agno_sessions   (runs = transcript)
   unique:(tenant,channel,external_contact_id)   unique:(tenant,channel,agno_session_id)   PK: session_id
```

## Skills followed

- **`review`** (two-axis Standards + Spec) — primary lens for the audit.
- **`improve-codebase-architecture`** — boundary/seam vocabulary; confirmed the read-only Agno seam holds.
- **`tdd`** — added DB-free **lock-tests** that encode the grain invariants (regression guards).
- **`handoff`** — this doc. (`diagnose` not needed — no failures.)

## Files / code / docs inspected

- **Schema:** `lib/db/schema.ts` (6 tables), `lib/db/schema.test.ts`, `lib/db/migration.test.ts`.
- **Sync/mapping:** `lib/agno/sync.ts`, `lib/agno/mapping.ts` (+ `mapping.test.ts`), `lib/agno/types.ts`.
- **Chat Monitor:** `lib/chat-monitor/service.ts`, `lib/chat-monitor/presenter.ts` (+ `presenter.test.ts`),
  `app/api/chat-monitor/conversations/route.ts`, `app/api/chat-monitor/conversations/[id]/transcript/route.ts`.
- **Analytics:** `lib/analytics/service.ts`, `lib/analytics/universe.ts` (+ `universe.test.ts`),
  `lib/analytics/aggregate.ts`. **Parser/mask:** `lib/agno/parser.ts`, `lib/agno/mask.ts`.
- **Verifiers:** `scripts/agno-verify.ts`, `scripts/chat-monitor-verify.ts`, `scripts/analytics-verify.ts`,
  `scripts/agno-reconfirm.ts`.
- **Docs:** `CONTEXT.md`, `docs/database/02`+`03`+`07`, `docs/architecture/08`, ADR-0003/0004/0011,
  `docs/phases/phase-1-post-acceptance-hardening.md`, `docs/changelog/technical-decision-log.md`.

## Review goals — findings (all PASS)

1. **No dashboard table stores chat content** — `app_conversations` columns are id/tenant/customer/
   identity/channel/`agno_session_id`(text)/`external_contact_id`/status/first_at/last_at/timestamps. No
   `runs`/`messages`/`content`. PASS.
2. **No `app_conversation_messages`** — only 6 tables; it is in `schema.test.ts`'s FORBIDDEN list and
   asserted absent; `db:agno:verify` confirms "no forbidden / transcript-message tables." PASS.
3. **Transcript reads from `ai.agno_sessions.runs`** — `getConversationTranscript` selects `runs` and
   parses in memory; never persisted. PASS.
4. **Analytics parses `runs` only after narrowing via `app_conversations`** — Slice 12D universe =
   `app_conversations` (tenant/channel/`status!='archived'`/`last_at` range) → `session_id = ANY($ids)`
   PK fetch → parse. PASS.
5. **One row per `agno_session_id`** — `buildConversationValues` keys on `session_id`; conversation
   lookup/insert + unique `(tenant,channel,agno_session_id)`. PASS.
6. **Same mobile → many conversations** — `external_contact_id` indexed, **not** unique. PASS.
7. **Identity reuse** — `findOrCreateIdentity` find-or-create on `(tenant,channel,external_contact_id)`;
   `db:agno:verify` shows 1 identity : N conversations (15 identities / 17 conversations). PASS.
8. **Separate conversation per new `session_id`** — sync looks up by `agnoSessionId`, inserts when absent.
   PASS.
9. **Archived v1 excluded** — chat list + analytics filter `status != 'archived'`; verifiers show active
   orphans 0 / archived 13. PASS.
10. **No session-merge path** — conversation identity is strictly the session triple; nothing attaches a
    session to an existing conversation by phone/identity. PASS.
11. **Docs say metadata-only** — ADR-0003 v2 note, `docs/architecture/08` §5 boundary lock,
    `docs/database/02`+`03`. PASS.
12. **No raw mobile / no Agno session token in client payloads** — list/transcript expose
    `maskContactId(...)` + internal conversation UUID only; `presenter.test.ts` asserts the raw phone is
    absent; `db:chat:verify` "no raw id leaks", IDOR-safe. PASS.

## Bugs found

**None.** The code already enforces the boundary correctly. (Minor non-blocking observation: the **sync**
path `readSessionsByAgent` still `SELECT`s `runs` it does not persist or need — a sync-only efficiency nit,
out of scope here; sync was not run.)

## Code fixes made

**None** (no over-engineering — the implementation is correct).

## Tests added/updated

3 DB-free **lock-tests** in `lib/db/schema.test.ts` (`app_conversations` describe block):
- unique on `(tenant_id, channel_id, agno_session_id)` — one conversation per Agno session (no merging);
- `external_contact_id` is **not** part of any unique constraint — one contact → many conversations;
- no transcript/message-content column exists (canonical transcript stays in `ai.*`).
Schema suite **16 → 19**; total **123 → 126**.

## Checks

- `npm run typecheck` — ✅ clean.
- `npm run test` — ✅ **126/126** (15 files).
- `npm run db:agno:reconfirm` — ✅ no writes; tenant-first composite confirmed; 5 live sessions.
- `npm run db:agno:verify` — ✅ ALL PASS (1 identity : N conversations — 15/17; 6 tables; no
  transcript-message tables; live 5 / mapped 4 / archived 13 / active orphans 0).
- `npm run db:chat:verify` — ✅ ALL PASS (masked, no raw id leaks, IDOR-safe, no system/tool, non-empty 4/4).
- `npm run db:analytics:verify` — ✅ ALL PASS (parity exact: conv 4 / turns 30 / tokens 648,405 /
  cost $0.065330944; universe 4 fetched/parsed).
- `npm run build` — **not run** (no shipped/production code changed; test-only addition).
- **Not run (forbidden):** `db:migrate`, `db:seed`, `db:agno:sync`, `db:agno:archive-orphans`, any write.

## PII / security confirmation

Client payloads carry only the **masked** contact (`94•••••784`) + the **internal conversation UUID**;
**no** raw mobile and **no** Agno `session_id` token ever leave the server. Transcript API is tenant/
channel-scoped (IDOR-safe; unknown/malformed id → null). Analytics is aggregate/PII-free. Error logs use
`maskDbUrl()`. No raw PII in any doc or output.

## Verdict

**PASS** — the Agno transcript boundary is correct and now documented + test-locked. Messages are not
duplicated; sessions are not merged; one contact correctly maps to many conversations via one identity.

## Next recommended step

**Slice 12C — filter / loading UX polish** (per-widget `<Suspense>` streaming + localized pending; this
also delivers Slice 12D's deferred API split). **Not started** — requires explicit per-slice approval.

## Stop

Review complete. **Stopping here — Slice 12C is NOT started.**
