import { describe, it, expect } from "vitest";
import { aggregateAnalytics, type AnalyticsSessionInput } from "./aggregate";

/**
 * Aggregation is pure and computed only from REAL inputs (ADR-0007): no intent,
 * sentiment, AI-resolved %, priority, etc. Range is [from, to) — `to` exclusive.
 * Token/cost are summed with COVERAGE counts so missing values are honest, never
 * presented as a confident zero.
 */

const FROM = new Date("2026-06-08T00:00:00.000Z");
const TO = new Date("2026-06-15T00:00:00.000Z"); // exclusive
const TZ = "UTC";

function inputs(): AnalyticsSessionInput[] {
  return [
    // A — in range, new (firstAt in range)
    {
      conversationId: "A",
      firstAt: new Date("2026-06-10T09:00:00.000Z"),
      lastAt: new Date("2026-06-10T10:00:00.000Z"),
      totalTokens: 100,
      cost: 0.01,
      turnCount: 3,
      messageCount: 6,
    },
    // B — in range, returning (firstAt before range), no cost reported
    {
      conversationId: "B",
      firstAt: new Date("2026-05-01T00:00:00.000Z"),
      lastAt: new Date("2026-06-14T23:00:00.000Z"),
      totalTokens: 200,
      cost: null,
      turnCount: 5,
      messageCount: 10,
    },
    // C — before range → excluded
    {
      conversationId: "C",
      firstAt: new Date("2026-06-07T00:00:00.000Z"),
      lastAt: new Date("2026-06-07T10:00:00.000Z"),
      totalTokens: 999,
      cost: 9.99,
      turnCount: 9,
      messageCount: 9,
    },
    // D — exactly == to → excluded (upper bound exclusive)
    {
      conversationId: "D",
      firstAt: new Date("2026-06-15T00:00:00.000Z"),
      lastAt: new Date("2026-06-15T00:00:00.000Z"),
      totalTokens: 50,
      cost: 0.5,
      turnCount: 1,
      messageCount: 1,
    },
    // E — no activity timestamp → excluded
    {
      conversationId: "E",
      firstAt: null,
      lastAt: null,
      totalTokens: 10,
      cost: 0.1,
      turnCount: 1,
      messageCount: 1,
    },
  ];
}

describe("aggregateAnalytics", () => {
  it("counts only in-range sessions ([from,to) exclusive of to)", () => {
    const { totals } = aggregateAnalytics(inputs(), { from: FROM, to: TO, timeZone: TZ });
    expect(totals.conversations).toBe(2); // A, B
  });

  it("splits new vs returning so they sum to conversations", () => {
    const { totals } = aggregateAnalytics(inputs(), { from: FROM, to: TO, timeZone: TZ });
    expect(totals.newContacts).toBe(1); // A
    expect(totals.returningContacts).toBe(1); // B
    expect(totals.newContacts + totals.returningContacts).toBe(totals.conversations);
  });

  it("sums turns and messages for in-range sessions only", () => {
    const { totals } = aggregateAnalytics(inputs(), { from: FROM, to: TO, timeZone: TZ });
    expect(totals.turns).toBe(8); // 3 + 5
    expect(totals.messages).toBe(16); // 6 + 10
  });

  it("sums tokens and cost with honest coverage counts", () => {
    const { totals } = aggregateAnalytics(inputs(), { from: FROM, to: TO, timeZone: TZ });
    expect(totals.totalTokens).toBe(300); // 100 + 200
    expect(totals.tokenCoverage).toBe(2); // both reported tokens
    expect(totals.cost).toBeCloseTo(0.01, 6); // only A reported cost
    expect(totals.costCoverage).toBe(1); // B had null cost
  });

  it("reports first/last activity across in-range sessions", () => {
    const { totals } = aggregateAnalytics(inputs(), { from: FROM, to: TO, timeZone: TZ });
    expect(totals.firstActivityAt).toBe("2026-05-01T00:00:00.000Z"); // B.firstAt
    expect(totals.lastActivityAt).toBe("2026-06-14T23:00:00.000Z"); // B.lastAt
  });

  it("buckets a continuous daily series in the tenant timezone", () => {
    const { series } = aggregateAnalytics(inputs(), { from: FROM, to: TO, timeZone: TZ });
    expect(series).toHaveLength(7); // 06-08 .. 06-14 inclusive
    const d10 = series.find((p) => p.date === "2026-06-10");
    const d14 = series.find((p) => p.date === "2026-06-14");
    const d09 = series.find((p) => p.date === "2026-06-09");
    expect(d10).toMatchObject({ conversations: 1, tokens: 100 });
    expect(d14).toMatchObject({ conversations: 1, tokens: 200 });
    expect(d09).toMatchObject({ conversations: 0, tokens: 0 });
  });

  it("handles an empty range without fabricating data", () => {
    const { totals, series } = aggregateAnalytics([], { from: FROM, to: TO, timeZone: TZ });
    expect(totals.conversations).toBe(0);
    expect(totals.totalTokens).toBe(0);
    expect(totals.cost).toBe(0);
    expect(totals.firstActivityAt).toBeNull();
    expect(totals.lastActivityAt).toBeNull();
    expect(series).toHaveLength(7);
    expect(series.every((p) => p.conversations === 0 && p.tokens === 0)).toBe(true);
  });

  it("exposes ONLY real metric keys (no fabricated KPIs — ADR-0007)", () => {
    const { totals } = aggregateAnalytics(inputs(), { from: FROM, to: TO, timeZone: TZ });
    expect(Object.keys(totals).sort()).toEqual(
      [
        "conversations",
        "cost",
        "costCoverage",
        "firstActivityAt",
        "lastActivityAt",
        "messages",
        "newContacts",
        "returningContacts",
        "totalTokens",
        "tokenCoverage",
        "turns",
      ].sort()
    );
  });
});
