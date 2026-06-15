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
  check(
    "one identity per conversation (1:1 in Phase 1)",
    conv.rows[0].n === identities.rows[0].n && customers.rows[0].n === identities.rows[0].n
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
