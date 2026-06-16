import type { Metadata } from "next";
import { TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/shell/empty-state";
import { Badge } from "@/components/ui/badge";
import { getDb, getPool, maskDbUrl } from "@/lib/db/client";
import { getAnalyticsData } from "@/lib/analytics/service";
import { getConversationList } from "@/lib/chat-monitor/service";
import { parseRangeParams } from "@/lib/analytics/ranges";
import { Dashboard, type DashboardData } from "@/components/dashboard/dashboard";

export const metadata: Metadata = { title: "Dashboard" };

// Reads live, tenant-scoped Agno metrics at request time (never prerendered), so
// `next build` opens no DB connection and the KPIs are always real/current.
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Dashboard (Slice 7C) — a dense, real-data operations overview. The page reads the same
 * Analytics aggregate that powers the Analytics report (KPIs + daily series) plus the
 * masked Chat Monitor list (recent conversations), then hands a PII-free payload to the
 * server-rendered `<Dashboard/>`. Range is a `?range=` param (Today/3D/7D/14D/30D/Month);
 * custom ranges live on Analytics. No DB access in the browser; no fabricated metrics.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const { key } = parseRangeParams({ range: sp.range });

  let initialData: DashboardData | null = null;
  let failed = false;
  try {
    const db = getDb();
    const pool = getPool();
    const [analytics, list] = await Promise.all([
      getAnalyticsData(db, pool, { rangeKey: key }),
      getConversationList(db, pool),
    ]);
    initialData = {
      analytics,
      recent: list.conversations,
      restrictedCount: list.restrictedCount,
    };
  } catch (err) {
    failed = true;
    console.error(
      "[dashboard] failed to load:",
      maskDbUrl(),
      err instanceof Error ? err.message : err
    );
  }

  if (failed || !initialData) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader
          title="AI Chat Operations"
          description="Read-only, real-data overview of the PEPPER ST. WhatsApp AI agent."
        >
          <Badge variant="ai">Real data only</Badge>
        </PageHeader>
        <EmptyState icon={TriangleAlert} title="Couldn&rsquo;t load the dashboard">
          The metrics couldn&rsquo;t be computed right now. Confirm the dashboard database is
          reachable, then refresh. The upstream Agno data is never modified.
        </EmptyState>
      </div>
    );
  }

  return <Dashboard initialData={initialData} initialRange={key} />;
}
