import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import * as schema from "../db/schema";
import { appChannels, appConversations, appConversationSessions } from "../db/schema";
import type { AgnoSession } from "./types";
import {
  buildConversationValues,
  buildSessionLinkValues,
  deriveExpectedAgentId,
  deriveExternalContactId,
  resolveChannelForAgent,
  type ChannelLike,
  type ConversationValues,
  type SessionLinkValues,
} from "./mapping";

/**
 * Agno -> dashboard mapping sync (Slice 4; simplified in Slice 12D-D / ADR-0012; dual-write
 * added in ADR-0016 Gate B; contact-thread grain in ADR-0016 Gate C.2). Reads `ai.agno_sessions`
 * READ-ONLY and writes ONLY dashboard-owned tables: the conversation index (`app_conversations`,
 * ONE row per CONTACT THREAD = tenant+channel+external_contact_id) AND, for each synced session,
 * the provider/session link (`app_conversation_sessions`). The contact is stored by value on
 * `app_conversations.external_contact_id`; the link references the session BY VALUE
 * (`external_session_id`). Idempotent: re-running creates no duplicates (conversation unique on
 * tenant+channel+external_contact_id; link unique on tenant+provider+external_session_id — re-sync
 * updates `last_at`). A NEW session of an EXISTING contact reuses that contact's conversation row
 * (no second row) and only upserts a new session link. Never writes/alters `ai.*`; never stores
 * transcript messages; never merges two distinct contacts.
 *
 * All dashboard reads/writes go through ONE `SyncGateway` (single owner; testable with a fake
 * gateway). The only `ai.*` access is the READ-ONLY `readSessionsByAgent` SELECT below.
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
  sessionLinksUpserted: number;
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

/**
 * The SINGLE owner of dashboard reads/writes for the sync (ADR-0016 Gate B). All methods target
 * ONLY `dashboard.*` — there is deliberately NO method that can touch `ai.*` (that schema is read
 * exclusively via the READ-ONLY `readSessionsByAgent` SELECT, kept separate). A fake gateway makes
 * the orchestration unit-testable without a DB.
 */
export interface SyncGateway {
  activeChannels(): Promise<ChannelLike[]>;
  /** Find the contact-thread conversation id by (tenant, channel, external_contact_id), or null.
   *  Deterministic if legacy duplicates still exist (pre-collapse): canonical = non-archived first,
   *  then latest last_at, then id. */
  findConversationId(
    tenantId: string,
    channelId: string,
    externalContactId: string
  ): Promise<string | null>;
  /** Insert a conversation; returns its id and whether THIS call created it (false on conflict). */
  insertConversation(values: ConversationValues): Promise<{ id: string; created: boolean }>;
  /** Bump last_at (and fill first_at only if currently null). Never clears existing first_at. */
  updateConversationActivity(
    id: string,
    lastAt: Date | null,
    firstAtIfMissing: Date | null
  ): Promise<void>;
  /** Idempotent upsert of the provider/session link (ON CONFLICT updates last_at; no duplicate). */
  upsertSessionLink(values: SessionLinkValues): Promise<void>;
}

/** Default drizzle-backed gateway — the only place that maps the sync to real `dashboard.*` SQL. */
export function createDrizzleGateway(db: Db): SyncGateway {
  return {
    async activeChannels() {
      const rows = await db.select().from(appChannels).where(eq(appChannels.isActive, true));
      return rows.map((c) => ({
        id: c.id,
        tenantId: c.tenantId,
        sourceAgentId: c.sourceAgentId,
        isActive: c.isActive,
      }));
    },

    async findConversationId(tenantId, channelId, externalContactId) {
      const [row] = await db
        .select({ id: appConversations.id })
        .from(appConversations)
        .where(
          and(
            eq(appConversations.tenantId, tenantId),
            eq(appConversations.channelId, channelId),
            eq(appConversations.externalContactId, externalContactId)
          )
        )
        // Deterministic canonical pick if legacy duplicates still exist (pre-collapse).
        .orderBy(
          sql`(${appConversations.status} = 'archived')::int asc, ${appConversations.lastAt} desc nulls last, ${appConversations.id} asc`
        )
        .limit(1);
      return row?.id ?? null;
    },

    async insertConversation(values) {
      const inserted = await db
        .insert(appConversations)
        .values({
          tenantId: values.tenantId,
          channelId: values.channelId,
          // Compatibility (Gate C.2): agno_session_id stays NOT NULL — store the CURRENT session id
          // as a temporary legacy value. It is NO LONGER the identity key (removed in Gate C.3).
          agnoSessionId: values.agnoSessionId,
          externalContactId: values.externalContactId,
          status: values.status,
          firstAt: values.firstAt,
          lastAt: values.lastAt,
        })
        .onConflictDoNothing({
          // Contact-thread identity (ADR-0016 Gate C.2): one row per (tenant, channel, contact).
          target: [
            appConversations.tenantId,
            appConversations.channelId,
            appConversations.externalContactId,
          ],
        })
        .returning({ id: appConversations.id });
      if (inserted[0]?.id) return { id: inserted[0].id, created: true };
      // Pre-existing contact thread (or insert race): re-select by contact key (dashboard-only).
      const existingId = await this.findConversationId(
        values.tenantId,
        values.channelId,
        values.externalContactId
      );
      return { id: existingId as string, created: false };
    },

    async updateConversationActivity(id, lastAt, firstAtIfMissing) {
      await db
        .update(appConversations)
        .set({
          lastAt,
          // keep the earliest known first_at; only fill when currently null
          firstAt: sql`coalesce(${appConversations.firstAt}, ${firstAtIfMissing})`,
          updatedAt: new Date(),
        })
        .where(eq(appConversations.id, id));
    },

    async upsertSessionLink(values) {
      await db
        .insert(appConversationSessions)
        .values({
          tenantId: values.tenantId,
          businessId: values.businessId,
          conversationId: values.conversationId,
          provider: values.provider,
          externalSessionId: values.externalSessionId,
          startedAt: values.startedAt,
          lastAt: values.lastAt,
        })
        .onConflictDoUpdate({
          target: [
            appConversationSessions.tenantId,
            appConversationSessions.provider,
            appConversationSessions.externalSessionId,
          ],
          // Re-sync of the same session bumps last_at — NEVER inserts a duplicate link.
          set: { lastAt: values.lastAt, updatedAt: new Date() },
        });
    },
  };
}

/**
 * Testable core: sync all sessions for one agent. Reads `ai.agno_sessions` READ-ONLY (via `pool`)
 * and routes EVERY dashboard write through the gateway. For each mapped session it (1) resolves or
 * creates the CONTACT-THREAD conversation (keyed by external_contact_id — one row per contact) and
 * (2) upserts the ADR-0016 provider/session link (idempotently). Never merges two distinct
 * contacts; never writes `ai.*`.
 */
export async function runAgentSync(
  gateway: SyncGateway,
  pool: Pool,
  agentId: string
): Promise<SyncResult> {
  const channels = await gateway.activeChannels();
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
    sessionLinksUpserted: 0,
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

    const values = buildConversationValues(session, { tenantId, channelId, externalContactId });

    // 1) Resolve or create the CONTACT-THREAD conversation (ADR-0016 Gate C.2: keyed by
    //    external_contact_id, NOT agno_session_id — a new session of an existing contact reuses
    //    the same conversation row instead of creating a second one).
    let conversationId = await gateway.findConversationId(tenantId, channelId, externalContactId);
    if (conversationId) {
      await gateway.updateConversationActivity(conversationId, values.lastAt, values.firstAt);
      result.conversationsUpdated++;
    } else {
      const ins = await gateway.insertConversation(values);
      conversationId = ins.id;
      if (ins.created) result.conversationsCreated++;
      else result.conversationsUpdated++;
    }

    // 2) ADR-0016 Gate B dual-write: idempotent provider/session link. Links BY VALUE; no ai.*
    //    write; no collapse. Re-syncing the same session updates last_at (never duplicates).
    if (conversationId) {
      await gateway.upsertSessionLink(
        buildSessionLinkValues(session, { tenantId, conversationId })
      );
      result.sessionLinksUpserted++;
    }
  }

  return result;
}

/** Sync all sessions for one agent into the dashboard tables. Idempotent. */
export async function syncAgentSessions(db: Db, pool: Pool, agentId: string): Promise<SyncResult> {
  return runAgentSync(createDrizzleGateway(db), pool, agentId);
}

/**
 * Sync every ACTIVE channel using its DERIVED agent_id ("<tenantId>:<channelId>"). This is the v2
 * entry point — no hardcoded agent literal. Multi-tenant/-channel safe (one SyncResult per channel).
 */
export async function syncAllActiveChannels(db: Db, pool: Pool): Promise<SyncResult[]> {
  const gateway = createDrizzleGateway(db);
  const channels = await gateway.activeChannels();
  const results: SyncResult[] = [];
  for (const c of channels) {
    results.push(await runAgentSync(gateway, pool, deriveExpectedAgentId(c.tenantId, c.id)));
  }
  return results;
}
