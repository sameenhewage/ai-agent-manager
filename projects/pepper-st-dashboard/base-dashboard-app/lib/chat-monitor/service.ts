import { and, eq, ne } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import * as schema from "../db/schema";
import { appChannels, appConversations, appTenantEntitlements } from "../db/schema";
import { resolveCurrentTenant } from "../tenant/context";
import { parseTranscript } from "../agno/parser";
import { deriveExpectedAgentId } from "../agno/mapping";
import { maskContactId } from "../agno/mask";
import type { AgnoSession, ParsedTranscript } from "../agno/types";
import {
  buildConversationList,
  buildTranscriptView,
  isWithinRetention,
  type ConversationListPayload,
  type TranscriptPayload,
} from "./presenter";

/**
 * Server-side Chat Monitor data flow (Slice 5). Reads dashboard mapping tables +
 * `ai.agno_sessions` (READ-ONLY), parses transcripts in memory (never persisted), and
 * returns fully-masked, serializable view models for the client. No DB credentials or
 * raw contact/session ids ever cross into the returned payload.
 */

type Db = NodePgDatabase<typeof schema>;

export const WHATSAPP_CHANNEL_KEY = "whatsapp-main";

const EMPTY_TRANSCRIPT: ParsedTranscript = {
  messages: [],
  messageCount: 0,
  turnCount: 0,
  lastActivityAt: null,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Resolve demo tenant + active WhatsApp channel + raw-history retention. Shared by both
 *  lazy endpoints; throws on misconfiguration (surfaced as an error state in the UI). */
async function resolveContext(db: Db) {
  const tenant = await resolveCurrentTenant(db);
  if (!tenant) throw new Error("Demo tenant not found.");

  const [channel] = await db
    .select()
    .from(appChannels)
    .where(and(eq(appChannels.tenantId, tenant.id), eq(appChannels.channelKey, WHATSAPP_CHANNEL_KEY)))
    .limit(1);
  if (!channel) throw new Error("WhatsApp channel not found for tenant.");

  const [entitlement] = await db
    .select()
    .from(appTenantEntitlements)
    .where(eq(appTenantEntitlements.tenantId, tenant.id))
    .limit(1);
  const retentionDays = entitlement?.rawHistoryRetentionDays ?? null;
  // v2: agent_id is DERIVED "<tenantId>:<channelId>" (not a stored literal).
  const agentId = deriveExpectedAgentId(channel.tenantId, channel.id);
  return { tenant, channel, retentionDays, agentId };
}

/**
 * Conversation LIST (fast path): one indexed dashboard read + a cheap per-session
 * `jsonb_array_length(runs)` aggregate. It NEVER transfers `runs` bodies or parses a
 * transcript, so first paint does not wait on transcript work. Fully masked, serializable.
 */
export async function getConversationList(db: Db, pool: Pool): Promise<ConversationListPayload> {
  const { tenant, channel, retentionDays, agentId } = await resolveContext(db);

  const conversations = await db
    .select()
    .from(appConversations)
    .where(
      and(
        eq(appConversations.tenantId, tenant.id),
        eq(appConversations.channelId, channel.id),
        ne(appConversations.status, "archived") // exclude retired (archived) conversations
      )
    );

  // Cheap turn counts: the DB computes jsonb_array_length(runs); only ints cross the wire.
  // Slice 12D: fetch BY `session_id` (PK) for THIS universe, not a `WHERE agent_id = $1`
  // sequential scan. `agent_id` is retained as a defensive scope filter (mapping parity).
  const sessionIds = [...new Set(conversations.map((c) => c.agnoSessionId).filter(Boolean))];
  const turnRows = sessionIds.length
    ? await pool.query<{ session_id: string; turns: number | string | null }>(
        `select session_id,
                jsonb_array_length(
                  case when jsonb_typeof(runs::jsonb) = 'array' then runs::jsonb else '[]'::jsonb end
                ) as turns
           from ai.agno_sessions
          where session_id = any($1::text[])
            and agent_id = $2`,
        [sessionIds, agentId]
      )
    : { rows: [] as { session_id: string; turns: number | string | null }[] };
  const turnsBySession = new Map(turnRows.rows.map((r) => [String(r.session_id), Number(r.turns) || 0]));
  const turnCountById = new Map(
    conversations.map((c) => [c.id, turnsBySession.get(c.agnoSessionId) ?? 0])
  );

  const { items, restrictedCount } = buildConversationList(
    conversations.map((c) => ({
      id: c.id,
      externalContactId: c.externalContactId,
      status: c.status,
      firstAt: c.firstAt,
      lastAt: c.lastAt,
    })),
    turnCountById,
    { retentionDays }
  );

  return {
    tenantName: tenant.name,
    channelLabel: channel.displayName ?? channel.channelKey,
    retentionDays,
    retentionLabel: retentionDays == null ? "Unlimited" : `${retentionDays} days`,
    conversations: items,
    restrictedCount,
  };
}

/**
 * Single TRANSCRIPT (lazy path): loads ONLY the requested conversation (tenant + channel
 * scoped to prevent IDOR), reads ONLY its Agno session (READ-ONLY), parses in memory with
 * retention applied. Returns null when the id is malformed or not owned by this tenant.
 */
export async function getConversationTranscript(
  db: Db,
  pool: Pool,
  conversationId: string
): Promise<TranscriptPayload | null> {
  if (!UUID_RE.test(conversationId)) return null;
  const { tenant, channel, retentionDays, agentId } = await resolveContext(db);

  const [conv] = await db
    .select()
    .from(appConversations)
    .where(
      and(
        eq(appConversations.id, conversationId),
        eq(appConversations.tenantId, tenant.id),
        eq(appConversations.channelId, channel.id)
      )
    )
    .limit(1);
  if (!conv) return null;

  const now = new Date();
  const res = await pool.query(
    `select session_id, runs, created_at, updated_at
       from ai.agno_sessions
      where session_id = $1 and agent_id = $2
      limit 1`,
    [conv.agnoSessionId, agentId]
  );
  const row = res.rows[0] as
    | { runs: unknown; created_at: number | string | null; updated_at: number | string | null }
    | undefined;

  let parsed: ParsedTranscript = EMPTY_TRANSCRIPT;
  if (row) {
    const session: AgnoSession = {
      session_id: conv.agnoSessionId,
      runs: (Array.isArray(row.runs) ? row.runs : null) as AgnoSession["runs"],
      created_at: row.created_at != null ? Number(row.created_at) : null,
      updated_at: row.updated_at != null ? Number(row.updated_at) : null,
    };
    parsed = parseTranscript(session, { retentionDays, now });
  }

  const within = isWithinRetention(conv.lastAt ?? null, retentionDays, now);
  return {
    id: conv.id,
    maskedContact: maskContactId(conv.externalContactId),
    status: conv.status,
    lastAt: conv.lastAt ? conv.lastAt.toISOString() : null,
    transcript: buildTranscriptView(parsed, { withinRetention: within }),
  };
}
