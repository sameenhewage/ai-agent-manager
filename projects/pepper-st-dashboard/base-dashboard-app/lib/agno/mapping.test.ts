import { describe, it, expect } from "vitest";
import {
  resolveChannelForAgent,
  buildConversationValues,
  deriveExternalContactId,
  deriveExpectedAgentId,
  deriveSessionKey,
  type ChannelLike,
} from "./mapping";
import type { AgnoSession } from "./types";

/**
 * Agno v2 mapping seam (ADR-0011): agent_id is DERIVED "<tenantId>:<channelId>" (tenant-first);
 * external contact id is the WhatsApp phone in session.user_id; the opaque session_id is the link key.
 */
const ch = (
  id: string,
  tenantId: string,
  sourceAgentId: string | null = null,
  isActive = true
): ChannelLike => ({ id, tenantId, sourceAgentId, isActive });

describe("deriveExpectedAgentId", () => {
  it("composes tenant-first with a single colon", () => {
    expect(deriveExpectedAgentId("t1", "c1")).toBe("t1:c1");
  });

  it("matches the live composite shape (uuid:uuid, len 73)", () => {
    const t = "2efc97ca-1111-4aaa-8bbb-000000000001";
    const c = "9f3b1a2c-2222-4ccc-9ddd-000000000002";
    const agentId = deriveExpectedAgentId(t, c);
    expect(agentId).toBe(`${t}:${c}`);
    expect(agentId).toHaveLength(73);
  });
});

describe("resolveChannelForAgent (derived agent_id)", () => {
  it("maps to the active channel whose derived agent_id matches", () => {
    const r = resolveChannelForAgent([ch("c1", "t1"), ch("c2", "t1")], "t1:c1");
    expect(r.status).toBe("mapped");
    expect(r.channel?.id).toBe("c1");
  });

  it("is unmapped when the matching channel is inactive (never guesses a tenant)", () => {
    const r = resolveChannelForAgent([ch("c1", "t1", null, false)], "t1:c1");
    expect(r.status).toBe("unmapped");
    expect(r.channel).toBeNull();
  });

  it("is unmapped when no active channel derives to the agent_id", () => {
    const r = resolveChannelForAgent([ch("c1", "t1"), ch("c2", "t2")], "t9:cX");
    expect(r.status).toBe("unmapped");
  });

  it("is unmapped for a null or empty agent_id", () => {
    expect(resolveChannelForAgent([ch("c1", "t1")], null).status).toBe("unmapped");
    expect(resolveChannelForAgent([ch("c1", "t1")], "").status).toBe("unmapped");
  });

  it("never matches on the legacy source_agent_id literal (v1 'concierge' is dead)", () => {
    const r = resolveChannelForAgent([ch("c1", "t1", "concierge")], "concierge");
    expect(r.status).toBe("unmapped");
  });

  it("is ambiguous only on a duplicate channel row (defensive; id is a PK)", () => {
    const r = resolveChannelForAgent([ch("c1", "t1"), ch("c1", "t1")], "t1:c1");
    expect(r.status).toBe("ambiguous");
    expect(r.channel).toBeNull();
  });
});

describe("deriveExternalContactId (v2: the phone is in user_id)", () => {
  const sid = "a".repeat(32); // opaque session token

  it("returns session.user_id (the WhatsApp phone)", () => {
    expect(deriveExternalContactId({ session_id: sid, user_id: "94714128890" })).toBe("94714128890");
  });

  it("returns null when user_id is missing/empty (skip; never an empty-contact identity)", () => {
    expect(deriveExternalContactId({ session_id: sid })).toBeNull();
    expect(deriveExternalContactId({ session_id: sid, user_id: "" })).toBeNull();
    expect(deriveExternalContactId({ session_id: sid, user_id: null })).toBeNull();
  });

  it("never falls back to the opaque session_id", () => {
    expect(deriveExternalContactId({ session_id: sid })).not.toBe(sid);
  });
});

describe("deriveSessionKey", () => {
  it("returns the opaque session_id (the agno_session_id link key)", () => {
    const sid = "b".repeat(32);
    expect(deriveSessionKey({ session_id: sid })).toBe(sid);
  });
});

describe("buildConversationValues", () => {
  const session: AgnoSession = {
    session_id: "f".repeat(32), // opaque token
    agent_id: "t1:c1",
    user_id: "94714128890",
    created_at: 100,
    updated_at: 200,
    runs: [],
  };
  const ids = {
    tenantId: "t1",
    channelId: "c1",
    customerId: "cu1",
    customerIdentityId: "ci1",
    externalContactId: "94714128890", // resolved by the caller from user_id
  };

  it("links by value: agno_session_id = opaque session_id; contact = user_id", () => {
    const v = buildConversationValues(session, ids);
    expect(v.tenantId).toBe("t1");
    expect(v.channelId).toBe("c1");
    expect(v.customerId).toBe("cu1");
    expect(v.customerIdentityId).toBe("ci1");
    expect(v.agnoSessionId).toBe("f".repeat(32));
    expect(typeof v.agnoSessionId).toBe("string");
    expect(v.externalContactId).toBe("94714128890");
    expect(v.status).toBe("open");
    expect(v.firstAt?.getTime()).toBe(100 * 1000);
    expect(v.lastAt?.getTime()).toBe(200 * 1000);
  });
});
