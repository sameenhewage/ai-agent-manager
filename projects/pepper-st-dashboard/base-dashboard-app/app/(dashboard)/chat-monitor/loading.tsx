import { Inbox } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Route-level skeleton (Slice 7B) shown instantly during navigation to /chat-monitor,
 * before the client component hydrates and fetches. Mirrors the full-height two-pane
 * WORKSPACE so the page never flashes blank and never document-scrolls.
 */
export default function ChatMonitorLoading() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Chat Monitor"
        description="Tenant-scoped conversations and live, read-only transcripts — contact numbers are masked and nothing is stored in this dashboard."
      />

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-4 lg:grid-cols-[340px_1fr]">
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <CardHeader className="flex-col items-start gap-1">
            <CardTitle>
              <Inbox className="text-accent" /> Conversations
            </CardTitle>
          </CardHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2 border-b border-line px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="h-3.5 w-24 animate-pulse rounded bg-hover" />
                  <div className="h-3 w-12 animate-pulse rounded bg-hover" />
                </div>
                <div className="h-3 w-16 animate-pulse rounded bg-hover" />
              </div>
            ))}
          </div>
        </Card>

        <Card className="flex min-h-0 flex-col overflow-hidden max-lg:hidden">
          <CardHeader className="flex-col items-stretch gap-2">
            <div className="h-4 w-40 animate-pulse rounded bg-hover" />
            <div className="h-3 w-56 animate-pulse rounded bg-hover" />
          </CardHeader>
          <div className="min-h-0 flex-1 overflow-y-auto bg-panel2 p-4">
            <div className="flex flex-col gap-3">
              {[
                { w: "58%", end: false },
                { w: "72%", end: true },
                { w: "46%", end: false },
                { w: "66%", end: true },
                { w: "60%", end: false },
              ].map((r, i) => (
                <div key={i} className={r.end ? "flex justify-end" : "flex justify-start"}>
                  <div className="h-14 animate-pulse rounded-2xl bg-hover" style={{ width: r.w }} />
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
