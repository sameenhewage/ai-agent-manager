# ADR-0014 — Realtime detection via in-process polling; browser transport via SSE

- **Status:** **Accepted** (Slice 12F).
- **Date:** 2026-06-16
- **Relation:** Implements the realtime mandate of **TD-081** (Slice 12F redefinition). Builds on
  **ADR-0013** (internal API routes consumed by client widgets — the foundation realtime patches on),
  **ADR-0004** (read-only Agno transcript), **ADR-0005** (phone/PII masking), **ADR-0012** (4-table
  dashboard schema), and the 12D-B boundary lock (no message table / no transcript copy). Honors
  **ADR-0009** (WebSocket reserved for a future approved human-handover/send path, not this read-only
  console).

> **One-line summary (must stay true in all docs):** *Current 12F detector is **in-process polling**;
> the future preferred detector is an **Agno webhook** if/when available; the browser realtime transport
> is and remains **SSE**.*

## Context

Manual `npm run db:agno:sync` is **not acceptable during live customer use** (TD-081): new WhatsApp/Agno
sessions and messages must appear in the console automatically, smoothly, with no full page reload, no
global loader, and no scroll jump. The coverage banner ("Showing 6 of 8 live sessions…") is a **safety
net**, not the normal operating state.

Constraints that shape the design:

- **No Agno webhook or DB `LISTEN/NOTIFY` exists today.** The Agno writer does not notify us, and we do
  **not** own `ai.*`, so we will not add triggers/NOTIFY to `ai.agno_sessions`.
- The dashboard is **self-hosted, single-instance**, deployed adjacent to the Agno PostgreSQL.
- The read path is already cheap and indexed (Slice 12D): tenant/channel `last_at` pre-filter +
  `session_id = ANY` PK fetch; the existing **read-only** `syncAllActiveChannels` upserts only
  `dashboard.app_conversations` metadata/index.
- WebSocket is rejected for a read-only console (ADR-0009); the realtime flow here is **one-way**
  server → browser, which is exactly SSE's shape.

## Decision

**(1) Browser transport = Server-Sent Events (SSE).** A single endpoint `GET /api/events/stream`
(`text/event-stream`, `no-store`, `dynamic = "force-dynamic"`) holds an open `ReadableStream` per client
and pushes safe events. SSE is one-way, read-only, auto-reconnecting (`EventSource`), and proxy-friendly.

**(2) Change detector = in-process polling (configurable interval).** A lazily-started server singleton
runs on an interval (`REALTIME_POLL_INTERVAL_MS`, default **5000ms**; set `0`/unset to disable in
environments that should not poll). Each tick runs the existing **read-only** `syncAllActiveChannels`,
**diffs** the resulting `app_conversations` snapshot against the previous tick, and publishes a **safe**
event for each change. `ai.*` stays read-only; only the already-approved `dashboard.app_conversations`
metadata/index upsert occurs.

**(3) Single-flight lock.** A module-level guard ensures **at most one** sync runs at a time: overlapping
interval ticks (or a future on-demand trigger) **coalesce** rather than running duplicate concurrent
syncs (TD-081 acceptance #7). A failed tick is logged (masked) and the lock is always released.

**(4) In-memory event bus.** A process-local pub/sub fans one detector result out to all connected SSE
clients. **No Redis/queue** (over-engineering for a single instance — Engineering rule 9). The
single-instance limitation is the documented residual risk below.

**(5) Safe event contract (no PII).** Events carry a **type** + the **internal conversation UUID** only —
never raw phone / `user_id` / `external_contact_id` / Agno `session_id`, never `runs`/`session_data`.
The union (finalized in 12F-1):
- `conversation.created` `{ conversationId }` — a new mapped conversation exists;
- `conversation.updated` `{ conversationId }` — last activity / preview / turn count changed;
- `transcript.updated` `{ conversationId }` — the selected chat may have new tail messages;
- `metrics.updated` `{}` — Dashboard/Analytics counters may have changed;
- `coverage.updated` `{ complete, mapped, liveValid }` — coverage/self-heal status (counts only).
Clients then **refetch the existing safe API** (`/api/chat-monitor/conversations`, `…/[id]/transcript`,
`/api/dashboard`, `/api/analytics`) — the event is a *signal*, the masked DTO still comes from the
server, so no new data leaves the boundary.

**(6) Client update rules (no flicker).** On an event the client **patches or silently refetches only
the affected surface**: never a full reload, never clears mounted state, never a global loader/skeleton.
Conversation list patches in place (stable React keys); the selected transcript appends only missing tail
messages (dedupe by id) — keeping the bottom if the user is at the bottom, otherwise showing a
**"New messages"** affordance without auto-scrolling; Dashboard/Analytics swap counter values in place.

**(7) Coverage banner = safety net.** If a sync tick fails, the UI does **not** crash; the last good data
stays and the coverage banner remains/returns until a later tick succeeds (self-heal).

## Future migration path (preferred detector)

If/when the Agno/AI platform can emit a **webhook/event** on session/run changes, it becomes the
**preferred** detector: a small `POST` endpoint validates the event and publishes onto the **same**
in-memory bus, replacing (or fronting) the polling loop. **The browser SSE contract and all client code
stay unchanged** — only the server-side *detector* swaps. Polling remains the always-available fallback.

## Alternatives considered

- **Postgres `LISTEN/NOTIFY`** — lower latency, but requires either Agno to emit `NOTIFY` or **us to add
  a trigger/NOTIFY on the AI-owned `ai.agno_sessions`** table. **Rejected for now:** we do not own `ai.*`
  (ADR-0004 boundary); revisit only if Agno provides notifications natively.
- **WebSocket** — bidirectional, unnecessary for a read-only console and heavier to operate.
  **Rejected** until/unless human-handover send/reply is approved (ADR-0009, Phase 2).
- **Client polling only (no SSE)** — simplest, but makes the UI *feel* like a refreshing polling
  dashboard (flicker/jitter), which the product explicitly rejects. **Rejected.**

## Consequences / residual risk

- **Single-instance only.** The in-memory bus + in-process poller do **not** fan out across multiple
  replicas. Acceptable for the current self-hosted single instance; scaling out later requires either the
  Agno webhook (above) or an external pub/sub — a **future ADR**, not now.
- **Latency ≈ poll interval** (≤ ~5s by default), tunable via env; the cheap indexed read keeps DB load
  low. The webhook path would make this near-instant.
- **Operational:** new env var `REALTIME_POLL_INTERVAL_MS` (no secret); documented in the deployment
  runbook. No schema/migration; `ai.*` read-only; no message table / transcript copy; masked DTOs only.

## Boundaries preserved

- `ai.*` **read-only**; canonical transcript stays in `ai.agno_sessions.runs` (ADR-0004); the only write
  is the existing `dashboard.app_conversations` metadata/index sync.
- **No** `app_conversation_messages` / message table (ADR-0012 + 12D-B lock); **no** transcript-body copy.
- SSE/API payloads are **masked, safe DTOs**: no raw phone / `user_id` / `external_contact_id` / Agno
  `session_id` / `runs` / `session_data` (ADR-0005).
