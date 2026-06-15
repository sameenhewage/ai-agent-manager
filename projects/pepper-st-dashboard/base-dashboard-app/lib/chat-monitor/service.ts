import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import * as schema from "../db/schema";
import { appChannels, appConversations, appTenantEntitlements } from "../db/schema";
import { resolveCurrentTenant } from "../tenant/context";
import { readSessionsByAgent } from "../agno/sync";
import { parseTranscript } from "../agno/parser";
import type { ParsedTranscript } from "../agno/types";
import {
  buildConversationList,
  buildTranscriptView,
  isWithinRetention,
  type ChatMonitorConversation,
  type ChatMonitorData,
  type SessionSummary,
  type TranscriptView,
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

export async function getChatMonitorData(db: Db, pool: Pool): Promise<ChatMonitorData> {
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

  const conversations = await db
    .select()
    .from(appConversations)
    .where(and(eq(appConversations.tenantId, tenant.id), eq(appConversations.channelId, channel.id)));

  // READ-ONLY Agno read; parse each transcript in memory (retention applied at read time).
  const sessions = await readSessionsByAgent(pool, channel.sourceAgentId ?? "concierge");
  const sessionById = new Map(sessions.map((s) => [s.session_id, s]));

  const now = new Date();
  const summaries = new Map<string, SessionSummary>();
  const transcriptByConv = new Map<string, TranscriptView>();

  for (const c of conversations) {
    const session = sessionById.get(c.agnoSessionId);
    const parsed = session ? parseTranscript(session, { retentionDays, now }) : EMPTY_TRANSCRIPT;
    summaries.set(c.id, {
      messageCount: parsed.messageCount,
      turnCount: parsed.turnCount,
      lastActivityAt: parsed.lastActivityAt,
    });
    const within = isWithinRetention(c.lastAt ?? null, retentionDays, now);
    transcriptByConv.set(c.id, buildTranscriptView(parsed, { withinRetention: within }));
  }

  const { items, restrictedCount } = buildConversationList(
    conversations.map((c) => ({
      id: c.id,
      externalContactId: c.externalContactId,
      status: c.status,
      firstAt: c.firstAt,
      lastAt: c.lastAt,
    })),
    summaries,
    { retentionDays, now }
  );

  const out: ChatMonitorConversation[] = items.map((it) => ({
    ...it,
    transcript: transcriptByConv.get(it.id) ?? {
      state: "empty",
      messages: [],
      messageCount: 0,
      turnCount: 0,
      lastActivityAt: null,
    },
  }));

  return {
    tenantName: tenant.name,
    channelLabel: channel.displayName ?? channel.channelKey,
    retentionDays,
    retentionLabel: retentionDays == null ? "Unlimited" : `${retentionDays} days`,
    conversations: out,
    restrictedCount,
  };
}
