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

export interface SessionSummary {
  messageCount: number;
  turnCount: number;
  lastActivityAt: Date | null;
}

export interface ConversationListItem {
  id: string;
  maskedContact: string; // never the raw phone/session id
  status: string;
  firstAt: string | null; // ISO
  lastAt: string | null; // ISO
  messageCount: number;
  turnCount: number;
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
  summaries: Map<string, SessionSummary>,
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
    const summary = summaries.get(r.id);
    items.push({
      id: r.id,
      maskedContact: maskContactId(r.externalContactId),
      status: r.status,
      firstAt: toDate(r.firstAt)?.toISOString() ?? null,
      lastAt: lastAt ? lastAt.toISOString() : null,
      messageCount: summary?.messageCount ?? 0,
      turnCount: summary?.turnCount ?? 0,
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
 * Fully-serializable, fully-masked payload for the client component. Contains NO raw
 * contact/session id and NO DB handle — safe to pass from a Server Component to a
 * Client Component.
 */
export interface ChatMonitorConversation extends ConversationListItem {
  transcript: TranscriptView;
}

export interface ChatMonitorData {
  tenantName: string;
  channelLabel: string;
  retentionDays: number | null;
  retentionLabel: string;
  conversations: ChatMonitorConversation[];
  restrictedCount: number;
}
