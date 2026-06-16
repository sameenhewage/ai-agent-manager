/**
 * Realtime SSE event contract (Slice 12F, ADR-0014 §5). This is the SECURITY BOUNDARY between the
 * server detector and the browser: an event carries ONLY a safe `type`, the internal conversation
 * UUID, and (for coverage) plain COUNTS. It must NEVER carry raw phone / user_id /
 * external_contact_id / Agno session_id / runs / session_data — clients refetch the existing masked
 * APIs after a signal, so no new data leaves the boundary. `assertSafeRealtimeEvent` is enforced
 * before anything is written to the stream, so an unsafe shape can never reach a client.
 */

export interface ConversationCreatedEvent {
  type: "conversation.created";
  conversationId: string;
}
export interface ConversationUpdatedEvent {
  type: "conversation.updated";
  conversationId: string;
}
export interface TranscriptUpdatedEvent {
  type: "transcript.updated";
  conversationId: string;
}
export interface MetricsUpdatedEvent {
  type: "metrics.updated";
}
export interface CoverageUpdatedEvent {
  type: "coverage.updated";
  complete: boolean;
  mapped: number;
  liveValid: number;
}

export type RealtimeEvent =
  | ConversationCreatedEvent
  | ConversationUpdatedEvent
  | TranscriptUpdatedEvent
  | MetricsUpdatedEvent
  | CoverageUpdatedEvent;

export type RealtimeEventType = RealtimeEvent["type"];

export const REALTIME_EVENT_TYPES = [
  "conversation.created",
  "conversation.updated",
  "transcript.updated",
  "metrics.updated",
  "coverage.updated",
] as const;

/** The EXACT key set allowed per event type (strict whitelist → no unknown/PII key can ride along). */
const ALLOWED_KEYS: Record<RealtimeEventType, readonly string[]> = {
  "conversation.created": ["type", "conversationId"],
  "conversation.updated": ["type", "conversationId"],
  "transcript.updated": ["type", "conversationId"],
  "metrics.updated": ["type"],
  "coverage.updated": ["type", "complete", "mapped", "liveValid"],
};

/**
 * Keys that must NEVER appear anywhere in an event (defense-in-depth on top of the strict whitelist).
 * Exposed for the security test; matching is case/separator-insensitive (so `userId` ≡ `user_id`).
 */
export const FORBIDDEN_EVENT_KEYS = [
  "phone",
  "msisdn",
  "contact",
  "external_contact_id",
  "user_id",
  "session_id",
  "agno_session_id",
  "runs",
  "session_data",
  "summary",
  "metadata",
  "text",
  "message",
  "messages",
  "body",
  "transcript",
  "content",
] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const normalizeKey = (k: string) => k.toLowerCase().replace(/[_-]/g, "");
const FORBIDDEN_NORMALIZED = new Set(FORBIDDEN_EVENT_KEYS.map(normalizeKey));

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Recursively scan keys for any forbidden (PII / transcript-content) key. Values are never inspected. */
function hasForbiddenKeyDeep(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasForbiddenKeyDeep);
  if (isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_NORMALIZED.has(normalizeKey(key))) return true;
      if (hasForbiddenKeyDeep(value[key])) return true;
    }
  }
  return false;
}

const isNonNegativeInt = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0;

/** Type guard: true ONLY for a known event type with the exact allowed keys, valid fields, and no PII. */
export function isSafeRealtimeEvent(value: unknown): value is RealtimeEvent {
  if (!isPlainObject(value)) return false;
  const type = value.type;
  if (typeof type !== "string" || !(REALTIME_EVENT_TYPES as readonly string[]).includes(type)) {
    return false;
  }
  const allowed = ALLOWED_KEYS[type as RealtimeEventType];
  const keys = Object.keys(value);
  if (keys.length !== allowed.length || !keys.every((k) => allowed.includes(k))) return false;

  switch (type as RealtimeEventType) {
    case "conversation.created":
    case "conversation.updated":
    case "transcript.updated":
      if (typeof value.conversationId !== "string" || !UUID_RE.test(value.conversationId)) return false;
      break;
    case "coverage.updated":
      if (typeof value.complete !== "boolean") return false;
      if (!isNonNegativeInt(value.mapped) || !isNonNegativeInt(value.liveValid)) return false;
      break;
    case "metrics.updated":
      break;
  }

  // Defense-in-depth: even a "known" shape must not smuggle a forbidden key.
  if (hasForbiddenKeyDeep(value)) return false;
  return true;
}

/** Returns the event when safe; throws otherwise. Call this before writing anything to the stream. */
export function assertSafeRealtimeEvent(value: unknown): RealtimeEvent {
  if (!isSafeRealtimeEvent(value)) {
    throw new Error("Unsafe or malformed realtime event blocked from the stream");
  }
  return value;
}

/** Safe JSON for the SSE `data:` field (asserts first). */
export function serializeRealtimeEvent(event: RealtimeEvent): string {
  return JSON.stringify(assertSafeRealtimeEvent(event));
}

/** Full SSE frame: `data: <json>\n\n`. One `onmessage` handler on the client decodes every type. */
export function toSseData(event: RealtimeEvent): string {
  return `data: ${serializeRealtimeEvent(event)}\n\n`;
}

/**
 * Parse + RE-VALIDATE an SSE `data:` JSON string on the CLIENT into a safe event, or `null` if it is
 * malformed or fails the safety contract. The client trusts nothing implicitly — even our own stream
 * is re-checked, so a malformed/unsafe frame is dropped rather than acted on.
 */
export function parseRealtimeMessage(data: string): RealtimeEvent | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  return isSafeRealtimeEvent(parsed) ? parsed : null;
}

// --- Constructors (used by the detector; keep the shape correct by construction) ---

export function conversationCreated(conversationId: string): ConversationCreatedEvent {
  return { type: "conversation.created", conversationId };
}
export function conversationUpdated(conversationId: string): ConversationUpdatedEvent {
  return { type: "conversation.updated", conversationId };
}
export function transcriptUpdated(conversationId: string): TranscriptUpdatedEvent {
  return { type: "transcript.updated", conversationId };
}
export function metricsUpdated(): MetricsUpdatedEvent {
  return { type: "metrics.updated" };
}
export function coverageUpdated(input: {
  complete: boolean;
  mapped: number;
  liveValid: number;
}): CoverageUpdatedEvent {
  return {
    type: "coverage.updated",
    complete: input.complete,
    mapped: input.mapped,
    liveValid: input.liveValid,
  };
}
