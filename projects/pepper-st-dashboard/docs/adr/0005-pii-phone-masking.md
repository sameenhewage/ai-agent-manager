# ADR-0005 — PII & Phone Masking

- **Status:** Accepted
- **Date:** 2026-06-15
- **Related:** ADR-0002, `docs/workflows/07-pii-phone-masking.md`

## Context

`ai.agno_sessions.session_id` is a raw **WhatsApp phone number** that also serves
as the contact identifier and is exposed as the session id. Phone numbers are
PII. The dashboard surfaces these in list views, transcript headers, and logs.

## Decision

1. **Treat `session_id` / phone as sensitive PII.**
2. **Mask by default everywhere** — list views, transcript headers, exports, and
   **logs** (e.g. `94•••••815`: keep a small prefix/suffix, mask the middle).
3. **Store the real value** (text) and **mask on read/render**, via a single
   shared masking utility used by both UI and logging. Never persist a separate
   masked copy as the source of truth.
4. **Full visibility is future admin-only** (requires auth; parked). No reveal
   capability in Phase 1.
5. **Never log raw phone numbers**, even at debug level.

## Consequences

- One masking util is a tested, central dependency for UI + logging.
- Because we store the real value and mask on read, the future admin "reveal"
  needs no data migration — only an authorization check.
- Analytics that need contact-level grouping use the **real** value server-side
  but only ever **emit** masked values to the client/logs.

## Alternatives considered

- **Store only masked / hashed phone**: rejected — would lose the ability to
  reveal for admins and to match upstream Agno `session_id` for transcript reads.
- **Mask in UI only**: rejected — logs are a common PII leak; masking must include
  logging.
