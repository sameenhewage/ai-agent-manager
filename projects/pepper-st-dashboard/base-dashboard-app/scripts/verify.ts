import { getPool, maskDbUrl } from "../lib/db/client";

/**
 * Slice 3 read-only verification: confirms the migration + seed result.
 * Performs ONLY SELECTs. Run: `npm run db:verify` (requires DATABASE_URL).
 */
function loadDotEnv() {
  const proc = process as unknown as { loadEnvFile?: (path?: string) => void };
  try {
    proc.loadEnvFile?.(".env");
  } catch {
    /* no .env file — rely on exported environment variables */
  }
}

const EXPECTED_TABLES = [
  "app_channels",
  "app_conversations",
  "app_customer_identities",
  "app_customers",
  "app_tenant_entitlements",
  "app_tenants",
];

const FORBIDDEN_TABLES = [
  "app_conversation_messages",
  "app_analytics_daily",
  "app_subscription_limits",
  "app_plans",
  "app_plan_features",
  "app_tenant_subscriptions",
];

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  loadDotEnv();
  console.log(`[verify] connecting to ${maskDbUrl()} (read-only)`);
  const pool = getPool();

  const schemaRes = await pool.query(
    "select 1 from information_schema.schemata where schema_name = 'dashboard'"
  );
  check("dashboard schema exists", schemaRes.rowCount === 1);

  const tablesRes = await pool.query<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema = 'dashboard' order by table_name"
  );
  const tables: string[] = tablesRes.rows.map((r) => r.table_name);
  check(
    "exactly the 6 expected dashboard tables exist",
    tables.length === 6 && EXPECTED_TABLES.every((t) => tables.includes(t)),
    tables.join(", ") || "none"
  );

  const forbidden = tables.filter((t) => FORBIDDEN_TABLES.includes(t));
  check("no forbidden tables in dashboard", forbidden.length === 0, forbidden.join(", ") || "none");

  const tenantRes = await pool.query(
    "select count(*)::int as n from dashboard.app_tenants where slug = 'pepper-st'"
  );
  check("PEPPER ST. tenant exists exactly once", tenantRes.rows[0].n === 1);

  const channelRes = await pool.query(
    "select count(*)::int as n from dashboard.app_channels c " +
      "join dashboard.app_tenants t on t.id = c.tenant_id " +
      "where t.slug = 'pepper-st' and c.channel_key = 'whatsapp-main'"
  );
  check("WhatsApp channel 'whatsapp-main' exists exactly once", channelRes.rows[0].n === 1);

  const entRes = await pool.query(
    "select e.plan_code, e.is_fully_enabled, e.raw_history_retention_days, e.analytics_retention_days " +
      "from dashboard.app_tenant_entitlements e " +
      "join dashboard.app_tenants t on t.id = e.tenant_id where t.slug = 'pepper-st'"
  );
  check("enterprise entitlement exists exactly once", entRes.rowCount === 1);
  const ent = entRes.rows[0];
  if (ent) {
    check("plan_code = enterprise", ent.plan_code === "enterprise", String(ent.plan_code));
    check("is_fully_enabled = true", ent.is_fully_enabled === true);
    check("raw_history_retention_days IS NULL (unlimited)", ent.raw_history_retention_days === null);
    check("analytics_retention_days IS NULL (unlimited)", ent.analytics_retention_days === null);
  }

  const aiLeak = await pool.query(
    "select count(*)::int as n from information_schema.tables " +
      "where table_schema = 'ai' and table_name like 'app\\_%'"
  );
  check("no dashboard app_* tables leaked into the ai schema", aiLeak.rows[0].n === 0);

  await pool.end();
  console.log(failures === 0 ? "\n[verify] ALL CHECKS PASSED" : `\n[verify] ${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("[verify] FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
