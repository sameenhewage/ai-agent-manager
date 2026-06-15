import { maskContactId } from "../agno/mask";
import type { ParsedTranscript } from "../agno/types";

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

export interface ConversationListItem {
  id: string;
  maskedContact: string; // never the raw phone/session id
  status: string;
  firstAt: string | null; // ISO
  lastAt: string | null; // ISO
  turnCount: number; // cheap (jsonb_array_length(runs)); NOT a parsed message count
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
  opts: { retentionDays: number | null; now?: Date }
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
    items.push({
      id: r.id,
      maskedContact: maskContactId(r.externalContactId),
      status: r.status,
      firstAt: toDate(r.firstAt)?.toISOString() ?? null,
      lastAt: lastAt ? lastAt.toISOString() : null,
      // Cheap turn count only; transcript bodies/counts are loaded lazily per conversation.
      turnCount: turnCountById.get(r.id) ?? 0,
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
  maskedContact: string;
  status: string;
  lastAt: string | null; // ISO
  transcript: TranscriptView;
}
