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

/** The opaque Agno session key — the provider session link value
 *  (`app_conversation_sessions.external_session_id`, link by value; no FK into `ai.*`). */
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
    // ADR-0016 Gate C.3: the conversation is the CONTACT THREAD (keyed by external_contact_id).
    // The provider session id is no longer stored here — it lives ONLY on the session link
    // (app_conversation_sessions.external_session_id, built by buildSessionLinkValues).
    status: "open", // dashboard-owned default (CHECK: open|resolved|archived)
    firstAt: epochSecondsToDate(session.created_at),
    lastAt: epochSecondsToDate(session.updated_at),
  };
}

/** Identifiers the caller resolves before building a provider/session link row (ADR-0016). */
export interface SessionLinkIds {
  tenantId: string;
  conversationId: string; // the resolved/created dashboard.app_conversations.id (FK target)
}

/**
 * Provider/session link row (dashboard.app_conversation_sessions). `businessId` is always null
 * here — the ADR-0015 business migration has not landed (no `app_businesses` to reference yet).
 */
export interface SessionLinkValues {
  tenantId: string;
  businessId: null;
  conversationId: string;
  provider: "agno";
  externalSessionId: string; // links BY VALUE to ai.agno_sessions.session_id — no FK into ai.*
  startedAt: Date | null;
  lastAt: Date | null;
}

/**
 * Build the ADR-0016 provider/session link for a synced Agno session (Gate B dual-write).
 * Pure: `external_session_id = session_id` (same value the conversation links by), provider
 * `'agno'`, `business_id` null. The unique (tenant, provider, external_session_id) makes the
 * upsert idempotent — re-syncing the same session updates `last_at`, never inserts a duplicate.
 * Never references `ai.*`; never collapses conversations.
 */
export function buildSessionLinkValues(
  session: AgnoSession,
  ids: SessionLinkIds
): SessionLinkValues {
  return {
    tenantId: ids.tenantId,
    businessId: null,
    conversationId: ids.conversationId,
    provider: "agno",
    externalSessionId: deriveSessionKey(session),
    startedAt: epochSecondsToDate(session.created_at),
    lastAt: epochSecondsToDate(session.updated_at),
  };
}
