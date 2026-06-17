import { and, eq, ne, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import * as schema from "../db/schema";
import {
  appChannels,
  appConversations,
  appConversationSessions,
  appTenantEntitlements,
} from "../db/schema";
import { resolveCurrentTenant } from "../tenant/context";
import { parseTranscript } from "../agno/parser";
import { deriveExpectedAgentId } from "../agno/mapping";
import { maskContactId } from "../agno/mask";
import { DEFAULT_TIME_ZONE } from "../format/time";
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
import { mergeThreadMessages } from "./thread";

/**
 * Server-side Chat Monitor data flow (Slice 5). Reads dashboard mapping tables +
 * `ai.agno_sessions` (READ-ONLY), parses transcripts in memory (never persisted), and
 * returns fully-masked, serializable view models for the client. No DB credentials or
 * raw contact/session ids ever cross into the returned payload.
 */

type Db = NodePgDatabase<typeof schema>;

export const WHATSAPP_CHANNEL_KEY = "whatsapp-main";

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
    timeZone: tenant.timezone || DEFAULT_TIME_ZONE,
    retentionDays,
    retentionLabel: retentionDays == null ? "Unlimited" : `${retentionDays} days`,
    conversations: items,
    restrictedCount,
  };
}

/**
 * Shared READ-ONLY loader for a CONTACT THREAD (ADR-0016 Gate B). Validates the id (UUID), loads the
 * selected `app_conversations` row scoped by tenant + channel (IDOR guard), then EXPANDS to the full
 * contact thread: all non-archived conversations for the same (tenant, channel, external_contact_id)
 * boundary. It gathers every linked provider session id (`app_conversation_sessions` UNION the
 * conversations' own `agno_session_id`), reads the matching `ai.agno_sessions` rows (READ-ONLY, BY
 * value), and MERGES them (dedupe by provider message id, time-sorted, retention applied). Sessions
 * absent from `ai.agno_sessions` (archived/legacy) are skipped — never a crash. Returns null for a
 * malformed/foreign id. Raw session/runs/contact ids NEVER leave this module.
 */
async function loadContactThreadForRead(db: Db, pool: Pool, conversationId: string) {
  if (!UUID_RE.test(conversationId)) return null;
  const { tenant, channel, retentionDays, agentId } = await resolveContext(db);

  // 1) IDOR-guarded load of the SELECTED conversation (the representative id from the list).
  const [selected] = await db
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
  if (!selected) return null;

  // 2) Expand to the contact thread: all NON-ARCHIVED conversations for this contact boundary. The
  //    selected row is always included (even if it is itself archived).
  const siblings = await db
    .select()
    .from(appConversations)
    .where(
      and(
        eq(appConversations.tenantId, tenant.id),
        eq(appConversations.channelId, channel.id),
        eq(appConversations.externalContactId, selected.externalContactId),
        ne(appConversations.status, "archived")
      )
    );
  const memberById = new Map(siblings.map((c) => [c.id, c]));
  memberById.set(selected.id, selected);
  const members = [...memberById.values()];
  const memberIds = members.map((m) => m.id);

  // 3) Collect provider session ids: ADR-0016 links for these conversations UNION the conversations'
  //    own agno_session_id (backward-compatible with any not-yet-linked row). De-duplicated by value.
  const linkRows = await db
    .select({ externalSessionId: appConversationSessions.externalSessionId })
    .from(appConversationSessions)
    .where(
      and(
        eq(appConversationSessions.tenantId, tenant.id),
        eq(appConversationSessions.provider, "agno"),
        inArray(appConversationSessions.conversationId, memberIds)
      )
    );
  const sessionIdSet = new Set<string>();
  for (const l of linkRows) if (l.externalSessionId) sessionIdSet.add(l.externalSessionId);
  for (const m of members) if (m.agnoSessionId) sessionIdSet.add(m.agnoSessionId);
  const sessionIds = [...sessionIdSet];

  const now = new Date();
  // 4) Read the matching Agno sessions (READ-ONLY, BY value) + the AI-owned name in parallel. Some
  //    linked sessions may be absent from ai.agno_sessions (live: 19 conversations vs 11 sessions).
  const [res, namesByContact] = await Promise.all([
    pool.query<{
      session_id: string;
      runs: unknown;
      created_at: number | string | null;
      updated_at: number | string | null;
    }>(
      `select session_id, runs, created_at, updated_at
         from ai.agno_sessions
        where session_id = any($1::text[]) and agent_id = $2`,
      [sessionIds, agentId]
    ),
    fetchCustomerNames(pool, tenant.id, channel.id, [selected.externalContactId]),
  ]);

  const found = new Set(res.rows.map((r) => String(r.session_id)));
  const missingSessionCount = sessionIds.filter((id) => !found.has(id)).length;
  if (missingSessionCount > 0) {
    // Counts only (no PII): some linked sessions are absent from ai.agno_sessions (archived/legacy).
    console.warn(
      `[chat-monitor] contact thread: ${missingSessionCount}/${sessionIds.length} linked session(s) ` +
        "absent from ai.agno_sessions; rendering available messages only."
    );
  }
  const sessions: AgnoSession[] = res.rows.map((r) => ({
    session_id: String(r.session_id),
    runs: (Array.isArray(r.runs) ? r.runs : null) as AgnoSession["runs"],
    created_at: r.created_at != null ? Number(r.created_at) : null,
    updated_at: r.updated_at != null ? Number(r.updated_at) : null,
  }));

  // 5) Merge across ALL sessions of the thread (dedupe by provider id, time-sorted, retention).
  const merged = mergeThreadMessages(sessions, { retentionDays, now });

  // Thread-level metadata (mirrors the list presenter's grouping rules).
  const groupLastAt = members.reduce<Date | null>(
    (acc, m) => (m.lastAt && (!acc || m.lastAt > acc) ? m.lastAt : acc),
    null
  );
  const statuses = new Set(members.map((m) => m.status));
  const status = statuses.has("open")
    ? "open"
    : statuses.has("resolved")
      ? "resolved"
      : selected.status;
  const within = isWithinRetention(groupLastAt, retentionDays, now);
  const displayName = normalizeCustomerName(namesByContact.get(selected.externalContactId));

  return {
    conversationId, // echo the requested (representative) id
    externalContactId: selected.externalContactId,
    channel,
    displayName,
    status,
    groupLastAt,
    within,
    merged,
    sessionCount: sessionIds.length,
    missingSessionCount,
  };
}

/**
 * Single TRANSCRIPT (full) — used by the read-only verifier. Returns the full masked transcript view
 * for the CONTACT THREAD (all linked provider sessions merged into one continuous transcript).
 * The browser uses the paginated `getConversationMessagesPage` instead. Null for a malformed/foreign id.
 */
export async function getConversationTranscript(
  db: Db,
  pool: Pool,
  conversationId: string
): Promise<TranscriptPayload | null> {
  const loaded = await loadContactThreadForRead(db, pool, conversationId);
  if (!loaded) return null;
  const { merged, within, displayName, status, groupLastAt, externalContactId } = loaded;
  // Shape the merged thread into the existing ParsedTranscript view contract.
  const parsed: ParsedTranscript = {
    messages: merged.messages.map((m) => ({
      id: m.providerId,
      role: m.sender === "bot" ? "assistant" : m.sender === "customer" ? "user" : "tool",
      sender: m.sender,
      content: m.content,
      at: m.at,
    })),
    messageCount: merged.messageCount,
    turnCount: merged.turnCount,
    lastActivityAt: merged.lastActivityAt,
  };
  return {
    id: loaded.conversationId,
    displayName,
    maskedContact: maskContactId(externalContactId),
    status,
    lastAt: groupLastAt ? groupLastAt.toISOString() : null,
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
  const loaded = await loadContactThreadForRead(db, pool, conversationId);
  if (!loaded) return null;
  const { merged, within, displayName, channel } = loaded;
  const channelLabel = channel.displayName ?? channel.channelKey;

  if (!within) {
    return {
      conversationId: loaded.conversationId,
      displayName,
      channelLabel,
      state: "restricted",
      messages: [],
      hasMoreBefore: false,
      beforeCursor: null,
    };
  }

  // Map merged messages → safe { role, text, at, key }; drop non-displayable (tool) senders. `key`
  // is the STABLE provider message id, hashed into the opaque DTO id by buildMessagesPage (merged
  // threads can shift a message's absolute index, so positional ids would not be stable).
  const ordered = merged.messages.flatMap((m) => {
    const role = toRole(m.sender);
    return role
      ? [
          {
            role,
            text: m.content,
            at: m.at ? m.at.toISOString() : null,
            key: m.providerId ?? undefined,
          },
        ]
      : [];
  });

  const slice = buildMessagesPage({
    conversationId: loaded.conversationId,
    ordered,
    limit: opts.limit,
    before: opts.before,
  });

  return {
    conversationId: loaded.conversationId,
    displayName,
    channelLabel,
    state: ordered.length === 0 ? "empty" : "ok",
    ...slice,
  };
}
