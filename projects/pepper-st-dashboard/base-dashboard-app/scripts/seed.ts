import { getDb, getPool, maskDbUrl } from "../lib/db/client";
import { seedPepperSt } from "../lib/db/seed";

/**
 * Slice 3 seed runner: applies the idempotent PEPPER ST. seed to `dashboard.*`.
 * Loads .env if present (Node >= 20.12), else relies on exported env vars.
 * Run: `npm run db:seed` (requires DATABASE_URL).
 */
function loadDotEnv() {
  const proc = process as unknown as { loadEnvFile?: (path?: string) => void };
  try {
    proc.loadEnvFile?.(".env");
  } catch {
    /* no .env file — rely on exported environment variables */
  }
}

async function main() {
  loadDotEnv();
  console.log(`[seed] connecting to ${maskDbUrl()}`);
  const db = getDb();
  const tenant = await seedPepperSt(db);
  console.log(`[seed] ok — tenant '${tenant.slug}' (${tenant.id})`);
  await getPool().end();
}

main().catch((err) => {
  console.error("[seed] FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
