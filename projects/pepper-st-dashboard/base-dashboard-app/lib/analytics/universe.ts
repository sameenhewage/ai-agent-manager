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

/** Minimal `app_conversations` shape needed to build the analytics universe. */
export interface UniverseConversation {
  id: string;
  agnoSessionId: string;
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

/** De-duplicated, non-empty session ids — the `session_id = ANY($ids)` lookup key set. */
export function collectSessionIds(conversations: { agnoSessionId: string }[]): string[] {
  const ids = new Set<string>();
  for (const c of conversations) {
    if (c.agnoSessionId) ids.add(c.agnoSessionId);
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
 * Build ONE analytics input from a mapped conversation + its (optional) live session row.
 * Turn/message counts come from parsing the session's `runs`; token/cost from
 * `session_metrics`. A missing live session => zero turns/messages + null token/cost.
 */
export function toAnalyticsInput(
  c: UniverseConversation,
  row: SessionMetricsRow | undefined,
  now: Date
): AnalyticsSessionInput {
  let turnCount = 0;
  let messageCount = 0;
  if (row) {
    const session: AgnoSession = {
      session_id: c.agnoSessionId,
      runs: (Array.isArray(row.runs) ? row.runs : null) as AgnoSession["runs"],
      created_at: row.created_at != null ? Number(row.created_at) : null,
      updated_at: row.updated_at != null ? Number(row.updated_at) : null,
    };
    // Analytics cap is applied at the RANGE level by the caller, not per message.
    const parsed = parseTranscript(session, { retentionDays: null, now });
    turnCount = parsed.turnCount;
    messageCount = parsed.messageCount;
  }
  return {
    conversationId: c.id,
    firstAt: c.firstAt ?? null,
    lastAt: c.lastAt ?? null,
    totalTokens: row ? num(row.total_tokens) : null,
    cost: row ? num(row.cost) : null,
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
    .map((c) => toAnalyticsInput(c, byId.get(c.agnoSessionId), now));
}
