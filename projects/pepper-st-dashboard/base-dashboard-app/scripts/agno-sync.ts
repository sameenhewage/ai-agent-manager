import { getDb, getPool, maskDbUrl } from "../lib/db/client";
import { syncConcierge } from "../lib/agno/sync";

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
  const result = await syncConcierge(db, pool);
  // result is counts only — no PII.
  console.log("[agno:sync] result:", JSON.stringify(result, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error("[agno:sync] FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
