import { parseTranscript } from "../agno/parser";
import type { AgnoSession } from "../agno/types";
import type { AnalyticsSessionInput } from "./aggregate";

/**
 * Pure analytics-universe helpers (Slice 12D). The universe is the tenant/channel's ACTIVE
 * `app_conversations` (the dashboard-owned, indexed mapping table) — archived rows are
 * excluded. Each conversation is joined BY VALUE to a session row that the service fetched
 * from `ai.agno_sessions` by `session_id` (PK), NOT by scanning Agno by `agent_id`.
 *
 * No DB access here (testable without credentials). No masking concerns: analytics is
 * PII-free by construction — these inputs carry NO `user_id` / `external_contact_id`. No
 * fabricated metrics (ADR-0007): a missing live session yields honest zero/null.
 */

/** Minimal contact-thread shape needed to build the analytics universe. The provider session ids
 *  come from app_conversation_sessions (ADR-0016 Gate C.3 — a thread may have MANY sessions). */
export interface UniverseConversation {
  id: string;
  sessionIds: string[];
  status: string;
  firstAt: Date | null;
  lastAt: Date | null;
}

/** READ-ONLY session row (runs + token/cost) fetched BY `session_id` from `ai.agno_sessions`. */
export interface SessionMetricsRow {
  session_id: string;
  runs: unknown;
  created_at: number | string | null;
  updated_at: number | string | null;
  total_tokens: string | null;
  cost: string | null;
}

const ARCHIVED = "archived";

/** A conversation contributes to analytics unless it is archived (retired). */
export function isActiveConversation(c: { status: string }): boolean {
  return c.status !== ARCHIVED;
}

/** De-duplicated, non-empty session ids across ALL conversations' linked provider sessions —
 *  the `session_id = ANY($ids)` lookup key set. */
export function collectSessionIds(conversations: { sessionIds: string[] }[]): string[] {
  const ids = new Set<string>();
  for (const c of conversations) {
    for (const sid of c.sessionIds) if (sid) ids.add(sid);
  }
  return [...ids];
}

/** Index session rows by `session_id` for O(1) join-by-value. */
export function indexSessionsById(rows: SessionMetricsRow[]): Map<string, SessionMetricsRow> {
  return new Map(rows.map((r) => [String(r.session_id), r]));
}

function num(value: string | null): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Build ONE analytics input for a contact thread by AGGREGATING across ALL its linked provider
 * sessions (ADR-0016 Gate C.3). Turn/message counts come from parsing each session's `runs`;
 * token/cost are summed from `session_metrics`. Sessions absent from the live set contribute
 * nothing; a thread with NO live session yields honest zero turns/messages + null token/cost.
 */
export function toAnalyticsInput(
  c: UniverseConversation,
  byId: Map<string, SessionMetricsRow>,
  now: Date
): AnalyticsSessionInput {
  let turnCount = 0;
  let messageCount = 0;
  let totalTokens: number | null = null;
  let cost: number | null = null;
  for (const sid of c.sessionIds) {
    const row = byId.get(sid);
    if (!row) continue;
    const session: AgnoSession = {
      session_id: sid,
      runs: (Array.isArray(row.runs) ? row.runs : null) as AgnoSession["runs"],
      created_at: row.created_at != null ? Number(row.created_at) : null,
      updated_at: row.updated_at != null ? Number(row.updated_at) : null,
    };
    // Analytics cap is applied at the RANGE level by the caller, not per message.
    const parsed = parseTranscript(session, { retentionDays: null, now });
    turnCount += parsed.turnCount;
    messageCount += parsed.messageCount;
    const t = num(row.total_tokens);
    if (t != null) totalTokens = (totalTokens ?? 0) + t;
    const co = num(row.cost);
    if (co != null) cost = (cost ?? 0) + co;
  }
  return {
    conversationId: c.id,
    firstAt: c.firstAt ?? null,
    lastAt: c.lastAt ?? null,
    totalTokens,
    cost,
    turnCount,
    messageCount,
  };
}

/**
 * Map the tenant/channel's conversations (already range-filtered in SQL) + the live session
 * rows (fetched BY `session_id`) into analytics inputs. Defense-in-depth: archived
 * conversations are dropped here too, so a stale/retired row can never reach the aggregate.
 */
export function buildAnalyticsInputs(
  conversations: UniverseConversation[],
  rows: SessionMetricsRow[],
  now: Date
): AnalyticsSessionInput[] {
  const byId = indexSessionsById(rows);
  return conversations
    .filter(isActiveConversation)
    .map((c) => toAnalyticsInput(c, byId, now));
}
