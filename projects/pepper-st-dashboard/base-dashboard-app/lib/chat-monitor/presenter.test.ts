import { describe, it, expect } from "vitest";
import {
  buildConversationList,
  buildTranscriptView,
  isWithinRetention,
  lastDisplayableMessage,
  messageAlignment,
  normalizeCustomerName,
  primaryContactLabel,
  toPreviewText,
  toRole,
} from "./presenter";
import { parseTranscript } from "../agno/parser";
import type { AgnoSession, ParsedTranscript, TranscriptMessage } from "../agno/types";

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

  it("carries safe FLAT last-message preview fields from the preview map (WhatsApp subtitle)", () => {
    const records = [rec("c1", "94714128890", new Date())];
    const previewByConversationId = new Map([
      ["c1", { role: "assistant" as const, text: "Hello! How can I help?", at: "2026-06-16T04:52:00.000Z" }],
    ]);
    const { items } = buildConversationList(records, turnCounts, {
      retentionDays: null,
      previewByConversationId,
    });
    expect(items[0].lastMessagePreview).toBe("Hello! How can I help?");
    expect(items[0].lastMessageRole).toBe("assistant");
    expect(items[0].lastMessageAt).toBe("2026-06-16T04:52:00.000Z");
    // list item stays lightweight + safe: no transcript bodies, no raw phone
    expect(items[0]).not.toHaveProperty("messages");
    expect(items[0]).not.toHaveProperty("transcript");
    expect(JSON.stringify(items[0])).not.toContain("94714128890");
  });

  it("defaults the preview fields to null when no preview map is provided (dashboard/fast path)", () => {
    const records = [rec("c1", "94714128890", new Date())];
    const { items } = buildConversationList(records, turnCounts, { retentionDays: null });
    expect(items[0].lastMessagePreview ?? null).toBeNull();
    expect(items[0].lastMessageRole ?? null).toBeNull();
    expect(items[0].lastMessageAt ?? null).toBeNull();
  });
});

/**
 * ADR-0016 Gate B — one LIST ROW per CONTACT THREAD (transitional key: tenant+channel+contact;
 * the service scopes tenant+channel, so it reduces to external_contact_id). Conversations are NOT
 * collapsed in the DB — this is read-time grouping only.
 */
describe("buildConversationList — contact-thread grouping (ADR-0016 Gate B)", () => {
  it("renders TWO conversations with the same contact as ONE list row (representative = most recent)", () => {
    const records = [
      rec("c1", "94714128890", new Date("2026-06-10T00:00:00Z")),
      rec("c2", "94714128890", new Date("2026-06-14T00:00:00Z")), // SAME contact, newer
    ];
    const { items } = buildConversationList(
      records,
      new Map([
        ["c1", 3],
        ["c2", 5],
      ]),
      { retentionDays: null }
    );
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("c2"); // most-recent member is the surfaced id
    expect(items[0].lastAt).toBe(new Date("2026-06-14T00:00:00Z").toISOString());
    expect(items[0].turnCount).toBe(8); // summed across the thread's sessions
  });

  it("keeps DISTINCT contacts as separate rows (no accidental collapse)", () => {
    const records = [
      rec("c1", "94714128890", new Date("2026-06-10T00:00:00Z")),
      rec("c2", "94771234567", new Date("2026-06-14T00:00:00Z")),
    ];
    const { items } = buildConversationList(records, new Map(), { retentionDays: null });
    expect(items).toHaveLength(2);
  });

  it("uses first_at = earliest and last_at = latest across the grouped thread", () => {
    const records = [
      rec("c1", "94714128890", new Date("2026-06-14T00:00:00Z"), "open", new Date("2026-06-01T00:00:00Z")),
      rec("c2", "94714128890", new Date("2026-06-20T00:00:00Z"), "open", new Date("2026-06-10T00:00:00Z")),
    ];
    const { items } = buildConversationList(records, new Map(), { retentionDays: null });
    expect(items[0].firstAt).toBe(new Date("2026-06-01T00:00:00Z").toISOString());
    expect(items[0].lastAt).toBe(new Date("2026-06-20T00:00:00Z").toISOString());
  });

  it("status is 'open' if ANY grouped conversation is open (safest-active rule)", () => {
    const records = [
      rec("c1", "94714128890", new Date("2026-06-10T00:00:00Z"), "resolved"),
      rec("c2", "94714128890", new Date("2026-06-14T00:00:00Z"), "resolved"),
      rec("c3", "94714128890", new Date("2026-06-12T00:00:00Z"), "open"),
    ];
    const { items } = buildConversationList(records, new Map(), { retentionDays: null });
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("open");
  });

  it("preview = the latest displayable message across the thread's sessions", () => {
    const records = [
      rec("c1", "94714128890", new Date("2026-06-10T00:00:00Z")),
      rec("c2", "94714128890", new Date("2026-06-14T00:00:00Z")),
    ];
    const previewByConversationId = new Map([
      ["c1", { role: "customer" as const, text: "older message", at: "2026-06-10T00:00:00.000Z" }],
      ["c2", { role: "assistant" as const, text: "newest message", at: "2026-06-14T00:00:00.000Z" }],
    ]);
    const { items } = buildConversationList(records, new Map(), {
      retentionDays: null,
      previewByConversationId,
    });
    expect(items[0].lastMessagePreview).toBe("newest message");
    expect(items[0].lastMessageRole).toBe("assistant");
  });

  it("never leaks the raw contact even when grouping multiple sessions", () => {
    const records = [
      rec("c1", "94714128890", new Date("2026-06-10T00:00:00Z")),
      rec("c2", "94714128890", new Date("2026-06-14T00:00:00Z")),
    ];
    const { items } = buildConversationList(records, new Map(), { retentionDays: null });
    expect(JSON.stringify(items)).not.toContain("94714128890");
    expect(items[0].maskedContact).toBe("94•••••890");
  });

  it("treats a whole out-of-window thread as ONE restricted entry (not per session)", () => {
    const now = new Date("2026-06-15T00:00:00Z");
    const records = [
      rec("c1", "94714128890", new Date("2026-01-01T00:00:00Z")),
      rec("c2", "94714128890", new Date("2026-02-01T00:00:00Z")),
    ];
    const { items, restrictedCount } = buildConversationList(records, new Map(), {
      retentionDays: 30,
      now,
    });
    expect(items).toHaveLength(0);
    expect(restrictedCount).toBe(1); // one thread, not two
  });
});

/**
 * WhatsApp-style list subtitle: the most recent displayable message, shaped into one safe
 * line. Pure (no DB); content only (already shown in the transcript) — never a raw id.
 */
describe("toPreviewText", () => {
  it("collapses newlines and runs of whitespace into a single clean line", () => {
    expect(toPreviewText("Hello\n\nworld   again\t!")).toBe("Hello world again !");
  });
  it("returns an empty string for null/undefined/blank content", () => {
    expect(toPreviewText(null)).toBe("");
    expect(toPreviewText(undefined)).toBe("");
    expect(toPreviewText("   \n  ")).toBe("");
  });
  it("truncates with a single-character ellipsis when longer than the max", () => {
    const out = toPreviewText("abcdefghij", 5);
    expect(out).toBe("abcd\u2026");
    expect([...out].length).toBe(5);
  });
  it("does not truncate when within the max", () => {
    expect(toPreviewText("short", 100)).toBe("short");
  });
});

describe("toRole", () => {
  it("maps parser senders to safe DTO roles (customer→customer, bot→assistant, tool→null)", () => {
    expect(toRole("customer")).toBe("customer");
    expect(toRole("bot")).toBe("assistant");
    expect(toRole("tool")).toBeNull();
  });
});

// WhatsApp-style row alignment: customer LEFT, assistant RIGHT, NEVER centered.
describe("messageAlignment", () => {
  it("aligns the customer row to the LEFT (justify-start, incoming)", () => {
    const a = messageAlignment("customer");
    expect(a.row).toBe("justify-start");
    expect(a.outgoing).toBe(false);
  });
  it("aligns the assistant row to the RIGHT (justify-end, outgoing)", () => {
    const a = messageAlignment("assistant");
    expect(a.row).toBe("justify-end");
    expect(a.outgoing).toBe(true);
  });
  it("NEVER centers a message row", () => {
    for (const role of ["customer", "assistant"] as const) {
      expect(messageAlignment(role).row).not.toMatch(/center/);
    }
  });
});

describe("lastDisplayableMessage", () => {
  const v = (sender: "customer" | "bot" | "tool", content: string, at: string | null = null) => ({
    sender,
    content,
    at,
  });
  it("returns null for an empty message list", () => {
    expect(lastDisplayableMessage([])).toBeNull();
  });
  it("previews the NEWEST message, role-mapped + whitespace-collapsed", () => {
    const p = lastDisplayableMessage([
      v("customer", "first", "2026-06-16T04:51:00.000Z"),
      v("bot", "Hey there!  \n thanks", "2026-06-16T04:52:00.000Z"),
    ]);
    expect(p).toEqual({ role: "assistant", text: "Hey there! thanks", at: "2026-06-16T04:52:00.000Z" });
  });

  // Business-Truth: the preview is the latest DISPLAYABLE user/assistant content message —
  // never system / tool / from_history / empty-assistant content.
  it("derives the preview from the latest displayable message of a raw Agno session", () => {
    const session: AgnoSession = {
      session_id: "s1",
      agent_id: "a",
      created_at: 100,
      updated_at: 105,
      runs: [
        {
          messages: [
            { role: "system", id: "s", created_at: 100, content: "prompt" },
            { role: "user", id: "u1", created_at: 101, content: "Do you have black polo t-shirts?" },
            { role: "assistant", id: "a1", created_at: 102, content: "" }, // empty / tool-call-only
            { role: "tool", id: "t1", created_at: 103, content: '{"phone":"94714128890"}' },
            { role: "user", id: "h1", created_at: 104, content: "old", from_history: true },
            { role: "assistant", id: "a2", created_at: 105, content: "Yes, we have that available." },
          ],
        },
      ],
    };
    const parsed = parseTranscript(session);
    const mapped = parsed.messages.map((m) => ({
      sender: m.sender,
      content: m.content,
      at: m.at ? m.at.toISOString() : null,
    }));
    const p = lastDisplayableMessage(mapped);
    expect(p?.role).toBe("assistant");
    expect(p?.text).toBe("Yes, we have that available.");
    expect(p?.text).not.toContain("94714128890"); // never the raw tool args / phone
  });
});

/**
 * Customer name display (AI-owned `ai.customers.name`, read by value on
 * tenant+channel+phone). The name is additive DISPLAY data — it must never relax the
 * masking guarantee, so the raw phone still never appears in the serialized view.
 */
describe("customer name display (displayName)", () => {
  const names = new Map<string, string | null>([["94714128890", "Nimal Perera"]]);

  it("includes displayName from the ai.customers name map when present (#1)", () => {
    const records = [rec("c1", "94714128890", new Date())];
    const { items } = buildConversationList(records, turnCounts, {
      retentionDays: null,
      namesByContact: names,
    });
    expect(items[0].displayName).toBe("Nimal Perera");
    expect(items[0].maskedContact).toBe("94•••••890"); // masked id retained as secondary
  });

  it("uses the customer name (NOT the masked phone) as the primary label when a name exists (#2, #3)", () => {
    const records = [rec("c1", "94714128890", new Date())];
    const { items } = buildConversationList(records, turnCounts, {
      retentionDays: null,
      namesByContact: names,
    });
    expect(primaryContactLabel(items[0])).toBe("Nimal Perera");
    expect(primaryContactLabel(items[0])).not.toBe(items[0].maskedContact);
  });

  it("falls back safely to the masked contact when the name is missing/null/empty (#4)", () => {
    expect(normalizeCustomerName(null)).toBeNull();
    expect(normalizeCustomerName(undefined)).toBeNull();
    expect(normalizeCustomerName("")).toBeNull();
    expect(normalizeCustomerName("   ")).toBeNull();
    expect(normalizeCustomerName("  Sunil  ")).toBe("Sunil");

    const records = [rec("c1", "94714128890", new Date())];
    const blanks = new Map<string, string | null>([["94714128890", "   "]]);
    const { items } = buildConversationList(records, turnCounts, {
      retentionDays: null,
      namesByContact: blanks,
    });
    expect(items[0].displayName).toBeNull();
    expect(primaryContactLabel(items[0])).toBe(items[0].maskedContact);
  });

  it("defaults displayName to null when no name map is provided (back-compat)", () => {
    const records = [rec("c1", "94714128890", new Date())];
    const { items } = buildConversationList(records, turnCounts, { retentionDays: null });
    expect(items[0].displayName).toBeNull();
  });

  it("never leaks the raw phone in the serialized view even when a name is present (security)", () => {
    const records = [rec("c1", "94714128890", new Date())];
    const { items } = buildConversationList(records, turnCounts, {
      retentionDays: null,
      namesByContact: names,
    });
    expect(JSON.stringify(items)).not.toContain("94714128890");
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
