# ADR-0004 — Read-only Agno Transcript (No Duplication)

- **Status:** Accepted
- **Date:** 2026-06-15
- **Related:** ADR-0003, ADR-0006, ADR-0009 (live handover reaffirms this),
  `docs/workflows/03-agno-transcript-rendering.md`

## Context

Transcripts live in `ai.agno_sessions.runs[].messages[]`. Inspection found: the
**system prompt repeats once per run**; a `from_history` flag exists (currently
all `false`); messages carry an `id` and `created_at`. Naively flattening
`runs[].messages[]` would show duplicated history and repeated system prompts.

## Decision

1. **Render transcripts live, read-only.** Never copy messages/runs into
   `dashboard.*`. No `messages` or `runs` tables.
2. **Build algorithm:** flatten `runs[].messages[]` → exclude `role='system'` →
   drop `from_history=true` → **dedupe by message `id`** → order by `created_at`.
3. **Role mapping:** `user→customer`, `assistant→bot`, `tool→` subtle/hidden note.
4. **Apply retention at read time** (ADR-0006) and **masking** (ADR-0005).

## Consequences

- Always consistent with Agno; no sync jobs, no staleness, no storage bloat.
- Transcript correctness is enforced by unit tests on a fixture session.
- **Phase 2 live handover reaffirms this:** the dashboard adds **control-plane
  metadata only** (handover/ownership/send-status) and **never** message bodies;
  the canonical transcript stays upstream (ADR-0009).
- Slightly more compute per view (JSON expansion); acceptable at current and
  near-term volume.

## Alternatives considered

- **Materialize transcripts** into dashboard tables: rejected — duplication,
  staleness, storage, and it breaks the read-only boundary. May revisit only if a
  proven performance need arises (would require a new ADR).
- **Trust `from_history` alone** (skip id-dedupe): rejected — the flag is `false`
  everywhere in current data, so we cannot rely on it exclusively; dedupe by `id`
  is the robust guard.
