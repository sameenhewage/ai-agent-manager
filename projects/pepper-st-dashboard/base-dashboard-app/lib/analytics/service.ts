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
import { computeUniverseCoverage, type UniverseCoverage } from "./coverage";

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
  // Business-Truth universe coverage (CONTEXT.md §7): how many VALID LIVE sessions exist for
  // this range vs. how many are actually counted (active mapped), with masked, reasoned
  // exclusions for the rest. Never hides an unmapped session.
  coverage: UniverseCoverage;
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

/**
 * READ-ONLY: session_ids of VALID LIVE sessions under the agent in [from, to) — i.e. a
 * derivable contact (`user_id`) and `updated_at` within the range. This is the
 * source-of-truth universe the dashboard SHOULD account for; comparing it to the mapped
 * universe yields the coverage/exclusions. Only SELECT; never mutates `ai.*`.
 */
async function readLiveValidSessionIds(
  pool: Pool,
  agentId: string,
  from: Date,
  to: Date
): Promise<string[]> {
  const res = await pool.query(
    // `updated_at` is epoch SECONDS stored as bigint; compare as double precision so the
    // fractional range bounds (e.g. `to = now`) don't fail a bigint cast.
    `select session_id
       from ai.agno_sessions
      where agent_id = $1
        and user_id is not null and user_id <> ''
        and updated_at is not null
        and updated_at >= $2::double precision and updated_at < $3::double precision`,
    [agentId, from.getTime() / 1000, to.getTime() / 1000]
  );
  return res.rows.map((r) => String(r.session_id));
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

  // Business-Truth coverage (CONTEXT.md §7): reconcile the COUNTED (active mapped) universe
  // against the VALID LIVE sessions for this range, so unmapped/unsynced sessions are
  // surfaced as explicit, masked exclusions instead of being silently dropped. READ-ONLY.
  const agentId = deriveExpectedAgentId(channel.tenantId, channel.id);
  const archivedRows = await db
    .select({ sid: appConversations.agnoSessionId })
    .from(appConversations)
    .where(
      and(
        eq(appConversations.tenantId, tenant.id),
        eq(appConversations.channelId, channel.id),
        eq(appConversations.status, "archived")
      )
    );
  const liveValidSessionIds = await readLiveValidSessionIds(pool, agentId, from, to);
  const coverage = computeUniverseCoverage({
    liveValidSessionIds,
    activeMappedSessionIds: sessionIds,
    archivedSessionIds: archivedRows.map((r) => r.sid),
  });

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
    coverage,
  };
}
