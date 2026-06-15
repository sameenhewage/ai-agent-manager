import type {
  AgnoSession,
  AgnoMessage,
  ParsedTranscript,
  TranscriptMessage,
  TranscriptSender,
} from "./types";

/**
 * Read-only, in-memory transcript parser (Workflow 03 / architecture 03-agno-mapping).
 * Produces a clean, ordered, de-duplicated transcript. NEVER persisted to dashboard.*.
 */

export function epochSecondsToDate(epoch: number | null | undefined): Date | null {
  if (epoch == null) return null;
  const n = Number(epoch);
  if (Number.isNaN(n)) return null;
  return new Date(n * 1000);
}

function roleToSender(role: string): TranscriptSender | null {
  switch (role) {
    case "user":
      return "customer";
    case "assistant":
      return "bot";
    case "tool":
      return "tool";
    default:
      return null; // system + unknown roles are excluded
  }
}

export interface ParseOptions {
  /** Tenant raw-history retention (days). null/undefined = unlimited (no cutoff). */
  retentionDays?: number | null;
  /** "now" for retention math (injectable for tests). */
  now?: Date;
  /** Include tool messages (default false — Phase 1 hides them). */
  includeTool?: boolean;
}

export function parseTranscript(session: AgnoSession, opts: ParseOptions = {}): ParsedTranscript {
  const { retentionDays = null, now = new Date(), includeTool = false } = opts;

  const runs = Array.isArray(session?.runs) ? session.runs : [];
  const turnCount = runs.length;

  const cutoffSeconds =
    retentionDays == null ? null : now.getTime() / 1000 - retentionDays * 86400;

  const seen = new Set<string>();
  type Row = TranscriptMessage & { runIdx: number; arrIdx: number; ts: number | null };
  const rows: Row[] = [];

  runs.forEach((run, runIdx) => {
    const messages = Array.isArray(run?.messages) ? run.messages : [];
    messages.forEach((m: AgnoMessage, arrIdx) => {
      if (!m || typeof m !== "object") return;

      const role = typeof m.role === "string" ? m.role : "";
      if (role === "system") return;
      if (m.from_history === true) return;

      const sender = roleToSender(role);
      if (!sender) return;
      if (sender === "tool" && !includeTool) return;

      const id = typeof m.id === "string" ? m.id : null;
      if (id != null) {
        if (seen.has(id)) return;
        seen.add(id);
      }

      const ts = typeof m.created_at === "number" && !Number.isNaN(m.created_at) ? m.created_at : null;
      if (cutoffSeconds != null && ts != null && ts < cutoffSeconds) return;

      // Never surface raw tool args (may contain PII); render a neutral placeholder.
      const content =
        sender === "tool" ? "[tool activity]" : typeof m.content === "string" ? m.content : "";

      rows.push({ id, role, sender, content, at: epochSecondsToDate(ts), runIdx, arrIdx, ts });
    });
  });

  rows.sort((a, b) => {
    if (a.ts != null && b.ts != null && a.ts !== b.ts) return a.ts - b.ts;
    if (a.runIdx !== b.runIdx) return a.runIdx - b.runIdx;
    return a.arrIdx - b.arrIdx;
  });

  const messages: TranscriptMessage[] = rows.map(({ id, role, sender, content, at }) => ({
    id,
    role,
    sender,
    content,
    at,
  }));

  const lastFromMessages = messages.reduce<Date | null>((acc, m) => {
    if (m.at && (!acc || m.at > acc)) return m.at;
    return acc;
  }, null);

  return {
    messages,
    messageCount: messages.length,
    turnCount,
    lastActivityAt: lastFromMessages ?? epochSecondsToDate(session?.updated_at),
  };
}
