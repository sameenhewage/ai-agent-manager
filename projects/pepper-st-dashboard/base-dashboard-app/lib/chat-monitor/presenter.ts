import { maskContactId } from "../agno/mask";
import type { ParsedTranscript, TranscriptSender } from "../agno/types";

/**
 * Pure Chat Monitor presenter (Slice 5). All UI-facing shaping — masking, ordering,
 * retention windowing, transcript view-state — lives here so it is testable without a DB
 * and so the raw `external_contact_id` / `agno_session_id` never reach the client.
 */

export interface ConversationRecord {
  id: string;
  externalContactId: string;
  status: string;
  firstAt: Date | string | null;
  lastAt: Date | string | null;
}

/** Safe DTO role for a chat message (the parser's "bot" → "assistant"; tool is never shown). */
export type ChatRole = "customer" | "assistant";

export interface ConversationListItem {
  id: string;
  /** AI-owned customer name (ai.customers.name) when known; null otherwise. Safe display
   *  data — NOT a phone. The UI shows this as the primary label, masked id as secondary. */
  displayName: string | null;
  maskedContact: string; // never the raw phone/session id
  status: string;
  firstAt: string | null; // ISO
  lastAt: string | null; // ISO
  turnCount: number; // cheap (jsonb_array_length(runs)); NOT a parsed message count
  /** WhatsApp-style list subtitle — the latest DISPLAYABLE message (role + text + time).
   *  Populated ONLY on the Chat Monitor list path; the reduced dashboard "recent" DTO omits
   *  them. Content only (already shown in transcripts) — never a raw phone/session id. */
  lastMessagePreview?: string | null;
  lastMessageRole?: ChatRole | null;
  lastMessageAt?: string | null; // ISO of the latest displayable message
}

/** Normalize a raw customer name into a safe display string, or null when absent/blank.
 *  Pure: trims surrounding whitespace; never throws. */
export function normalizeCustomerName(name: string | null | undefined): string | null {
  if (name == null) return null;
  const s = String(name).trim();
  return s.length > 0 ? s : null;
}

/** Primary UI label for a contact: the customer name when known, else the masked id.
 *  Never returns a raw phone (maskedContact is already masked, displayName is a name). */
export function primaryContactLabel(item: {
  displayName: string | null;
  maskedContact: string;
}): string {
  return item.displayName ?? item.maskedContact;
}

/** Max characters for a list preview before it is ellipsized. */
export const PREVIEW_MAX_LEN = 100;

/** Collapse newlines / runs of whitespace and truncate to a single clean preview line.
 *  Pure; never throws. Returns "" for null/blank content. */
export function toPreviewText(
  content: string | null | undefined,
  max: number = PREVIEW_MAX_LEN
): string {
  const oneLine = String(content ?? "").replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return oneLine.slice(0, Math.max(0, max - 1)).trimEnd() + "\u2026";
}

/** Map a parser sender to a safe DTO role. Tool / unknown senders → null (never shown). */
export function toRole(sender: TranscriptSender): ChatRole | null {
  if (sender === "customer") return "customer";
  if (sender === "bot") return "assistant";
  return null;
}

/** WhatsApp-style row alignment for a chat message: customer → LEFT (incoming), assistant →
 *  RIGHT (outgoing). Pure; the row is full-width and NEVER centered. */
export function messageAlignment(role: ChatRole): {
  row: "justify-start" | "justify-end";
  outgoing: boolean;
} {
  const outgoing = role === "assistant";
  return { row: outgoing ? "justify-end" : "justify-start", outgoing };
}

/** The latest displayable message, shaped for the WhatsApp-style list subtitle. */
export interface LastDisplayableMessage {
  role: ChatRole;
  text: string; // whitespace-collapsed + truncated; content only (never a raw id)
  at: string | null; // ISO
}

/** Pick the NEWEST DISPLAYABLE (user/assistant-content) message from an ordered
 *  (oldest→newest) list and shape it into one safe subtitle line. Skips tool/unknown
 *  senders. Returns null when there is no displayable message. Pure. */
export function lastDisplayableMessage(
  messages: ReadonlyArray<{ sender: TranscriptSender; content: string; at: string | null }>
): LastDisplayableMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const role = toRole(messages[i].sender);
    if (role) return { role, text: toPreviewText(messages[i].content), at: messages[i].at ?? null };
  }
  return null;
}

export interface ConversationListResult {
  items: ConversationListItem[];
  restrictedCount: number; // out-of-window conversations hidden from the normal list
}

function toDate(value: Date | string | null): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Retention is a read-time access limit (ADR-0006). NULL = unlimited. */
export function isWithinRetention(
  lastAt: Date | null,
  retentionDays: number | null,
  now: Date = new Date()
): boolean {
  if (retentionDays == null) return true; // unlimited
  if (!lastAt) return false; // unknown activity is out-of-window when a limit applies
  const cutoff = now.getTime() - retentionDays * 86400 * 1000;
  return lastAt.getTime() >= cutoff;
}

export function buildConversationList(
  records: ConversationRecord[],
  turnCountById: Map<string, number>,
  opts: {
    retentionDays: number | null;
    now?: Date;
    /** raw external_contact_id (phone) -> ai.customers.name. Server-side only; the raw key
     *  never leaves this function — only the resolved displayName + masked id are emitted. */
    namesByContact?: Map<string, string | null>;
    /** conversation id -> the latest displayable message (Chat Monitor list path only). */
    previewByConversationId?: Map<string, LastDisplayableMessage | null>;
  }
): ConversationListResult {
  const now = opts.now ?? new Date();
  let restrictedCount = 0;
  const items: ConversationListItem[] = [];

  for (const r of records) {
    const lastAt = toDate(r.lastAt);
    if (!isWithinRetention(lastAt, opts.retentionDays, now)) {
      restrictedCount++; // not surfaced as normal accessible history
      continue;
    }
    const preview = opts.previewByConversationId?.get(r.id) ?? null;
    items.push({
      id: r.id,
      displayName: normalizeCustomerName(opts.namesByContact?.get(r.externalContactId)),
      maskedContact: maskContactId(r.externalContactId),
      status: r.status,
      firstAt: toDate(r.firstAt)?.toISOString() ?? null,
      lastAt: lastAt ? lastAt.toISOString() : null,
      // Cheap turn count only; transcript bodies/counts are loaded lazily per conversation.
      turnCount: turnCountById.get(r.id) ?? 0,
      lastMessagePreview: preview ? preview.text : null,
      lastMessageRole: preview ? preview.role : null,
      lastMessageAt: preview ? preview.at : null,
    });
  }

  items.sort((a, b) => {
    const at = a.lastAt ? Date.parse(a.lastAt) : Number.NEGATIVE_INFINITY;
    const bt = b.lastAt ? Date.parse(b.lastAt) : Number.NEGATIVE_INFINITY;
    return bt - at; // last_at descending
  });

  return { items, restrictedCount };
}

export type TranscriptState = "ok" | "empty" | "restricted";

export interface TranscriptMessageView {
  id: string | null;
  sender: "customer" | "bot" | "tool";
  content: string;
  at: string | null; // ISO
}

export interface TranscriptView {
  state: TranscriptState;
  messages: TranscriptMessageView[];
  messageCount: number;
  turnCount: number;
  lastActivityAt: string | null;
}

export function buildTranscriptView(
  parsed: ParsedTranscript,
  opts: { withinRetention: boolean }
): TranscriptView {
  if (!opts.withinRetention) {
    // Whole conversation is outside the retention window — access is restricted, not an error.
    return {
      state: "restricted",
      messages: [],
      messageCount: 0,
      turnCount: parsed.turnCount,
      lastActivityAt: null,
    };
  }

  const messages: TranscriptMessageView[] = parsed.messages.map((m) => ({
    id: m.id,
    sender: m.sender,
    content: m.content,
    at: m.at ? m.at.toISOString() : null,
  }));

  return {
    state: messages.length === 0 ? "empty" : "ok",
    messages,
    messageCount: parsed.messageCount,
    turnCount: parsed.turnCount,
    lastActivityAt: parsed.lastActivityAt ? parsed.lastActivityAt.toISOString() : null,
  };
}

/**
 * Lazy list payload (GET /api/chat-monitor/conversations). Cheap to build: NO transcript
 * messages, NO parsed message counts — only masked ids, status, timing, and a turn count.
 */
export interface ConversationListPayload {
  tenantName: string;
  channelLabel: string;
  /** Tenant IANA timezone (e.g. "Asia/Colombo"). The client formats every chat timestamp
   *  in this zone so the Chat Monitor matches the Dashboard/Analytics exactly. */
  timeZone: string;
  retentionDays: number | null;
  retentionLabel: string;
  conversations: ConversationListItem[];
  restrictedCount: number;
}

/**
 * Lazy single-transcript payload (GET /api/chat-monitor/conversations/[id]/transcript).
 * Parsed for ONE conversation only; fully masked; never persisted.
 */
export interface TranscriptPayload {
  id: string;
  displayName: string | null; // ai.customers.name when known; null otherwise (safe display)
  maskedContact: string;
  status: string;
  lastAt: string | null; // ISO
  transcript: TranscriptView;
}
