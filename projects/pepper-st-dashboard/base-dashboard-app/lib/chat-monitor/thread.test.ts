import { describe, it, expect } from "vitest";
import { mergeThreadMessages } from "./thread";
import type { AgnoMessage, AgnoSession } from "../agno/types";

/**
 * ADR-0016 Gate B — pure transcript MERGE across the provider sessions of one contact thread.
 * Proves the business contract: multiple linked sessions render as ONE thread, duplicate provider
 * message ids are deduped, messages are time-sorted, retention applies, and a missing/absent
 * session (live has app_conversations=19 vs ai.agno_sessions=11) never crashes the merge.
 */

function msg(
  id: string | null,
  role: string,
  content: string,
  createdAt: number,
  extra: Partial<AgnoMessage> = {}
): AgnoMessage {
  return { id, role, content, created_at: createdAt, ...extra };
}

function sess(sessionId: string, messages: AgnoMessage[], created = 0, updated = 0): AgnoSession {
  return { session_id: sessionId, runs: [{ messages }], created_at: created, updated_at: updated };
}

const RAW_PHONE = "94714128890";

describe("mergeThreadMessages", () => {
  it("merges displayable messages from MULTIPLE linked sessions into one ordered thread", () => {
    const s1 = sess("s1", [
      msg("u1", "user", "Hi (session 1)", 100),
      msg("a1", "assistant", "Hello! (session 1)", 101),
    ]);
    const s2 = sess("s2", [
      msg("u2", "user", "I'm back (session 2)", 200),
      msg("a2", "assistant", "Welcome back! (session 2)", 201),
    ]);
    const merged = mergeThreadMessages([s1, s2]);
    expect(merged.messages.map((m) => m.content)).toEqual([
      "Hi (session 1)",
      "Hello! (session 1)",
      "I'm back (session 2)",
      "Welcome back! (session 2)",
    ]);
    expect(merged.messageCount).toBe(4);
    expect(merged.turnCount).toBe(2); // one run per session
  });

  it("sorts merged messages by timestamp ACROSS sessions (interleaved by time)", () => {
    const s1 = sess("s1", [msg("a", "user", "first", 100), msg("c", "user", "third", 300)]);
    const s2 = sess("s2", [msg("b", "user", "second", 200), msg("d", "user", "fourth", 400)]);
    const merged = mergeThreadMessages([s2, s1]); // pass sessions out of order on purpose
    expect(merged.messages.map((m) => m.content)).toEqual(["first", "second", "third", "fourth"]);
  });

  it("DEDUPES by stable provider message id across sessions (keeps the first occurrence)", () => {
    const s1 = sess("s1", [msg("dup-1", "user", "original", 100)]);
    const s2 = sess("s2", [
      msg("dup-1", "user", "duplicate copy", 150), // same provider id -> dropped
      msg("u2", "assistant", "unique answer", 160),
    ]);
    const merged = mergeThreadMessages([s1, s2]);
    expect(merged.messages.map((m) => m.content)).toEqual(["original", "unique answer"]);
    expect(merged.messages.filter((m) => m.providerId === "dup-1")).toHaveLength(1);
  });

  it("does NOT crash on an empty set or a session with null/missing runs (missing ai.agno_sessions row)", () => {
    expect(mergeThreadMessages([]).messages).toEqual([]);
    const absent: AgnoSession = { session_id: "x", runs: null, created_at: 1, updated_at: 2 };
    const ok = sess("s1", [msg("u1", "user", "still here", 100)]);
    const merged = mergeThreadMessages([absent, ok]);
    expect(merged.messages.map((m) => m.content)).toEqual(["still here"]);
  });

  it("carries the canonical parser rules through the merge (no system/tool/from_history/empty-assistant; no PII)", () => {
    const s = sess("s1", [
      msg("sys", "system", "internal prompt", 100),
      msg("u1", "user", "real question", 101),
      msg("a-empty", "assistant", "", 102), // tool-call-only / empty assistant
      msg("t1", "tool", `{"phone":"${RAW_PHONE}"}`, 103),
      msg("h1", "user", "old history", 104, { from_history: true }),
      msg("a1", "assistant", "real answer", 105),
    ]);
    const merged = mergeThreadMessages([s]);
    expect(merged.messages.map((m) => m.content)).toEqual(["real question", "real answer"]);
    expect(JSON.stringify(merged)).not.toContain(RAW_PHONE); // raw tool args / phone never surface
  });

  it("applies retention across the thread (drops messages older than the cutoff)", () => {
    const now = new Date("2026-06-15T00:00:00Z");
    const old = Math.floor(new Date("2026-01-01T00:00:00Z").getTime() / 1000);
    const recent = Math.floor(new Date("2026-06-14T00:00:00Z").getTime() / 1000);
    const s = sess("s1", [msg("u1", "user", "ancient", old), msg("u2", "user", "recent", recent)]);
    const merged = mergeThreadMessages([s], { retentionDays: 30, now });
    expect(merged.messages.map((m) => m.content)).toEqual(["recent"]);
  });

  it("reports lastActivityAt as the newest message timestamp across the thread", () => {
    const s1 = sess("s1", [msg("u1", "user", "early", 100)]);
    const s2 = sess("s2", [msg("u2", "user", "late", 500)]);
    const merged = mergeThreadMessages([s1, s2]);
    expect(merged.lastActivityAt?.getTime()).toBe(500 * 1000);
  });
});
