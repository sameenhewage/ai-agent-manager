import { getDb, getPool, maskDbUrl } from "../lib/db/client";
import { syncAllActiveChannels } from "../lib/agno/sync";

/**
 * Slice 4 — Agno -> dashboard mapping sync. Reads `ai.agno_sessions` READ-ONLY and
 * writes ONLY dashboard mapping rows (customers/identities/conversations). Idempotent.
 * Run: `npm run db:agno:sync` (needs DATABASE_URL).
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
  console.log(`[agno:sync] ${maskDbUrl()}`);
  const db = getDb();
  const pool = getPool();
  const results = await syncAllActiveChannels(db, pool);
  // results are counts only — no PII.
  console.log("[agno:sync] results:", JSON.stringify(results, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error("[agno:sync] FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
