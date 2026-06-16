# ADR-0015 — Multi-business / branch / channel / conversation model (the dashboard hierarchy contract)

- **Status:** **Accepted as the architecture contract (target model).** Documentation-only finalization
  gate — **no schema migration, no code, no `ai.*` change, no commit/push in this gate.** Schema
  migration + onboarding + realtime-scope + UI-filter implementation are **approval-gated** and begin
  only after this contract is approved.
- **Date:** 2026-06-16
- **Originating input:** `docs/main-stratergy.md` (product strategy draft). Authoritative, structured
  contract: this ADR + `docs/architecture/09-multi-business-branch-channel-strategy.md`.
- **Relation to prior ADRs:**
  - **Extends ADR-0002** (multi-tenancy = shared `dashboard` schema, row-level scoping) — adds
    `business_id` and optional `location_id` as additional row-level scopes.
  - **Supersedes the "exactly 4 tables" consequence of ADR-0012** (the dashboard schema grows to the
    **7 core tables** below) **while PRESERVING ADR-0012's principles**: contact stored **by value**
    (no dashboard-side customer/identity table), and the grain lock.
  - **Preserves ADR-0003** (grain: one Agno `session_id` = one conversation), **ADR-0004** (read-only
    canonical transcript in `ai.agno_sessions.runs`; no message table), **ADR-0005** (PII masking).
  - **Extends ADR-0014** (realtime): browser transport stays **SSE**; the in-process polling detector
    stays the current detector; the **event contract grows** to carry **scope ids + safe deltas**, and
    the in-memory bus **may later be backed by** a durable `app_realtime_outbox`. Agno **webhook**
    remains the future-preferred detector.
  - **Relates to ADR-0008** (future Agno session/source contract) and **ADR-0009** (Phase-2 human
    handover — still the only thing that would justify WebSocket).

## Context

The dashboard was modelled as **`tenant → channel → conversation`**, with **`tenant ≈ business`**. That
collapses three distinct real-world levels and blocks larger customers:

- a **tenant** is the SaaS **account/billing/owner** boundary, but a tenant may run **several
  businesses/brands** (e.g. *Sameen Group* → Bakery, Cafe, Catering);
- a **business** may operate **many branches/locations** (Colombo, Kandy, Galle), or be online-only;
- a **channel** (WhatsApp, Instagram, Facebook, Website) may be **branch-specific** or **shared** across
  the whole business, and the branch may only become known **after** the conversation starts.

The old model also stored the platform **name** as if it were the provider id, and hard-wired the Agno
`agent_id` shape into mapping logic — both block multi-channel / multi-provider growth.

This must work for **PEPPER ST. today** (single business, possibly no branches) **and** for franchises,
bakery chains, supermarkets, and multi-brand groups **later**, **without re-architecting**.

## Decision

Adopt the hierarchy as the **official contract**:

```txt
Tenant
  → Business / Brand
      → Location / Branch        (OPTIONAL)
          → Channel
              → Conversation
                  → AI / Agno Session   (external, read-only)
```

**Definitions (canonical — see `CONTEXT.md`):**

```txt
Tenant       = SaaS account / billing / owner boundary
Business     = a brand, shop, or business line inside a tenant
Location     = a branch / store / outlet / pickup location under a business (OPTIONAL)
Channel      = a customer entry point: WhatsApp, Instagram, Facebook, Website, …
Conversation = one customer chat
Agno Session = AI session / source-of-truth history (external, read-only)
```

### D1 — Tenant ≠ Business (one tenant → one *or many* businesses)
A tenant **starts with one default business** created at onboarding (so single-business customers stay
simple), but the schema **must not assume `tenant = business`**. A tenant can add more businesses later
without changing the architecture. A business belongs to exactly one tenant.

### D2 — Business → zero/one/many Locations (branch is OPTIONAL)
A business may have **0, 1, or many** locations. `location_id = NULL` means **"not applicable or not
known yet"**, *not* "branches are ignored". Online-only businesses and shared channels legitimately
carry `NULL`.

### D3 — Channel = a real external account; `type` ≠ `external_channel_id`
A business or branch may have **many channels**. **Each real external account/number/page/widget is its
own `app_channels` row.** Store the **platform** and the **provider id separately**:

```txt
app_channels.type                = whatsapp | instagram | facebook | website | …
app_channels.external_channel_id = the provider-side id   (NOT the platform name)
```

Examples: `type=whatsapp` → `external_channel_id = Meta phone_number_id`; `type=instagram` →
IG business-account id; `type=facebook` → FB page id; `type=website` → widget/site id. **Never** store
`external_channel_id = "whatsapp"`.

### D4 — Branch-aware routing is a PREMIUM capability
- **Basic:** one central business inbox; branch captured **if** known; no advanced routing.
- **Premium:** route conversations to the correct branch; branch-specific inbox, analytics, staff
  permissions, AI context, and stock/offers/pickup/delivery handling.
- **Branch resolution** sources (record `location_source` + `location_confidence`): branch-specific
  channel · branch-specific QR/link · customer selection · AI asking · message text · delivery address ·
  customer history · manual staff correction.

### D5 — Target dashboard-owned schema (7 core tables)

```txt
dashboard.app_tenants
dashboard.app_businesses          (NEW)
dashboard.app_locations           (NEW)
dashboard.app_channels            (+ business_id, + location_id NULLABLE, + type, + external_channel_id)
dashboard.app_conversations       (+ business_id, + location_id NULLABLE, + location_source/confidence)
dashboard.app_ai_agent_bindings   (NEW — maps scope ⇄ external AI/Agno agent id)
dashboard.app_realtime_outbox     (NEW — safe realtime events for durable SSE delivery/recovery)
```

Optional later (only when staff permissions ship): `app_users`, `app_user_business_access`,
`app_user_location_access`, `app_user_channel_access`. `app_tenant_entitlements` remains for
plan/entitlement config.

### D6 — Conversation ownership (hard rule)
Every conversation **MUST** carry `tenant_id`, `business_id`, `channel_id`. It **MAY** carry
`location_id = NULL` until the branch is resolved (or for non-branch/shared channels). `agno_session_id`
maps **by value** to `ai.agno_sessions.session_id`; `external_contact_id` is server-side only and
**never** exposed raw.

### D7 — Agno boundary (unchanged, reaffirmed)
`ai.*` is **read-only**: never migrate/alter/drop/truncate/write `ai.agno_sessions`, `ai.customers`,
`ai.agno_metrics`, or any `ai.*`. Mapping is **by value only**
(`dashboard.app_conversations.agno_session_id = ai.agno_sessions.session_id`); **no FK from `dashboard.*`
to `ai.*`**. The Agno **`agent_id` shape is not hard-coded** into app logic — it is resolved through
`app_ai_agent_bindings.external_agent_id` to a tenant/business/location/channel scope.

### D8 — Realtime is scope-aware (extends ADR-0014)
Realtime events carry the **scope** (`tenant_id`, `business_id`, `location_id` nullable, `channel_id`,
`conversation_id`) and update the UI through **safe deltas/patches** where possible — the browser must
**not** refetch the whole dashboard/analytics/chat-monitor API for every message. **Transport stays
SSE.** Payloads remain PII-safe: **no raw phone / `user_id` / `external_contact_id` / `agno_session_id`
/ raw `runs` / `session_data`** (safe UI-ready DTOs only; message text and previews are allowed because
they are already shown in Chat Monitor and are not raw identifiers). The current 12F event contract
(`conversationId` only) is a **strict subset** that grows to add scope ids + safe deltas when the
multi-business schema lands.

### D9 — Migration = expand → backfill → verify → enforce (no destructive change, `ai.*` untouched)
1. **Expand:** add the new tables + **nullable** `business_id`/`location_id` columns on
   `app_channels`/`app_conversations`.
2. **Backfill:** create the **default business** under the existing PEPPER ST. tenant; map existing
   channels/conversations to it; leave `location_id = NULL` unless the branch is known.
3. **Verify:** all existing conversations/channels preserved; every conversation has
   `tenant_id`/`business_id`/`channel_id`; `ai.*` untouched; no customer/chat data deleted.
4. **Enforce:** only then make `business_id` NOT NULL where required, add dashboard-only FKs + indexes.
   **No FK to `ai.*`.**

## Consequences

- **Future-proof:** supports single-business PEPPER ST. today and franchises/chains/multi-brand groups
  later **without** re-architecting; branch routing becomes a clean premium product line.
- **Schema grows from 4 → 7 core tables** (ADR-0012's count is superseded; its by-value contact +
  grain-lock principles are kept). Customer **identity resolution across channels stays deferred**
  (no auto-merge; ADR-0012 stance preserved).
- **Realtime contract evolves** (scope + safe deltas + optional durable outbox) but the **SSE transport
  and the no-PII rule are unchanged**; ADR-0014's in-process detector + in-memory bus remain valid and
  are extended, not replaced.
- **`ai.*` stays read-only**; the transcript boundary (ADR-0004) and masking (ADR-0005) are unchanged.
- **More columns/joins** to scope by business/location — acceptable cost for the capability; mitigated by
  indexes added in the *enforce* step.

## Alternatives considered

- **Keep `tenant = business`:** rejected — cannot represent a tenant with multiple brands; forces a new
  tenant (new billing account) per brand and blocks shared-channel/branch routing.
- **Make every branch its own business:** rejected — mismodels a chain (one brand, many outlets);
  fragments analytics and channel sharing. Branch is a **location under a business**, not a business.
- **Store platform name as `external_channel_id`:** rejected — collides across accounts and cannot bind
  to a real provider id; `type` + `external_channel_id` must be separate (D3).
- **Hard-code the Agno `agent_id` format:** rejected — breaks on provider/format change; use
  `app_ai_agent_bindings` (D7).
- **Add the full user/access-control model now:** deferred — only needed when staff permissions ship;
  documented as optional tables to avoid premature complexity.

## Boundaries preserved

- `ai.*` **read-only**; mapping **by value**; **no** cross-schema FK; **no** `app_conversation_messages`
  / message table / transcript-body copy (ADR-0004).
- Contact stored **by value** on `app_conversations.external_contact_id`, masked on read (ADR-0005);
  **no** dashboard-side customer/identity table (ADR-0012 principle kept).
- Browser/SSE payloads expose **safe DTOs only** — never raw phone / `user_id` / `external_contact_id` /
  `agno_session_id` / `runs` / `session_data`.
