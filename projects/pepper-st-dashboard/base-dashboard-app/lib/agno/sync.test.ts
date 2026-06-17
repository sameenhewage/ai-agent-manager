import { describe, it, expect } from "vitest";
import type { Pool } from "pg";
import { runAgentSync, type SyncGateway } from "./sync";
import { deriveExpectedAgentId } from "./mapping";
import type { ChannelLike, ConversationValues, SessionLinkValues } from "./mapping";
import type { AgnoSession } from "./types";

/**
 * ADR-0016 Gate B/C.2 — sync business contract (no DB). The orchestration (`runAgentSync`) is
 * exercised with a FAKE gateway (records every dashboard write, simulates the unique-key
 * idempotency) and a FAKE pool (records every query). This proves:
 *  - one provider/session link is upserted per mapped session (alongside the conversation),
 *  - Gate C.2: conversations are keyed by CONTACT (tenant+channel+external_contact_id) — a NEW
 *    session of an EXISTING contact reuses the same conversation row (no second row), and two
 *    DIFFERENT contacts get two conversations,
 *  - re-syncing the SAME sessions creates NO duplicate conversation or link (last_at advances),
 *  - the link references the session BY VALUE (provider 'agno', external_session_id = session_id),
 *  - there is NO ai.* write path — the ONLY ai.* access is a READ-ONLY SELECT.
 */

const tenantId = "11111111-1111-4111-8111-111111111111";
const channelId = "22222222-2222-4222-8222-222222222222";
const agentId = deriveExpectedAgentId(tenantId, channelId);
const channels: ChannelLike[] = [{ id: channelId, tenantId, sourceAgentId: null, isActive: true }];

function session(
  sessionId: string,
  userId: string | null,
  created = 100,
  updated = 200,
  agent: string | null = agentId
): AgnoSession {
  return { session_id: sessionId, agent_id: agent, user_id: userId, created_at: created, updated_at: updated, runs: [] };
}

/** In-memory dashboard gateway: records writes + simulates the two unique keys. */
function createFakeGateway(activeChannels: ChannelLike[]) {
  const conversations: Array<{
    id: string;
    tenantId: string;
    channelId: string;
    agnoSessionId: string;
    externalContactId: string;
    firstAt: Date | null;
    lastAt: Date | null;
  }> = [];
  const links = new Map<string, SessionLinkValues>();
  const calls = { insertConversation: 0, updateConversationActivity: 0, upsertSessionLink: 0 };
  let seq = 0;

  const gateway: SyncGateway = {
    async activeChannels() {
      return activeChannels;
    },
    async findConversationId(t, c, externalContactId) {
      return (
        conversations.find(
          (x) => x.tenantId === t && x.channelId === c && x.externalContactId === externalContactId
        )?.id ?? null
      );
    },
    async insertConversation(values: ConversationValues) {
      const existing = conversations.find(
        (x) =>
          x.tenantId === values.tenantId &&
          x.channelId === values.channelId &&
          x.externalContactId === values.externalContactId
      );
      if (existing) return { id: existing.id, created: false }; // unique (tenant, channel, external_contact_id)
      calls.insertConversation++;
      const id = `conv-${++seq}`;
      conversations.push({
        id,
        tenantId: values.tenantId,
        channelId: values.channelId,
        agnoSessionId: values.agnoSessionId,
        externalContactId: values.externalContactId,
        firstAt: values.firstAt,
        lastAt: values.lastAt,
      });
      return { id, created: true };
    },
    async updateConversationActivity(id, lastAt, firstAtIfMissing) {
      calls.updateConversationActivity++;
      const c = conversations.find((x) => x.id === id);
      if (c) {
        c.lastAt = lastAt;
        if (c.firstAt == null) c.firstAt = firstAtIfMissing;
      }
    },
    async upsertSessionLink(values: SessionLinkValues) {
      calls.upsertSessionLink++;
      const key = `${values.tenantId}|${values.provider}|${values.externalSessionId}`; // the unique key
      const existing = links.get(key);
      if (existing) existing.lastAt = values.lastAt; // ON CONFLICT DO UPDATE — never a duplicate
      else links.set(key, { ...values });
    },
  };
  return { gateway, conversations, links, calls };
}

/** Fake pg pool: records every SQL string; returns canned ai.agno_sessions rows for the SELECT. */
function createFakePool(sessionsByAgent: Record<string, AgnoSession[]>) {
  const queries: string[] = [];
  const pool = {
    async query(text: string, params: unknown[]) {
      queries.push(text);
      const agent = (params as string[])[0];
      const sessions = sessionsByAgent[agent] ?? [];
      return {
        rows: sessions.map((s) => ({
          session_id: s.session_id,
          session_type: s.session_type ?? null,
          agent_id: s.agent_id ?? null,
          user_id: s.user_id ?? null,
          runs: s.runs ?? null,
          created_at: s.created_at ?? null,
          updated_at: s.updated_at ?? null,
          metadata: null,
          summary: null,
        })),
      };
    },
  } as unknown as Pool;
  return { pool, queries };
}

describe("runAgentSync — ADR-0016 Gate B dual-write", () => {
  it("upserts one provider/session link per mapped session (conversation + link together)", async () => {
    const { gateway, conversations, links, calls } = createFakeGateway(channels);
    const { pool } = createFakePool({
      [agentId]: [session("s1", "94714128890"), session("s2", "94771234567")],
    });
    const r = await runAgentSync(gateway, pool, agentId);
    expect(r.mapped).toBe(2);
    expect(r.conversationsCreated).toBe(2);
    expect(r.sessionLinksUpserted).toBe(2);
    expect(conversations).toHaveLength(2);
    expect(links.size).toBe(2);
    expect(calls.upsertSessionLink).toBe(2);
  });

  it("is IDEMPOTENT — re-syncing the same session creates NO duplicate conversation or link (last_at advances)", async () => {
    const fake = createFakeGateway(channels);
    const first = createFakePool({ [agentId]: [session("s1", "94714128890", 100, 200)] });
    await runAgentSync(fake.gateway, first.pool, agentId);

    const again = createFakePool({ [agentId]: [session("s1", "94714128890", 100, 999)] });
    const r2 = await runAgentSync(fake.gateway, again.pool, agentId);

    expect(fake.conversations).toHaveLength(1); // NO duplicate conversation
    expect(fake.links.size).toBe(1); // NO duplicate link
    expect(r2.conversationsCreated).toBe(0);
    expect(r2.conversationsUpdated).toBe(1);
    expect(r2.sessionLinksUpserted).toBe(1);
    expect([...fake.links.values()][0].lastAt?.getTime()).toBe(999 * 1000); // last_at bumped
  });

  it("links the session BY VALUE (provider 'agno', external_session_id = session_id, business null)", async () => {
    const { gateway, links } = createFakeGateway(channels);
    const { pool } = createFakePool({ [agentId]: [session("opaque-session-token", "94714128890")] });
    await runAgentSync(gateway, pool, agentId);
    const link = [...links.values()][0];
    expect(link.provider).toBe("agno");
    expect(link.externalSessionId).toBe("opaque-session-token");
    expect(link.businessId).toBeNull();
    expect(link.conversationId).toMatch(/^conv-/); // FK target is the resolved dashboard conversation
  });

  it("has NO ai.* write path — the ONLY ai.* access is a READ-ONLY SELECT", async () => {
    const { gateway } = createFakeGateway(channels);
    const { pool, queries } = createFakePool({ [agentId]: [session("s1", "94714128890")] });
    await runAgentSync(gateway, pool, agentId);
    expect(queries.length).toBeGreaterThan(0);
    for (const q of queries) {
      expect(q.trim().toLowerCase().startsWith("select")).toBe(true); // reads only
      expect(q.toLowerCase()).not.toMatch(/\b(insert|update|delete|drop|alter|truncate)\b/);
      expect(/from\s+ai\.agno_sessions/i.test(q)).toBe(true); // the read model, never a write
    }
  });

  it("skips a session with no contact (no conversation, no link)", async () => {
    const { gateway, conversations, links } = createFakeGateway(channels);
    const { pool } = createFakePool({ [agentId]: [session("s1", null)] });
    const r = await runAgentSync(gateway, pool, agentId);
    expect(r.skippedNoContact).toBe(1);
    expect(conversations).toHaveLength(0);
    expect(links.size).toBe(0);
  });

  it("counts an unmapped agent_id and writes nothing", async () => {
    const { gateway, conversations, links } = createFakeGateway(channels);
    const { pool } = createFakePool({ [agentId]: [session("s1", "94714128890", 100, 200, "zzz:zzz")] });
    const r = await runAgentSync(gateway, pool, agentId);
    expect(r.unmapped).toBe(1);
    expect(r.mapped).toBe(0);
    expect(conversations).toHaveLength(0);
    expect(links.size).toBe(0);
  });

  it("Gate C.2 — same contact + NEW session does NOT create a second conversation (only a new link)", async () => {
    const { gateway, conversations, links, calls } = createFakeGateway(channels);
    const { pool } = createFakePool({
      [agentId]: [
        session("sess-A", "94714128890", 100, 200),
        session("sess-B", "94714128890", 300, 400), // SAME contact, DIFFERENT session
      ],
    });
    const r = await runAgentSync(gateway, pool, agentId);
    expect(r.mapped).toBe(2);
    expect(conversations).toHaveLength(1); // ONE contact-thread row, not two
    expect(calls.insertConversation).toBe(1);
    expect(r.conversationsCreated).toBe(1);
    expect(r.conversationsUpdated).toBe(1); // second session reuses + bumps the same row
    expect(links.size).toBe(2); // but TWO distinct provider/session links
    expect(r.sessionLinksUpserted).toBe(2);
  });

  it("Gate C.2 — two DIFFERENT contacts create two DIFFERENT conversations", async () => {
    const { gateway, conversations } = createFakeGateway(channels);
    const { pool } = createFakePool({
      [agentId]: [session("s1", "94714128890"), session("s2", "94771234567")],
    });
    await runAgentSync(gateway, pool, agentId);
    expect(conversations).toHaveLength(2);
    expect(new Set(conversations.map((c) => c.externalContactId)).size).toBe(2);
  });
});
