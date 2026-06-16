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
  coverage: { liveValid: 4, mapped: 4, excludedCount: 0, excluded: [], complete: true },
};

const safeItem: ConversationListItem = {
  id: "11111111-1111-1111-1111-111111111111",
  displayName: null,
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
      // a deliberately UNSAFE item: contains raw fields that must NEVER reach the client,
      // plus a safe customer displayName that SHOULD reach the client.
      conversations: [
        {
          ...safeItem,
          displayName: "Nimal Perera",
          externalContactId: "94771234567",
          agnoSessionId: "abcdef0123456789abcdef0123456789",
          userId: "94771234567",
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
    expect(json).not.toMatch(/94771234567/); // raw phone / raw user_id (#5, #6)
    expect(json).not.toMatch(/abcdef0123456789/); // raw agno session id (#8)
    expect(json).not.toMatch(/externalContactId|agnoSessionId|userId/); // raw contact id (#7)
    expect(json).not.toMatch(/customer_id|customer_identity_id|customerId|customerIdentityId/);
    expect(json).toMatch(/94•••••784/); // masked contact IS present (secondary)
    expect(json).toMatch(/Nimal Perera/); // safe customer displayName IS present (#1, #10)
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

describe("API parity + business-truth coverage exposure (CONTEXT.md §7)", () => {
  it("dashboard and analytics reconcile to the SAME totals and coverage for a range", async () => {
    const loadAnalytics = vi.fn().mockResolvedValue(fakeAnalytics);
    const loadRecent = vi.fn().mockResolvedValue({
      conversations: [],
      channelLabel: "WhatsApp",
      retentionLabel: "Unlimited",
      restrictedCount: 0,
    });
    const a = await runAnalyticsEndpoint(sp("range=today"), { loadAnalytics });
    const d = await runDashboardEndpoint(sp("range=today"), { loadAnalytics, loadRecent });
    const aBody = a.body as { analytics: AnalyticsData };
    const dBody = d.body as { analytics: AnalyticsData };
    expect(dBody.analytics.totals).toEqual(aBody.analytics.totals);
    expect(dBody.analytics.coverage).toEqual(aBody.analytics.coverage);
  });

  it("surfaces excluded valid sessions (reasoned, masked) — never hides them, never leaks raw ids", async () => {
    const withExcluded: AnalyticsData = {
      ...fakeAnalytics,
      coverage: {
        liveValid: 6,
        mapped: 4,
        excludedCount: 2,
        excluded: [
          { ref: "sess_••••b8bb", reason: "unsynced: no active app_conversations row (run db:agno:sync to map it)" },
          { ref: "sess_••••7e4f", reason: "unsynced: no active app_conversations row (run db:agno:sync to map it)" },
        ],
        complete: false,
      },
    };
    const res = await runAnalyticsEndpoint(sp("range=today"), {
      loadAnalytics: vi.fn().mockResolvedValue(withExcluded),
    });
    const body = res.body as { analytics: AnalyticsData };
    expect(body.analytics.coverage.complete).toBe(false);
    expect(body.analytics.coverage.excludedCount).toBe(2);
    const json = JSON.stringify(res.body);
    expect(json).toContain("sess_••••b8bb"); // masked ref IS surfaced (exclusion is explicit)
    expect(json).not.toMatch(/6c6bb8bb|7a477e4f/); // raw agno session_id NEVER leaks
  });
});

describe("pickRecentItem", () => {
  it("whitelists exactly the safe keys (drops raw/removed fields)", () => {
    const dirty = {
      ...safeItem,
      displayName: "Nimal Perera",
      externalContactId: "94771234567",
      agnoSessionId: "tok",
      customer_id: "c1",
      // Chat-Monitor-only fields: the reduced dashboard "recent" DTO must NOT carry them.
      lastMessagePreview: "Hello there!",
      lastMessageRole: "assistant",
      lastMessageAt: "2026-06-16T04:52:00.000Z",
    } as ConversationListItem & Record<string, unknown>;
    expect(Object.keys(pickRecentItem(dirty)).sort()).toEqual([
      "displayName",
      "firstAt",
      "id",
      "lastAt",
      "maskedContact",
      "status",
      "turnCount",
    ]);
  });

  it("passes through a safe customer displayName but never a raw phone", () => {
    const picked = pickRecentItem({ ...safeItem, displayName: "Nimal Perera" });
    expect(picked.displayName).toBe("Nimal Perera");
    expect(JSON.stringify(picked)).not.toContain("94771234567");
  });
});
