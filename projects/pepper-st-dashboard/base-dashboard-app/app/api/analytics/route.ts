import { NextResponse } from "next/server";
import { getDb, getPool, maskDbUrl } from "@/lib/db/client";
import { getAnalyticsData } from "@/lib/analytics/service";
import { runAnalyticsEndpoint } from "@/lib/api/endpoints";

/**
 * GET /api/analytics?range=&from=&to= (Slice 12C / ADR-0013) — dynamic Analytics payload
 * (`{ analytics }`) for a validated range (custom supported). THIN HTTP boundary: validates
 * the safe client inputs, resolves tenant/channel SERVER-side via the service (the source of
 * truth), returns an aggregate, PII-free DTO. Server-only; read-only; never writes.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const result = await runAnalyticsEndpoint(searchParams, {
    loadAnalytics: (range) =>
      getAnalyticsData(getDb(), getPool(), {
        rangeKey: range.key,
        customFrom: range.customFrom,
        customTo: range.customTo,
      }),
    onError: (err) =>
      console.error(
        "[api/analytics] failed:",
        maskDbUrl(),
        err instanceof Error ? err.message : err
      ),
  });
  return NextResponse.json(result.body, {
    status: result.status,
    headers: { "cache-control": "no-store" },
  });
}
