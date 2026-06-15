import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/shell/empty-state";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Analytics" };

export default function AnalyticsPage() {
  return (
    <>
      <PageHeader
        title="Analytics"
        description="Date-filtered, real metrics in the tenant timezone — conversation volume, turns, tokens and cost."
      >
        <Badge variant="ai">Real data only</Badge>
      </PageHeader>

      <EmptyState icon={BarChart3} title="Analytics lands in a later slice">
        Timezone-aware ranges (Today / 7D / 30D / Custom) and real Agno-derived
        metrics are built in Slice 6. No KPIs are shown without a real source —
        nothing is fabricated.
      </EmptyState>
    </>
  );
}
