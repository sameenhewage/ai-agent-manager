import { describe, it, expect } from "vitest";
import { buildConversationList, buildTranscriptView, isWithinRetention } from "./presenter";
import type { ParsedTranscript, TranscriptMessage } from "../agno/types";

/**
 * Slice 5 — Chat Monitor pure presenter (PRD 04, ADR-0004/0005/0006). No DB:
 * ordering, masking, retention windowing and transcript view-state are all unit-testable.
 */
const rec = (
  id: string,
  contact: string,
  lastAt: Date | null,
  status = "open",
  firstAt: Date | null = null
) => ({ id, externalContactId: contact, status, lastAt, firstAt });

// Lazy list contract: only a cheap turn count (jsonb_array_length(runs)) is carried;
// the list NEVER parses transcripts or includes message bodies/counts.
const turnCounts = new Map<string, number>([
  ["c1", 2],
  ["c2", 1],
]);

describe("isWithinRetention", () => {
  it("treats NULL retention as unlimited (always within window)", () => {
    expect(isWithinRetention(new Date(0), null)).toBe(true);
  });
  it("excludes activity older than the cutoff, keeps recent activity", () => {
    const now = new Date("2026-06-15T00:00:00Z");
    expect(isWithinRetention(new Date("2026-04-01T00:00:00Z"), 30, now)).toBe(false);
    expect(isWithinRetention(new Date("2026-06-14T00:00:00Z"), 30, now)).toBe(true);
  });
});

describe("buildConversationList", () => {
  it("orders by last_at descending and masks contact ids", () => {
    const records = [
      rec("c1", "94714128890", new Date("2026-06-10T00:00:00Z")),
      rec("c2", "94771234567", new Date("2026-06-14T00:00:00Z")),
    ];
    const { items } = buildConversationList(records, turnCounts, { retentionDays: null });
    expect(items.map((i) => i.id)).toEqual(["c2", "c1"]);
    expect(items[0].maskedContact).toBe("94•••••567");
    expect(items.some((i) => i.maskedContact.includes("714128"))).toBe(false);
  });

  it("never exposes the full external_contact_id in the serialized view", () => {
    const records = [rec("c1", "94714128890", new Date())];
    const { items } = buildConversationList(records, turnCounts, { retentionDays: null });
    expect(JSON.stringify(items)).not.toContain("94714128890");
  });

  it("handles an empty list", () => {
    expect(buildConversationList([], turnCounts, { retentionDays: null })).toEqual({
      items: [],
      restrictedCount: 0,
    });
  });

  it("excludes out-of-window conversations when retention is finite", () => {
    const now = new Date("2026-06-15T00:00:00Z");
    const records = [
      rec("c1", "94714128890", new Date("2026-01-01T00:00:00Z")),
      rec("c2", "94771234567", new Date("2026-06-14T00:00:00Z")),
    ];
    const { items, restrictedCount } = buildConversationList(records, turnCounts, {
      retentionDays: 30,
      now,
    });
    expect(items.map((i) => i.id)).toEqual(["c2"]);
    expect(restrictedCount).toBe(1);
  });

  it("carries a cheap turn count but NO transcript messages or message count (lazy list)", () => {
    const records = [rec("c1", "94714128890", new Date())];
    const { items } = buildConversationList(records, turnCounts, { retentionDays: null });
    expect(items[0].turnCount).toBe(2);
    expect(items[0]).not.toHaveProperty("messageCount");
    expect(items[0]).not.toHaveProperty("messages");
    expect(items[0]).not.toHaveProperty("transcript");
  });
});

describe("buildTranscriptView", () => {
  const msg = (
    id: string,
    sender: TranscriptMessage["sender"],
    content: string,
    at: Date | null
  ): TranscriptMessage => ({ id, role: sender === "bot" ? "assistant" : "user", sender, content, at });

  const parsed = (msgs: TranscriptMessage[]): ParsedTranscript => ({
    messages: msgs,
    messageCount: msgs.length,
    turnCount: 2,
    lastActivityAt: msgs.length ? new Date("2026-06-14T00:00:00Z") : null,
  });

  it("uses the parsed transcript and reports counts", () => {
    const v = buildTranscriptView(
      parsed([
        msg("u1", "customer", "hi", new Date("2026-06-14T00:00:00Z")),
        msg("a1", "bot", "hello", new Date("2026-06-14T00:01:00Z")),
      ]),
      { withinRetention: true }
    );
    expect(v.state).toBe("ok");
    expect(v.messageCount).toBe(2);
    expect(v.turnCount).toBe(2);
    expect(v.messages.map((m) => m.sender)).toEqual(["customer", "bot"]);
  });

  it("returns an empty state when there are no messages", () => {
    expect(buildTranscriptView(parsed([]), { withinRetention: true }).state).toBe("empty");
  });

  it("returns a restricted state (no messages) when retention blocks access", () => {
    const v = buildTranscriptView(parsed([msg("u1", "customer", "hi", null)]), {
      withinRetention: false,
    });
    expect(v.state).toBe("restricted");
    expect(v.messages).toEqual([]);
  });
});
