import { describe, it, expect } from "vitest";
import {
  resolveChannelForAgent,
  buildConversationValues,
  deriveExternalContactId,
  type ChannelLike,
} from "./mapping";
import type { AgnoSession } from "./types";

/**
 * Slice 4 — pure mapping helpers (Workflow 02/04, ADR-0003). Channel resolution is
 * active + exactly-one; conversation values link by value (agno_session_id as text).
 */
const ch = (
  id: string,
  tenantId: string,
  sourceAgentId: string | null,
  isActive = true
): ChannelLike => ({ id, tenantId, sourceAgentId, isActive });

describe("resolveChannelForAgent", () => {
  it("maps to the single active matching channel", () => {
    const r = resolveChannelForAgent([ch("c1", "t1", "concierge"), ch("c2", "t1", "other")], "concierge");
    expect(r.status).toBe("mapped");
    expect(r.channel?.id).toBe("c1");
  });

  it("is unmapped when no ACTIVE channel matches (never guesses a tenant)", () => {
    const r = resolveChannelForAgent([ch("c1", "t1", "concierge", false)], "concierge");
    expect(r.status).toBe("unmapped");
    expect(r.channel).toBeNull();
  });

  it("is ambiguous when more than one active channel matches", () => {
    const r = resolveChannelForAgent([ch("c1", "t1", "concierge"), ch("c2", "t2", "concierge")], "concierge");
    expect(r.status).toBe("ambiguous");
    expect(r.channel).toBeNull();
  });
});

describe("deriveExternalContactId", () => {
  it("uses session_id in Phase 1", () => {
    expect(deriveExternalContactId({ session_id: "94714128890" })).toBe("94714128890");
  });
});

describe("buildConversationValues", () => {
  const session: AgnoSession = {
    session_id: "94714128890",
    agent_id: "concierge",
    created_at: 100,
    updated_at: 200,
    runs: [],
  };
  const ids = { tenantId: "t1", channelId: "c1", customerId: "cu1", customerIdentityId: "ci1" };

  it("maps an Agno session to conversation values", () => {
    const v = buildConversationValues(session, ids);
    expect(v.tenantId).toBe("t1");
    expect(v.channelId).toBe("c1");
    expect(v.customerId).toBe("cu1");
    expect(v.customerIdentityId).toBe("ci1");
    expect(v.agnoSessionId).toBe("94714128890");
    expect(typeof v.agnoSessionId).toBe("string");
    expect(v.externalContactId).toBe("94714128890");
    expect(v.status).toBe("open");
    expect(v.firstAt?.getTime()).toBe(100 * 1000);
    expect(v.lastAt?.getTime()).toBe(200 * 1000);
  });
});
