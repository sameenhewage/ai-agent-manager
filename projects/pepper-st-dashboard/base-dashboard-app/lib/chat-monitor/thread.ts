import { parseTranscript } from "../agno/parser";
import type { AgnoSession, TranscriptSender } from "../agno/types";

/**
 * Pure transcript MERGE across all provider sessions linked to ONE contact thread (ADR-0016
 * Gate B). Each session is parsed with the canonical `parseTranscript` (so the SAME rules apply:
 * system / tool / from_history / empty-assistant excluded, retention windowed, deduped within the
 * session). This then merges across sessions:
 *   - dedupes by the STABLE provider message id (Agno `message.id`) so a message repeated across
 *     overlapping sessions appears once,
 *   - sorts by timestamp ascending (undated messages keep arrival order at the end),
 *   - sums turn counts.
 *
 * No DB here. `providerId` is kept INTERNAL (the service hashes it into an opaque message id and
 * never emits it raw). Tolerates missing/empty sessions — a contact whose linked session is absent
 * from `ai.agno_sessions` (archived/legacy) simply contributes no messages (never throws).
 */

export interface MergedThreadMessage {
  /** Stable provider message id (Agno message.id) when present; null when the source had none.
   *  INTERNAL — used by the service to derive an opaque message id; never sent to the browser. */
  providerId: string | null;
  sender: TranscriptSender;
  content: string;
  at: Date | null;
}

export interface MergedThread {
  messages: MergedThreadMessage[];
  messageCount: number;
  turnCount: number;
  lastActivityAt: Date | null;
}

export interface MergeThreadOptions {
  /** Tenant raw-history retention (days). null/undefined = unlimited. */
  retentionDays?: number | null;
  /** "now" for retention math (injectable for tests). */
  now?: Date;
}

export function mergeThreadMessages(
  sessions: ReadonlyArray<AgnoSession>,
  opts: MergeThreadOptions = {}
): MergedThread {
  const retentionDays = opts.retentionDays ?? null;
  const now = opts.now ?? new Date();

  type Row = MergedThreadMessage & { seq: number };
  const rows: Row[] = [];
  let turnCount = 0;
  let seq = 0;

  for (const session of sessions ?? []) {
    if (!session) continue; // a missing/absent linked session contributes nothing (no crash)
    const parsed = parseTranscript(session, { retentionDays, now });
    turnCount += parsed.turnCount;
    for (const m of parsed.messages) {
      rows.push({ providerId: m.id, sender: m.sender, content: m.content, at: m.at, seq: seq++ });
    }
  }

  // Dedupe by stable provider message id ACROSS sessions (keep first). Null ids can't be deduped.
  const seen = new Set<string>();
  const deduped = rows.filter((r) => {
    if (r.providerId == null) return true;
    if (seen.has(r.providerId)) return false;
    seen.add(r.providerId);
    return true;
  });

  // Sort by timestamp ascending; undated messages sort to the end. Stable tiebreak by arrival
  // sequence so equal timestamps preserve the per-session parser ordering.
  deduped.sort((a, b) => {
    const at = a.at ? a.at.getTime() : Number.POSITIVE_INFINITY;
    const bt = b.at ? b.at.getTime() : Number.POSITIVE_INFINITY;
    if (at !== bt) return at - bt;
    return a.seq - b.seq;
  });

  const messages: MergedThreadMessage[] = deduped.map(({ providerId, sender, content, at }) => ({
    providerId,
    sender,
    content,
    at,
  }));

  const lastActivityAt = messages.reduce<Date | null>(
    (acc, m) => (m.at && (!acc || m.at > acc) ? m.at : acc),
    null
  );

  return { messages, messageCount: messages.length, turnCount, lastActivityAt };
}
