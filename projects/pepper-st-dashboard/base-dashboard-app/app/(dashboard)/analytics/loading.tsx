import { BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Route-level skeleton (Slice 7) shown instantly while the Analytics server component
 * computes its metrics, so the page never flashes blank.
 */
export default function AnalyticsLoading() {
  return (
    <>
      <PageHeader
        title="Analytics"
        description="Date-filtered, real metrics in the tenant timezone — conversation volume, turns, tokens and cost."
      >
        <Badge variant="ai">Real data only</Badge>
      </PageHeader>

      <div className="mb-4 h-12 animate-pulse rounded-lg bg-hover" />

      <div className="mb-4 flex flex-wrap gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-8 w-16 animate-pulse rounded-lg bg-hover" />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="flex flex-col gap-2 p-4">
              <div className="h-3 w-24 animate-pulse rounded bg-hover" />
              <div className="h-6 w-16 animate-pulse rounded bg-hover" />
              <div className="h-3 w-20 animate-pulse rounded bg-hover" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {[
          { label: "Conversations per day", color: "text-accent" },
          { label: "Tokens per day", color: "text-ai" },
        ].map((c) => (
          <Card key={c.label}>
            <CardHeader>
              <CardTitle>
                <BarChart3 className={c.color} /> {c.label}
              </CardTitle>
              <div className="h-5 w-20 animate-pulse rounded bg-hover" />
            </CardHeader>
            <CardContent>
              <div className="h-[206px] w-full animate-pulse rounded bg-hover" />
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
