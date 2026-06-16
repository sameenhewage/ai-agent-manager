import { parseAnalyticsQuery, type ValidatedRange } from "./query";
import type { AnalyticsData } from "../analytics/service";
import type { ConversationListItem } from "../chat-monitor/presenter";

/**
 * Slice 12C (ADR-0013) — dependency-injected cores for the internal Dashboard/Analytics
 * API routes. These hold the HTTP-boundary CONTRACT (validate inputs → call the injected
 * service loader → shape a safe DTO → map errors), with NO DB access of their own, so the
 * route handlers stay thin and this logic is unit-testable without credentials.
 *
 * Safety invariants enforced here:
 * - tenant/channel are resolved server-side by the injected loaders; the client query is
 *   only ever read for `range`/`from`/`to` (see `parseAnalyticsQuery`);
 * - recent items are passed through `pickRecentItem`, a whitelist that drops any raw
 *   `external_contact_id` / `agno_session_id` / removed customer ids (defense-in-depth);
 * - failures map to a generic message (never the raw error/DB URL); the caller logs via
 *   `onError` (masked).
 */

export interface EndpointResponse {
  status: number;
  body: unknown;
}

/** Whitelist a recent-conversation item down to the safe, masked DTO. */
export function pickRecentItem(item: ConversationListItem): ConversationListItem {
  return {
    id: item.id,
    displayName: item.displayName, // safe AI-owned name (or null); never a raw phone
    maskedContact: item.maskedContact,
    status: item.status,
    firstAt: item.firstAt,
    lastAt: item.lastAt,
    turnCount: item.turnCount,
  };
}

export interface RecentResult {
  conversations: ConversationListItem[];
  channelLabel: string;
  retentionLabel: string;
  restrictedCount: number;
}

export interface AnalyticsDeps {
  loadAnalytics: (range: ValidatedRange) => Promise<AnalyticsData>;
  onError?: (err: unknown) => void;
}

export interface DashboardDeps extends AnalyticsDeps {
  loadRecent: () => Promise<RecentResult>;
}

/** GET /api/analytics — { analytics } for a validated range (custom supported). */
export async function runAnalyticsEndpoint(
  params: URLSearchParams,
  deps: AnalyticsDeps
): Promise<EndpointResponse> {
  const parsed = parseAnalyticsQuery(params);
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
  try {
    const analytics = await deps.loadAnalytics(parsed.value);
    return { status: 200, body: { analytics } };
  } catch (err) {
    deps.onError?.(err);
    return { status: 500, body: { error: "Failed to load analytics." } };
  }
}

/** GET /api/dashboard — { analytics, recent, restrictedCount } for a validated range. */
export async function runDashboardEndpoint(
  params: URLSearchParams,
  deps: DashboardDeps
): Promise<EndpointResponse> {
  const parsed = parseAnalyticsQuery(params);
  if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
  try {
    const [analytics, recent] = await Promise.all([deps.loadAnalytics(parsed.value), deps.loadRecent()]);
    return {
      status: 200,
      body: {
        analytics,
        recent: recent.conversations.map(pickRecentItem),
        channelLabel: recent.channelLabel,
        retentionLabel: recent.retentionLabel,
        restrictedCount: recent.restrictedCount,
      },
    };
  } catch (err) {
    deps.onError?.(err);
    return { status: 500, body: { error: "Failed to load dashboard." } };
  }
}
