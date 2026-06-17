# ADR-0016 — Contact Thread Conversation Boundary

- **Status:** **Proposed** (Accepted after review). **Documentation + schema-proposal gate only — no code,
  no migration, no DB write, no `ai.*` change, no commit/push.** Implementation is approval-gated.
- **Date:** 2026-06-17
- **Originating evidence:** the read-only verification gate (TD-089-VERIFY / decision-log 2026-06-17) on
  the live `papper` DB.
- **Decision (one line):**

```txt
Dashboard conversation = customer/contact thread.
Agno session           = provider/internal session segment.
One dashboard conversation may contain many Agno/provider sessions.
```

> **This supersedes the old assumption:**
> ```txt
> 1 Agno session = 1 dashboard conversation
> ```

- **Relation to prior ADRs (see §9):** **revises ADR-0003** (grain-lock), **revises ADR-0012**
  (`app_conversations.agno_session_id` as the boundary), **refines ADR-0015** (multi-business model);
  **preserves ADR-0004** (read-only transcript, no message table), **ADR-0005** (PII masking),
  **ADR-0001** (link by value, no cross-schema FK).

---

## 1. Context

The dashboard maps WhatsApp/AI activity from the **read-only** `ai.agno_sessions` table. Since ADR-0003
the grain has been **one Agno `session_id` = one `app_conversations` row**, uniquely keyed
`(tenant_id, channel_id, agno_session_id)`, with the contact stored **by value** on
`external_contact_id` (= `ai.agno_sessions.user_id`, the phone/PII).

Under Agno v2 (ADR-0011) a **returning customer gets a NEW `session_id`** — the platform opens a fresh
session per visit/thread rather than re-using one rolling row. So **one contact (`user_id`) → many Agno
sessions → many `app_conversations` rows**. ADR-0003/0012 explicitly accepted that fan-out
("one contact → many sessions → many conversations").

**Live verification (masked, read-only — `npm run db:agno:verify` / `db:agno:reconfirm` / `db:chat:verify`):**

```txt
app_conversations rows (PEPPER ST.)        : 19   for 16 distinct contacts  → ≥3 duplicate rows
Chat Monitor visible list (active)         : 6 rows; masked sample shows 94•••••273 TWICE
session_id shape                           : 32–36 chars, not phone-like → opaque provider session id
user_id shape                              : 11–22 chars, 0 nulls         → the customer/contact id
transcript loader                          : "parses ONE session" per row
payloads                                   : no raw phone/user_id/session_id/runs leaked (masked + opaque)
```

## 2. Problem

The Agno session is an **internal provider segment**, not a customer conversation. Treating it as the
dashboard boundary makes the product wrong in two visible ways:

1. **Duplicate rows:** the same customer appears as **multiple Chat Monitor rows** (proven:
   `94•••••273` renders twice among 6 visible conversations).
2. **Fragmented transcript:** each row's transcript shows **only that one session**, so a customer's
   history is split across rows and **no view shows the continuous conversation**.

This is a **data-modeling/UX defect**, not a security defect (payloads are already PII-safe). It will get
worse as customers return, and it blocks branch-aware/business-scoped analytics (ADR-0015).

## 3. Decision

Adopt the **contact thread** as the dashboard conversation boundary; keep the Agno/provider session as an
**internal child segment**.

```txt
app_conversations          = the customer-facing CONTACT THREAD (one row per customer/contact)
app_conversation_sessions  = the PROVIDER SESSION LINKS belonging to that thread (one row per Agno session)
```

- **Conversation boundary (target, post-business / ADR-0015):**
  ```txt
  tenant_id + business_id + channel_id + external_contact_id
  ```
- **Conversation boundary (transitional, current pre-business schema):**
  ```txt
  tenant_id + channel_id + external_contact_id
  ```
- **Session linkage moves off the conversation:** `app_conversations.agno_session_id` is **replaced** by
  child rows in `app_conversation_sessions`. The cross-schema link stays **by value, no FK**:
  ```txt
  app_conversation_sessions.external_session_id  ==  ai.agno_sessions.session_id   (by value, NO FK to ai.*)
  ```
- **Grain redefined:** **one customer/contact thread = one `app_conversations` row = many provider
  sessions.** A provider session belongs to **exactly one** thread.

### Proposed table (document only — NOT created in this gate)

```txt
dashboard.app_conversation_sessions
  id                  uuid primary key
  tenant_id           uuid not null                         -- scope; -> app_tenants
  business_id         uuid null                             -- nullable until the business migration (ADR-0015) lands
  conversation_id     uuid not null                         -- -> dashboard.app_conversations (the contact thread)
  provider            text not null default 'agno'          -- 'agno' today; future providers reuse this table
  external_session_id text not null                         -- == ai.agno_sessions.session_id (BY VALUE; NO FK to ai.*)
  started_at          timestamptz                           -- from session created_at
  last_at             timestamptz                           -- from session updated_at / latest message
  created_at          timestamptz not null
  updated_at          timestamptz not null

  unique (tenant_id, provider, external_session_id)         -- one dashboard link per provider session
  -- conversation_id references dashboard.app_conversations(id)
  -- index (conversation_id) for thread fan-out reads
```

### `app_conversations` target shape

```txt
app_conversations = one row per CONTACT THREAD
  required boundary (transitional): tenant_id + channel_id + external_contact_id
  required boundary (post-business): tenant_id + business_id + channel_id + external_contact_id
  external_contact_id : the contact, stored BY VALUE, masked on read (unchanged, ADR-0012)
  agno_session_id     : REMOVED from this table (moves to app_conversation_sessions.external_session_id)
  first_at / last_at  : rolled up across ALL linked provider sessions
  status              : dashboard-owned (open|resolved|archived) — unchanged
```

## 4. Consequences

- **One customer = one Chat Monitor row**, regardless of how many Agno sessions exist; the visible
  duplicate (`94•••••273` ×2) collapses to one thread.
- **Transcript is continuous** — merged across all of the thread's provider sessions.
- **Schema grows by one dashboard-owned table** (`app_conversation_sessions`); `app_conversations` loses
  `agno_session_id` and gains the contact-thread uniqueness. ADR-0012's **4-table count is revised**, but
  its **by-value contact + no customer/identity table + read-only boundary** principles are **kept**.
- **Analytics that counted `app_conversations` as "conversations" must be re-checked:** "conversations"
  now means **threads**; "sessions/visits" becomes a separate (provider-session) count. New-vs-returning
  by `external_contact_id` is unaffected.
- **More join work** on read (thread → its sessions → `ai.agno_sessions`), mitigated by
  `app_conversation_sessions(conversation_id)` and `(tenant_id, provider, external_session_id)` indexes.
- **Identity merge across channels stays deferred** (ADR-0012 stance): a thread is per
  `(tenant[, business], channel, contact)`; cross-channel identity resolution is a separate future ADR.

## 5. Migration direction (PROPOSE ONLY — expand → backfill → verify → enforce; non-destructive; `ai.*` untouched)

1. **Expand**
   - Create `dashboard.app_conversation_sessions`.
   - Keep existing `app_conversations` (and its `agno_session_id`) **temporarily**.
2. **Backfill**
   - For **each** existing `app_conversations` row, insert one `app_conversation_sessions` row:
     ```txt
     conversation_id     = the existing conversation id (initially 1:1)
     provider            = 'agno'
     external_session_id = the old app_conversations.agno_session_id
     started_at/last_at  = the existing first_at/last_at
     ```
   - **Then collapse/merge** conversation rows that share the boundary key — transitional
     `tenant_id + channel_id + external_contact_id` (post-business
     `tenant_id + business_id + channel_id + external_contact_id`): pick one **surviving** thread row per
     contact, **re-point** the other rows' `app_conversation_sessions.conversation_id` to it, roll up
     `first_at = min`, `last_at = max`, and retire the now-empty duplicate conversation rows
     (status flip / delete in the enforce step — dashboard-owned rows only).
3. **Verify** (read-only checks before any enforce):
   ```txt
   - no ai.* rows changed (counts/checksum identical; ai.* strictly read-only)
   - every old agno_session_id is linked exactly once in app_conversation_sessions
   - every contact has exactly ONE target conversation thread
   - duplicate contact rows are collapsed logically (threads == distinct contacts)
   - message counts preserved (sum of per-session displayable messages == merged thread total)
   - no raw PII exposed in any output (masked/aggregated only)
   ```
4. **Enforce** (only after verify passes):
   ```txt
   - remove/migrate the direct agno_session_id off app_conversations
   - add the contact-thread uniqueness (transitional: tenant_id+channel_id+external_contact_id;
     post-business: tenant_id+business_id+channel_id+external_contact_id)
   - keep app_conversation_sessions unique(tenant_id, provider, external_session_id)
   - add app_conversation_sessions(conversation_id) index; dashboard-only FK conversation_id -> app_conversations
   ```

> No destructive change; `ai.*` is never altered/dropped/written. The default-business backfill for
> `business_id` is deferred to the ADR-0015 business migration (column stays nullable until then).

## 6. Read-path direction (PROPOSE ONLY)

**Conversation list (Chat Monitor / Dashboard recent):**
```txt
- one row per app_conversations CONTACT THREAD
- preview  = the latest displayable message across ALL linked provider sessions
- last_at  = max(message/session timestamp) across the thread
- badges (channel, business/location) stable per thread
```

**Transcript:**
```txt
- load ALL app_conversation_sessions for the conversation (thread)
- read the matching ai.agno_sessions BY external_session_id value (READ-ONLY)
- parse messages; exclude system / tool / internal / from_history (parser already does this)
- DEDUPE by a stable provider message id (Agno message `id`), not by array position
- sort by created_at / ts across the merged set
- render ONE continuous WhatsApp-like thread
```

**Stable message id (important):** the current wire id
`safeMessageId(conversationId, index)` is **positional per single session** and is **not stable once
sessions are merged** (indexes collide/shift). Replace it with an **opaque safe id derived from the
stable provider message id** (e.g. a hash of `conversationId + provider message id`) — never the raw
provider id. The parser already carries the Agno `m.id`, so this is mostly additive.

## 7. Realtime impact (extends ADR-0014 / ADR-0015)

Realtime events must target the **contact thread**, not the provider session. Transport stays **SSE**.

```txt
Event scope (server-side):
  tenant_id
  business_id          (nullable until the business migration lands)
  channel_id
  external_contact_id  (SERVER-SIDE ONLY — never emitted)
  conversation_id      (safe dashboard id — the thread the UI patches)
  provider_session_id  (SERVER-SIDE ONLY — never emitted)
```

A new provider session for an existing contact emits a **thread update** (the existing row moves/append),
**never a new row**. The browser patches the thread identified by `conversation_id` only.

## 8. Security / PII boundary (unchanged, reaffirmed)

Browser/SSE payloads expose **safe DTOs only**. **Never emit:**
```txt
raw phone · external_contact_id · user_id · agno_session_id · external_session_id · raw runs · session_data
```
Only the safe dashboard `conversation_id`, masked contact, `ai.customers.name` display name, safe message
DTOs, and **opaque** message ids cross the wire. `ai.*` stays **read-only**; the link is **by value**
(`app_conversation_sessions.external_session_id == ai.agno_sessions.session_id`) with **no cross-schema
FK**; **no** transcript bodies / message table in `dashboard.*` (ADR-0004).

## 9. ADRs superseded / revised

- **Supersedes the assumption** `1 Agno session = 1 dashboard conversation` (originating in ADR-0003 §1
  and reaffirmed in ADR-0012 §4).
- **Revises ADR-0003 (grain-lock):** the conversation grain is now the **contact thread**, not the Agno
  session. Uniqueness moves from `(tenant_id, channel_id, agno_session_id)` to the contact-thread key; the
  per-session row becomes `app_conversation_sessions`.
- **Revises ADR-0012 (`app_conversations.agno_session_id`):** `agno_session_id` **moves off**
  `app_conversations` into `app_conversation_sessions.external_session_id`. ADR-0012's by-value-contact,
  no-customer-table, and read-only boundary principles are **kept**; the **4-table count is revised** to
  add one dashboard-owned table.
- **Refines ADR-0015 (multi-business model):** in `architecture/09`, the conversation node becomes
  **Conversation / Contact Thread → Provider Sessions → Agno Session**; `app_conversation_sessions` is
  added to the target schema; the conversation boundary becomes
  `tenant_id + business_id + channel_id + external_contact_id`.
- **Preserves:** ADR-0001 (link by value, no FK), ADR-0004 (read-only transcript, no message table),
  ADR-0005 (PII masking), ADR-0011 (Agno v2 identity: `session_id` opaque, `user_id` = contact).
