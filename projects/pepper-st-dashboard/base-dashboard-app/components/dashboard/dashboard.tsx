import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Clock,
  Coins,
  Database,
  DollarSign,
  Hash,
  Inbox,
  MessageSquare,
  MessagesSquare,
  Repeat,
  ShieldCheck,
  TriangleAlert,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart } from "@/components/charts/area-chart";
import { DashboardToolbar } from "@/components/dashboard/dashboard-toolbar";
import type { AnalyticsData } from "@/lib/analytics/service";
import type { ConversationListItem } from "@/lib/chat-monitor/presenter";
import {
  buildDashboardChartSeries,
  buildDashboardKpis,
  fmtDateTime,
} from "@/lib/dashboard/presenter";

/**
 * Operations Dashboard (Slice 7C) — a dense, demo-grammar SaaS overview built ENTIRELY
 * from real data: KPI cards + two charts from the Analytics aggregate, and a recent
 * conversations panel from the (masked) Chat Monitor list. Server-rendered; the only
 * client island is the range toolbar. Per ADR-0007 it shows nothing fabricated — and a
 * single honest panel names the mockup signals that have no source yet.
 */

const NF = new Intl.NumberFormat("en-US");
const fmtInt = (n: number) => NF.format(Math.round(n));

function fmtDay(dateKey: string): string {
  // Label from a 'YYYY-MM-DD' local key; render at UTC noon so the label day never shifts.
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(
    new Date(`${dateKey}T12:00:00.000Z`)
  );
}

const KPI_ICON: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  conversations: MessagesSquare,
  newContacts: UserPlus,
  returningContacts: Repeat,
  messages: MessageSquare,
  turns: Hash,
  totalTokens: Coins,
  cost: DollarSign,
  lastActivity: Clock,
};

// Mockup signals with NO source in ai.agno_sessions today (ADR-0007) — named, never faked.
const NOT_TRACKED = [
  "Intent",
  "Sentiment",
  "AI-resolution rate",
  "Priority",
  "Orders",
  "Exchanges",
  "Customer issues",
  "Follow-ups",
  "Staff tasks",
  "Revenue",
  "CSAT",
];

export function Dashboard({
  data,
  recent,
  rangeKey,
}: {
  data: AnalyticsData;
  recent: ConversationListItem[];
  rangeKey: string;
}) {
  const kpis = buildDashboardKpis(data);
  const chart = buildDashboardChartSeries(data);
  const hasData = data.totals.conversations > 0;
  const dayLabels = chart.labels.map(fmtDay);
  const recentTop = recent.slice(0, 6);

  return (
    <div className="flex flex-col gap-4">
      {/* phead: greeting + real-data badge + range toolbar */}
      <div className="flex flex-wrap items-end justify-between gap-3.5">
        <div>
          <h1 className="m-0 flex items-center gap-2.5 text-[22px] font-extrabold tracking-[-0.02em]">
            AI Chat Operations
          </h1>
          <p className="mt-1.5 max-w-[760px] text-[13px] text-muted">
            What came through the {data.channelLabel} AI agent —{" "}
            <span className="font-semibold text-text">{data.range.label}</span>, in{" "}
            <span className="font-mono text-text">{data.timeZone}</span>. Read-only, real data only.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Badge variant="ai">Real data only</Badge>
          <DashboardToolbar currentRange={rangeKey} />
        </div>
      </div>

      {data.clamped ? (
        <div className="flex items-start gap-2 rounded-lg border border-warn bg-warn-weak px-4 py-2.5 text-[12.5px] text-text">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
          <span>
            The selected range exceeds this tenant&rsquo;s analytics window ({data.retentionLabel}).
            Showing the in-window portion; older history needs rollups (not built yet).
          </span>
        </div>
      ) : null}

      {/* Dense KPI grid — real metrics only */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {kpis.map((k) => {
          const Icon = KPI_ICON[k.key] ?? BarChart3;
          const ai = k.accent === "ai";
          return (
            <Card key={k.key} className="relative overflow-hidden">
              <CardContent className="p-[15px]">
                <div className="text-[11.5px] font-semibold text-muted">{k.label}</div>
                <div className="mt-2 text-[23px] font-extrabold leading-none tracking-[-0.02em] text-text">
                  {k.value}
                </div>
                <div className="mt-1.5 text-[11px] text-faint">{k.sub}</div>
                <span
                  className={cn(
                    "absolute right-3 top-3 flex size-[30px] items-center justify-center rounded-[9px]",
                    ai ? "bg-ai-weak text-ai" : "bg-accent-weak text-accent"
                  )}
                >
                  <Icon className="size-[15px]" strokeWidth={2} />
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Two real charts (conversations + tokens per day) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <BarChart3 className="text-accent" /> Conversations over time
            </CardTitle>
            <Badge variant="ai">{data.range.label}</Badge>
          </CardHeader>
          <CardContent>
            {hasData ? (
              <>
                <div className="mb-2 flex items-center justify-between text-[11px] text-faint">
                  <span>Peak {fmtInt(chart.peakConversations)} / day</span>
                  <span>{fmtInt(chart.totalConversations)} total</span>
                </div>
                <AreaChart
                  id="dash-conv"
                  values={chart.conversations}
                  labels={dayLabels}
                  color="accent"
                  formatPoint={(v, l) => `${l}: ${v} conversation(s)`}
                />
              </>
            ) : (
              <EmptyChart />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <Coins className="text-ai" /> Tokens per day
            </CardTitle>
            <Link
              href="/analytics"
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent hover:underline"
            >
              Full report <ArrowRight className="size-3.5" />
            </Link>
          </CardHeader>
          <CardContent>
            {hasData ? (
              <>
                <div className="mb-2 flex items-center justify-between text-[11px] text-faint">
                  <span>
                    {data.totals.tokenCoverage}/{data.totals.conversations} sessions reported
                  </span>
                  <span>{fmtInt(chart.totalTokens)} total</span>
                </div>
                <AreaChart
                  id="dash-tok"
                  values={chart.tokens}
                  labels={dayLabels}
                  color="ai"
                  formatPoint={(v, l) => `${l}: ${fmtInt(v)} tokens`}
                />
              </>
            ) : (
              <EmptyChart />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent conversations (real, masked) + coverage/window meta */}
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="flex flex-col overflow-hidden">
          <CardHeader>
            <CardTitle>
              <Inbox className="text-accent" /> Recent conversations
            </CardTitle>
            <Link
              href="/chat-monitor"
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent hover:underline"
            >
              View all <ArrowRight className="size-3.5" />
            </Link>
          </CardHeader>
          <div className="flex flex-col">
            {recentTop.length === 0 ? (
              <div className="px-4 py-8 text-center text-[13px] text-muted">
                No conversations in the retention window.
              </div>
            ) : (
              recentTop.map((c) => (
                <Link
                  key={c.id}
                  href="/chat-monitor"
                  className="flex items-center justify-between gap-3 border-b border-line2 px-4 py-2.5 last:border-0 hover:bg-hover"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-weak text-accent">
                      <MessagesSquare className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-mono text-[13px] font-semibold text-text">
                        {c.maskedContact}
                      </div>
                      <div className="text-[11.5px] text-faint">
                        {c.turnCount} {c.turnCount === 1 ? "turn" : "turns"}
                      </div>
                    </div>
                  </div>
                  <span className="shrink-0 text-[11.5px] text-faint">
                    {fmtDateTime(c.lastAt, data.timeZone)}
                  </span>
                </Link>
              ))
            )}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <Database className="text-accent" /> Coverage &amp; window
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5 text-[12.5px]">
            <Meta label="Channel" value={data.channelLabel} />
            <Meta label="Timezone" value={data.timeZone} mono />
            <Meta label="Analytics window" value={data.retentionLabel} mono />
            <Meta
              label="Token coverage"
              value={`${data.totals.tokenCoverage}/${data.totals.conversations}`}
              mono
            />
            <Meta
              label="Cost coverage"
              value={`${data.totals.costCoverage}/${data.totals.conversations}`}
              mono
            />
            <Meta label="First activity" value={fmtDateTime(data.totals.firstActivityAt, data.timeZone)} mono />
            <Meta label="Last activity" value={fmtDateTime(data.totals.lastActivityAt, data.timeZone)} mono />
          </CardContent>
        </Card>
      </div>

      {/* One honest panel — no fabricated cards (ADR-0007) */}
      <Card className="border-dashed bg-panel2">
        <CardContent className="flex flex-col gap-2.5 p-4">
          <div className="flex items-center gap-2 text-[13px] font-bold text-text">
            <ShieldCheck className="size-4 text-ai" /> Not tracked in Phase 1
          </div>
          <p className="text-[12.5px] text-muted">
            This console shows only what the WhatsApp AI agent actually records. These operational
            signals from the design mockup have <span className="font-semibold text-text">no source</span>{" "}
            in the agent data yet, so they are intentionally not shown (no guesses):
          </p>
          <div className="flex flex-wrap gap-2">
            {NOT_TRACKED.map((t) => (
              <span
                key={t}
                className="rounded-full border border-line bg-panel px-2.5 py-0.5 text-[11.5px] font-medium text-muted"
              >
                {t}
              </span>
            ))}
          </div>
          <p className="text-[11.5px] text-faint">
            They&rsquo;ll appear here only once the agent emits them via a stable contract (ADR-0008).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className={cn("text-right text-text", mono && "font-mono text-[12px]")}>{value}</span>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-[180px] flex-col items-center justify-center gap-2 text-center">
      <MessagesSquare className="size-6 text-faint" />
      <p className="text-[13px] text-muted">No conversations in this range.</p>
    </div>
  );
}
