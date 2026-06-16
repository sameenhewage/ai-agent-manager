import { getPool, maskDbUrl } from "../lib/db/client";

/**
 * Slice 11B — dashboard-only ARCHIVAL of v1 orphan conversations.
 *
 * Reads `ai.*` ONLY for an existence check; the only WRITE is to
 * `dashboard.app_conversations.status` (-> 'archived'). NO hard-delete, NO schema change,
 * NO writes to `ai.*`, NO unrelated seeding.
 *
 * An "orphan" = a non-archived conversation for pepper-st/whatsapp-main whose `agno_session_id`
 * has NO matching live session under the DERIVED agent_id "<tenant_id>:<channel_id>". These are
 * v1 artifacts whose ids (v1 phone-based) no longer exist after the Agno v2 migration (live
 * session ids are 32-hex). We RETIRE them via status='archived' (reversible), never delete.
 *
 * Idempotent: re-running archives only the orphans that exist at that moment.
 * Run: `npm run db:agno:archive-orphans` (needs DATABASE_URL).
 */
function loadDotEnv() {
  const proc = process as unknown as { loadEnvFile?: (path?: string) => void };
  try {
    proc.loadEnvFile?.(".env");
  } catch {
    /* rely on exported env vars */
  }
}

// Derives the agent_id in SQL as "<tenant_id>:<channel_id>" (tenant-first, confirmed contract).
const ORPHAN_CTE = `
  with ch as (
    select ch.id as channel_id, (t.id::text || ':' || ch.id::text) as agent_id
      from dashboard.app_channels ch
      join dashboard.app_tenants t on t.id = ch.tenant_id
     where t.slug = 'pepper-st' and ch.channel_key = 'whatsapp-main'
  )`;

async function main() {
  loadDotEnv();
  const pool = getPool();
  console.log(`[agno:archive-orphans] ${maskDbUrl()}`);

  // 1. Pre-count (read-only): exactly how many orphans WILL be archived, and why.
  const pre = await pool.query<{ total: number; live_sessions: number; orphans: number }>(
    `${ORPHAN_CTE}
     select
       (select count(*)::int from dashboard.app_conversations c
          join ch on ch.channel_id = c.channel_id) as total,
       (select count(*)::int from ai.agno_sessions s, ch where s.agent_id = ch.agent_id) as live_sessions,
       (select count(*)::int
          from dashboard.app_conversations c
          join ch on ch.channel_id = c.channel_id
          where c.status <> 'archived'
            and not exists (
              select 1 from ai.agno_sessions s
               where s.session_id = c.agno_session_id and s.agent_id = ch.agent_id)) as orphans`
  );
  const { total, live_sessions, orphans } = pre.rows[0];
  console.log(`conversations (channel) : ${total}`);
  console.log(`live sessions (derived) : ${live_sessions}`);
  console.log(`orphans to archive      : ${orphans}`);
  console.log(
    "reason                  : these rows reference agno_session_id values that no longer exist as " +
      "live sessions under the derived agent_id (v1 phone-based ids; the Agno v2 migration replaced " +
      "them with 32-hex session ids). Retired via status='archived' (NOT deleted)."
  );

  if (Number(orphans) === 0) {
    console.log("[agno:archive-orphans] nothing to archive.");
    await pool.end();
    return;
  }

  // 2. WRITE (dashboard.* only): archive exactly those orphans.
  const res = await pool.query<{ id: string }>(
    `${ORPHAN_CTE}
     update dashboard.app_conversations c
        set status = 'archived', updated_at = now()
       from ch
      where c.channel_id = ch.channel_id
        and c.status <> 'archived'
        and not exists (
          select 1 from ai.agno_sessions s
           where s.session_id = c.agno_session_id and s.agent_id = ch.agent_id)
     returning c.id`
  );
  console.log(
    `[agno:archive-orphans] ARCHIVED ${res.rowCount} conversation(s) ` +
      "(dashboard.app_conversations.status only; ai.* untouched)."
  );
  await pool.end();
}

main().catch((err) => {
  console.error("[agno:archive-orphans] FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
