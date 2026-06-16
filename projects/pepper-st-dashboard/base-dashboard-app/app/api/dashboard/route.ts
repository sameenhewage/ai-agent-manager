import { NextResponse } from "next/server";
import { getDb, getPool, maskDbUrl } from "@/lib/db/client";
import { getAnalyticsData } from "@/lib/analytics/service";
import { getConversationList } from "@/lib/chat-monitor/service";
import { runDashboardEndpoint } from "@/lib/api/endpoints";

/**
 * GET /api/dashboard?range=… (Slice 12C / ADR-0013) — dynamic Dashboard payload
 * (`{ analytics, recent, restrictedCount }`) for a validated range. THIN HTTP boundary:
 * it validates the safe client inputs, resolves tenant/channel SERVER-side via the
 * services (the source of truth), and returns masked, safe DTOs only. Server-only (imports
 * `pg` via the services). Read-only; never writes to `dashboard.*` or `ai.*`.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const result = await runDashboardEndpoint(searchParams, {
    loadAnalytics: (range) =>
      getAnalyticsData(getDb(), getPool(), {
        rangeKey: range.key,
        customFrom: range.customFrom,
        customTo: range.customTo,
      }),
    loadRecent: () => getConversationList(getDb(), getPool()),
    onError: (err) =>
      console.error(
        "[api/dashboard] failed:",
        maskDbUrl(),
        err instanceof Error ? err.message : err
      ),
  });
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "cache-control": "no-store" },
  });
}
