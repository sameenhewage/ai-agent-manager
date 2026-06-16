import type { Metadata } from "next";
import { TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/shell/empty-state";
import { Badge } from "@/components/ui/badge";
import { getDb, getPool, maskDbUrl } from "@/lib/db/client";
import { getAnalyticsData, type AnalyticsData } from "@/lib/analytics/service";
import { parseRangeParams } from "@/lib/analytics/ranges";
import { Analytics } from "@/components/analytics/analytics";

export const metadata: Metadata = { title: "Analytics" };

// Reads the database at request time (tenant-scoped, live Agno metrics) — never
// prerendered at build, so `next build` never opens a DB connection.
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const { key, customFrom, customTo } = parseRangeParams({
    range: sp.range,
    from: sp.from,
    to: sp.to,
  });

  let data: AnalyticsData | null = null;
  let failed = false;
  try {
    data = await getAnalyticsData(getDb(), getPool(), {
      rangeKey: key,
      customFrom,
      customTo,
    });
  } catch (err) {
    failed = true;
    // Mask connection details; never log secrets or raw phone numbers.
    console.error(
      "[analytics] failed to load:",
      maskDbUrl(),
      err instanceof Error ? err.message : err
    );
  }

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Date-filtered, real metrics in the tenant timezone — conversation volume, turns, tokens and cost."
      >
        <Badge variant="ai">Real data only</Badge>
      </PageHeader>

      {failed || !data ? (
        <EmptyState icon={TriangleAlert} title="Couldn&rsquo;t load analytics">
          The metrics couldn&rsquo;t be computed right now. Confirm the dashboard database is
          reachable, then refresh. The upstream Agno data is never modified.
        </EmptyState>
      ) : (
        <Analytics initialData={{ analytics: data }} initialSelection={{ key, customFrom, customTo }} />
      )}
    </>
  );
}
