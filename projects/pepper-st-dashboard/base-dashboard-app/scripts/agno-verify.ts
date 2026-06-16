import { getPool, maskDbUrl } from "../lib/db/client";

/**
 * Slice 4 — READ-ONLY verification of the mapping sync result. Only SELECTs.
 * Run: `npm run db:agno:verify` (needs DATABASE_URL).
 */
function loadDotEnv() {
  const proc = process as unknown as { loadEnvFile?: (path?: string) => void };
  try {
    proc.loadEnvFile?.(".env");
  } catch {
    /* rely on exported env vars */
  }
}

const FORBIDDEN_TABLES = [
  "app_conversation_messages",
  "app_analytics_daily",
  "app_plans",
  "app_plan_features",
  "app_tenant_subscriptions",
  "app_subscription_limits",
];

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  loadDotEnv();
  const pool = getPool();
  console.log(`[agno:verify] ${maskDbUrl()} (read-only)`);

  const tenant = await pool.query<{ n: number }>(
    "select count(*)::int n from dashboard.app_tenants where slug = 'pepper-st'"
  );
  check("PEPPER ST. tenant exists exactly once", tenant.rows[0].n === 1);

  const channel = await pool.query<{ n: number }>(
    "select count(*)::int n from dashboard.app_channels c join dashboard.app_tenants t on t.id = c.tenant_id where t.slug = 'pepper-st' and c.channel_key = 'whatsapp-main'"
  );
  check("whatsapp-main channel exists exactly once", channel.rows[0].n === 1);

  const conv = await pool.query<{ n: number }>(
    "select count(*)::int n from dashboard.app_conversations c join dashboard.app_tenants t on t.id = c.tenant_id where t.slug = 'pepper-st'"
  );
  const customers = await pool.query<{ n: number }>(
    "select count(*)::int n from dashboard.app_customers c join dashboard.app_tenants t on t.id = c.tenant_id where t.slug = 'pepper-st'"
  );
  const identities = await pool.query<{ n: number }>(
    "select count(*)::int n from dashboard.app_customer_identities i join dashboard.app_tenants t on t.id = i.tenant_id where t.slug = 'pepper-st'"
  );
  console.log(`conversations synced : ${conv.rows[0].n}`);
  console.log(`customers synced     : ${customers.rows[0].n}`);
  console.log(`identities synced    : ${identities.rows[0].n}`);
  // v2 is 1 identity : N conversations (a contact/user_id may own many sessions), so the strict v1
  // 1:1 invariant no longer holds. Every conversation must still resolve to an identity.
  check(
    "1 identity : N conversations (identities <= conversations, customers <= identities)",
    identities.rows[0].n <= conv.rows[0].n && customers.rows[0].n <= identities.rows[0].n
  );
  const nullIdentity = await pool.query<{ n: number }>(
    "select count(*)::int n from dashboard.app_conversations c join dashboard.app_tenants t on t.id = c.tenant_id where t.slug = 'pepper-st' and c.customer_identity_id is null"
  );
  check("no conversation is missing its customer_identity_id", nullIdentity.rows[0].n === 0);

  // ---- v2 live-coverage: agent_id is DERIVED "<tenant_id>:<channel_id>" (computed in SQL). This
  // catches the Gate 10 drift that the old structural checks PASSED right through. ----
  const coverage = await pool.query<{
    live_sessions: number;
    mapped: number;
    archived: number;
    orphans: number;
  }>(
    `with ch as (
       select ch.id as channel_id, (t.id::text || ':' || ch.id::text) as agent_id
         from dashboard.app_channels ch
         join dashboard.app_tenants t on t.id = ch.tenant_id
        where t.slug = 'pepper-st' and ch.channel_key = 'whatsapp-main'
     )
     select
       (select count(*)::int from ai.agno_sessions s, ch where s.agent_id = ch.agent_id) as live_sessions,
       (select count(*)::int
          from dashboard.app_conversations c
          join ch on ch.channel_id = c.channel_id
          join ai.agno_sessions s on s.session_id = c.agno_session_id and s.agent_id = ch.agent_id) as mapped,
       (select count(*)::int
          from dashboard.app_conversations c
          join ch on ch.channel_id = c.channel_id
          where c.status = 'archived') as archived,
       (select count(*)::int
          from dashboard.app_conversations c
          join ch on ch.channel_id = c.channel_id
          where c.status <> 'archived'
            and not exists (
              select 1 from ai.agno_sessions s
               where s.session_id = c.agno_session_id and s.agent_id = ch.agent_id)) as orphans`
  );
  const cov = coverage.rows[0];
  console.log(`live sessions (derived agent_id) : ${cov.live_sessions}`);
  console.log(`mapped conversations             : ${cov.mapped}`);
  console.log(`archived (retired) conversations : ${cov.archived}`);
  console.log(`active orphan conversations      : ${cov.orphans}`);
  check(
    "no ACTIVE orphan conversations (archived rows are intentionally excluded)",
    Number(cov.orphans) === 0,
    `orphans=${cov.orphans} archived=${cov.archived}`
  );
  check(
    "live sessions are actually mapped (no 0-coverage drift)",
    Number(cov.live_sessions) === 0 || Number(cov.mapped) > 0,
    `live=${cov.live_sessions} mapped=${cov.mapped}`
  );

  const tables = await pool.query<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema = 'dashboard' order by table_name"
  );
  const names: string[] = tables.rows.map((r) => r.table_name);
  check("dashboard still has exactly 6 tables", names.length === 6, names.join(", "));
  check(
    "no forbidden / transcript-message tables exist",
    names.every((n) => !FORBIDDEN_TABLES.includes(n))
  );

  const aiLeak = await pool.query<{ n: number }>(
    "select count(*)::int n from information_schema.tables where table_schema = 'ai' and table_name like 'app\\_%'"
  );
  check("no dashboard app_* tables leaked into the ai schema", aiLeak.rows[0].n === 0);

  await pool.end();
  console.log(failures === 0 ? "\n[agno:verify] ALL CHECKS PASSED" : `\n[agno:verify] ${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("[agno:verify] FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
