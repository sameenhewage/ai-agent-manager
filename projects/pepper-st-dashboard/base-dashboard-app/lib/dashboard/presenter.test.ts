import { describe, expect, it } from "vitest";
import type { AnalyticsData } from "@/lib/analytics/service";
import {
  ALLOWED_METRIC_KEYS,
  FORBIDDEN_METRIC_KEYS,
  buildDashboardChartSeries,
  buildDashboardKpis,
  fmtDateTime,
} from "./presenter";

/**
 * Slice 7C — the Dashboard must present ONLY real, derivable metrics (ADR-0007). These
 * tests run with no DB: they feed a hand-built `AnalyticsData` and assert the presenter
 * never emits a fabricated metric key/label. If someone later adds a fake "AI resolution
 * rate" etc., these fail.
 */

function makeData(overrides: Partial<AnalyticsData> = {}): AnalyticsData {
  return {
    tenantName: "PEPPER ST.",
    channelLabel: "PEPPER ST. WhatsApp",
    timeZone: "Asia/Colombo",
    analyticsRetentionDays: null,
    retentionLabel: "Unlimited",
    range: {
      key: "7d",
      label: "Last 7 days",
      fromISO: "2026-06-09T00:00:00.000Z",
      toISO: "2026-06-15T18:00:00.000Z",
    },
    clamped: false,
    requestedFromISO: null,
    totals: {
      conversations: 1234,
      newContacts: 1000,
      returningContacts: 234,
      turns: 6800,
      messages: 17300,
      totalTokens: 799898,
      tokenCoverage: 13,
      cost: 0.0621,
      costCoverage: 11,
      firstActivityAt: "2026-06-12T08:00:00.000Z",
      lastActivityAt: "2026-06-15T13:30:00.000Z",
    },
    series: [
      { date: "2026-06-13", conversations: 1, tokens: 40120 },
      { date: "2026-06-14", conversations: 2, tokens: 31712 },
      { date: "2026-06-15", conversations: 10, tokens: 728066 },
    ],
    coverage: { liveValid: 1234, mapped: 1234, excludedCount: 0, excluded: [], complete: true },
    ...overrides,
  };
}

const FORBIDDEN_SUBSTRINGS = [
  "intent",
  "sentiment",
  "resolution",
  "resolved",
  "priority",
  "revenue",
  "sales",
  "satisfaction",
  "lead",
  "order",
  "exchange",
  "escalation",
  "handover",
  "handoff",
  "staff",
  "csat",
  "nps",
];

describe("buildDashboardKpis", () => {
  it("emits only allowed, real metric keys", () => {
    const kpis = buildDashboardKpis(makeData());
    const allowed = new Set<string>(ALLOWED_METRIC_KEYS);
    expect(kpis.length).toBe(ALLOWED_METRIC_KEYS.length);
    for (const k of kpis) expect(allowed.has(k.key)).toBe(true);
  });

  it("never emits a forbidden (fabricated) metric key", () => {
    const kpis = buildDashboardKpis(makeData());
    const forbidden = new Set<string>(FORBIDDEN_METRIC_KEYS);
    for (const k of kpis) expect(forbidden.has(k.key)).toBe(false);
  });

  it("uses no fabricated wording in keys or labels", () => {
    const kpis = buildDashboardKpis(makeData());
    for (const k of kpis) {
      const hay = `${k.key} ${k.label}`.toLowerCase();
      for (const bad of FORBIDDEN_SUBSTRINGS) {
        expect(hay.includes(bad)).toBe(false);
      }
    }
  });

  it("derives values straight from the real totals", () => {
    const kpis = buildDashboardKpis(makeData());
    const by = Object.fromEntries(kpis.map((k) => [k.key, k]));
    expect(by.conversations.value).toBe("1,234");
    expect(by.newContacts.value).toBe("1,000");
    expect(by.returningContacts.value).toBe("234");
    expect(by.messages.value).toBe("17,300");
    expect(by.turns.value).toBe("6,800");
    expect(by.turns.sub).toBe("5.5 avg / chat"); // 6800 / 1234
    expect(by.totalTokens.value).toBe("799,898");
    expect(by.totalTokens.sub).toBe("13/1234 reported");
    expect(by.cost.value).toBe("$0.0621");
    expect(by.cost.sub).toBe("11/1234 reported");
  });

  it("avoids divide-by-zero when there are no conversations", () => {
    const kpis = buildDashboardKpis(
      makeData({
        totals: {
          conversations: 0,
          newContacts: 0,
          returningContacts: 0,
          turns: 0,
          messages: 0,
          totalTokens: 0,
          tokenCoverage: 0,
          cost: 0,
          costCoverage: 0,
          firstActivityAt: null,
          lastActivityAt: null,
        },
      })
    );
    const by = Object.fromEntries(kpis.map((k) => [k.key, k]));
    expect(by.turns.sub).toBe("0.0 avg / chat");
    expect(by.lastActivity.value).toBe("—");
  });
});

describe("fmtDateTime", () => {
  it("renders an absolute, tz-fixed time (12-hour AM/PM) and handles null", () => {
    expect(fmtDateTime(null, "Asia/Colombo")).toBe("—");
    expect(fmtDateTime("not-a-date", "Asia/Colombo")).toBe("—");
    // 13:30 UTC = 19:00 in Asia/Colombo (+5:30) = 7:00 PM — same AM/PM clock the Chat
    // Monitor shows for this instant (shared lib/format/time formatter).
    expect(fmtDateTime("2026-06-15T13:30:00.000Z", "Asia/Colombo")).toBe("Jun 15, 7:00 PM");
  });
});

describe("buildDashboardChartSeries", () => {
  it("maps the real daily series and computes the peak", () => {
    const s = buildDashboardChartSeries(makeData());
    expect(s.labels).toEqual(["2026-06-13", "2026-06-14", "2026-06-15"]);
    expect(s.conversations).toEqual([1, 2, 10]);
    expect(s.tokens).toEqual([40120, 31712, 728066]);
    expect(s.peakConversations).toBe(10);
    expect(s.totalConversations).toBe(1234);
    expect(s.totalTokens).toBe(799898);
  });
});
