import { Card, CardContent, CardHeader } from "@/components/ui/card";

/**
 * Route-level skeleton (Slice 7C) for the now-dynamic Dashboard. Mirrors the dense
 * overview (phead + KPI grid + two charts + recent/coverage) so navigation never flashes
 * blank while the real, tenant-scoped metrics are computed on the server.
 */
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-4">
      {/* phead */}
      <div className="flex flex-wrap items-end justify-between gap-3.5">
        <div>
          <div className="h-6 w-52 animate-pulse rounded bg-hover" />
          <div className="mt-2 h-3.5 w-[420px] max-w-full animate-pulse rounded bg-hover" />
        </div>
        <div className="h-9 w-[260px] animate-pulse rounded-[10px] bg-hover" />
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i} className="relative overflow-hidden">
            <CardContent className="p-[15px]">
              <div className="h-3 w-20 animate-pulse rounded bg-hover" />
              <div className="mt-3 h-6 w-24 animate-pulse rounded bg-hover" />
              <div className="mt-2 h-2.5 w-16 animate-pulse rounded bg-hover" />
              <span className="absolute right-3 top-3 size-[30px] animate-pulse rounded-[9px] bg-hover" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardHeader>
              <div className="h-4 w-44 animate-pulse rounded bg-hover" />
              <div className="h-5 w-20 animate-pulse rounded bg-hover" />
            </CardHeader>
            <CardContent>
              <div className="h-[206px] w-full animate-pulse rounded bg-hover" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent + coverage */}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <div className="h-4 w-40 animate-pulse rounded bg-hover" />
            <div className="h-4 w-14 animate-pulse rounded bg-hover" />
          </CardHeader>
          <div className="flex flex-col">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 border-b border-line2 px-4 py-2.5 last:border-0"
              >
                <div className="flex items-center gap-2.5">
                  <div className="size-8 animate-pulse rounded-lg bg-hover" />
                  <div className="flex flex-col gap-1.5">
                    <div className="h-3 w-24 animate-pulse rounded bg-hover" />
                    <div className="h-2.5 w-14 animate-pulse rounded bg-hover" />
                  </div>
                </div>
                <div className="h-2.5 w-16 animate-pulse rounded bg-hover" />
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader>
            <div className="h-4 w-36 animate-pulse rounded bg-hover" />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="h-3 w-24 animate-pulse rounded bg-hover" />
                <div className="h-3 w-16 animate-pulse rounded bg-hover" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
