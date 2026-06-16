import { and, eq, gte, lt, ne } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import * as schema from "../db/schema";
import { appChannels, appConversations, appTenantEntitlements } from "../db/schema";
import { resolveCurrentTenant } from "../tenant/context";
import { deriveExpectedAgentId } from "../agno/mapping";
import { clampToRetention, DEFAULT_TIME_ZONE, resolveRange, type RangeKey } from "./ranges";
import { aggregateAnalytics, type AnalyticsTotals, type DailyPoint } from "./aggregate";
import { buildAnalyticsInputs, collectSessionIds, type SessionMetricsRow } from "./universe";

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

/**
 * READ-ONLY: fetch runs + token/cost metrics for a SPECIFIC set of sessions by `session_id`
 * (the `ai.agno_sessions` PRIMARY KEY), scoped to the derived `agent_id` for defense-in-depth.
 * This is the Slice 12D performance path: it uses the PK instead of a `WHERE agent_id = $1`
 * sequential scan, and fetches ONLY the active/in-range universe — not every session under
 * the agent. Only SELECT; never mutates `ai.*`.
 */
async function readSessionMetricsByIds(
  pool: Pool,
  sessionIds: string[],
  agentId: string
): Promise<SessionMetricsRow[]> {
  if (sessionIds.length === 0) return [];
  const res = await pool.query(
    `select session_id,
            runs,
            created_at,
            updated_at,
            (session_data->'session_metrics'->>'total_tokens') as total_tokens,
            (session_data->'session_metrics'->>'cost')         as cost
       from ai.agno_sessions
      where session_id = any($1::text[])
        and agent_id = $2`,
    [sessionIds, agentId]
  );
  return res.rows as SessionMetricsRow[];
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

  // The analytics UNIVERSE is the tenant/channel's ACTIVE (non-archived) conversations,
  // narrowed to the range AT THE DATABASE using the indexed, dashboard-owned `last_at`
  // (`app_conv_tenant_last_idx`). This is the SAME [from, to) bound the aggregate applies in
  // memory (and the same one db:analytics:verify checks), so totals are unchanged — we simply
  // avoid fetching/parsing out-of-range sessions. `last_at` is whole-seconds (set from the
  // session's epoch `updated_at` at sync), so there is no sub-millisecond boundary edge.
  const conversations = await db
    .select()
    .from(appConversations)
    .where(
      and(
        eq(appConversations.tenantId, tenant.id),
        eq(appConversations.channelId, channel.id),
        ne(appConversations.status, "archived"), // exclude retired (archived) conversations
        gte(appConversations.lastAt, from),
        lt(appConversations.lastAt, to)
      )
    );

  // READ-ONLY Agno read: fetch ONLY this universe's sessions BY `session_id` (PK), never a
  // `WHERE agent_id = $1` scan. Joined in memory by value into PII-free analytics inputs.
  const sessionIds = collectSessionIds(conversations);
  const rows = await readSessionMetricsByIds(
    pool,
    sessionIds,
    deriveExpectedAgentId(channel.tenantId, channel.id)
  );
  const inputs = buildAnalyticsInputs(conversations, rows, now);

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
