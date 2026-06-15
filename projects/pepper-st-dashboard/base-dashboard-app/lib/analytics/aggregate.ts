import { startOfDay, tzDayKey } from "./ranges";

/**
 * Pure analytics aggregation (Slice 6, Workflow 05). Computes ONLY real metrics from
 * already-joined session inputs (ADR-0007): conversation volume, new/returning split,
 * turns, displayed messages, token/cost sums (with honest coverage), activity bounds,
 * and a continuous per-local-day series. No DB, no masking concerns (no raw ids here),
 * no fabricated KPIs (no intent/sentiment/AI-resolved/priority).
 */

export interface AnalyticsSessionInput {
  conversationId: string;
  firstAt: Date | null;
  lastAt: Date | null; // most recent activity (drives in-range + series bucketing)
  totalTokens: number | null; // session_data.session_metrics.total_tokens
  cost: number | null; // session_data.session_metrics.cost (may be absent)
  turnCount: number;
  messageCount: number; // non-system, de-duplicated (parser-derived)
}

export interface AggregateOptions {
  from: Date;
  to: Date; // exclusive upper bound
  timeZone: string;
}

export interface DailyPoint {
  date: string; // 'YYYY-MM-DD' local
  conversations: number;
  tokens: number;
}

export interface AnalyticsTotals {
  conversations: number;
  newContacts: number;
  returningContacts: number;
  turns: number;
  messages: number;
  totalTokens: number;
  tokenCoverage: number; // # in-range sessions that reported tokens
  cost: number;
  costCoverage: number; // # in-range sessions that reported cost
  firstActivityAt: string | null; // ISO
  lastActivityAt: string | null; // ISO
}

export interface AnalyticsResult {
  totals: AnalyticsTotals;
  series: DailyPoint[];
}

const DAY_MS = 86_400_000;

function inRange(d: Date | null, from: Date, to: Date): boolean {
  if (d == null) return false;
  const t = d.getTime();
  return t >= from.getTime() && t < to.getTime();
}

/** Continuous list of local-day keys covering [from, to). DST-safe via midnight snap. */
function buildDayAxis(from: Date, to: Date, timeZone: string): string[] {
  const days: string[] = [];
  let cursor = startOfDay(from, timeZone);
  let guard = 0;
  while (cursor.getTime() < to.getTime() && guard < 1000) {
    days.push(tzDayKey(cursor, timeZone));
    cursor = startOfDay(new Date(cursor.getTime() + DAY_MS + DAY_MS / 2), timeZone);
    guard++;
  }
  return days.filter((d, i) => i === 0 || d !== days[i - 1]);
}

export function aggregateAnalytics(
  sessions: AnalyticsSessionInput[],
  opts: AggregateOptions
): AnalyticsResult {
  const { from, to, timeZone } = opts;
  const dayKeys = buildDayAxis(from, to, timeZone);
  const convByDay = new Map<string, number>();
  const tokByDay = new Map<string, number>();
  for (const k of dayKeys) {
    convByDay.set(k, 0);
    tokByDay.set(k, 0);
  }

  let conversations = 0;
  let newContacts = 0;
  let turns = 0;
  let messages = 0;
  let totalTokens = 0;
  let tokenCoverage = 0;
  let cost = 0;
  let costCoverage = 0;
  let firstActivity: number | null = null;
  let lastActivity: number | null = null;

  for (const s of sessions) {
    if (!inRange(s.lastAt, from, to)) continue;
    conversations++;
    if (inRange(s.firstAt, from, to)) newContacts++;
    turns += Number.isFinite(s.turnCount) ? s.turnCount : 0;
    messages += Number.isFinite(s.messageCount) ? s.messageCount : 0;
    if (typeof s.totalTokens === "number" && Number.isFinite(s.totalTokens)) {
      totalTokens += s.totalTokens;
      tokenCoverage++;
    }
    if (typeof s.cost === "number" && Number.isFinite(s.cost)) {
      cost += s.cost;
      costCoverage++;
    }

    const startMs = (s.firstAt ?? s.lastAt)!.getTime();
    if (firstActivity == null || startMs < firstActivity) firstActivity = startMs;
    const endMs = (s.lastAt ?? s.firstAt)!.getTime();
    if (lastActivity == null || endMs > lastActivity) lastActivity = endMs;

    const key = tzDayKey(s.lastAt!, timeZone);
    if (convByDay.has(key)) convByDay.set(key, (convByDay.get(key) ?? 0) + 1);
    if (tokByDay.has(key) && typeof s.totalTokens === "number") {
      tokByDay.set(key, (tokByDay.get(key) ?? 0) + s.totalTokens);
    }
  }

  return {
    totals: {
      conversations,
      newContacts,
      returningContacts: conversations - newContacts,
      turns,
      messages,
      totalTokens,
      tokenCoverage,
      cost,
      costCoverage,
      firstActivityAt: firstActivity != null ? new Date(firstActivity).toISOString() : null,
      lastActivityAt: lastActivity != null ? new Date(lastActivity).toISOString() : null,
    },
    series: dayKeys.map((date) => ({
      date,
      conversations: convByDay.get(date) ?? 0,
      tokens: tokByDay.get(date) ?? 0,
    })),
  };
}
