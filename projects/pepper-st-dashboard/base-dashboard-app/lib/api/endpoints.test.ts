import { describe, it, expect, vi } from "vitest";
import { runAnalyticsEndpoint, runDashboardEndpoint, pickRecentItem } from "./endpoints";
import type { AnalyticsData } from "../analytics/service";
import type { ConversationListItem } from "../chat-monitor/presenter";

/**
 * Slice 12C (ADR-0013) — dependency-injected API route cores. Tests the HTTP-boundary
 * contract WITHOUT a DB: range validation, server-side tenant/channel resolution
 * (client tenant/channel ignored), safe-DTO-only responses (no raw external_contact_id /
 * agno_session_id / customer ids), and safe error mapping.
 */

const sp = (s: string) => new URLSearchParams(s);

const fakeAnalytics: AnalyticsData = {
  tenantName: "PEPPER ST.",
  channelLabel: "WhatsApp",
  timeZone: "Asia/Colombo",
  analyticsRetentionDays: null,
  retentionLabel: "Unlimited",
  range: {
    key: "7d",
    label: "Last 7 days",
    fromISO: "2026-06-09T00:00:00.000Z",
    toISO: "2026-06-16T00:00:00.000Z",
  },
  clamped: false,
  requestedFromISO: null,
  totals: {
    conversations: 4,
    newContacts: 2,
    returningContacts: 2,
    turns: 38,
    messages: 110,
    totalTokens: 828005,
    tokenCoverage: 4,
    cost: 0.077716308,
    costCoverage: 4,
    firstActivityAt: "2026-06-10T05:00:00.000Z",
    lastActivityAt: "2026-06-15T09:00:00.000Z",
  },
  series: [{ date: "2026-06-15", conversations: 4, tokens: 828005 }],
};

const safeItem: ConversationListItem = {
  id: "11111111-1111-1111-1111-111111111111",
  maskedContact: "94•••••784",
  status: "open",
  firstAt: "2026-06-10T05:00:00.000Z",
  lastAt: "2026-06-15T09:00:00.000Z",
  turnCount: 9,
};

describe("runAnalyticsEndpoint", () => {
  it("400s on an invalid range WITHOUT calling the data loader", async () => {
    const loadAnalytics = vi.fn();
    const res = await runAnalyticsEndpoint(sp("range=__bad__"), { loadAnalytics });
    expect(res.status).toBe(400);
    expect(loadAnalytics).not.toHaveBeenCalled();
  });

  it("resolves tenant/channel server-side: the loader only ever gets {key,customFrom,customTo}", async () => {
    const loadAnalytics = vi.fn().mockResolvedValue(fakeAnalytics);
    const res = await runAnalyticsEndpoint(sp("range=7d&tenant_id=hacker&channel_id=evil"), {
      loadAnalytics,
    });
    expect(res.status).toBe(200);
    expect(loadAnalytics).toHaveBeenCalledWith({ key: "7d", customFrom: null, customTo: null });
    expect(JSON.stringify(res.body)).not.toMatch(/hacker|evil/);
  });

  it("maps a loader failure to a safe 500 (no raw error/secret) and reports via onError", async () => {
    const onError = vi.fn();
    const res = await runAnalyticsEndpoint(sp("range=7d"), {
      loadAnalytics: vi.fn().mockRejectedValue(new Error("ECONNREFUSED postgres://secret@host/db")),
      onError,
    });
    expect(res.status).toBe(500);
    expect(onError).toHaveBeenCalledOnce();
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|postgres|secret/);
  });
});

describe("runDashboardEndpoint — safe DTO only", () => {
  it("returns analytics + recent and strips every raw/removed field", async () => {
    const loadAnalytics = vi.fn().mockResolvedValue(fakeAnalytics);
    const loadRecent = vi.fn().mockResolvedValue({
      // a deliberately UNSAFE item: contains raw fields that must NEVER reach the client
      conversations: [
        {
          ...safeItem,
          externalContactId: "94771234567",
          agnoSessionId: "abcdef0123456789abcdef0123456789",
          customer_id: "c1",
          customer_identity_id: "ci1",
        },
      ],
      channelLabel: "WhatsApp",
      retentionLabel: "Unlimited",
      restrictedCount: 0,
    });

    const res = await runDashboardEndpoint(sp("range=7d"), { loadAnalytics, loadRecent });
    expect(res.status).toBe(200);
    const json = JSON.stringify(res.body);
    expect(json).not.toMatch(/94771234567/); // raw phone
    expect(json).not.toMatch(/abcdef0123456789/); // raw agno session id
    expect(json).not.toMatch(/externalContactId|agnoSessionId/);
    expect(json).not.toMatch(/customer_id|customer_identity_id|customerId|customerIdentityId/);
    expect(json).toMatch(/94•••••784/); // masked contact IS present
  });

  it("400s on invalid range without loading anything", async () => {
    const loadAnalytics = vi.fn();
    const loadRecent = vi.fn();
    const res = await runDashboardEndpoint(sp("range=__bad__"), { loadAnalytics, loadRecent });
    expect(res.status).toBe(400);
    expect(loadAnalytics).not.toHaveBeenCalled();
    expect(loadRecent).not.toHaveBeenCalled();
  });
});

describe("pickRecentItem", () => {
  it("whitelists exactly the safe keys (drops raw/removed fields)", () => {
    const dirty = {
      ...safeItem,
      externalContactId: "94771234567",
      agnoSessionId: "tok",
      customer_id: "c1",
    } as ConversationListItem & Record<string, unknown>;
    expect(Object.keys(pickRecentItem(dirty)).sort()).toEqual([
      "firstAt",
      "id",
      "lastAt",
      "maskedContact",
      "status",
      "turnCount",
    ]);
  });
});
