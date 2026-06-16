import { describe, it, expect } from "vitest";
import {
  DEFAULT_PAGE_SIZE,
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
    expect(DEFAULT_PAGE_SIZE).toBe(50);
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
