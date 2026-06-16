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
  // Removed in Slice 12D-D / ADR-0012 — the dashboard owns no customer/contact model;
  // ai.customers is the AI-platform registry and external_contact_id lives on the conversation.
  "app_customers",
  "app_customer_identities",
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

  const conv = await pool.query<{ n: number; contacts: number; null_contacts: number }>(
    `select count(*)::int n,
            count(distinct c.external_contact_id)::int contacts,
            count(*) filter (where c.external_contact_id is null)::int null_contacts
       from dashboard.app_conversations c
       join dashboard.app_tenants t on t.id = c.tenant_id
      where t.slug = 'pepper-st'`
  );
  console.log(`conversations synced : ${conv.rows[0].n}`);
  console.log(`distinct contacts    : ${conv.rows[0].contacts} (one contact may own many conversations)`);
  // ADR-0012: the dashboard owns NO customer/identity table. The contact is stored by value on the
  // conversation; many conversations may share one external_contact_id (one contact => N sessions).
  check(
    "every conversation carries a non-null external_contact_id (the masked-contact source — ADR-0012)",
    conv.rows[0].null_contacts === 0,
    `null_contacts=${conv.rows[0].null_contacts}`
  );
  check(
    "distinct contacts <= conversations (same contact may own many conversations; no 1:1 CRM model)",
    conv.rows[0].contacts <= conv.rows[0].n,
    `contacts=${conv.rows[0].contacts} conversations=${conv.rows[0].n}`
  );

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
  check(
    "dashboard has exactly 4 tables (app_tenants, app_channels, app_conversations, app_tenant_entitlements — ADR-0012)",
    names.length === 4,
    names.join(", ")
  );
  check(
    "no forbidden tables exist (incl. the removed app_customers / app_customer_identities)",
    names.every((n) => !FORBIDDEN_TABLES.includes(n)),
    names.filter((n) => FORBIDDEN_TABLES.includes(n)).join(", ") || "none"
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
