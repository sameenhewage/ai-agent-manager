import { describe, it, expect } from "vitest";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  buildMessagesPage,
  decodeCursor,
  encodeCursor,
  safeMessageId,
  type ChatMessageDto,
} from "./message-pagination";

/**
 * Slice — WhatsApp-like loading + cursor pagination (pure). The chat panel must load only
 * the latest page first and fetch older pages via an OPAQUE before-cursor. These tests pin
 * the behaviour AND the safety contract (no raw phone / contact / user / session id, no
 * runs / session_data, opaque message ids) — all without a DB.
 */

const ROLES = ["customer", "assistant"] as const;
/** Build N ordered (oldest→newest) displayable messages. */
function ordered(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    role: ROLES[i % 2],
    text: `m${i}`,
    at: new Date(Date.UTC(2026, 5, 16, 0, 0, i)).toISOString(),
  }));
}

// Raw values that must NEVER appear in a page payload or a cursor.
const RAW_PHONE = "94714128890";
const RAW_SESSION = "6c6bb8bb7a477e4f0011223344556677";
const CONV = "5073cb2f-d343-4116-83ed-afc9458ceb5c"; // safe internal dashboard id

describe("cursor (opaque, index-based)", () => {
  it("round-trips a non-negative index", () => {
    expect(decodeCursor(encodeCursor(0))).toBe(0);
    expect(decodeCursor(encodeCursor(70))).toBe(70);
  });

  it("returns null for missing / malformed / negative cursors (no crash)", () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor("")).toBeNull();
    expect(decodeCursor("not-base64!!")).toBeNull();
    expect(decodeCursor(Buffer.from('{"i":-3}').toString("base64url"))).toBeNull();
    expect(decodeCursor(Buffer.from('{"x":1}').toString("base64url"))).toBeNull();
  });

  it("is OPAQUE — the encoded cursor exposes no raw phone / session id", () => {
    const c = encodeCursor(70);
    expect(c).not.toContain(RAW_PHONE);
    expect(c).not.toContain(RAW_SESSION);
    const decoded = Buffer.from(c, "base64url").toString("utf8");
    expect(decoded).not.toContain(RAW_PHONE);
    expect(decoded).not.toContain(RAW_SESSION);
  });
});

describe("safeMessageId", () => {
  it("is opaque (not a raw Agno id), deterministic and stable per (conversation, index)", () => {
    const a = safeMessageId(CONV, 70);
    const b = safeMessageId(CONV, 70);
    expect(a).toBe(b); // stable across pages
    expect(a).toMatch(/^m_/); // generated, opaque
    expect(a).not.toContain(RAW_PHONE);
    expect(a).not.toContain(RAW_SESSION);
    expect(safeMessageId(CONV, 71)).not.toBe(a); // distinct per index
  });
});

/**
 * ADR-0016 Gate B — when sessions are merged into one contact thread, a message's absolute index
 * is no longer stable, so the opaque id is derived from the STABLE provider message id instead.
 */
describe("safeMessageId — provider-id keyed (merge-stable)", () => {
  it("derives a stable opaque id from the provider message id, independent of conversation/index", () => {
    const a = safeMessageId(CONV, 0, "agno-msg-1");
    const b = safeMessageId("a-different-conversation-id", 999, "agno-msg-1");
    expect(a).toBe(b); // same provider id ⇒ same opaque id, whatever the position
    expect(a).toMatch(/^m_/);
    expect(a).not.toContain("agno-msg-1"); // raw provider id never exposed
  });

  it("falls back to the positional id (byte-identical to the 2-arg form) when there is no provider id", () => {
    expect(safeMessageId(CONV, 70, null)).toBe(safeMessageId(CONV, 70));
    expect(safeMessageId(CONV, 70, "")).toBe(safeMessageId(CONV, 70));
    expect(safeMessageId(CONV, 70, undefined)).toBe(safeMessageId(CONV, 70));
  });

  it("distinct provider ids yield distinct opaque ids", () => {
    expect(safeMessageId(CONV, 0, "id-A")).not.toBe(safeMessageId(CONV, 0, "id-B"));
  });
});

describe("buildMessagesPage — provider-id-keyed messages (merged thread)", () => {
  it("uses the provider id for the DTO id and NEVER emits it raw", () => {
    const orderedMsgs = [
      { role: "customer" as const, text: "hi", at: "2026-06-16T00:00:00.000Z", key: "agno-1" },
      { role: "assistant" as const, text: "hello", at: "2026-06-16T00:00:01.000Z", key: "agno-2" },
    ];
    const page = buildMessagesPage({ conversationId: CONV, ordered: orderedMsgs, limit: 50 });
    expect(page.messages[0].id).toBe(safeMessageId(CONV, 0, "agno-1"));
    expect(page.messages[1].id).toBe(safeMessageId(CONV, 1, "agno-2"));
    const json = JSON.stringify(page);
    expect(json).not.toContain("agno-1");
    expect(json).not.toContain("agno-2");
    expect(Object.keys(page.messages[0]).sort()).toEqual(["createdAt", "id", "role", "text"]);
  });

  it("keeps a message's id STABLE even when its absolute index shifts (older page prepended)", () => {
    const m = (text: string, key: string, at: string) => ({ role: "customer" as const, text, at, key });
    const renderA = buildMessagesPage({
      conversationId: CONV,
      ordered: [m("M", "stable-1", "2026-06-16T00:00:02.000Z")],
      limit: 50,
    });
    const renderB = buildMessagesPage({
      conversationId: CONV,
      ordered: [
        m("X", "k0", "2026-06-16T00:00:00.000Z"),
        m("Y", "k1", "2026-06-16T00:00:01.000Z"),
        m("M", "stable-1", "2026-06-16T00:00:02.000Z"), // same message, now at index 2
      ],
      limit: 50,
    });
    const idA = renderA.messages[0].id;
    const idB = renderB.messages.find((mm) => mm.text === "M")!.id;
    expect(idA).toBe(idB); // stable id despite the index change
  });
});

describe("buildMessagesPage — initial load", () => {
  it("returns the latest PAGE only, oldest→newest, with hasMoreBefore + a non-null cursor", () => {
    const page = buildMessagesPage({ conversationId: CONV, ordered: ordered(120), limit: 50 });
    expect(page.messages).toHaveLength(50);
    expect(page.messages[0].text).toBe("m70"); // latest 50 = indices 70..119
    expect(page.messages[49].text).toBe("m119");
    // chronological (ascending by createdAt)
    const times = page.messages.map((m) => m.createdAt);
    expect(times).toEqual([...times].sort());
    expect(page.hasMoreBefore).toBe(true);
    expect(page.beforeCursor).not.toBeNull();
    expect(decodeCursor(page.beforeCursor)).toBe(70);
  });

  it("defaults to DEFAULT_PAGE_SIZE and returns everything (no cursor) when fewer than a page", () => {
    const page = buildMessagesPage({ conversationId: CONV, ordered: ordered(10) });
    expect(DEFAULT_PAGE_SIZE).toBe(20);
    expect(page.messages.map((m) => m.text)).toEqual(ordered(10).map((m) => m.text));
    expect(page.hasMoreBefore).toBe(false);
    expect(page.beforeCursor).toBeNull();
  });

  it("returns a safe empty page for an empty conversation", () => {
    const page = buildMessagesPage({ conversationId: CONV, ordered: [], limit: 50 });
    expect(page.messages).toEqual([]);
    expect(page.hasMoreBefore).toBe(false);
    expect(page.beforeCursor).toBeNull();
  });
});

describe("buildMessagesPage — older pages via before-cursor", () => {
  it("returns the previous older page, no duplicates, chronological order preserved", () => {
    const all = ordered(120);
    const first = buildMessagesPage({ conversationId: CONV, ordered: all, limit: 50 }); // 70..119
    const older = buildMessagesPage({
      conversationId: CONV,
      ordered: all,
      limit: 50,
      before: first.beforeCursor,
    }); // 20..69
    expect(older.messages[0].text).toBe("m20");
    expect(older.messages[49].text).toBe("m69");
    expect(older.hasMoreBefore).toBe(true);
    expect(decodeCursor(older.beforeCursor)).toBe(20);

    // No overlap between the first page and the older page.
    const firstIds = new Set(first.messages.map((m) => m.id));
    expect(older.messages.some((m) => firstIds.has(m.id))).toBe(false);

    // Same message keeps the SAME id across pages (stable keys).
    expect(safeMessageId(CONV, 70)).toBe(first.messages[0].id);

    // Final older page reaches the start and stops.
    const oldest = buildMessagesPage({
      conversationId: CONV,
      ordered: all,
      limit: 50,
      before: older.beforeCursor,
    }); // 0..19
    expect(oldest.messages[0].text).toBe("m0");
    expect(oldest.messages[19].text).toBe("m19");
    expect(oldest.hasMoreBefore).toBe(false);
    expect(oldest.beforeCursor).toBeNull();
  });

  it("treats an invalid before-cursor as an initial load (no crash)", () => {
    const page = buildMessagesPage({ conversationId: CONV, ordered: ordered(120), limit: 50, before: "garbage" });
    expect(page.messages[0].text).toBe("m70");
  });

  it("clamps an oversized limit", () => {
    const page = buildMessagesPage({ conversationId: CONV, ordered: ordered(500), limit: 100000 });
    expect(page.messages.length).toBeLessThanOrEqual(100);
  });
});

describe("message DTO safety", () => {
  it("each message exposes ONLY {id, role, text, createdAt} — no source/raw fields leak", () => {
    const dirty = [
      {
        role: "customer" as const,
        text: "hi",
        at: "2026-06-16T00:00:00.000Z",
        // hostile extras that must be ignored by the pure builder:
        rawAgnoId: "agno-raw-id-123",
        user_id: RAW_PHONE,
        session_id: RAW_SESSION,
        runs: [{ messages: [] }],
        session_data: { secret: true },
      } as unknown as { role: "customer"; text: string; at: string | null },
    ];
    const page = buildMessagesPage({ conversationId: CONV, ordered: dirty, limit: 50 });
    expect(Object.keys(page.messages[0]).sort()).toEqual(["createdAt", "id", "role", "text"]);
    const json = JSON.stringify(page);
    expect(json).not.toContain(RAW_PHONE);
    expect(json).not.toContain(RAW_SESSION);
    expect(json).not.toContain("agno-raw-id-123");
    expect(json).not.toMatch(/runs|session_data|user_id|session_id/);
  });

  it("maps createdAt from the source timestamp", () => {
    const page = buildMessagesPage({
      conversationId: CONV,
      ordered: [{ role: "assistant", text: "ok", at: "2026-06-16T04:52:00.000Z" }],
      limit: 50,
    });
    const m: ChatMessageDto = page.messages[0];
    expect(m.createdAt).toBe("2026-06-16T04:52:00.000Z");
    expect(m.role).toBe("assistant");
    expect(m.text).toBe("ok");
  });
});

describe("pagination enforcement — initial load NEVER returns the full transcript (regression lock)", () => {
  // Reproduces the reported "loads all messages at once" symptom and proves it does NOT happen:
  // the page builder hard-caps every response, so a 120-message conversation can never return 120.
  it("applies the default page size and does NOT return everything when there is more than a page (120, no limit -> 20)", () => {
    const page = buildMessagesPage({ conversationId: CONV, ordered: ordered(120) }); // no `limit` passed
    expect(page.messages).toHaveLength(DEFAULT_PAGE_SIZE); // 20, never 120
    expect(page.messages.length).toBeLessThan(120);
    expect(page.messages[0].text).toBe("m100"); // the LATEST 20 (indices 100..119)
    expect(page.messages[19].text).toBe("m119");
    expect(page.hasMoreBefore).toBe(true);
    expect(page.beforeCursor).not.toBeNull();
  });

  it("clamps an oversized limit to exactly MAX_PAGE_SIZE and still paginates (500, limit=99999 -> 100)", () => {
    expect(MAX_PAGE_SIZE).toBe(100);
    const page = buildMessagesPage({ conversationId: CONV, ordered: ordered(500), limit: 99999 });
    expect(page.messages).toHaveLength(MAX_PAGE_SIZE); // 100, never 500
    expect(page.messages.length).toBeLessThan(500);
    expect(page.hasMoreBefore).toBe(true); // 400 older still remain
  });

  it("walks every page latest->oldest with no overlap and no duplicates until exhausted (120 = 50 + 50 + 20)", () => {
    const all = ordered(120);
    const seen = new Set<string>();
    const texts: string[] = [];
    let before: string | null | undefined = undefined;
    let pages = 0;
    // Simulate the client loop: latest page first, then older via the returned cursor.
    for (;;) {
      const page = buildMessagesPage({ conversationId: CONV, ordered: all, limit: 50, before });
      pages++;
      expect(page.messages.length).toBeLessThanOrEqual(50); // no page exceeds the limit
      for (const msg of page.messages) {
        expect(seen.has(msg.id)).toBe(false); // never a duplicate across pages
        seen.add(msg.id);
        texts.push(msg.text);
      }
      if (!page.hasMoreBefore) break;
      before = page.beforeCursor;
      expect(before).not.toBeNull();
      expect(pages).toBeLessThan(10); // safety: the loop always terminates
    }
    expect(pages).toBe(3); // 50 + 50 + 20
    expect(seen.size).toBe(120); // every message retrieved exactly once (complete, no loss)
    const restored = [...texts].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
    expect(restored).toEqual(all.map((msg) => msg.text));
  });
});

describe("Chat Monitor page size = 20 (WhatsApp-like; conversation with MORE than 20 messages)", () => {
  it("server DEFAULT is 20 (not 50): omitting `limit` returns the latest 20 only", () => {
    expect(DEFAULT_PAGE_SIZE).toBe(20);
    const page = buildMessagesPage({ conversationId: CONV, ordered: ordered(56) }); // no limit
    expect(page.messages).toHaveLength(20);
    expect(page.messages[0].text).toBe("m36"); // latest 20 = indices 36..55
    expect(page.messages[19].text).toBe("m55");
    expect(page.hasMoreBefore).toBe(true);
  });

  it("initial load of a 56-message chat returns the LATEST 20, oldest→newest, with a cursor", () => {
    const page = buildMessagesPage({ conversationId: CONV, ordered: ordered(56), limit: 20 });
    expect(page.messages).toHaveLength(20);
    expect(page.messages.map((m) => m.text)).toEqual(
      Array.from({ length: 20 }, (_, i) => `m${36 + i}`)
    );
    const times = page.messages.map((m) => m.createdAt);
    expect(times).toEqual([...times].sort()); // chronological within the page
    expect(page.hasMoreBefore).toBe(true);
    expect(decodeCursor(page.beforeCursor)).toBe(36);
  });

  it("scroll-up walks 56 messages as 20 + 20 + 16 with NO overlap and NO duplicates", () => {
    const all = ordered(56);
    const sizes: number[] = [];
    const seen = new Set<string>();
    let before: string | null | undefined = undefined;
    let pages = 0;
    for (;;) {
      const page = buildMessagesPage({ conversationId: CONV, ordered: all, limit: 20, before });
      pages++;
      sizes.push(page.messages.length);
      for (const m of page.messages) {
        expect(seen.has(m.id)).toBe(false); // never a duplicate across pages
        seen.add(m.id);
      }
      const times = page.messages.map((m) => m.createdAt);
      expect(times).toEqual([...times].sort()); // each rendered page stays chronological
      if (!page.hasMoreBefore) break;
      before = page.beforeCursor;
      expect(before).not.toBeNull();
      expect(pages).toBeLessThan(10); // the loop always terminates
    }
    expect(pages).toBe(3);
    expect(sizes).toEqual([20, 20, 16]); // latest 20, older 20, remaining 16
    expect(seen.size).toBe(56); // every message retrieved exactly once (complete, no loss)
  });
});
