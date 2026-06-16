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
  lastDisplayableMessage,
  normalizeCustomerName,
  toRole,
  type ConversationListPayload,
  type LastDisplayableMessage,
  type TranscriptPayload,
} from "./presenter";
import { buildMessagesPage, type ConversationMessagesPageDto } from "./message-pagination";

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
 * Read AI-owned customer display names (READ-ONLY) for a set of contacts. Joins BY VALUE on
 * the confirmed key (tenant_id, channel_id, phone) == (app_conversations tenant, channel,
 * external_contact_id). Returns raw phone -> name; callers normalize + never emit the raw
 * key. NEVER writes `ai.*`. Resilient: on any read error it logs (no PII) and returns an
 * empty map, so name display degrades to the masked contact instead of breaking the list.
 */
async function fetchCustomerNames(
  pool: Pool,
  tenantId: string,
  channelId: string,
  contactIds: string[]
): Promise<Map<string, string | null>> {
  const ids = [...new Set(contactIds.filter((c) => typeof c === "string" && c.trim().length > 0))];
  if (ids.length === 0) return new Map();
  try {
    const res = await pool.query<{ phone: string; name: string | null }>(
      `select phone, name
         from ai.customers
        where tenant_id = $1 and channel_id = $2 and phone = any($3::text[])`,
      [tenantId, channelId, ids]
    );
    return new Map(res.rows.map((r) => [String(r.phone), r.name]));
  } catch (err) {
    // No PII in the message (pg errors are about relation/permission/SQL, not row values).
    console.error(
      "[chat-monitor] ai.customers name lookup failed; falling back to masked contact:",
      err instanceof Error ? err.message : err
    );
    return new Map();
  }
}

/**
 * Conversation LIST. By default (fast path, e.g. the Dashboard) it does one indexed
 * dashboard read + a cheap per-session `jsonb_array_length(runs)` aggregate and NEVER
 * transfers `runs` bodies or parses a transcript. With `{ withPreview: true }` (Chat
 * Monitor) it additionally reads runs (READ-ONLY) and parses them in memory to derive a
 * short, masked-safe last-message preview for the WhatsApp-style list subtitle — runs
 * still NEVER reach the client. Fully masked, serializable either way.
 */
export async function getConversationList(
  db: Db,
  pool: Pool,
  opts: { withPreview?: boolean } = {}
): Promise<ConversationListPayload> {
  const { tenant, channel, retentionDays, agentId } = await resolveContext(db);
  const now = new Date();

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

  // Turn counts (always) + an optional last-message preview (Chat Monitor list only).
  // Slice 12D: fetch BY `session_id` (PK) for THIS universe, not a `WHERE agent_id = $1`
  // sequential scan. `agent_id` is retained as a defensive scope filter (mapping parity).
  const sessionIds = [...new Set(conversations.map((c) => c.agnoSessionId).filter(Boolean))];
  const turnsBySession = new Map<string, number>();
  const previewBySession = new Map<string, LastDisplayableMessage | null>();

  if (opts.withPreview) {
    // WhatsApp-style subtitles need the last message, so read runs (READ-ONLY) and parse in
    // memory. Runs NEVER reach the client — only a short masked-safe preview + the turn
    // count (= runs.length) are emitted. Reuses the canonical parser so the preview matches
    // the transcript exactly (system/tool/empty-assistant filtered, retention applied).
    type RunRow = {
      session_id: string;
      runs: unknown;
      created_at: number | string | null;
      updated_at: number | string | null;
    };
    const rows = sessionIds.length
      ? await pool.query<RunRow>(
          `select session_id, runs, created_at, updated_at
             from ai.agno_sessions
            where session_id = any($1::text[])
              and agent_id = $2`,
          [sessionIds, agentId]
        )
      : { rows: [] as RunRow[] };
    for (const r of rows.rows) {
      const session: AgnoSession = {
        session_id: String(r.session_id),
        runs: (Array.isArray(r.runs) ? r.runs : null) as AgnoSession["runs"],
        created_at: r.created_at != null ? Number(r.created_at) : null,
        updated_at: r.updated_at != null ? Number(r.updated_at) : null,
      };
      const parsed = parseTranscript(session, { retentionDays, now });
      turnsBySession.set(session.session_id, parsed.turnCount);
      previewBySession.set(
        session.session_id,
        lastDisplayableMessage(
          parsed.messages.map((m) => ({
            sender: m.sender,
            content: m.content,
            at: m.at ? m.at.toISOString() : null,
          }))
        )
      );
    }
  } else {
    // Fast path (Dashboard / first paint): the DB computes jsonb_array_length(runs); only
    // ints cross the wire — no runs bodies, no transcript parse.
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
    for (const r of turnRows.rows) turnsBySession.set(String(r.session_id), Number(r.turns) || 0);
  }

  const turnCountById = new Map(
    conversations.map((c) => [c.id, turnsBySession.get(c.agnoSessionId) ?? 0])
  );
  const previewByConversationId = new Map(
    conversations.map((c) => [c.id, previewBySession.get(c.agnoSessionId) ?? null])
  );

  // AI-owned customer display names (READ-ONLY), joined by value on (tenant, channel, phone).
  const namesByContact = await fetchCustomerNames(
    pool,
    tenant.id,
    channel.id,
    conversations.map((c) => c.externalContactId)
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
    { retentionDays, now, namesByContact, previewByConversationId }
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
 * Shared READ-ONLY loader for a single conversation: validates the id (UUID), loads the ONE
 * `app_conversations` row scoped by tenant + channel (IDOR guard), reads ONLY that Agno
 * session's runs (READ-ONLY), resolves the AI-owned customer name, and parses the transcript
 * in memory with retention applied. Returns null for a malformed/foreign id. The raw
 * session/runs/contact id NEVER leave this module.
 */
async function loadConversationForRead(db: Db, pool: Pool, conversationId: string) {
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
  // Read the session runs (READ-ONLY) and the AI-owned customer name in parallel.
  const [res, namesByContact] = await Promise.all([
    pool.query(
      `select session_id, runs, created_at, updated_at
         from ai.agno_sessions
        where session_id = $1 and agent_id = $2
        limit 1`,
      [conv.agnoSessionId, agentId]
    ),
    fetchCustomerNames(pool, tenant.id, channel.id, [conv.externalContactId]),
  ]);
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
  const displayName = normalizeCustomerName(namesByContact.get(conv.externalContactId));
  return { conv, channel, displayName, parsed, within };
}

/**
 * Single TRANSCRIPT (full) — used by the read-only verifier. Returns the full masked
 * transcript view for ONE conversation. The browser uses the paginated
 * `getConversationMessagesPage` instead. Returns null for a malformed/foreign id.
 */
export async function getConversationTranscript(
  db: Db,
  pool: Pool,
  conversationId: string
): Promise<TranscriptPayload | null> {
  const loaded = await loadConversationForRead(db, pool, conversationId);
  if (!loaded) return null;
  const { conv, displayName, parsed, within } = loaded;
  return {
    id: conv.id,
    displayName,
    maskedContact: maskContactId(conv.externalContactId),
    status: conv.status,
    lastAt: conv.lastAt ? conv.lastAt.toISOString() : null,
    transcript: buildTranscriptView(parsed, { withinRetention: within }),
  };
}

/**
 * Paginated MESSAGES page (WhatsApp-like loading) — the browser's per-conversation feed.
 * Loads the latest page first (default 50, oldest→newest) and older pages via an OPAQUE
 * `before` cursor. Reuses the canonical parser (system/tool/empty filtered, retention
 * applied) + the SAME masking/IDOR guards. Returns null for a malformed/foreign id. Never
 * emits raw phone/session/contact id, raw `runs`, or `session_data`.
 */
export async function getConversationMessagesPage(
  db: Db,
  pool: Pool,
  conversationId: string,
  opts: { limit?: number; before?: string | null } = {}
): Promise<ConversationMessagesPageDto | null> {
  const loaded = await loadConversationForRead(db, pool, conversationId);
  if (!loaded) return null;
  const { conv, channel, displayName, parsed, within } = loaded;
  const channelLabel = channel.displayName ?? channel.channelKey;

  if (!within) {
    return {
      conversationId: conv.id,
      displayName,
      channelLabel,
      state: "restricted",
      messages: [],
      hasMoreBefore: false,
      beforeCursor: null,
    };
  }

  // Map parsed messages → safe { role, text, at }; drop any non-displayable (tool) sender.
  const ordered = parsed.messages.flatMap((m) => {
    const role = toRole(m.sender);
    return role ? [{ role, text: m.content, at: m.at ? m.at.toISOString() : null }] : [];
  });

  const slice = buildMessagesPage({
    conversationId: conv.id,
    ordered,
    limit: opts.limit,
    before: opts.before,
  });

  return {
    conversationId: conv.id,
    displayName,
    channelLabel,
    state: ordered.length === 0 ? "empty" : "ok",
    ...slice,
  };
}
