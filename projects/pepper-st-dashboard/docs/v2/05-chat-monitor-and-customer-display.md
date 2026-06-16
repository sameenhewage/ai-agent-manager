# V2 / 05 — Chat Monitor & Customer Display

> Source files: `lib/chat-monitor/service.ts`, `lib/chat-monitor/presenter.ts`,
> `lib/agno/parser.ts`, `lib/agno/mask.ts`, `components/chat-monitor/chat-monitor.tsx`,
> `app/api/chat-monitor/**`.

## 1. How the conversation list loads

`GET /api/chat-monitor/conversations` → `getConversationList()`:

1. Resolve tenant + active WhatsApp channel + retention.
2. Read `dashboard.app_conversations` where `tenant_id`, `channel_id`, and
   `status != 'archived'`.
3. For those sessions, compute **turns cheaply in SQL**:
   `jsonb_array_length(runs)` on `ai.agno_sessions` (scoped by derived `agent_id`) —
   **no `runs` bodies cross the wire**.
4. `buildConversationList` (presenter): drop out-of-retention rows (counted as
   `restrictedCount`), **mask** the contact, sort by `last_at` desc.

DTO per item: `{ id, displayName, maskedContact, status, firstAt, lastAt, turnCount,
lastMessagePreview, lastMessageRole, lastMessageAt }` — a WhatsApp-style row (customer name +
last-message preview + time). **No transcript bodies, no message-count, no raw ids.** The
preview is the **latest DISPLAYABLE** message only (system / tool / `from_history` /
empty-assistant excluded), built by the canonical parser, whitespace-collapsed + truncated
(content only — never a raw id). `lastMessageRole ∈ {customer, assistant}`.

## 2. How the selected chat loads (WhatsApp-like pagination)

`GET /api/chat-monitor/conversations/[id]/transcript?limit=&before=` →
`getConversationMessagesPage()` — the original transcript route, **extended** in place (no
duplicate route):

1. **Validate** `id` is a UUID; reject otherwise (`null` → 404).
2. Load the **one** `app_conversations` row scoped by `id` **AND** `tenant_id` **AND**
   `channel_id` (IDOR guard — a foreign/unknown id returns `null`).
3. Read **only that session's** `ai.agno_sessions.runs` by `session_id` (scoped by derived
   `agent_id`), **read-only**; parse + retention + masking in memory via the shared
   `loadConversationForRead` (also used by the verifier's full `getConversationTranscript`).
4. `buildMessagesPage` (pure — `lib/chat-monitor/message-pagination.ts`) slices the latest
   `limit` (default 50, max 100) messages, or the page strictly **older** than the opaque
   `before` cursor, returned **oldest→newest**.

Page DTO: `{ conversationId, displayName, channelLabel, state, messages[], hasMoreBefore,
beforeCursor }`. Each message is `{ id, role, text, createdAt }` where `id` is an **opaque,
generated** id (never the raw Agno message id) and `role ∈ {customer, assistant}`. **Never
persisted** to `dashboard.*`; never includes raw `runs` / `session_data`.

### Cursor (opaque, stable)

`beforeCursor` is base64url of a stable **absolute message index** (oldest = 0). It encodes
**no** phone / `external_contact_id` / `user_id` / `agno_session_id`. Older pages load with
`?before=<cursor>`; absolute indices mean pages never overlap (**no duplicate messages**) and
stay stable as new messages append at the end.

### Browser behaviour

- The conversation list loads once; selecting a chat fetches **only** that chat's message
  page — the list is never refetched or reset. The header shows the customer name
  **immediately** (from the list item) while messages load.
- Initial load = **latest 50**, auto-scrolled to the bottom; scroll-up (or a "Load older
  messages" button) fetches the previous page via the cursor, **prepends** it, and **holds
  the reading position** (no jump to bottom).
- **No realtime in Slice 12E** (manual retry/refresh only). **Realtime is now MANDATORY** — specified
  as **Slice 12F** (Realtime Monitoring + Automatic Agno Sync: **SSE** browser updates + automatic sync
  freshness; the transcript **tail** updates live). See `docs/architecture/08` §5 and TD-081. Not yet
  implemented (approval-gated).

## 3. Source of the transcript

**`ai.agno_sessions.runs`** (jsonb), parsed live in memory each request. The dashboard
stores **no** message bodies (ADR-0004). `parseTranscript` (`lib/agno/parser.ts`):

- **drops** `role = "system"`, **drops** `from_history = true`, **drops** `tool` messages
  by default (Phase 1), **de-dupes** by message `id`, **orders** by `created_at`.
- Tool messages, if ever shown, render a neutral `"[tool activity]"` placeholder (never raw
  tool args, which may contain PII).
- Sender mapping: `user → customer`, `assistant → bot`, `tool → tool`.

## 4. Masking rules

`maskContactId` (`lib/agno/mask.ts`): keep a 2-char prefix + fixed `•••••` + 2–3-char
suffix (length never revealed). Example (illustrative, not real): `94•••••784`. Applied in
the presenter/service **before** data leaves the server. The client renders `maskedContact`
verbatim and has no DB access.

## 5. IDOR safety

- UUID-format check + **tenant + channel scoping** on the conversation lookup.
- Unknown id, foreign-tenant id, or malformed id → `null` → **404** (no existence oracle).
- Verified by `db:chat:verify` ("unknown id returns null", "malformed id returns null",
  "no raw id leaks in any payload").

## 6. Customer name (`ai.customers.name`)

**Audit findings (read-only, 2026-06-16):**

- **`ai.customers.name` EXISTS** — `text`, nullable, and **populated for all 5 rows**
  (`with_name = 5/5`).
- **Join key (by value, no FK):** `ai.customers (tenant_id, channel_id, phone)` ↔
  `dashboard.app_conversations (tenant_id::text, channel_id::text, external_contact_id)`.
  **CONFIRMED** — 6 conversations match (R1). Equivalently, `ai.agno_sessions.user_id = phone`
  (R3 = 5).
- **Coverage is partial:** 5 customers vs **15** distinct historical contacts → only current
  contacts have a name; older conversations have **no** `ai.customers` row.
- **Now IMPLEMENTED:** the list + chat header read `ai.customers.name` **read-only** (by
  value on `tenant_id, channel_id, phone`) and show it as the **primary label**, with the
  masked contact as the fallback when no name exists. The raw phone is never emitted.

### Can Chat Monitor safely show the customer name?

**Yes, structurally** — it would be a **read-only** by-value join to an AI-owned table
(consistent with the `ai.agno_sessions` read pattern), and `name` is a **display label**,
not the phone number. Recommended **fallback rule**:

- **If `name` is present** → show **display name + masked contact** (e.g. `J...` + `94•••••784`).
- **If `name` is missing** → show **masked contact only** (current behaviour).

> **Status: IMPLEMENTED** (read-only by-value join; masked-contact fallback). The pre-implementation
> checks held: (a) `name` is a display label (not a phone) and is shown to operators with the masked id
> as fallback; (b) `name` is shown as a CRM-style label (not re-masked) — revisit if product wants
> partial masking; (c) `(tenant_id, channel_id)` in `ai.customers` equal the dashboard's tenant/channel
> UUIDs as text (held in audit). **Open product question** (still tracked in `06` §6): confirm the
> stored names are acceptable to display long-term, and whether to partially mask.

## 7. Security rules (unchanged, must hold for any name feature)

- **No raw phone** in any payload.
- **No raw `user_id`.**
- **No raw `external_contact_id`.**
- **No raw Agno `session_id`** (the client only ever uses the internal conversation UUID).
- Adding `name` must **not** relax any of the above; `name` is additive display data only,
  and the join/read stays server-side and read-only.
