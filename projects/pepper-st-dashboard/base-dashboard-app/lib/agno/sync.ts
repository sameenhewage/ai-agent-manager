import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import * as schema from "../db/schema";
import { appChannels, appConversations } from "../db/schema";
import type { AgnoSession } from "./types";
import {
  buildConversationValues,
  deriveExpectedAgentId,
  deriveExternalContactId,
  resolveChannelForAgent,
  type ChannelLike,
} from "./mapping";

/**
 * Agno -> dashboard mapping sync (Slice 4; simplified in Slice 12D-D / ADR-0012). Reads
 * `ai.agno_sessions` READ-ONLY and upserts ONLY the dashboard-owned conversation index
 * (one row per Agno session). The dashboard keeps NO customer/identity table — the contact
 * is stored by value on `app_conversations.external_contact_id`. Idempotent: re-running
 * creates no duplicates (composite unique on tenant+channel+agno_session_id). Never
 * writes/alters `ai.*`; never stores transcript messages.
 */

type Db = NodePgDatabase<typeof schema>;

export interface SyncResult {
  agentId: string;
  considered: number;
  mapped: number;
  unmapped: number;
  ambiguous: number;
  skippedNoContact: number;
  conversationsCreated: number;
  conversationsUpdated: number;
}

/** READ-ONLY: load Agno sessions for an agent. Only SELECT; never mutates `ai.*`. */
export async function readSessionsByAgent(pool: Pool, agentId: string): Promise<AgnoSession[]> {
  const res = await pool.query(
    `select session_id, session_type, agent_id, user_id, runs, created_at, updated_at, metadata, summary
       from ai.agno_sessions
      where agent_id = $1`,
    [agentId]
  );
  return res.rows.map((r) => ({
    session_id: String(r.session_id),
    session_type: r.session_type ?? null,
    agent_id: r.agent_id ?? null,
    user_id: r.user_id != null ? String(r.user_id) : null,
    runs: Array.isArray(r.runs) ? r.runs : r.runs ?? null,
    created_at: r.created_at != null ? Number(r.created_at) : null,
    updated_at: r.updated_at != null ? Number(r.updated_at) : null,
    metadata: r.metadata ?? null,
    summary: r.summary ?? null,
  }));
}

async function activeChannels(db: Db): Promise<ChannelLike[]> {
  const rows = await db.select().from(appChannels).where(eq(appChannels.isActive, true));
  return rows.map((c) => ({
    id: c.id,
    tenantId: c.tenantId,
    sourceAgentId: c.sourceAgentId,
    isActive: c.isActive,
  }));
}

/** Sync all sessions for one agent into the dashboard conversation index. Idempotent. */
export async function syncAgentSessions(db: Db, pool: Pool, agentId: string): Promise<SyncResult> {
  const channels = await activeChannels(db);
  const sessions = await readSessionsByAgent(pool, agentId);

  const result: SyncResult = {
    agentId,
    considered: sessions.length,
    mapped: 0,
    unmapped: 0,
    ambiguous: 0,
    skippedNoContact: 0,
    conversationsCreated: 0,
    conversationsUpdated: 0,
  };

  for (const session of sessions) {
    const resolution = resolveChannelForAgent(channels, session.agent_id);
    if (resolution.status !== "mapped") {
      if (resolution.status === "ambiguous") result.ambiguous++;
      else result.unmapped++;
      continue;
    }
    const { id: channelId, tenantId } = resolution.channel;
    const externalContactId = deriveExternalContactId(session);
    if (externalContactId == null) {
      // v2: no user_id => no contact; skip rather than create an empty-contact identity.
      result.skippedNoContact++;
      continue;
    }
    result.mapped++;

    const values = buildConversationValues(session, {
      tenantId,
      channelId,
      externalContactId,
    });

    const [existingConv] = await db
      .select()
      .from(appConversations)
      .where(
        and(
          eq(appConversations.tenantId, tenantId),
          eq(appConversations.channelId, channelId),
          eq(appConversations.agnoSessionId, values.agnoSessionId)
        )
      )
      .limit(1);

    if (existingConv) {
      await db
        .update(appConversations)
        .set({
          lastAt: values.lastAt,
          firstAt: existingConv.firstAt ?? values.firstAt,
          updatedAt: new Date(),
        })
        .where(eq(appConversations.id, existingConv.id));
      result.conversationsUpdated++;
    } else {
      await db
        .insert(appConversations)
        .values({
          tenantId,
          channelId,
          agnoSessionId: values.agnoSessionId,
          externalContactId: values.externalContactId,
          status: values.status,
          firstAt: values.firstAt,
          lastAt: values.lastAt,
        })
        .onConflictDoNothing({
          target: [
            appConversations.tenantId,
            appConversations.channelId,
            appConversations.agnoSessionId,
          ],
        });
      result.conversationsCreated++;
    }
  }

  return result;
}

/**
 * Sync every ACTIVE channel using its DERIVED agent_id ("<tenantId>:<channelId>"). This is the v2
 * entry point — no hardcoded agent literal. Multi-tenant/-channel safe (one SyncResult per channel).
 */
export async function syncAllActiveChannels(db: Db, pool: Pool): Promise<SyncResult[]> {
  const channels = await activeChannels(db);
  const results: SyncResult[] = [];
  for (const c of channels) {
    results.push(await syncAgentSessions(db, pool, deriveExpectedAgentId(c.tenantId, c.id)));
  }
  return results;
}
