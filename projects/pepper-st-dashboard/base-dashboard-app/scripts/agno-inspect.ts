import { eq } from "drizzle-orm";
import { getDb, getPool, maskDbUrl } from "../lib/db/client";
import { maskContactId } from "../lib/agno/mask";
import { appChannels } from "../lib/db/schema";
import { deriveExpectedAgentId } from "../lib/agno/mapping";

/**
 * Slice 4 — READ-ONLY Agno inspect. Summarizes `ai.agno_sessions` with masked
 * identifiers only. Makes no writes. Run: `npm run db:agno:inspect` (needs DATABASE_URL).
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
  const db = getDb();
  const pool = getPool();
  console.log(`[agno:inspect] ${maskDbUrl()} (read-only)`);
  try {
    const total = await pool.query<{ n: number }>("select count(*)::int n from ai.agno_sessions");
    console.log(`total Agno sessions considered : ${total.rows[0].n}`);

    // v2: agent_id is DERIVED "<tenantId>:<channelId>"; report per ACTIVE channel.
    const channels = await db.select().from(appChannels).where(eq(appChannels.isActive, true));
    if (channels.length === 0) console.log("(no active channels configured)");
    for (const c of channels) {
      const agentId = deriveExpectedAgentId(c.tenantId, c.id);
      const matched = await pool.query<{ n: number }>(
        "select count(*)::int n from ai.agno_sessions where agent_id = $1",
        [agentId]
      );
      const sample = await pool.query<{ session_id: string }>(
        "select session_id from ai.agno_sessions where agent_id = $1 order by updated_at desc nulls last limit 5",
        [agentId]
      );
      console.log(`\nchannel '${c.channelKey}' (derived agent_id ${maskContactId(agentId)})`);
      console.log(`  matching live sessions      : ${matched.rows[0].n}`);
      console.log(
        `  sample session ids (MASKED) : ${
          sample.rows.map((r) => maskContactId(String(r.session_id))).join(", ") || "(none)"
        }`
      );
    }
  } catch (err) {
    console.error(
      "[agno:inspect] could not read ai.agno_sessions:",
      err instanceof Error ? err.message : err
    );
    await pool.end();
    process.exit(1);
  }
  await pool.end();
}

main().catch((err) => {
  console.error("[agno:inspect] FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
