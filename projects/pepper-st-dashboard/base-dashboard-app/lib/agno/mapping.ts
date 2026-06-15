import type { AgnoSession } from "./types";
import { epochSecondsToDate } from "./parser";

/**
 * Pure mapping helpers (Workflow 02/04, ADR-0003). No DB access here so the
 * resolution + value-building rules are unit-testable without credentials.
 */

export interface ChannelLike {
  id: string;
  tenantId: string;
  sourceAgentId: string | null;
  isActive: boolean;
}

export type ChannelResolution =
  | { status: "mapped"; channel: ChannelLike }
  | { status: "unmapped"; channel: null }
  | { status: "ambiguous"; channel: null };

/**
 * Resolve an Agno session's `agent_id` to exactly one ACTIVE channel.
 * 0 matches -> unmapped (skip; never guess a tenant). >1 -> ambiguous (config error).
 */
export function resolveChannelForAgent(
  channels: ChannelLike[],
  agentId: string | null | undefined
): ChannelResolution {
  const matches = (channels ?? []).filter(
    (c) => c.isActive && c.sourceAgentId != null && c.sourceAgentId === agentId
  );
  if (matches.length === 1) return { status: "mapped", channel: matches[0] };
  if (matches.length === 0) return { status: "unmapped", channel: null };
  return { status: "ambiguous", channel: null };
}

/** Phase 1: external_contact_id == session_id (the phone). Modelled separately so it can diverge (ADR-0008). */
export function deriveExternalContactId(session: AgnoSession): string {
  return session.session_id;
}

export interface ConversationIds {
  tenantId: string;
  channelId: string;
  customerId: string;
  customerIdentityId: string;
}

export interface ConversationValues extends ConversationIds {
  agnoSessionId: string;
  externalContactId: string;
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
    agnoSessionId: session.session_id, // link by value; stored as TEXT, no FK into ai.*
    externalContactId: deriveExternalContactId(session),
    status: "open", // dashboard-owned default (CHECK: open|resolved|archived)
    firstAt: epochSecondsToDate(session.created_at),
    lastAt: epochSecondsToDate(session.updated_at),
  };
}
