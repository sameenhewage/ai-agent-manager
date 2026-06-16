/**
 * Read model for the external, read-only `ai.agno_sessions` table (Slice 4).
 * Mirrors the observed Agno shape; fields are optional/nullable because Agno data
 * is not owned by us and may be sparse. We never write these.
 */

export interface AgnoMessage {
  role?: string | null;
  id?: string | null;
  created_at?: number | null; // epoch seconds
  content?: unknown;
  from_history?: boolean | null;
  [key: string]: unknown;
}

export interface AgnoRun {
  messages?: AgnoMessage[] | null;
  [key: string]: unknown;
}

export interface AgnoSession {
  session_id: string; // opaque 32-char token (v2) — NOT the phone
  session_type?: string | null;
  agent_id?: string | null; // composite "<tenantId>:<channelId>" (v2)
  user_id?: string | null; // WhatsApp contact phone (v2, PII)
  runs?: AgnoRun[] | null;
  created_at?: number | null; // epoch seconds
  updated_at?: number | null; // epoch seconds
  metadata?: unknown;
  summary?: unknown;
}

export type TranscriptSender = "customer" | "bot" | "tool";

export interface TranscriptMessage {
  id: string | null;
  role: string;
  sender: TranscriptSender;
  content: string;
  at: Date | null;
}

export interface ParsedTranscript {
  messages: TranscriptMessage[];
  messageCount: number;
  turnCount: number;
  lastActivityAt: Date | null;
}
