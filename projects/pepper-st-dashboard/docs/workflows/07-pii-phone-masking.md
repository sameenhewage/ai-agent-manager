# Workflow 07 — PII / Phone Masking

- **Status:** Phase 1 (docs-first)
- **Last updated:** 2026-06-15
- **Related:** ADR-0005

## Goal

Ensure WhatsApp phone numbers / `session_id` are **masked by default**
everywhere — UI list views, transcript headers, exports, and **logs**.

## What is sensitive

- `ai.agno_sessions.session_id` (currently the **phone number** + global id).
- `external_contact_id` and any cached copy of it.
- Any phone-like string inside tool args / message content (avoid surfacing).

## Masking rule

- Keep a small prefix and suffix, mask the middle. Example:
  `94714128890` → `94•••••890` (exact pattern finalized at build gate; must not
  reveal enough to reconstruct the number).
- Masking is applied **on read/render**, from the stored **real** value.

## Single source: shared masking utility

- One utility function used by **both** UI rendering **and** the logger.
- Logging must route phone/contact values through the masker; **raw phone numbers
  must never appear in logs**, even at debug level.

## Default-on, reveal later

- Phase 1: masking is **always on**; there is **no reveal** capability.
- Future: **admin-only reveal** (requires auth). Because we store the real value
  and mask on read, reveal needs only an authorization check — no data migration.

## Storage rule

- Store the **real** value (text) as the source of truth (needed to read the
  Agno transcript by `session_id`).
- Do **not** store a masked copy as the canonical value.

## Edge cases

- Search by contact: match server-side on the real value; **return masked** to the
  client.
- Exports/CSV: masked by default in Phase 1.
- Error messages/toasts: never echo a raw phone.

## Test intent

- Masker: given a phone → masked form; idempotent; never returns the full number.
- Logger: asserts no raw phone pattern is emitted.
- UI: list + transcript header show masked values only.
