import type { AgnoSession } from "./types";
import { epochSecondsToDate } from "./parser";

/**
 * Pure mapping seam (ADR-0011, Agno v2). No DB access here so the v2 identity
 * contract is unit-testable without credentials. SINGLE SOURCE OF TRUTH for:
 *  - the derived agent key  agent_id = "<tenantId>:<channelId>" (tenant-first),
 *  - the external contact id (the WhatsApp phone in session.user_id, PII), and
 *  - the opaque session link key (session.session_id).
 */

export interface ChannelLike {
  id: string;
  tenantId: string;
  sourceAgentId: string | null; // legacy/derived cache only; NOT used to resolve in v2
  isActive: boolean;
}

export type ChannelResolution =
  | { status: "mapped"; channel: ChannelLike }
  | { status: "unmapped"; channel: null }
  | { status: "ambiguous"; channel: null };

/** Delimiter the AI platform uses between the tenant id and channel id in `agent_id`. */
export const AGENT_ID_DELIMITER = ":";

/**
 * v2 agent key: the AI platform stamps `agent_id = "<tenantId>:<channelId>"` from the dashboard's
 * own `app_tenants.id` + `app_channels.id` (confirmed + live-verified, tenant-first). We DERIVE it
 * from our rows — we never store or hardcode the composite (`source_agent_id` is a legacy cache).
 */
export function deriveExpectedAgentId(tenantId: string, channelId: string): string {
  return `${tenantId}${AGENT_ID_DELIMITER}${channelId}`;
}

/**
 * Resolve an Agno session's `agent_id` to exactly one ACTIVE channel by DERIVING each active
 * channel's expected `agent_id` and comparing by value. 0 matches -> unmapped (skip; never guess a
 * tenant). A duplicate channel row -> ambiguous (defensive: `app_channels.id` is a PK, so two
 * distinct channels can never derive the same key).
 */
export function resolveChannelForAgent(
  channels: ChannelLike[],
  agentId: string | null | undefined
): ChannelResolution {
  if (agentId == null || agentId === "") return { status: "unmapped", channel: null };
  const matches = (channels ?? []).filter(
    (c) => c.isActive && deriveExpectedAgentId(c.tenantId, c.id) === agentId
  );
  if (matches.length === 1) return { status: "mapped", channel: matches[0] };
  if (matches.length === 0) return { status: "unmapped", channel: null };
  return { status: "ambiguous", channel: null };
}

/** The opaque Agno session key — stored as `app_conversations.agno_session_id` (link by value). */
export function deriveSessionKey(session: AgnoSession): string {
  return session.session_id;
}

/**
 * v2 external contact id = the WhatsApp phone in `session.user_id` (PII; masked everywhere). Returns
 * null when absent so the caller SKIPS the session instead of creating an empty-contact identity.
 * It never falls back to the opaque `session_id`.
 */
export function deriveExternalContactId(session: AgnoSession): string | null {
  const userId = session.user_id;
  return userId != null && userId !== "" ? userId : null;
}

export interface ConversationIds {
  tenantId: string;
  channelId: string;
  externalContactId: string; // resolved (non-null) by the caller from session.user_id
}

export interface ConversationValues extends ConversationIds {
  agnoSessionId: string;
  status: "open";
  firstAt: Date | null;
  lastAt: Date | null;
}

export function buildConversationValues(
  session: AgnoSession,
  ids: ConversationIds
): ConversationValues {
  return {
    ...ids,
    agnoSessionId: deriveSessionKey(session), // opaque session_id; stored as TEXT, no FK into ai.*
    status: "open", // dashboard-owned default (CHECK: open|resolved|archived)
    firstAt: epochSecondsToDate(session.created_at),
    lastAt: epochSecondsToDate(session.updated_at),
  };
}
