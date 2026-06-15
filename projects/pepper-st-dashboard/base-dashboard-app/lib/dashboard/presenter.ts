import type { AnalyticsData } from "@/lib/analytics/service";

/**
 * Pure Dashboard presenter (Slice 7C). Shapes the headline KPI cards + chart series
 * shown on the operations Dashboard from the EXISTING real analytics payload
 * (`AnalyticsData`). It introduces NO new data source and — per ADR-0007 — fabricates
 * nothing: every key here maps 1:1 to a real, already-computed metric (conversation
 * volume, new/returning split, turns, displayed messages, token/cost with coverage,
 * activity timing). Kept DB-free so it is unit-testable without credentials.
 *
 * The `FORBIDDEN_METRIC_KEYS` list encodes the ADR-0007 ban (intent, sentiment,
 * AI-resolution, priority, orders/exchanges/issues, revenue, satisfaction, staff,
 * human-handover). A test asserts the produced KPIs never intersect it, so a future
 * edit that smuggles in a fabricated metric fails CI instead of shipping.
 */

export interface DashboardKpi {
  key: string;
  label: string;
  value: string; // pre-formatted, locale-fixed (no hydration drift)
  sub: string; // honest context (coverage / range / timing)
  accent: "accent" | "ai"; // brand rose = business view · violet = AI-produced
}

export interface DashboardChartSeries {
  /** local 'YYYY-MM-DD' day keys, continuous across the range */
  labels: string[];
  /** conversations per local day (real) */
  conversations: number[];
  /** tokens per local day (real; 0 where a session reported none) */
  tokens: number[];
  peakConversations: number;
  totalConversations: number;
  totalTokens: number;
}

/**
 * Metric keys that have NO source in `ai.agno_sessions` today (ADR-0007). The Dashboard
 * must never present any of these. Enforced by `lib/dashboard/presenter.test.ts`.
 */
export const FORBIDDEN_METRIC_KEYS = [
  "resolutionRate",
  "aiResolved",
  "aiResolution",
  "needsStaff",
  "escalations",
  "intent",
  "sentiment",
  "confidence",
  "priority",
  "leadConversion",
  "leads",
  "revenue",
  "sales",
  "satisfaction",
  "csat",
  "nps",
  "orders",
  "exchanges",
  "issues",
  "followups",
  "staffTasks",
  "handover",
  "handoff",
] as const;

/** The complete set of metric keys the Dashboard is allowed to render. */
export const ALLOWED_METRIC_KEYS = [
  "conversations",
  "newContacts",
  "returningContacts",
  "messages",
  "turns",
  "totalTokens",
  "cost",
  "lastActivity",
] as const;

const NF = new Intl.NumberFormat("en-US");
const fmtInt = (n: number) => NF.format(Math.round(n));
const fmtCost = (n: number) => `$${n.toFixed(4)}`;

/** Absolute, tz-fixed timestamp (e.g. "Jun 15, 13:30"). Pure: no Date.now(). */
export function fmtDateTime(iso: string | null, timeZone: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
}

/**
 * Build the headline KPI cards from real totals. Returns exactly the metrics listed in
 * `ALLOWED_METRIC_KEYS`, each formatted with honest context. No fabricated signals.
 */
export function buildDashboardKpis(data: AnalyticsData): DashboardKpi[] {
  const t = data.totals;
  const avgTurns = t.conversations > 0 ? t.turns / t.conversations : 0;

  return [
    {
      key: "conversations",
      label: "Conversations",
      value: fmtInt(t.conversations),
      sub: data.range.label,
      accent: "accent",
    },
    {
      key: "newContacts",
      label: "New contacts",
      value: fmtInt(t.newContacts),
      sub: "first seen in range",
      accent: "accent",
    },
    {
      key: "returningContacts",
      label: "Returning",
      value: fmtInt(t.returningContacts),
      sub: "seen before range",
      accent: "accent",
    },
    {
      key: "messages",
      label: "Messages",
      value: fmtInt(t.messages),
      sub: "non-system, de-duped",
      accent: "ai",
    },
    {
      key: "turns",
      label: "Turns",
      value: fmtInt(t.turns),
      sub: `${avgTurns.toFixed(1)} avg / chat`,
      accent: "ai",
    },
    {
      key: "totalTokens",
      label: "Total tokens",
      value: fmtInt(t.totalTokens),
      sub: `${t.tokenCoverage}/${t.conversations} reported`,
      accent: "ai",
    },
    {
      key: "cost",
      label: "Est. cost (USD)",
      value: fmtCost(t.cost),
      sub: `${t.costCoverage}/${t.conversations} reported`,
      accent: "ai",
    },
    {
      key: "lastActivity",
      label: "Last activity",
      value: fmtDateTime(t.lastActivityAt, data.timeZone),
      sub: "most recent message",
      accent: "accent",
    },
  ];
}

/** Reshape the real daily series for the Dashboard charts (conversations + tokens). */
export function buildDashboardChartSeries(data: AnalyticsData): DashboardChartSeries {
  const labels = data.series.map((p) => p.date);
  const conversations = data.series.map((p) => p.conversations);
  const tokens = data.series.map((p) => p.tokens);
  return {
    labels,
    conversations,
    tokens,
    peakConversations: conversations.reduce((m, v) => (v > m ? v : m), 0),
    totalConversations: data.totals.conversations,
    totalTokens: data.totals.totalTokens,
  };
}
