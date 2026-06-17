# Workflow 03 — Agno Transcript Rendering

- **Status:** Phase 1 (docs-first)
- **Last updated:** 2026-06-15
- **Related:** ADR-0004, ADR-0005, ADR-0006, `docs/architecture/03-agno-mapping.md`

## Goal

Render a clean, ordered, human-readable transcript for a conversation, **live and
read-only** from `ai.agno_sessions`, with no duplication, no system noise, masked
PII, and retention applied.

> **⚠ ADR-0016 update (2026-06-17):** a conversation is a **customer/contact thread**; the transcript is
> built by **merging ALL of the thread's linked provider sessions**
> (`app_conversation_sessions.external_session_id`, each = one `ai.agno_sessions.session_id`) before the
> steps below (dedupe by message `id`, drop `system`/`from_history`, order by `created_at`). See ADR-0016
> + `docs/architecture/03-agno-mapping.md`.

## Input

- the conversation **thread** + its linked provider sessions
  (`app_conversation_sessions.external_session_id`, each = one `ai.agno_sessions.session_id`); the
  tenant's `raw_history_retention_days`. *(ADR-0016 — was a single `agno_session_id`.)*

## Algorithm

1. **Load + merge** all the thread's linked provider sessions (read-only) via
   `app_conversation_sessions.external_session_id` → `ai.agno_sessions` (ADR-0016).
2. **Expand** `runs[]`, then each run's `messages[]`.
3. **Filter:**
   - exclude `role = 'system'` (the system prompt repeats once per run);
   - exclude `from_history = true` (replayed context).
4. **Dedupe** by message `id` (robust guard even if `from_history` is unreliable).
5. **Retention:** drop messages whose `created_at` is older than
   `now - raw_history_retention_days` (ADR-0006); **`NULL` = unlimited** (no cutoff).
6. **Order** by `created_at` (fallback: run index, then array index).
7. **Map roles → senders:** `user → customer`, `assistant → bot`,
   `tool → tool/system note` (subtle or hidden in Phase 1).
8. **Mask** any contact identifiers shown in the header (ADR-0005).
9. **Render** in the prototype's 3-column monitor style (list · thread · context),
   where the context panel shows only **real** fields (contact masked, first/last
   activity, turn count, token/cost) — **no intent/summary/priority**.

## Edge cases

- **Empty after filtering** (e.g. only system messages): show "No messages in
  retention window".
- **`tool` messages / tool calls:** Phase 1 renders minimally (or hides); never
  expose raw tool args containing PII.
- **Missing `created_at` on a message:** fall back to run/array order; never crash.
- **Large `runs[]`:** acceptable at current scale; revisit (pagination) if needed.

## Reference query

See `docs/architecture/03-agno-mapping.md` → "Reference read query".

## Test intent

- Fixture with multi-run history + repeated system prompts + a `from_history=true`
  message → output is ordered, system-free, de-duplicated.
- Retention boundary: a message exactly inside vs outside the window.
- Masking: header never contains a full phone; logs never contain a raw phone.

## Hard rules

- Read-only; never persist the transcript into `dashboard.*`.
- Never fabricate fields not present in Agno.
