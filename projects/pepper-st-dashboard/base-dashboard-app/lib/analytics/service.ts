import { and, eq, ne } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import * as schema from "../db/schema";
import { appChannels, appConversations, appTenantEntitlements } from "../db/schema";
import { resolveCurrentTenant } from "../tenant/context";
import { parseTranscript } from "../agno/parser";
import { deriveExpectedAgentId } from "../agno/mapping";
import type { AgnoSession } from "../agno/types";
import { clampToRetention, DEFAULT_TIME_ZONE, resolveRange, type RangeKey } from "./ranges";
import {
  aggregateAnalytics,
  type AnalyticsSessionInput,
  type AnalyticsTotals,
  type DailyPoint,
} from "./aggregate";

/**
 * Server-side Analytics data flow (Slice 6). Universe = the tenant/channel's MAPPED
 * `app_conversations`, joined by value to `ai.agno_sessions` (READ-ONLY) for runs +
 * `session_data.session_metrics`. Ranges are tenant-timezone aware and clamped by
 * `analytics_retention_days` (NULL = unlimited). Returns an aggregate, serializable
 * payload with NO per-contact identifiers (analytics is inherently PII-free here) and
 * NO fabricated KPIs (ADR-0007). No writes to `ai.*`.
 */

type Db = NodePgDatabase<typeof schema>;

export const WHATSAPP_CHANNEL_KEY = "whatsapp-main";

export interface AnalyticsRangeInfo {
  key: RangeKey;
  label: string;
  fromISO: string;
  toISO: string;
}

export interface AnalyticsData {
  tenantName: string;
  channelLabel: string;
  timeZone: string;
  analyticsRetentionDays: number | null;
  retentionLabel: string;
  range: AnalyticsRangeInfo;
  clamped: boolean; // requested range exceeded the analytics cap
  requestedFromISO: string | null; // original (pre-clamp) lower bound when clamped
  totals: AnalyticsTotals;
  series: DailyPoint[];
}

export interface GetAnalyticsParams {
  rangeKey: RangeKey;
  customFrom?: string | null;
  customTo?: string | null;
  now?: Date;
}

interface AnalyticsRow {
  session_id: string;
  runs: unknown;
  created_at: number | string | null;
  updated_at: number | string | null;
  total_tokens: string | null;
  cost: string | null;
}

/** READ-ONLY: runs + token/cost metrics for an agent. Only SELECT; never mutates `ai.*`. */
async function readAnalyticsRows(pool: Pool, agentId: string): Promise<AnalyticsRow[]> {
  const res = await pool.query(
    `select session_id,
            runs,
            created_at,
            updated_at,
            (session_data->'session_metrics'->>'total_tokens') as total_tokens,
            (session_data->'session_metrics'->>'cost')         as cost
       from ai.agno_sessions
      where agent_id = $1`,
    [agentId]
  );
  return res.rows as AnalyticsRow[];
}

function num(value: string | null): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function getAnalyticsData(
  db: Db,
  pool: Pool,
  params: GetAnalyticsParams
): Promise<AnalyticsData> {
  const now = params.now ?? new Date();

  const tenant = await resolveCurrentTenant(db);
  if (!tenant) throw new Error("Demo tenant not found.");
  const timeZone = tenant.timezone || DEFAULT_TIME_ZONE;

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
  const analyticsRetentionDays = entitlement?.analyticsRetentionDays ?? null;

  // Resolve requested range in the tenant timezone, then clamp by analytics retention.
  const resolved = resolveRange(params.rangeKey, {
    now,
    timeZone,
    customFrom: params.customFrom,
    customTo: params.customTo,
  });
  const { from, clamped, requestedFrom } = clampToRetention(
    resolved.from,
    now,
    analyticsRetentionDays
  );
  const to = resolved.to;
  const requestedFromISO = requestedFrom ? requestedFrom.toISOString() : null;

  // Tenant/channel-scoped mapped conversations = the analytics universe.
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

  // READ-ONLY Agno read (runs + metrics), joined in memory by session id.
  const rows = await readAnalyticsRows(pool, deriveExpectedAgentId(channel.tenantId, channel.id));
  const rowById = new Map(rows.map((r) => [String(r.session_id), r]));

  const inputs: AnalyticsSessionInput[] = conversations.map((c) => {
    const row = rowById.get(c.agnoSessionId);
    let turnCount = 0;
    let messageCount = 0;
    if (row) {
      const session: AgnoSession = {
        session_id: c.agnoSessionId,
        runs: (Array.isArray(row.runs) ? row.runs : null) as AgnoSession["runs"],
        created_at: row.created_at != null ? Number(row.created_at) : null,
        updated_at: row.updated_at != null ? Number(row.updated_at) : null,
      };
      // Analytics cap is applied at the RANGE level (below), not per message.
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
  });

  const { totals, series } = aggregateAnalytics(inputs, { from, to, timeZone });

  return {
    tenantName: tenant.name,
    channelLabel: channel.displayName ?? channel.channelKey,
    timeZone,
    analyticsRetentionDays,
    retentionLabel: analyticsRetentionDays == null ? "Unlimited" : `${analyticsRetentionDays} days`,
    range: {
      key: resolved.key,
      label: resolved.label,
      fromISO: from.toISOString(),
      toISO: to.toISOString(),
    },
    clamped,
    requestedFromISO,
    totals,
    series,
  };
}
