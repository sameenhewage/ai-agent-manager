import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_EVENT_KEYS,
  REALTIME_EVENT_TYPES,
  assertSafeRealtimeEvent,
  conversationCreated,
  conversationUpdated,
  coverageUpdated,
  isSafeRealtimeEvent,
  metricsUpdated,
  parseRealtimeMessage,
  serializeRealtimeEvent,
  toSseData,
  transcriptUpdated,
} from "./events";

/**
 * The SSE event contract is the security boundary of Slice 12F (ADR-0014 §5). An event may carry
 * ONLY a safe type + the internal conversation UUID (+ coverage COUNTS). It must NEVER carry raw
 * phone / user_id / external_contact_id / Agno session_id / runs / session_data. These tests pin
 * that contract BEFORE any transport exists, so the SSE route can only ever emit a vetted shape.
 */

const UUID = "7f3e2b1a-9c8d-4e6f-a1b2-c3d4e5f60718";
const RAW_PHONE = "94714128890";
const RAW_SESSION = "agno-session-abc-123";

describe("RealtimeEvent constructors", () => {
  it("builds each known event with the minimal safe shape", () => {
    expect(conversationCreated(UUID)).toEqual({ type: "conversation.created", conversationId: UUID });
    expect(conversationUpdated(UUID)).toEqual({ type: "conversation.updated", conversationId: UUID });
    expect(transcriptUpdated(UUID)).toEqual({ type: "transcript.updated", conversationId: UUID });
    expect(metricsUpdated()).toEqual({ type: "metrics.updated" });
    expect(coverageUpdated({ complete: false, mapped: 6, liveValid: 8 })).toEqual({
      type: "coverage.updated",
      complete: false,
      mapped: 6,
      liveValid: 8,
    });
  });

  it("REALTIME_EVENT_TYPES lists exactly the five supported types", () => {
    expect([...REALTIME_EVENT_TYPES].sort()).toEqual([
      "conversation.created",
      "conversation.updated",
      "coverage.updated",
      "metrics.updated",
      "transcript.updated",
    ]);
  });

  it("treats every constructed event as safe", () => {
    for (const e of [
      conversationCreated(UUID),
      conversationUpdated(UUID),
      transcriptUpdated(UUID),
      metricsUpdated(),
      coverageUpdated({ complete: true, mapped: 8, liveValid: 8 }),
    ]) {
      expect(isSafeRealtimeEvent(e)).toBe(true);
    }
  });
});

describe("isSafeRealtimeEvent — rejects malformed", () => {
  it("rejects null, non-objects, arrays and unknown types", () => {
    expect(isSafeRealtimeEvent(null)).toBe(false);
    expect(isSafeRealtimeEvent(undefined)).toBe(false);
    expect(isSafeRealtimeEvent("conversation.created")).toBe(false);
    expect(isSafeRealtimeEvent([{ type: "metrics.updated" }])).toBe(false);
    expect(isSafeRealtimeEvent({})).toBe(false);
    expect(isSafeRealtimeEvent({ type: "nope" })).toBe(false);
    expect(isSafeRealtimeEvent({ type: "conversation.deleted", conversationId: UUID })).toBe(false);
  });

  it("requires a UUID conversationId for conversation/transcript events", () => {
    expect(isSafeRealtimeEvent({ type: "conversation.created" })).toBe(false);
    expect(isSafeRealtimeEvent({ type: "conversation.created", conversationId: "not-a-uuid" })).toBe(false);
    expect(isSafeRealtimeEvent({ type: "conversation.created", conversationId: RAW_SESSION })).toBe(false);
    expect(isSafeRealtimeEvent({ type: "conversation.created", conversationId: UUID })).toBe(true);
    expect(isSafeRealtimeEvent({ type: "transcript.updated", conversationId: UUID })).toBe(true);
  });

  it("rejects unknown/extra keys (strict per-type whitelist)", () => {
    expect(isSafeRealtimeEvent({ type: "metrics.updated", extra: 1 })).toBe(false);
    expect(isSafeRealtimeEvent({ type: "conversation.created", conversationId: UUID, foo: "bar" })).toBe(false);
  });

  it("validates coverage.updated field types", () => {
    expect(isSafeRealtimeEvent({ type: "coverage.updated", complete: true, mapped: 8, liveValid: 8 })).toBe(true);
    expect(isSafeRealtimeEvent({ type: "coverage.updated", complete: "yes", mapped: 8, liveValid: 8 })).toBe(false);
    expect(isSafeRealtimeEvent({ type: "coverage.updated", complete: true, mapped: -1, liveValid: 8 })).toBe(false);
    expect(isSafeRealtimeEvent({ type: "coverage.updated", complete: true, mapped: 1.5, liveValid: 8 })).toBe(false);
    expect(isSafeRealtimeEvent({ type: "coverage.updated", complete: true, mapped: 8 })).toBe(false);
  });
});

describe("payload safety — PII deny-list (deep)", () => {
  it("FORBIDDEN_EVENT_KEYS covers phone/user/contact/session/runs/session_data", () => {
    for (const k of [
      "phone",
      "user_id",
      "external_contact_id",
      "session_id",
      "agno_session_id",
      "runs",
      "session_data",
    ]) {
      expect(FORBIDDEN_EVENT_KEYS).toContain(k);
    }
  });

  it("rejects any event carrying a forbidden key (top-level)", () => {
    expect(isSafeRealtimeEvent({ type: "conversation.created", conversationId: UUID, user_id: RAW_PHONE })).toBe(false);
    expect(isSafeRealtimeEvent({ type: "conversation.created", conversationId: UUID, session_id: RAW_SESSION })).toBe(false);
    expect(isSafeRealtimeEvent({ type: "conversation.updated", conversationId: UUID, phone: RAW_PHONE })).toBe(false);
  });

  it("rejects forbidden keys even in camelCase or nested", () => {
    expect(isSafeRealtimeEvent({ type: "metrics.updated", userId: RAW_PHONE })).toBe(false);
    expect(isSafeRealtimeEvent({ type: "metrics.updated", meta: { external_contact_id: RAW_PHONE } })).toBe(false);
    expect(isSafeRealtimeEvent({ type: "coverage.updated", complete: true, mapped: 8, liveValid: 8, runs: [] })).toBe(false);
  });
});

describe("assert + serialize", () => {
  it("assertSafeRealtimeEvent returns the event when safe, throws when not", () => {
    expect(assertSafeRealtimeEvent(conversationCreated(UUID))).toEqual(conversationCreated(UUID));
    expect(() => assertSafeRealtimeEvent({ type: "x" })).toThrow();
    expect(() =>
      assertSafeRealtimeEvent({ type: "conversation.created", conversationId: UUID, phone: RAW_PHONE })
    ).toThrow();
  });

  it("serializeRealtimeEvent emits JSON with no raw phone/session/contact", () => {
    const json = serializeRealtimeEvent(transcriptUpdated(UUID));
    expect(JSON.parse(json)).toEqual({ type: "transcript.updated", conversationId: UUID });
    expect(json).not.toContain(RAW_PHONE);
    expect(json).not.toContain(RAW_SESSION);
    expect(json).not.toMatch(/runs|session_data|user_id|external_contact_id|"session_id"|phone/);
  });

  it("toSseData wraps the JSON in an SSE data frame", () => {
    expect(toSseData(metricsUpdated())).toBe('data: {"type":"metrics.updated"}\n\n');
  });
});

describe("parseRealtimeMessage (client re-validation)", () => {
  it("round-trips a serialized event", () => {
    for (const e of [conversationCreated(UUID), metricsUpdated(), coverageUpdated({ complete: true, mapped: 8, liveValid: 8 })]) {
      expect(parseRealtimeMessage(serializeRealtimeEvent(e))).toEqual(e);
    }
  });

  it("returns null for malformed JSON", () => {
    expect(parseRealtimeMessage("not json")).toBeNull();
    expect(parseRealtimeMessage("")).toBeNull();
  });

  it("returns null for valid JSON that fails the safety contract", () => {
    expect(parseRealtimeMessage(JSON.stringify({ type: "conversation.created", conversationId: UUID, user_id: RAW_PHONE }))).toBeNull();
    expect(parseRealtimeMessage(JSON.stringify({ type: "bogus" }))).toBeNull();
    expect(parseRealtimeMessage(JSON.stringify({ type: "conversation.created", conversationId: "x" }))).toBeNull();
  });
});
