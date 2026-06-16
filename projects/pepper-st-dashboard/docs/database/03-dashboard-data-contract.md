# 03 — Dashboard Data Contract (Gate 10)

- **Owner:** this app. Schema `dashboard` is the only schema the dashboard writes (via
  `drizzle-kit migrate` + the seed/sync scripts). It stores **mapping + organisation metadata only**
  — never transcript bodies, never anything copied from `ai.*` beyond linking keys/timestamps.
- **Date:** 2026-06-16 · **Status:** schema intact and correct; agent match is now **derived**
  (`agent_id = tenant_id:channel_id`, confirmed); the old `source_agent_id='concierge'` seed + the 13
  mapping rows are **stale** against the migrated Agno (see §4).
- **Gate 12 update (2026-06-16):** Slice 11B **executed** the re-alignment — live data restored
  (mapped 4 / active orphans 0 / **13 orphans archived**, not deleted); all six `app_*` tables + mapping
  logic re-verify green. `source_agent_id='concierge'` is now a **dead legacy cache** (the agent key is
  derived). §4's "stale/broken" rows describe the **pre-11B** state. See
  `docs/database/07-old-vs-current-db-comparison.md`.

---

## 1. Tables the dashboard owns

| Table | Purpose | Dashboard writes? | Notes |
|---|---|---|---|
| `app_tenants` | The business/client using the dashboard | Yes (seed) | `slug` unique; status/onboarding/timezone |
| `app_channels` | A tenant's source integration (WhatsApp) | Yes (seed) | `(tenant_id, channel_key)` unique; Agno `agent_id` is **derived** `tenant_id:channel_id`; `source_agent_id` is a legacy cache |
| `app_customers` | A tenant-scoped end customer | Yes (sync) | `display_name` nullable (Agno has no name) |
| `app_customer_identities` | External contact id per channel | Yes (sync) | `(tenant_id, channel_id, external_contact_id)` unique |
| `app_conversations` | **Mapping record for one Agno session** | Yes (sync) | `(tenant_id, channel_id, agno_session_id)` unique; `status` dashboard-owned; `first_at`/`last_at` cached |
| `app_tenant_entitlements` | Per-tenant access limits | Yes (seed) | 1:1 with tenant; retention `NULL = unlimited` |

## 2. The cross-schema link contract (by value, no FK)

- `dashboard.app_conversations.agno_session_id` **== (by value)** `ai.agno_sessions.session_id`.
- the Agno **`agent_id`** is **derived** as `app_tenants.id` + `:` + `app_channels.id` (the dashboard computes it; `source_agent_id` is an optional legacy cache, **not** the source of truth).
- `dashboard.app_customer_identities.external_contact_id` **== (by value)** the contact's WhatsApp id.

These three value-links are how the dashboard joins its mapping to the live AI data. **All three are
currently mis-aligned with the migrated Agno** (see §4).

## 3. What the dashboard owns vs reads

- **Owns (writes to `dashboard.*`):** tenant/channel/entitlement config, customer/identity mapping,
  conversation mapping rows, and the dashboard-only `status` (open/resolved/archived) and cached
  `first_at`/`last_at`.
- **Reads only (from `ai.*`):** transcript (`runs[].messages[]`), turn count, token/cost metrics,
  session timestamps. None of this is persisted into `dashboard.*`.

## 4. Drift detected at Gate 10 (seed/mapping now stale)

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

## 5. Required contract corrections (proposed — needs approval; see ADR-0011 / doc 05)

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
