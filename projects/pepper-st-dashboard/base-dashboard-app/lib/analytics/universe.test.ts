import { describe, it, expect } from "vitest";
import {
  buildAnalyticsInputs,
  collectSessionIds,
  isActiveConversation,
  toAnalyticsInput,
  type SessionMetricsRow,
  type UniverseConversation,
} from "./universe";

/**
 * Slice 12D — the analytics UNIVERSE is derived from the tenant/channel's ACTIVE
 * `app_conversations` (archived excluded) and joined BY VALUE to session rows that were
 * fetched by `session_id` (PK), never by scanning Agno by `agent_id`. These pure helpers
 * encode that contract so it is testable without a database. No contact PII may appear.
 */

const NOW = new Date("2026-06-16T00:00:00.000Z");

function conv(over: Partial<UniverseConversation> = {}): UniverseConversation {
  return {
    id: over.id ?? "c1",
    sessionIds: over.sessionIds ?? ["s1"],
    status: over.status ?? "open",
    firstAt: over.firstAt ?? new Date("2026-06-10T09:00:00.000Z"),
    lastAt: over.lastAt ?? new Date("2026-06-10T10:00:00.000Z"),
  };
}

/** Index a list of session rows by session_id (the shape toAnalyticsInput/buildAnalyticsInputs join on). */
function byIdOf(rows: SessionMetricsRow[]): Map<string, SessionMetricsRow> {
  return new Map(rows.map((r) => [String(r.session_id), r]));
}

/** One run with user + assistant + system messages → turns=1, displayed messages=2. */
function sessionRow(over: Partial<SessionMetricsRow> = {}): SessionMetricsRow {
  return {
    session_id: over.session_id ?? "s1",
    runs:
      over.runs ?? [
        {
          messages: [
            { role: "user", content: "hi", id: "m1", created_at: 1_718_000_000 },
            { role: "assistant", content: "hello", id: "m2", created_at: 1_718_000_001 },
            { role: "system", content: "sys", id: "m3", created_at: 1_718_000_002 },
          ],
        },
      ],
    created_at: over.created_at ?? 1_718_000_000,
    updated_at: over.updated_at ?? 1_718_000_002,
    total_tokens: over.total_tokens ?? "1500",
    cost: over.cost ?? "0.0123",
  };
}

describe("isActiveConversation", () => {
  it("includes open + resolved, excludes archived", () => {
    expect(isActiveConversation({ status: "open" })).toBe(true);
    expect(isActiveConversation({ status: "resolved" })).toBe(true);
    expect(isActiveConversation({ status: "archived" })).toBe(false);
  });
});

describe("collectSessionIds", () => {
  it("returns de-duplicated, non-empty session ids across all conversations' linked sessions", () => {
    const ids = collectSessionIds([
      { sessionIds: ["s1", "s2"] },
      { sessionIds: ["s1"] }, // dup across conversations
      { sessionIds: [""] }, // empty dropped
    ]);
    expect(ids.sort()).toEqual(["s1", "s2"]);
  });

  it("returns an empty array for no conversations", () => {
    expect(collectSessionIds([])).toEqual([]);
  });
});

describe("toAnalyticsInput", () => {
  it("parses turns + displayed messages from runs and numeric token/cost", () => {
    const input = toAnalyticsInput(conv(), byIdOf([sessionRow()]), NOW);
    expect(input.turnCount).toBe(1); // one run
    expect(input.messageCount).toBe(2); // user + assistant (system hidden)
    expect(input.totalTokens).toBe(1500);
    expect(input.cost).toBeCloseTo(0.0123, 6);
  });

  it("AGGREGATES turns + messages + token/cost across ALL of a thread's linked sessions (Gate C.3)", () => {
    const input = toAnalyticsInput(
      conv({ sessionIds: ["s1", "s2"] }),
      byIdOf([
        sessionRow({ session_id: "s1", total_tokens: "1000", cost: "0.10" }),
        sessionRow({ session_id: "s2", total_tokens: "500", cost: "0.05" }),
      ]),
      NOW
    );
    expect(input.turnCount).toBe(2); // one run each → summed
    expect(input.messageCount).toBe(4); // 2 displayed each → summed
    expect(input.totalTokens).toBe(1500); // 1000 + 500
    expect(input.cost).toBeCloseTo(0.15, 6); // 0.10 + 0.05
  });

  it("counts only the LIVE linked sessions; a missing session contributes nothing", () => {
    const input = toAnalyticsInput(
      conv({ sessionIds: ["s1", "missing"] }),
      byIdOf([sessionRow({ session_id: "s1", total_tokens: "700", cost: "0.07" })]),
      NOW
    );
    expect(input.turnCount).toBe(1);
    expect(input.messageCount).toBe(2);
    expect(input.totalTokens).toBe(700);
    expect(input.cost).toBeCloseTo(0.07, 6);
  });

  it("yields zero/null (not fabricated) when NO linked session is live", () => {
    const input = toAnalyticsInput(conv(), new Map(), NOW);
    expect(input.turnCount).toBe(0);
    expect(input.messageCount).toBe(0);
    expect(input.totalTokens).toBeNull();
    expect(input.cost).toBeNull();
  });

  it("carries NO contact PII — only the analytics input keys", () => {
    const input = toAnalyticsInput(conv(), byIdOf([sessionRow()]), NOW);
    expect(Object.keys(input).sort()).toEqual(
      [
        "conversationId",
        "cost",
        "firstAt",
        "lastAt",
        "messageCount",
        "totalTokens",
        "turnCount",
      ].sort()
    );
  });
});

describe("buildAnalyticsInputs", () => {
  it("joins conversations to session rows BY session_id (value join)", () => {
    const inputs = buildAnalyticsInputs(
      [conv({ id: "c1", sessionIds: ["s1"] }), conv({ id: "c2", sessionIds: ["s2"] })],
      [sessionRow({ session_id: "s2", total_tokens: "200" }), sessionRow({ session_id: "s1", total_tokens: "100" })],
      NOW
    );
    const byConv = new Map(inputs.map((i) => [i.conversationId, i]));
    expect(byConv.get("c1")?.totalTokens).toBe(100);
    expect(byConv.get("c2")?.totalTokens).toBe(200);
  });

  it("excludes archived conversations even if a live session exists (stale v1 cannot leak into totals)", () => {
    const inputs = buildAnalyticsInputs(
      [
        conv({ id: "active", sessionIds: ["s1"], status: "open" }),
        conv({ id: "retired", sessionIds: ["s2"], status: "archived" }),
      ],
      [sessionRow({ session_id: "s1" }), sessionRow({ session_id: "s2" })],
      NOW
    );
    expect(inputs.map((i) => i.conversationId)).toEqual(["active"]);
  });

  it("keeps an active conversation whose live session is absent, with honest zero/null", () => {
    const inputs = buildAnalyticsInputs([conv({ id: "c1", sessionIds: ["missing"] })], [], NOW);
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({ conversationId: "c1", turnCount: 0, messageCount: 0, totalTokens: null, cost: null });
  });
});
