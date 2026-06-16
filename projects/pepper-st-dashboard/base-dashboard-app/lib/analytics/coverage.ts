/**
 * Business-Truth universe coverage (CONTEXT.md §7 — Business-Truth TDD Gate).
 *
 * The analytics UNIVERSE is the ACTIVE mapped `app_conversations`. Some valid live
 * `ai.agno_sessions` (tenant/channel, in range, with a contact) may not be mapped yet
 * (e.g. `db:agno:sync` has not run). Those sessions must NOT be silently dropped: the
 * service reports them here as explicit, REASONED exclusions so the API/UI can say
 * "showing N of M sessions" instead of pretending the universe is N.
 *
 * Pure + DB-free (testable without credentials). PII-safe: session ids are NEVER exposed
 * raw — only a short masked `ref`. No fabricated metrics (ADR-0007).
 */

export const REASON_UNSYNCED =
  "unsynced: no active app_conversations row (run db:agno:sync to map it)";
export const REASON_ARCHIVED =
  "archived: conversation retired from the active analytics universe";

export interface ExcludedSession {
  /** Masked, non-reversible reference — NEVER the raw agno session_id. */
  ref: string;
  /** Why this valid live session is not counted in the totals. */
  reason: string;
}

export interface UniverseCoverage {
  /** Distinct valid live Agno sessions under the agent, in range. */
  liveValid: number;
  /** Of those, how many are in the ACTIVE mapped universe (i.e. actually counted). */
  mapped: number;
  /** liveValid − mapped. */
  excludedCount: number;
  /** Per-session exclusion reasons (masked refs). */
  excluded: ExcludedSession[];
  /** True when nothing is hidden (mapped === liveValid). */
  complete: boolean;
}

export interface CoverageInput {
  /** session_ids of valid live sessions under the derived agent, in range (read-only ai.* read). */
  liveValidSessionIds: string[];
  /** session_ids of the ACTIVE, in-range `app_conversations` the analytics counted. */
  activeMappedSessionIds: string[];
  /** session_ids that have an ARCHIVED conversation (reason annotation only). */
  archivedSessionIds?: string[];
}

/** Mask an Agno session_id to a short, non-reversible ref (never the raw id). */
export function maskSessionRef(sessionId: string): string {
  const s = String(sessionId ?? "");
  if (s.length <= 4) return "sess_••••";
  return `sess_••••${s.slice(-4)}`;
}

/**
 * Reconcile the live valid universe against the active mapped universe and report every
 * valid session that is NOT being counted, with a reason. De-duplicates live ids.
 */
export function computeUniverseCoverage(input: CoverageInput): UniverseCoverage {
  const active = new Set(input.activeMappedSessionIds);
  const archived = new Set(input.archivedSessionIds ?? []);
  const liveValid = new Set(input.liveValidSessionIds);

  let mapped = 0;
  const excluded: ExcludedSession[] = [];
  for (const id of liveValid) {
    if (active.has(id)) {
      mapped++;
      continue;
    }
    excluded.push({
      ref: maskSessionRef(id),
      reason: archived.has(id) ? REASON_ARCHIVED : REASON_UNSYNCED,
    });
  }

  return {
    liveValid: liveValid.size,
    mapped,
    excludedCount: excluded.length,
    excluded,
    complete: excluded.length === 0,
  };
}
