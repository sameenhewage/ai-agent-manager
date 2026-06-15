"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Coins,
  Hash,
  MessageSquare,
  MessagesSquare,
  Repeat,
  ShieldCheck,
  TriangleAlert,
  UserPlus,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AreaChart } from "@/components/charts/area-chart";
import type { AnalyticsData } from "@/lib/analytics/service";

/**
 * Analytics (Slice 6) — CLIENT component. Holds only interaction state (range selection
 * + custom-date inputs) and pushes it to the URL so the Server Component re-computes
 * everything. Every number shown is real (ADR-0007); no per-contact ids are present in
 * the payload at all. Formatting is locale-fixed + tz-fixed to avoid hydration drift.
 */

const RANGE_BUTTONS: { key: string; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "3d", label: "3D" },
  { key: "7d", label: "7D" },
  { key: "14d", label: "14D" },
  { key: "30d", label: "30D" },
  { key: "this_month", label: "Month" },
];

const NF = new Intl.NumberFormat("en-US");
const fmtInt = (n: number) => NF.format(Math.round(n));
const fmtCost = (n: number) => `$${n.toFixed(4)}`;
function fmtDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric" }).format(
    new Date(iso)
  );
}

export function Analytics({ data }: { data: AnalyticsData }) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = React.useTransition();

  const localDay = (iso: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: data.timeZone }).format(new Date(iso)); // YYYY-MM-DD
  const [customFrom, setCustomFrom] = React.useState(() => localDay(data.range.fromISO));
  const [customTo, setCustomTo] = React.useState(() => localDay(data.range.toISO));
  const [showCustom, setShowCustom] = React.useState(data.range.key === "custom");

  function go(key: string, from?: string, to?: string) {
    const sp = new URLSearchParams();
    sp.set("range", key);
    if (key === "custom" && from && to) {
      sp.set("from", from);
      sp.set("to", to);
    }
    startTransition(() => router.push(`${pathname}?${sp.toString()}`));
  }

  const t = data.totals;
  const avgTurns = t.conversations > 0 ? t.turns / t.conversations : 0;

  const kpis = [
    { icon: MessagesSquare, label: "Conversations", value: fmtInt(t.conversations), sub: `${data.range.label}` },
    { icon: UserPlus, label: "New contacts", value: fmtInt(t.newContacts), sub: "first seen in range" },
    { icon: Repeat, label: "Returning", value: fmtInt(t.returningContacts), sub: "seen before range" },
    { icon: Hash, label: "Turns", value: fmtInt(t.turns), sub: `${avgTurns.toFixed(1)} avg / chat` },
    { icon: MessageSquare, label: "Messages", value: fmtInt(t.messages), sub: "non-system, de-duped" },
    { icon: Coins, label: "Total tokens", value: fmtInt(t.totalTokens), sub: `${t.tokenCoverage}/${t.conversations} reported` },
    { icon: BarChart3, label: "Est. cost (USD)", value: fmtCost(t.cost), sub: `${t.costCoverage}/${t.conversations} reported` },
    { icon: Users, label: "Active contacts", value: fmtInt(t.conversations), sub: "with activity in range" },
  ];

  const peakConv = data.series.reduce((m, p) => Math.max(m, p.conversations), 0);
  const convValues = data.series.map((p) => p.conversations);
  const tokenValues = data.series.map((p) => p.tokens);
  const dayLabels = data.series.map((p) => fmtDay(`${p.date}T12:00:00.000Z`, "UTC"));

  return (
    <div className="flex flex-col gap-4">
      {/* Real-data banner */}
      <div className="flex items-start gap-3 rounded-lg border border-ai-line bg-ai-weak px-4 py-3">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-panel text-ai">
          <ShieldCheck className="size-[15px]" strokeWidth={2} />
        </span>
        <p className="text-[13px] text-muted">
          <span className="font-semibold text-text">Real data only.</span> Computed live from the
          WhatsApp AI agent in <span className="font-mono text-text">{data.timeZone}</span>. Analytics
          window: <span className="font-mono text-text">{data.retentionLabel}</span>. No intent,
          sentiment, or resolution metrics are shown &mdash; they have no source.
        </p>
      </div>

      {/* Range switcher (report toolbar) */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2.5",
          pending && "opacity-60"
        )}
      >
        {RANGE_BUTTONS.map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => {
              setShowCustom(false);
              go(b.key);
            }}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
              data.range.key === b.key && !showCustom
                ? "border-accent bg-accent-weak text-accent"
                : "border-line bg-panel text-muted hover:bg-hover hover:text-text"
            )}
          >
            {b.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowCustom((v) => !v)}
          className={cn(
            "rounded-lg border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
            data.range.key === "custom" || showCustom
              ? "border-accent bg-accent-weak text-accent"
              : "border-line bg-panel text-muted hover:bg-hover hover:text-text"
          )}
        >
          Custom
        </button>

        {showCustom ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={customFrom}
              max={customTo}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="rounded-lg border border-line bg-panel px-2 py-1.5 text-[12.5px] text-text"
            />
            <span className="text-faint">&rarr;</span>
            <input
              type="date"
              value={customTo}
              min={customFrom}
              onChange={(e) => setCustomTo(e.target.value)}
              className="rounded-lg border border-line bg-panel px-2 py-1.5 text-[12.5px] text-text"
            />
            <button
              type="button"
              onClick={() => go("custom", customFrom, customTo)}
              className="rounded-lg border border-accent bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-[var(--on-accent,#fff)]"
            >
              Apply
            </button>
          </div>
        ) : null}
      </div>

      {data.clamped ? (
        <div className="flex items-start gap-2 rounded-lg border border-warn bg-warn-weak px-4 py-2.5 text-[12.5px] text-text">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
          <span>
            The requested range exceeds this tenant&rsquo;s analytics window
            ({data.retentionLabel}). Showing {fmtDay(data.range.fromISO, data.timeZone)} onward; the
            earlier portion needs historical rollups (not built yet).
          </span>
        </div>
      ) : null}

      {/* KPI cards */}
      <h2 className="-mb-1 text-[11px] font-bold uppercase tracking-[0.09em] text-faint">
        Overview &middot; {data.range.label}
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="flex flex-col gap-1 p-4">
              <div className="flex items-center gap-2 text-muted">
                <k.icon className="size-4 text-accent" />
                <span className="text-[12px] font-semibold uppercase tracking-wide">{k.label}</span>
              </div>
              <div className="text-[24px] font-extrabold leading-tight text-text">{k.value}</div>
              <div className="text-[11.5px] text-faint">{k.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Daily series — two real charts (parity with the demo's chart row) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <BarChart3 className="text-accent" /> Conversations per day
            </CardTitle>
            <Badge variant="ai">{data.range.label}</Badge>
          </CardHeader>
          <CardContent>
            {t.conversations === 0 ? (
              <EmptyChart />
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between text-[11px] text-faint">
                  <span>Peak {fmtInt(peakConv)} / day</span>
                  <span>{fmtInt(t.conversations)} total</span>
                </div>
                <AreaChart
                  id="an-conv"
                  values={convValues}
                  labels={dayLabels}
                  color="accent"
                  formatPoint={(v, l) => `${l}: ${v} conversation(s)`}
                />
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <Coins className="text-ai" /> Tokens per day
            </CardTitle>
            <Badge variant="ai">{data.range.label}</Badge>
          </CardHeader>
          <CardContent>
            {t.conversations === 0 ? (
              <EmptyChart />
            ) : (
              <>
                <div className="mb-2 flex items-center justify-between text-[11px] text-faint">
                  <span>
                    {t.tokenCoverage}/{t.conversations} sessions reported
                  </span>
                  <span>{fmtInt(t.totalTokens)} total</span>
                </div>
                <AreaChart
                  id="an-tok"
                  values={tokenValues}
                  labels={dayLabels}
                  color="ai"
                  formatPoint={(v, l) => `${l}: ${fmtInt(v)} tokens`}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="text-[11px] text-faint">
        Token &amp; cost are per-session lifetime totals from the agent&rsquo;s metrics, attributed
        to each session&rsquo;s latest activity day. Finer per-message attribution needs rollups
        (future). <Badge variant="ai">Read-only</Badge>
      </p>
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
