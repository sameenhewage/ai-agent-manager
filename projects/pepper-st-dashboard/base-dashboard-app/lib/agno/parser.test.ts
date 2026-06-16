import { describe, it, expect } from "vitest";
import { parseTranscript, epochSecondsToDate } from "./parser";
import type { AgnoSession } from "./types";

/**
 * Slice 4 — read-only transcript parser (Workflow 03 / architecture 03-agno-mapping).
 * Pure, in-memory; no persistence. Excludes system, drops from_history, dedupes by id,
 * orders by created_at, applies retention (NULL = unlimited), hides tool messages.
 */
function msg(
  role: string,
  id: string | null,
  created_at: number | null,
  content = "x",
  extra: Record<string, unknown> = {}
) {
  return { role, id, created_at, content, ...extra };
}

const base: AgnoSession = {
  session_id: "94714128890",
  agent_id: "concierge",
  created_at: 100,
  updated_at: 202,
  runs: [
    {
      messages: [
        msg("system", "s1", 100, "prompt"),
        msg("user", "u1", 101, "hi"),
        msg("assistant", "a1", 102, "hello"),
      ],
    },
    {
      messages: [
        msg("system", "s1b", 200, "prompt"),
        msg("user", "u2", 201, "again"),
        msg("assistant", "a2", 202, "sure"),
      ],
    },
  ],
};

describe("epochSecondsToDate", () => {
  it("converts epoch seconds to a Date", () => {
    expect(epochSecondsToDate(1700000000)?.getTime()).toBe(1700000000 * 1000);
    expect(epochSecondsToDate(0)?.getTime()).toBe(0);
  });
  it("returns null for missing/invalid input", () => {
    expect(epochSecondsToDate(undefined)).toBeNull();
    expect(epochSecondsToDate(null)).toBeNull();
    expect(epochSecondsToDate(Number.NaN)).toBeNull();
  });
});

describe("parseTranscript", () => {
  it("excludes system messages", () => {
    expect(parseTranscript(base).messages.every((m) => m.role !== "system")).toBe(true);
  });

  it("flattens runs[].messages[] ordered by created_at", () => {
    expect(parseTranscript(base).messages.map((m) => m.id)).toEqual(["u1", "a1", "u2", "a2"]);
  });

  it("dedupes by message id", () => {
    const dup: AgnoSession = {
      ...base,
      runs: [{ messages: [msg("user", "u1", 101, "hi"), msg("user", "u1", 101, "dup")] }],
    };
    expect(parseTranscript(dup).messages.filter((m) => m.id === "u1")).toHaveLength(1);
  });

  it("drops from_history = true", () => {
    const fh: AgnoSession = {
      ...base,
      runs: [
        {
          messages: [
            msg("user", "h1", 101, "old", { from_history: true }),
            msg("user", "u9", 102, "new"),
          ],
        },
      ],
    };
    expect(parseTranscript(fh).messages.map((m) => m.id)).toEqual(["u9"]);
  });

  it("handles null/missing/invalid runs without crashing", () => {
    expect(parseTranscript({ session_id: "x", runs: null }).messages).toEqual([]);
    expect(parseTranscript({ session_id: "x" }).messages).toEqual([]);
    expect(
      parseTranscript({ session_id: "x", runs: [{}, { messages: null }] }).messages
    ).toEqual([]);
  });

  it("hides tool messages by default and never exposes raw tool args when included", () => {
    const tools: AgnoSession = {
      ...base,
      runs: [
        {
          messages: [
            msg("user", "u1", 101),
            msg("tool", "t1", 102, '{"phone":"94714128890"}'),
            msg("assistant", "a1", 103),
          ],
        },
      ],
    };
    expect(parseTranscript(tools).messages.some((m) => m.sender === "tool")).toBe(false);
    const withTools = parseTranscript(tools, { includeTool: true });
    const tool = withTools.messages.find((m) => m.sender === "tool");
    expect(tool).toBeTruthy();
    expect(tool?.content).not.toContain("94714128890");
  });

  it("maps roles to senders (user->customer, assistant->bot)", () => {
    const t = parseTranscript(base);
    expect(t.messages.find((m) => m.id === "u1")?.sender).toBe("customer");
    expect(t.messages.find((m) => m.id === "a1")?.sender).toBe("bot");
  });

  it("derives message count, turn count and last activity", () => {
    const t = parseTranscript(base);
    expect(t.messageCount).toBe(4);
    expect(t.turnCount).toBe(2);
    expect(t.lastActivityAt?.getTime()).toBe(202 * 1000);
  });

  // Business-Truth (CONTEXT.md §7): "displayable messages" = user + assistant-with-content.
  // Tool-call-only / internal assistant turns carry NO visible content and must not inflate
  // the message count (they showed up as empty bot bubbles). turnCount (= runs.length) is
  // unaffected — a tool-calling turn is still a turn.
  it("excludes empty / tool-call-only ASSISTANT messages from displayable count", () => {
    const s: AgnoSession = {
      ...base,
      runs: [
        {
          messages: [
            msg("user", "u1", 101, "hi"),
            msg("assistant", "a1", 102, ""), // tool-call-only -> no visible content
            msg("assistant", "a2", 103, "   "), // whitespace-only -> no visible content
            msg("assistant", "a3", 104, "real answer"),
          ],
        },
      ],
    };
    const t = parseTranscript(s);
    expect(t.messages.map((m) => m.id)).toEqual(["u1", "a3"]);
    expect(t.messageCount).toBe(2);
    expect(t.turnCount).toBe(1); // one run, regardless of empty bot turns
  });

  it("KEEPS an empty-content USER message (e.g. media-only) — only assistant empties drop", () => {
    const s: AgnoSession = {
      ...base,
      runs: [{ messages: [msg("user", "u1", 101, ""), msg("assistant", "a1", 102, "hi")] }],
    };
    expect(parseTranscript(s).messages.map((m) => m.id)).toEqual(["u1", "a1"]);
  });

  it("applies retention (NULL = unlimited; cutoff drops older messages)", () => {
    const now = new Date(1000 * 1000);
    expect(parseTranscript(base, { retentionDays: null, now }).messages).toHaveLength(4);
    expect(parseTranscript(base, { retentionDays: 0.00001, now }).messages).toHaveLength(0);
  });

  it("returns a safe empty transcript when everything is out of retention", () => {
    const now = new Date(10_000_000 * 1000);
    const t = parseTranscript(base, { retentionDays: 1, now });
    expect(t.messages).toEqual([]);
    expect(t.messageCount).toBe(0);
  });
});
