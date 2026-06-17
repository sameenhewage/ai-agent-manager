# 03 — Dashboard Data Contract (Gate 10)

> **CURRENT CONTRACT (2026-06-16, post-Slice 12D-D / ADR-0012 — read this first).** The dashboard owns
> **exactly 4 tables**: `app_tenants`, `app_channels`, `app_conversations`, `app_tenant_entitlements`.
> There is **no `app_customers`, no `app_customer_identities`, no `app_conversations.customer_id`, and no
> `app_conversations.customer_identity_id`** — all dropped in Slice 12D-D. The external contact/user id is
> stored **by value** on `app_conversations.external_contact_id` (TEXT, NOT NULL, **indexed not unique**);
> **one `external_contact_id` may appear in many `app_conversations`**, and **one Agno session → one
> `app_conversations` row**. The contact/customer **registry** is AI-owned (`ai.customers` /
> `ai.agno_sessions.user_id`); the session/transcript source is AI-owned (`ai.agno_sessions` and
> `ai.agno_sessions.runs`). The dashboard duplicates **neither**. **Do not reintroduce a dashboard-side
> customer/identity model.** Sections §4–§5 below are **historical** (pre-11B drift) — see the banner.
>
> **Scope note (Gate V2-DOCS, 2026-06-16):** this file documents the **dashboard-owned
> schema only**. For the **full app DB dependencies** — including the AI-owned `ai.*` tables
> the app reads (`ai.agno_sessions`, `ai.customers`, `ai.agno_metrics`) — see
> [`docs/v2/01-database-inventory.md`](../v2/01-database-inventory.md).

> **⚠ TARGET CHANGE (2026-06-17) — ADR-0016.** This page documents the **current** contract, in which
> **one Agno session → one `app_conversations` row** (`agno_session_id` on the row). The **target**
> (ADR-0016 / `architecture/09`) makes a **conversation = a customer/contact thread** (one row **per
> contact**) and moves `agno_session_id` into a new **`app_conversation_sessions`** table
> (`external_session_id` == `ai.agno_sessions.session_id` by value, **no FK**;
> `unique(tenant_id, provider, external_session_id)`). Boundary becomes
> `tenant_id + business_id + channel_id + external_contact_id`. Migration is **approval-gated / not yet
> applied** — the contract below is still live.

- **Owner:** this app. Schema `dashboard` is the only schema the dashboard writes (via
  `drizzle-kit migrate` + the seed/sync scripts). It stores **mapping + organisation metadata only**
  — never transcript bodies, never anything copied from `ai.*` beyond linking keys/timestamps.
- **Date:** 2026-06-16 · **Status:** schema intact and correct; agent match is now **derived**
  (`agent_id = tenant_id:channel_id`, confirmed); the old `source_agent_id='concierge'` seed + the 13
  mapping rows are **stale** against the migrated Agno (see §4).
- **Gate 12 update (2026-06-16):** Slice 11B **executed** the re-alignment — live data restored
  (mapped 4 / active orphans 0 / **13 orphans archived**, not deleted); all `app_*` tables (**six at the
  time; now 4 after 12D-D / ADR-0012**) + mapping logic re-verify green. `source_agent_id='concierge'` is now a **dead legacy cache** (the agent key is
  derived). §4's "stale/broken" rows describe the **pre-11B** state. See
  `docs/database/07-old-vs-current-db-comparison.md`.
- **Slice 12D-B boundary lock (2026-06-16):** reaffirmed by a read-only audit (TD-070). `dashboard.*`
  stores **mapping/metadata/index only** — **never** transcript message bodies (no
  `app_conversation_messages`, no message index, no content cache). Canonical transcript stays in
  `ai.agno_sessions.runs` (ADR-0004). Grain: **one Agno `session_id` → one `app_conversations` row**
  (`(tenant_id, channel_id, agno_session_id)` unique); **one contact → many sessions → many
  conversations**, all sharing the **same `external_contact_id` value** (indexed, **not** unique). *(**ADR-0016 target:** `app_conversations` = the **customer/contact thread**; `agno_session_id` moves to `app_conversation_sessions.external_session_id` — see the top banner.)* *(12D-B
  originally described this as one shared `app_customer_identities` row; that table was **removed in 12D-D /
  ADR-0012** — the contact is now stored by value, see the next bullet.)* Any future webhook/trigger sync
  updates metadata/index only. Locked by `schema.test.ts`
  (FORBIDDEN tables + grain unique/not-unique/no-content assertions).
- **Slice 12D-D schema simplification (2026-06-16) — ADR-0012:** the dashboard's **customer/identity model
  is removed**. `app_customers` and `app_customer_identities` are **dropped**, as are
  `app_conversations.customer_id` / `customer_identity_id`. The contact lives **only** as
  `app_conversations.external_contact_id` (TEXT, NOT NULL, indexed **not** unique); the AI platform
  (`ai.agno_sessions.user_id` / `ai.customers`) owns the contact registry. **The dashboard now owns exactly
  4 tables** (§1). Migration `drizzle/0001_clumsy_rawhide_kid.sql` applied to the live DB (backup
  `backups/2026-06-16-dashboard-pre-12dd.sql`). §4/§5 below describe the **superseded pre-11B drift**
  (historical).

---

## 1. Tables the dashboard owns

| Table | Purpose | Dashboard writes? | Notes |
|---|---|---|---|
| `app_tenants` | The business/client using the dashboard | Yes (seed) | `slug` unique; status/onboarding/timezone |
| `app_channels` | A tenant's source integration (WhatsApp) | Yes (seed) | `(tenant_id, channel_key)` unique; Agno `agent_id` is **derived** `tenant_id:channel_id`; `source_agent_id` is a legacy cache |
| `app_conversations` | **Mapping/index record for one Agno session** | Yes (sync) | `(tenant_id, channel_id, agno_session_id)` unique; `external_contact_id` TEXT NOT NULL (indexed, **not** unique — the masked-contact source); `status` dashboard-owned; `first_at`/`last_at` cached. **No `customer_id`/`customer_identity_id` (ADR-0012).** |
| `app_tenant_entitlements` | Per-tenant access limits | Yes (seed) | 1:1 with tenant; retention `NULL = unlimited` |

## 2. The cross-schema link contract (by value, no FK)

- `dashboard.app_conversations.agno_session_id` **== (by value)** `ai.agno_sessions.session_id`.
- the Agno **`agent_id`** is **derived** as `app_tenants.id` + `:` + `app_channels.id` (the dashboard computes it; `source_agent_id` is an optional legacy cache, **not** the source of truth).
- `dashboard.app_conversations.external_contact_id` **== (by value)** the contact's WhatsApp id from
  `ai.agno_sessions.user_id` (masked on read; ADR-0012 — there is no separate identity table).

These value-links are how the dashboard joins its mapping to the live AI data. (§4 below records the
pre-11B drift, since corrected by Slice 11B + the 12D-D simplification.)

## 3. What the dashboard owns vs reads

- **Owns (writes to `dashboard.*`):** tenant/channel/entitlement config, conversation mapping/index rows
  (with `external_contact_id` stored **by value**), and the dashboard-only `status`
  (open/resolved/archived) and cached `first_at`/`last_at`. **No customer/identity model (ADR-0012).**
- **Reads only (from `ai.*`):** transcript (`runs[].messages[]`), turn count, token/cost metrics,
  session timestamps. None of this is persisted into `dashboard.*`.

## 4. Drift detected at Gate 10 (seed/mapping now stale) — *historical (pre-11B; corrected since)*

| Link / assumption | Seeded value | Current Agno reality | State |
|---|---|---|---|
| agent match: stored `source_agent_id='concierge'` | `'concierge'` | live `agent_id='<tenant_id>:<channel_id>'` — must be **derived**, not a stored literal | **BROKEN** (0 matches) → fix = derive |
| `app_conversations.agno_session_id` | old phone-style session ids (13) | session_ids are 32-char tokens; old ones gone | **BROKEN** (13 orphans) |
| `external_contact_id == session_id` | phone == session_id | phone now in `user_id`; `session_id` is opaque | **BROKEN** (identity source moved) |
| 6 tables / unique keys / checks | as designed | identical | ✅ intact |
| entitlement (enterprise/unlimited) | NULL/NULL | identical | ✅ intact |

**Consequence:** with the current seed, the dashboard resolves the channel by `source_agent_id =
'concierge'`, which now matches **no live sessions**, so every surface joins to nothing — the 13
conversations render with empty transcripts and zero metrics.

## 5. Required contract corrections (proposed — needs approval; see ADR-0011 / doc 05) — *historical (corrections executed by Slice 11B + 12D-D)*

1. **Agent identity (derived):** stop relying on a stored `source_agent_id` value; **derive**
   `agent_id = "${app_tenants.id}:${app_channels.id}"` in the mapping seam and match live
   `ai.agno_sessions.agent_id` against it (confirmed + live-verified, tenant-first). `source_agent_id`
   stays only as an optional legacy cache.
2. **Contact identity:** treat `ai.agno_sessions.user_id` (phone, PII) as `external_contact_id`, and
   `session_id` purely as the Agno session key (`agno_session_id`). Masking already covers phone
   shapes; the *source field* changes.
3. **Stale data:** decide whether to clear the 13 orphan mapping rows and re-run `db:agno:sync`
   against the corrected mapping (a dashboard-only write — **requires approval**).

No code or data was changed in Gate 10. These are recommendations for a follow-up slice.
