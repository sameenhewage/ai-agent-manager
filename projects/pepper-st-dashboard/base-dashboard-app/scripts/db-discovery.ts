import { getPool, maskDbUrl } from "../lib/db/client";

/**
 * Gate 10 — READ-ONLY database discovery.
 *
 * Runs ONLY SELECT/SET statements on a connection pinned to
 * `default_transaction_read_only = on`, so any accidental write throws instead of
 * mutating data. Emits schema inventory, `ai.agno_sessions` STRUCTURE (JSON keys,
 * counts, patterns — never message content, never raw phone/session identifiers),
 * dashboard mapping coverage, and volume. Makes NO writes to any schema.
 *
 * Run: `npx tsx scripts/db-discovery.ts` (requires DATABASE_URL in env/.env).
 *
 * NOTE: the section-B probes filter `agent_id='concierge'` to mirror the APP's current
 * mapping assumption. Gate 10 found that assumption is now stale (Agno migrated; the agent
 * id is a composite `<uuid>:<uuid>`), so those probes return empty against live data — that
 * emptiness is itself the finding. See docs/database/01-current-database-inventory.md.
 */
function loadDotEnv() {
  const proc = process as unknown as { loadEnvFile?: (path?: string) => void };
  try {
    proc.loadEnvFile?.(".env");
  } catch {
    /* rely on exported env vars */
  }
}

async function main() {
  loadDotEnv();
  const pool = getPool();
  console.log(`[discovery] ${maskDbUrl()} (READ-ONLY)`);
  const client = await pool.connect();
  // Hard guard: pin the session read-only so any stray write is rejected by PG.
  await client.query("set session default_transaction_read_only = on");
  await client.query("set statement_timeout = '45s'");

  const q = async (label: string, text: string, params: unknown[] = []) => {
    try {
      const res = await client.query(text, params as unknown[] as never[]);
      console.log(`\n### ${label} (${res.rowCount} rows)`);
      console.dir(res.rows, { depth: 6, maxArrayLength: 300 });
      return res.rows as Record<string, unknown>[];
    } catch (e) {
      console.log(`\n### ${label} — ERROR: ${e instanceof Error ? e.message : String(e)}`);
      return [];
    }
  };

  // ---------------------------------------------------------------- A. inventory
  const schemas = await q(
    "A1 schemas",
    `select n.nspname as schema,
            count(*) filter (where c.relkind in ('r','p')) as tables,
            count(*) filter (where c.relkind='v') as views,
            count(*) filter (where c.relkind='m') as matviews,
            count(*) filter (where c.relkind='S') as sequences
       from pg_namespace n left join pg_class c on c.relnamespace=n.oid
      where n.nspname not in ('pg_catalog','information_schema','pg_toast')
        and n.nspname not like 'pg_temp%' and n.nspname not like 'pg_toast_temp%'
      group by 1 order by 1`
  );
  const inspect = (schemas as { schema: string }[]).map((r) => r.schema);
  const hasAi = inspect.includes("ai");

  await q(
    "A2 tables + estimated rows",
    `select n.nspname schema, c.relname tbl, c.relkind, c.reltuples::bigint est_rows
       from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname = any($1::text[]) and c.relkind in ('r','p','v','m','S')
      order by 1,2`,
    [inspect]
  );
  await q(
    "A3 columns",
    `select table_schema, table_name, ordinal_position pos, column_name, data_type, udt_name, is_nullable, column_default
       from information_schema.columns where table_schema = any($1::text[])
      order by table_schema, table_name, ordinal_position`,
    [inspect]
  );
  await q(
    "A4 indexes",
    `select schemaname schema, tablename tbl, indexname, indexdef
       from pg_indexes where schemaname = any($1::text[]) order by 1,2,3`,
    [inspect]
  );
  await q(
    "A5 constraints",
    `select n.nspname schema, t.relname tbl, c.contype, c.conname, pg_get_constraintdef(c.oid) def
       from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
      where n.nspname = any($1::text[]) order by 1,2,3`,
    [inspect]
  );
  await q(
    "A6 enum/composite/domain types",
    `select n.nspname schema, t.typname type, t.typtype,
            array_agg(e.enumlabel order by e.enumsortorder) filter (where e.enumlabel is not null) labels
       from pg_type t join pg_namespace n on n.oid=t.typnamespace
       left join pg_enum e on e.enumtypid=t.oid
      where n.nspname = any($1::text[]) and t.typtype in ('e','c','d')
      group by 1,2,3 order by 1,2`,
    [inspect]
  );

  // -------------------------------------------------- B. ai.agno_sessions deep read
  if (hasAi) {
    const ct = await client.query(
      `select udt_name from information_schema.columns
        where table_schema='ai' and table_name='agno_sessions' and column_name='created_at'`
    );
    const createdType = (ct.rows[0]?.udt_name as string) ?? "(unknown)";
    const epoch = ["int8", "int4", "int2", "numeric", "float8", "float4"].includes(createdType);
    console.log(`\n[ai.agno_sessions.created_at udt_name = ${createdType} -> ${epoch ? "epoch" : "timestamp"}]`);

    await q("B1 total sessions", `select count(*)::bigint n from ai.agno_sessions`);
    await q("B2 by agent_id", `select agent_id, count(*)::int n from ai.agno_sessions group by 1 order by 2 desc limit 50`);
    await q("B3 by session_type", `select session_type, count(*)::int n from ai.agno_sessions group by 1 order by 2 desc limit 50`);
    await q(
      "B4 session_id pattern (counts only)",
      `select count(*) filter (where session_id ~ '^[+0-9]{6,18}$') phone_like,
              count(*) filter (where session_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') uuid_like,
              count(*) filter (where session_id !~ '^[+0-9]{6,18}$'
                               and session_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') other,
              count(*) total
         from ai.agno_sessions`
    );
    if (epoch) {
      await q(
        "B5 created/updated range",
        `select to_timestamp(min(created_at)) min_created, to_timestamp(max(created_at)) max_created,
                to_timestamp(min(updated_at)) min_updated, to_timestamp(max(updated_at)) max_updated
           from ai.agno_sessions`
      );
      await q("B6 sessions by month", `select to_char(to_timestamp(created_at),'YYYY-MM') ym, count(*)::int n from ai.agno_sessions group by 1 order by 1`);
    } else {
      await q(
        "B5 created/updated range",
        `select min(created_at) min_created, max(created_at) max_created, min(updated_at) min_updated, max(updated_at) max_updated from ai.agno_sessions`
      );
      await q("B6 sessions by month", `select to_char(created_at,'YYYY-MM') ym, count(*)::int n from ai.agno_sessions group by 1 order by 1`);
    }
    await q("B7 runs typeof", `select jsonb_typeof(runs::jsonb) t, count(*)::int n from ai.agno_sessions group by 1`);
    await q(
      "B8 runs length stats (concierge)",
      `select min(len)::int min, max(len)::int max, round(avg(len),2) avg, sum(len)::bigint sum
         from (select jsonb_array_length(case when jsonb_typeof(runs::jsonb)='array' then runs::jsonb else '[]'::jsonb end) len
                 from ai.agno_sessions where agent_id='concierge') s`
    );
    await q(
      "B9 first-run object keys (concierge sample 20)",
      `with s as (select runs::jsonb runs from ai.agno_sessions
                   where agent_id='concierge' and jsonb_typeof(runs::jsonb)='array' and jsonb_array_length(runs::jsonb)>0 limit 20)
       select array_agg(distinct k) keys from s, lateral jsonb_object_keys(runs->0) k`
    );
    await q(
      "B10 message object keys (concierge sample 20)",
      `with s as (select runs::jsonb runs from ai.agno_sessions
                   where agent_id='concierge' and jsonb_typeof(runs::jsonb)='array' and jsonb_array_length(runs::jsonb)>0 limit 20)
       select array_agg(distinct k) keys from s,
         lateral jsonb_array_elements(runs) r,
         lateral jsonb_array_elements(case when jsonb_typeof(r->'messages')='array' then r->'messages' else '[]'::jsonb end) m,
         lateral jsonb_object_keys(m) k`
    );
    await q(
      "B11 message role distribution (concierge sample 50)",
      `with s as (select runs::jsonb runs from ai.agno_sessions
                   where agent_id='concierge' and jsonb_typeof(runs::jsonb)='array' and jsonb_array_length(runs::jsonb)>0 limit 50)
       select m->>'role' role, count(*)::int n from s,
         lateral jsonb_array_elements(runs) r,
         lateral jsonb_array_elements(case when jsonb_typeof(r->'messages')='array' then r->'messages' else '[]'::jsonb end) m
       group by 1 order by 2 desc`
    );
    await q(
      "B12 session_data top-level keys (concierge sample 50)",
      `with s as (select session_data::jsonb sd from ai.agno_sessions
                   where agent_id='concierge' and session_data is not null and jsonb_typeof(session_data::jsonb)='object' limit 50)
       select array_agg(distinct k) keys from s, lateral jsonb_object_keys(sd) k`
    );
    await q(
      "B13 session_metrics keys (concierge sample 50)",
      `with s as (select session_data::jsonb sd from ai.agno_sessions
                   where agent_id='concierge' and (session_data::jsonb) ? 'session_metrics' limit 50)
       select array_agg(distinct k) keys from s, lateral jsonb_object_keys(sd->'session_metrics') k`
    );
    await q(
      "B14 token/cost coverage (concierge)",
      `select count(*) filter (where (session_data->'session_metrics'->>'total_tokens') is not null) tokens,
              count(*) filter (where (session_data->'session_metrics'->>'cost') is not null) cost,
              count(*) total
         from ai.agno_sessions where agent_id='concierge'`
    );
    await q(
      "B15 metadata/summary presence (concierge)",
      `select count(*) filter (where metadata is not null) meta_present,
              count(*) filter (where summary is not null) summary_present, count(*) total
         from ai.agno_sessions where agent_id='concierge'`
    );
    await q("B16 summary typeof (concierge)", `select jsonb_typeof(summary::jsonb) t, count(*)::int n from ai.agno_sessions where agent_id='concierge' group by 1`);
    await q(
      "B17 metadata keys (concierge sample 50)",
      `with s as (select metadata::jsonb md from ai.agno_sessions
                   where agent_id='concierge' and metadata is not null and jsonb_typeof(metadata::jsonb)='object' limit 50)
       select array_agg(distinct k) keys from s, lateral jsonb_object_keys(md) k`
    );
  }

  // --------------------------------------- C. dashboard verification + coverage
  await q(
    "C1 dashboard row counts",
    `select 'app_tenants' tbl, count(*)::int n from dashboard.app_tenants
      union all select 'app_channels', count(*) from dashboard.app_channels
      union all select 'app_conversations', count(*) from dashboard.app_conversations
      union all select 'app_tenant_entitlements', count(*) from dashboard.app_tenant_entitlements
      order by 1`
  );
  await q(
    "C2 tenants/channels (slugs/keys only)",
    `select t.slug, t.status, t.timezone, c.channel_key, c.type, c.source_agent_id, c.is_active
       from dashboard.app_tenants t left join dashboard.app_channels c on c.tenant_id=t.id order by 1,4`
  );
  await q(
    "C3 entitlements",
    `select t.slug, e.plan_code, e.is_fully_enabled, e.raw_history_retention_days, e.analytics_retention_days
       from dashboard.app_tenant_entitlements e join dashboard.app_tenants t on t.id=e.tenant_id order by 1`
  );
  if (hasAi) {
    await q(
      "C4 mapping coverage (concierge)",
      // Gate C.3: agno_session_id was removed — coverage is derived via app_conversation_sessions links.
      `select (select count(*) from ai.agno_sessions where agent_id='concierge') concierge_sessions,
              (select count(*) from dashboard.app_conversations) mapped_conversations,
              (select count(*) from ai.agno_sessions s where s.agent_id='concierge'
                 and not exists (select 1 from dashboard.app_conversation_sessions l where l.external_session_id=s.session_id)) unmapped_sessions,
              (select count(*) from dashboard.app_conversations c
                 where not exists (select 1 from dashboard.app_conversation_sessions l
                    join ai.agno_sessions s on s.session_id=l.external_session_id and s.agent_id='concierge'
                   where l.conversation_id=c.id)) orphan_conversations`
    );
  }

  client.release();
  await pool.end();
  console.log("\n[discovery] done (no writes performed).");
}

main().catch((e) => {
  console.error("[discovery] FATAL:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});
