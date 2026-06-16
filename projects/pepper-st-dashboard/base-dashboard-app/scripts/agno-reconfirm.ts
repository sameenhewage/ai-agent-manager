import { getPool, maskDbUrl } from "../lib/db/client";

/**
 * Gate 11A — READ-ONLY reconfirmation of the live Agno v2 data contract.
 *
 * Confirms (structure / shapes / counts only — NEVER raw phone, session token, or
 * message content): session count, distinct agent_id + agent_name, session_id shape,
 * user_id shape, token/cost JSON paths, message role shape, and dashboard mapped-vs-
 * orphaned coverage against the channel's CURRENTLY CONFIGURED source_agent_id.
 *
 * Read-only: the session is pinned `default_transaction_read_only = on`, so any stray
 * write throws instead of mutating. Makes NO writes to any schema.
 * Run: `npm run db:agno:reconfirm` (requires DATABASE_URL).
 */
function loadDotEnv() {
  const proc = process as unknown as { loadEnvFile?: (p?: string) => void };
  try {
    proc.loadEnvFile?.(".env");
  } catch {
    /* rely on exported env vars */
  }
}

async function main() {
  loadDotEnv();
  const pool = getPool();
  console.log(`[agno:reconfirm] ${maskDbUrl()} (READ-ONLY)`);
  const client = await pool.connect();
  await client.query("set session default_transaction_read_only = on");
  await client.query("set statement_timeout = '30s'");

  const q = async (label: string, text: string) => {
    const res = await client.query(text);
    console.log(`\n### ${label}`);
    console.dir(res.rows, { depth: 6, maxArrayLength: 100 });
  };

  await q("1. session count", `select count(*)::int as sessions from ai.agno_sessions`);

  await q(
    "2-3. distinct agent_id (masked prefix) + agent_name (config label)",
    `select count(distinct agent_id)::int as distinct_agent_ids,
            array_agg(distinct left(agent_id, 8) || '…') as agent_id_prefixes_masked,
            array_agg(distinct (runs::jsonb->0->>'agent_name')) as agent_names,
            bool_and(agent_id ~ ':') as agent_id_is_composite,
            max(length(agent_id)) as agent_id_len
       from ai.agno_sessions`
  );

  await q(
    "4. session_id shape (no raw values)",
    `select min(length(session_id)) as sid_min_len, max(length(session_id)) as sid_max_len,
            bool_and(session_id ~* '^[0-9a-f]{32}$') as sid_all_hex32,
            bool_and(session_id ~ '^[+0-9]{6,18}$') as sid_phone_like
       from ai.agno_sessions`
  );

  await q(
    "5. user_id shape (PII — shape only, no raw values)",
    `select count(*) filter (where user_id is null)::int as user_id_nulls,
            min(length(user_id)) as uid_min_len, max(length(user_id)) as uid_max_len,
            bool_and(user_id ~ '^[0-9]+$') as uid_all_digits,
            bool_and(user_id ~ '^[+0-9]{6,18}$') as uid_all_phone_like
       from ai.agno_sessions`
  );

  await q(
    "6. token/cost JSON paths present",
    `select bool_and((session_data->'session_metrics'->>'total_tokens') is not null) as total_tokens_path,
            bool_and((session_data->'session_metrics'->>'cost') is not null) as cost_path
       from ai.agno_sessions`
  );

  await q(
    "7. message role distribution (structure only)",
    `with s as (select runs::jsonb as runs from ai.agno_sessions where jsonb_typeof(runs::jsonb)='array')
     select m->>'role' as role, count(*)::int as n
       from s,
            lateral jsonb_array_elements(runs) r,
            lateral jsonb_array_elements(case when jsonb_typeof(r->'messages')='array' then r->'messages' else '[]'::jsonb end) m
      group by 1 order by 2 desc`
  );

  await q(
    "8. dashboard mapped vs orphaned (vs CONFIGURED source_agent_id)",
    `with ch as (
       select c.source_agent_id
         from dashboard.app_channels c
         join dashboard.app_tenants t on t.id = c.tenant_id
        where t.slug = 'pepper-st' and c.channel_key = 'whatsapp-main'
        limit 1
     )
     select (select source_agent_id from ch) as configured_source_agent_id,
            (select count(*)::int from ai.agno_sessions) as live_sessions_total,
            (select count(*)::int from ai.agno_sessions s, ch where s.agent_id = ch.source_agent_id) as live_sessions_for_configured_agent,
            (select count(*)::int from dashboard.app_conversations c join dashboard.app_tenants t on t.id=c.tenant_id where t.slug='pepper-st') as dashboard_conversations,
            (select count(*)::int from dashboard.app_conversations c join dashboard.app_tenants t on t.id=c.tenant_id join ai.agno_sessions s on s.session_id=c.agno_session_id where t.slug='pepper-st') as mapped_to_live_session`
  );

  // --- AI-dev confirmed contract (Slice 11B): agent_id == tenant_id:channel_id ---
  await q(
    "9. agent_id composite shape (delimiter + segment + uuid-shape of halves)",
    `select bool_and(agent_id ~ ':') as all_have_colon,
            min(array_length(string_to_array(agent_id, ':'), 1)) as min_segments,
            max(array_length(string_to_array(agent_id, ':'), 1)) as max_segments,
            bool_and(split_part(agent_id, ':', 1) ~* '^[0-9a-f-]{36}$') as part1_uuid_shaped,
            bool_and(split_part(agent_id, ':', 2) ~* '^[0-9a-f-]{36}$') as part2_uuid_shaped,
            count(distinct agent_id)::int as distinct_agent_ids
       from ai.agno_sessions
      where agent_id is not null`
  );

  await q(
    "10. does composite resolve to a REAL dashboard tenant+channel pair? (ordering probe; any tenant)",
    `with parts as (
       select distinct agent_id,
              split_part(agent_id, ':', 1) as p1,
              split_part(agent_id, ':', 2) as p2
         from ai.agno_sessions
        where agent_id ~ ':'
     )
     select count(*)::int as distinct_composite_agent_ids,
            count(*) filter (
              where exists (
                select 1 from dashboard.app_channels c
                  join dashboard.app_tenants t on t.id = c.tenant_id
                 where t.id::text = parts.p1 and c.id::text = parts.p2)
            )::int as strict_tenant_then_channel,
            count(*) filter (
              where exists (
                select 1 from dashboard.app_channels c
                  join dashboard.app_tenants t on t.id = c.tenant_id
                 where c.id::text = parts.p1 and t.id::text = parts.p2)
            )::int as strict_channel_then_tenant
       from parts`
  );

  await q(
    "11. live sessions for pepper-st/whatsapp-main under each derived ordering",
    `with ref as (
       select t.id::text as tid, c.id::text as cid
         from dashboard.app_channels c
         join dashboard.app_tenants t on t.id = c.tenant_id
        where t.slug = 'pepper-st' and c.channel_key = 'whatsapp-main'
        limit 1
     )
     select (select count(*)::int from ai.agno_sessions s, ref where s.agent_id = ref.tid || ':' || ref.cid) as sessions_tenant_then_channel,
            (select count(*)::int from ai.agno_sessions s, ref where s.agent_id = ref.cid || ':' || ref.tid) as sessions_channel_then_tenant
       from ref`
  );

  client.release();
  await pool.end();
  console.log("\n[agno:reconfirm] done (no writes performed).");
}

main().catch((err) => {
  console.error("[agno:reconfirm] FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
