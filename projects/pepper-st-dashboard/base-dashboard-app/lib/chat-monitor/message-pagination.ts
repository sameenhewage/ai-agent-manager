import type { ChatRole } from "./presenter";

/**
 * Pure, server-side message pagination for the WhatsApp-like chat panel. Given the FULL
 * ordered (oldest→newest) list of DISPLAYABLE messages for one conversation, it returns the
 * latest page first and older pages via an OPAQUE before-cursor.
 *
 * Safety contract (no DB here): the cursor + generated message ids are opaque and encode
 * only a stable index — never a raw phone / external_contact_id / user_id / agno_session_id.
 * The page DTO carries content only (already shown in the transcript), never `runs` /
 * `session_data`. The caller (service) maps Agno `runs` → `{ role, text, at }` and resolves a
 * safe internal conversation id before calling in here.
 */

export interface ChatMessageDto {
  id: string; // opaque, generated (not the raw Agno message id)
  role: ChatRole; // "customer" | "assistant"
  text: string;
  createdAt: string | null; // ISO
  dayLabel?: string; // optional; day grouping is computed client-side (see UI)
}

export type ConversationMessagesState = "ok" | "empty" | "restricted";

export interface ConversationMessagesPageDto {
  conversationId: string; // safe internal dashboard id only
  displayName: string | null;
  channelLabel: string;
  state: ConversationMessagesState;
  messages: ChatMessageDto[]; // the PAGE, oldest→newest
  hasMoreBefore: boolean;
  beforeCursor: string | null; // opaque; pass back as `before` to load the previous page
}

/** Chat Monitor transcript page size (WhatsApp-like): the latest 20 messages on open, older
 *  pages of 20 via the before-cursor. Server default when the client omits `limit`. */
export const DEFAULT_PAGE_SIZE = 20;
/** Safety cap so a hostile/oversized `limit` can never return an unbounded transcript. */
export const MAX_PAGE_SIZE = 100;

/** Encode a stable, absolute (oldest = 0) message index into an opaque base64url cursor. */
export function encodeCursor(index: number): string {
  return Buffer.from(JSON.stringify({ i: index }), "utf8").toString("base64url");
}

/** Decode an opaque cursor back to its index; null for missing/malformed/negative input. */
export function decodeCursor(cursor: string | null | undefined): number | null {
  if (!cursor || typeof cursor !== "string") return null;
  try {
    const obj = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { i?: unknown };
    const i = obj?.i;
    if (typeof i !== "number" || !Number.isInteger(i) || i < 0) return null;
    return i;
  } catch {
    return null;
  }
}

/** Deterministic, opaque message id from (conversationId, absolute index). Stable across
 *  pages (same message → same id), never the raw Agno message id. FNV-1a → base36. */
export function safeMessageId(conversationId: string, index: number): string {
  let h = 0x811c9dc5;
  const seed = `${conversationId}:${index}`;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return "m_" + (h >>> 0).toString(36);
}

function clampLimit(limit: number | undefined): number {
  if (limit == null || !Number.isFinite(limit)) return DEFAULT_PAGE_SIZE;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(limit)));
}

export interface BuildMessagesPageInput {
  conversationId: string;
  /** FULL displayable messages, oldest→newest (already filtered + role-mapped). */
  ordered: ReadonlyArray<{ role: ChatRole; text: string; at: string | null }>;
  limit?: number;
  before?: string | null;
}

export interface MessagesPageSlice {
  messages: ChatMessageDto[];
  hasMoreBefore: boolean;
  beforeCursor: string | null;
}

/**
 * Slice the latest `limit` messages (or the page strictly older than `before`). Returns
 * oldest→newest for direct rendering. The cursor is the ABSOLUTE index of the oldest
 * message in the returned page, so older pages never overlap and stay stable as new
 * messages append at the end.
 */
export function buildMessagesPage(input: BuildMessagesPageInput): MessagesPageSlice {
  const { conversationId, ordered } = input;
  const total = ordered.length;
  const limit = clampLimit(input.limit);

  const beforeIndex = decodeCursor(input.before);
  // `end` is EXCLUSIVE: an initial load ends at `total`; an older page ends at the cursor.
  const end = beforeIndex == null ? total : Math.min(beforeIndex, total);
  const start = Math.max(0, end - limit);

  const messages: ChatMessageDto[] = [];
  for (let i = start; i < end; i++) {
    const m = ordered[i];
    messages.push({
      id: safeMessageId(conversationId, i),
      role: m.role,
      text: m.text,
      createdAt: m.at ?? null,
    });
  }

  const hasMoreBefore = start > 0;
  return { messages, hasMoreBefore, beforeCursor: hasMoreBefore ? encodeCursor(start) : null };
}
