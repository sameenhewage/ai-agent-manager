import { getPool, maskDbUrl } from "../lib/db/client";

/**
 * Schema Migration Gate A (ADR-0016) — BACKFILL the provider/Agno session-link layer.
 *
 * For EACH existing `dashboard.app_conversations` row that carries an old `agno_session_id`, create ONE
 * `dashboard.app_conversation_sessions` row that links the same session BY VALUE:
 *   tenant_id           = app_conversations.tenant_id
 *   business_id         = NULL              (app_conversations has no business_id yet — ADR-0015 pending)
 *   conversation_id     = app_conversations.id     (Gate A: keep the existing 1:1 mapping; NO collapse)
 *   provider            = 'agno'
 *   external_session_id = app_conversations.agno_session_id
 *   started_at/last_at  = app_conversations.first_at / last_at
 *
 * SAFETY (Gate A rules):
 *   - Writes ONLY `dashboard.app_conversation_sessions` (INSERT). Never updates/deletes anything.
 *   - NEVER reads/writes `ai.*` (this script does not touch the ai schema at all).
 *   - Does NOT collapse/merge `app_conversations` rows and does NOT drop `agno_session_id`.
 *   - Idempotent: `ON CONFLICT (tenant_id, provider, external_session_id) DO NOTHING` — safe to re-run.
 *   - GUARDED: dry-run by default; pass `--confirm` to actually write.
 *
 * Run (DRY RUN):  npm run db:sessions:backfill
 * Run (APPLY):    npm run db:sessions:backfill -- --confirm     (requires DATABASE_URL; approval-gated)
 */
function loadDotEnv() {
  const proc = process as unknown as { loadEnvFile?: (path?: string) => void };
  try {
    proc.loadEnvFile?.(".env");
  } catch {
    /* rely on exported env vars */
  }
}

const CONFIRM = process.argv.includes("--confirm");

const BACKFILL_SQL = `
  insert into dashboard.app_conversation_sessions
    (tenant_id, business_id, conversation_id, provider, external_session_id, started_at, last_at, created_at, updated_at)
  select c.tenant_id,
         null::uuid           as business_id,
         c.id                 as conversation_id,
         'agno'               as provider,
         c.agno_session_id    as external_session_id,
         c.first_at           as started_at,
         c.last_at            as last_at,
         now()                as created_at,
         now()                as updated_at
    from dashboard.app_conversations c
   where c.agno_session_id is not null
     and c.agno_session_id <> ''
  on conflict (tenant_id, provider, external_session_id) do nothing
`;

async function main() {
  loadDotEnv();
  const pool = getPool();
  console.log(`[sessions:backfill] ${maskDbUrl()} ${CONFIRM ? "(APPLY)" : "(DRY RUN)"}`);

  // ADR-0016 Gate C.3: app_conversations.agno_session_id was REMOVED. This one-time Gate A
  // backfill is complete and retired — the sync now writes provider session links directly.
  // Guard so a post-C.3 run exits clearly instead of failing on the missing column.
  const guard = await pool.query<{ present: boolean }>(
    `select exists(select 1 from information_schema.columns
       where table_schema = 'dashboard' and table_name = 'app_conversations'
         and column_name = 'agno_session_id') as present`
  );
  if (!guard.rows[0].present) {
    console.log(
      "[sessions:backfill] RETIRED — agno_session_id no longer exists (Gate C.3). The backfill is\n" +
        "  complete; provider session links are now written by the sync. No action taken."
    );
    await pool.end();
    process.exit(0);
  }

  // Pre-count (read-only): how many links SHOULD exist vs already exist.
  const pre = await pool.query<{ with_session: number; existing_links: number }>(
    `select
       (select count(*)::int from dashboard.app_conversations
         where agno_session_id is not null and agno_session_id <> '') as with_session,
       (select count(*)::int from dashboard.app_conversation_sessions) as existing_links`
  );
  const { with_session, existing_links } = pre.rows[0];
  console.log(`conversations with agno_session_id : ${with_session}`);
  console.log(`existing session links             : ${existing_links}`);
  console.log(`links to create (max)              : ${Math.max(0, with_session - existing_links)}`);

  if (!CONFIRM) {
    console.log(
      "\n[sessions:backfill] DRY RUN — no rows written. Re-run with `-- --confirm` to APPLY " +
        "(writes dashboard.app_conversation_sessions only; ai.* untouched; idempotent)."
    );
    await pool.end();
    return;
  }

  const res = await pool.query(BACKFILL_SQL);
  console.log(
    `\n[sessions:backfill] INSERTED ${res.rowCount} session link(s) ` +
      "(dashboard.app_conversation_sessions only; no updates/deletes; ai.* untouched)."
  );

  const post = await pool.query<{ links: number }>(
    `select count(*)::int as links from dashboard.app_conversation_sessions`
  );
  console.log(`session links total now            : ${post.rows[0].links}`);
  await pool.end();
}

main().catch((err) => {
  console.error("[sessions:backfill] FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
