# 06 — Agno v2 Re-alignment Plan (Gate 11A — Design / Approval Only)

- **Project:** pepper-st-dashboard
- **Gate:** 11A — Agno v2 Re-alignment **Design / Approval Gate**
- **Date:** 2026-06-16
- **Status:** Contract **CONFIRMED** (AI dev + live `db:agno:reconfirm`, 2026-06-16):
  **`agent_id = "<app_tenants.id>:<app_channels.id>"`** (tenant-first, single `:`). **Slice 11B** is
  implementing the logic/config + verify hardening below as **code-only**; the **dashboard-only writes**
  (orphan cleanup + `db:agno:sync`, §7) stay **approval-gated** and are **not** executed yet. `ai.*`
  stays read-only. Inputs: `docs/database/01..05`, ADR-0011, current Drizzle schema + services + verify scripts.
- **Product boundary (unchanged):** this dashboard **monitors/reads only**. It does **not** send
  WhatsApp messages or AI replies. Nothing in this plan adds send/reply logic.

> Hard rule for the implementing slice: `ai.*` stays **read-only**; the link to Agno stays
> **by value** (no cross-schema FK); transcripts/memories are **never** persisted.

---

## 1. Live DB contract — reconfirmed (read-only, `db:agno:reconfirm`)

| Concern | Reconfirmed (2026-06-16) |
|---|---|
| `ai.agno_sessions` count | **1** |
| distinct `agent_id` | **1**, composite **`<tenant_id>:<channel_id>`** — 73 chars, single `:`, both halves UUID-shaped |
| `runs[].agent_name` | `PEPPER ST. WhatsApp Concierge` (single value) |
| `session_id` shape | **32-char hex token**, not phone-like |
| `user_id` shape | **11-digit, all-digits, phone-like, 0 nulls** (the contact / PII) |
| token/cost paths | `session_data.session_metrics.{total_tokens,cost}` present |
| message roles | `assistant`, `tool`, `user`, `system` (parser mapping still valid) |
| coverage vs configured agent | configured `source_agent_id='concierge'` → **0** live sessions; **13** dashboard conversations → **0** mapped → **13 orphans** |

**Derivation proven (new at 11B):** the ordering probe returned `strict_tenant_then_channel = 1`,
`strict_channel_then_tenant = 0`, and the live session's `agent_id` equals the **current**
`pepper-st`/`whatsapp-main` `app_tenants.id` + `app_channels.id`. The agent key is therefore
**derivable from our own dashboard rows** — no opaque external value, **no env var**, no `agent_name`
scan. The drift is real and current; the parser/token/cost/role/timestamp assumptions remain valid.

---

## 2. Existing-schema fit analysis (per element)

The v2 contract has **three** distinct identifiers (agent key, opaque session key, contact phone).
The dashboard schema already carries **three distinct columns** for them:

| Agno v2 value | Maps to existing column | Type fit | Change? |
|---|---|---|---|
| agent key = **`${tenant_id}:${channel_id}`** (derived) | computed in the mapping seam from `app_tenants.id` + `app_channels.id`; `app_channels.source_agent_id` demoted to **derived/legacy cache** | ✅ no storage needed | **logic (derive), not stored value** |
| opaque `session_id` | `app_conversations.agno_session_id` (`text`, NOT NULL) + unique `(tenant_id, channel_id, agno_session_id)` | ✅ | **none** |
| contact phone `user_id` | `app_customer_identities.external_contact_id` (`text`) + `app_conversations.external_contact_id` (cached) | ✅ | **none (derivation source changes)** |
| (future) team scope `team_id` | `app_channels.source_team_id` (`text`, already present, unused) | ✅ | none |

Other tables: `app_customers` (no change), `app_tenant_entitlements` (no change). Unique keys/CHECKs
all remain correct under v2.

**Important invariant change:** in v1 `session_id` *was* the phone, so identity↔conversation was 1:1.
In v2 one `user_id` (phone) can own **many** `session_id`s → **1 identity : N conversations**. The
schema already supports this (identity is reused; conversations keyed by `session_id`; `external_contact_id`
is indexed, **not** unique). Only the *verify assumption* must change (see §6).

---

## 3. Decision — **NO migration needed**

The existing `dashboard` schema can represent Agno v2 safely. Re-alignment is a **logic + config**
change behind the existing mapping seam.

Each suggested migration idea is **rejected with a reason** (per gate instruction "do not propose
migration unless there is a real reason"):

| Idea | Verdict | Reason |
|---|---|---|
| `source_session_id` column | ❌ not needed | already represented by `app_conversations.agno_session_id` |
| `source_user_id` column | ❌ not needed | already represented by `external_contact_id` (identity + cached) |
| `source_agent_key` column | ❌ not needed | agent key is **derived** `${tenant_id}:${channel_id}` from existing PKs; `source_agent_id` kept only as a derived/legacy cache (may stay NULL) |
| `source_contract_version` column | ⏸ deferred (optional) | nice for future drift-detection, but not required to restore Phase 1; revisit in Phase 2 |
| explicit `orphaned`/`stale` status | ❌ not needed | orphans can be **archived** via existing `status='archived'` (allowed by CHECK) or deleted; no new column/CHECK change |

> **Sub-decision RESOLVED (AI dev confirmed + live-verified):** the agent filter is the **derived
> composite** `agent_id = "${tenant_id}:${channel_id}"` (proven against live data) — **not**
> `runs[].agent_name`, **not** a stored opaque value. See §5.

---

## 4. Recommended re-alignment approach (implementation plan — for a later, approved slice)

**Design principle (improve-codebase-architecture):** today the `'concierge'` assumption and the
"contact = session_id" rule are a **shallow, leaky seam** scattered across 5 sites. Consolidate the v2
contract into **one module** (`lib/agno/mapping.ts`, the existing seam) — including a single
`deriveExpectedAgentId(tenantId, channelId)` (`= "${tenantId}:${channelId}"`) — so the next
AI-platform change is a one-file edit. Deletion test: removing that module re-scatters the contract
across 5 files → it earns its keep.

### 4.1 Exact change set (no schema migration)

| # | File (current) | Change |
|---|---|---|
| 1 | `lib/agno/types.ts:21-30` | add `user_id?: string \| null`; fix stale comment (`session_id` is no longer the phone) |
| 2 | `lib/agno/mapping.ts:38-40` | `deriveExternalContactId(session)` → return **`session.user_id`** (was `session.session_id`); if `user_id` is null → treat as **unmapped/skip** (never create an empty-contact identity) |
| 3 | `lib/agno/mapping.ts` | add `deriveSessionKey(session)=session.session_id` and the **agent-match predicate** so all callers share one seam |
| 4 | `lib/agno/sync.ts:42` | add `user_id` to the read-only SELECT; map it into `AgnoSession` (`:47-56`) |
| 5 | `lib/agno/sync.ts:132-134` | use `deriveExternalContactId(session)` instead of `session.session_id` for the identity |
| 6 | `lib/agno/sync.ts` | drop the hardcoded `CONCIERGE_AGENT_ID`; derive the agent key via `deriveExpectedAgentId(channel.tenantId, channel.id)` and match live `agent_id` against it |
| 7 | `scripts/agno-sync.ts` | resolve the active channel, derive its expected `agent_id`, pass it to `syncAgentSessions` |
| 8 | `lib/analytics/service.ts` | remove `?? "concierge"` fallback; derive the agent key from `tenantId:channelId` |
| 9 | `lib/chat-monitor/service.ts` | remove `AGENT_FALLBACK="concierge"`; derive the agent key from `tenantId:channelId` |
| 10 | `lib/db/seed.ts` | **no 73-char value to seed** — agent key is derived; keep `source_agent_id` only as an optional derived/legacy cache (may be left NULL) |
| 11 | `scripts/agno-inspect.ts` | repoint to the derived agent key; report orphan/coverage counts |

**Config note (item 10 — UPDATED):** the composite `agent_id` is **derived from our own
`app_tenants.id` + `app_channels.id`**, so there is **nothing environment-specific to seed or env**.
No `PEPPER_ST_SOURCE_AGENT_ID` var; no hardcoded 73-char uuid. `source_agent_id` is demoted to an
optional derived/legacy cache (may stay NULL); the mapping seam is the single source of truth.

**What does NOT change:** `lib/agno/parser.ts` (roles/content/id/created_at/from_history/tokens all
valid), the by-value link, read-only `ai.*`, masking (`maskContactId` already handles phone shapes),
the Drizzle schema, and all UI.

### 4.2 Sequence (all steps approval-gated; none run in this gate)
1. Confirm agent-key strategy with AI dev (§5).
2. Land the code change set (§4.1) + unit tests (pure mapping: `user_id`→contact, `session_id`→key, null `user_id`→skip).
3. Update channel config (`source_agent_id`) — via seed/env, dashboard-only write.
4. Clean up the 13 orphans (§7) — dashboard-only write.
5. Re-run `db:agno:sync` — dashboard-only write.
6. Run hardened verifies (§6) + browser smoke.

---

## 5. AI-dev contract questions (answers CONFIRMED 2026-06-16)

1. Is the composite `agent_id` (`<uuid>:<uuid>`) **stable across deploys/restarts**, or can it change?
2. Is `runs[].agent_name` **stable** or **display-only** (renamable)?
3. Is `user_id` **always** the WhatsApp customer/contact? Can it ever be **null** or a non-phone value?
4. Is `session_id` **stable per conversation/session** (never reused/rewritten)?
5. Can **one `user_id` have multiple `session_id`s** (confirm 1:N contact→session)?
6. Are old sessions **expected to be deleted/reset** during AI-platform changes (as happened here)?
7. **Which table/field is canonical** for live WhatsApp conversation identity — `agno_sessions` (`session_id`/`user_id`), or something else?
8. Is there a **session-level** field to filter a tenant's sessions (so we needn't scan `runs[].agent_name`)?
9. Will `agno_metrics` become **populated and tenant/channel-scoped** (vs agent/team/workflow only)?
10. Are there planned **handover/status/approval** fields (e.g. `agno_approvals`) the dashboard may read later?

**RESOLVED (AI dev, 2026-06-16):** #1/#2/#8 are answered — the agent filter is the **derived
composite** `agent_id = "${tenant_id}:${channel_id}"` (stable because it is built from our own PKs;
proven against live data). We do **not** scan `runs[].agent_name` and do **not** store an opaque
value. #3/#5 confirmed: `user_id` is the WhatsApp contact (11-digit, non-null here) and one `user_id`
may own many `session_id`s (1 identity : N conversations).

---

## 6. Verify-script hardening plan (stop stale mappings false-PASSing)

**Root cause of false-PASS:** `db:agno:verify` only checks internal consistency (never joins to live
`ai.agno_sessions`), and `db:chat:verify` treats a **non-null but empty** transcript as "resolved".
Only `db:analytics:verify`'s independent SQL caught the drift.

| Script | Add | Fail condition |
|---|---|---|
| `agno-verify.ts` | **derived-agent check**: for each active channel, expected `agent_id == "${tenant_id}:${channel_id}"`; assert each live `ai.agno_sessions.agent_id` resolves to a real dashboard tenant+channel pair | **FAIL** if a channel's derived `agent_id` matches **0** live sessions, or a live `agent_id` half is **not** a real tenant/channel id |
| `agno-verify.ts` | live-coverage block: `live_sessions_for_agent`, `mapped`, `orphans` (join `agno_session_id`→`session_id`) | **FAIL** if `conversations>0 AND mapped==0` (all orphaned) |
| `agno-verify.ts:58-61` | replace 1:1 `conv==identities==customers` with v2 invariant | `customers==identities` (1:1) **and** `conversations>=identities` (allow 1:N); FAIL otherwise |
| `agno-verify.ts` | report line | always print `live / mapped / orphan` counts |
| `chat-monitor-verify.ts:101` | distinguish empty vs non-empty transcripts | **FAIL** if `conversations>0` but **every** transcript has `messageCount==0 && turnCount==0` (stale mapping) |
| `chat-monitor-verify.ts` | list turn-sum check | **FAIL** if conversations exist but total `jsonb_array_length(runs)` over mapped sessions is 0 |
| `analytics-verify.ts` | explicit drift assertion | **FAIL** if `totals.conversations>0` but the live-joined SQL universe `==0` (dashboard mappings non-zero yet analytics universe zero) |

Keep all existing masking / IDOR / no-leak / no-fabricated-KPI checks. After re-alignment these should
read `live=1, mapped=1, orphan=0` and PASS.

---

## 7. Dashboard cleanup / resync plan (design only — NOT executed)

1. **Backup/checkpoint (read-only export):** dump the 6 `dashboard.*` tables before any write
   (`pg_dump --schema=dashboard` to a timestamped file, or a SELECT→JSON export). `ai.*` untouched.
   This is the rollback artifact.
2. **Remove the 13 stale mappings** (dashboard-only write, approval-gated). **Recommended: delete**
   (the referenced Agno sessions no longer exist anywhere, so the rows are pure dangling references):
   delete the orphan `app_conversations`, then their now-unused `app_customer_identities` +
   `app_customers`. **Alternative (more conservative): archive** via `status='archived'` (allowed by
   CHECK) — but leaves 13 meaningless rows. Pick one at approval time.
3. **Update channel config** (`source_agent_id`) to the confirmed agent key (§4.1 item 10).
4. **Re-run `db:agno:sync`** (dashboard-only write) → maps the live session(s) using the v2 contract.
5. **Verify row counts:** `live_sessions_for_agent == mapped_conversations`, `orphans == 0`
   (`db:agno:reconfirm` + hardened `db:agno:verify`).
6. **Browser smoke:** Dashboard / Chat Monitor / Analytics show the live session's **real** data
   (non-empty transcript, non-zero KPIs).
7. **Rollback:** restore `dashboard.*` from step-1 snapshot and revert config if mapping is wrong.

---

## 8. Deployment impact

- **Deploy remains BLOCKED.** Gate 9 readiness is **superseded** until Agno v2 re-alignment is
  implemented **and** the hardened verifies + browser smoke confirm live data in Dashboard / Chat
  Monitor / Analytics.
- The Gate 9 infrastructure/runtime/env conclusions (self-host adjacent to the Agno PG) still hold;
  only the data-contract blocker is new.

---

## 9. Risks

- **🔴 Blocker:** until the §4 change set + §7 resync land (approved), all three features render empty;
  must not deploy.
- **✅ Resolved (was 🟠 Major):** agent-key stability is **confirmed** — the key is **derived** from our
  own `app_tenants.id`/`app_channels.id` (`${tenant_id}:${channel_id}`), so it is as stable as our PKs
  and cannot drift to a renamable label or per-deploy value.
- **🟠 Major:** verify scripts currently false-PASS (§6) — until hardened, "green" is not trustworthy.
- **🟡 Minor:** `user_id`-null handling (AI-dev #3) — design skips null-contact sessions; confirm.
- **🟡 Minor:** 1:N identity→session changes the "1:1" mental model in docs/tests; update on implement.
- **🟢 Opportunity (deferred):** `source_contract_version` + `agno_metrics`/`agno_approvals` reads.

---

## 10. Next action requiring product-owner approval

§5 AI-dev questions are **answered** and the contract is **confirmed live**. Slice 11B implements §4.1
(derive-agent-key mapping seam) + §6 verify hardening as **code-only** (no DB writes). The remaining
**approval gate** is the §7 **dashboard-only** write plan: archive the 13 orphans → `db:agno:sync` →
hardened verifies + browser smoke. **No DB writes happen until that plan is approved.**
