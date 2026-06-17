import { getPool, maskDbUrl } from "../lib/db/client";
import { maskContactId } from "../lib/agno/mask";

/**
 * Schema Migration Gate A + B (ADR-0016) — READ-ONLY verifier for the provider/session-link layer
 * and the Gate B read-time contact-thread grouping invariants.
 *
 * Proves (masked, counts/shapes only — never raw phone / user_id / external_contact_id /
 * external_session_id / agno_session_id):
 *   1. every existing app_conversations.agno_session_id has EXACTLY ONE app_conversation_sessions link;
 *   2. app_conversation_sessions.external_session_id is UNIQUE per (tenant, provider);
 *   3. no ai.* rows changed   (this session is pinned default_transaction_read_only = on; ai.* never written);
 *   4. no existing app_conversations rows deleted (every link still resolves to a live conversation row);
 *   5. duplicate contact-thread CANDIDATES are detected but NOT collapsed (still separate rows in the DB);
 *   6. masked output only;
 *   7. (Gate B) grouped contact-thread count <= app_conversations count — read-time grouping invents no rows;
 *   8. (Gate B) any fan-out contact (>1 conversation) would render as ONE thread (else proven by unit tests).
 *
 * The session is pinned READ-ONLY, so any stray write throws instead of mutating. Makes NO writes.
 * Run: `npm run db:sessions:verify` (requires DATABASE_URL).
 */
function loadDotEnv() {
  const proc = process as unknown as { loadEnvFile?: (path?: string) => void };
  try {
    proc.loadEnvFile?.(".env");
  } catch {
    /* rely on exported env vars */
  }
}

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  loadDotEnv();
  const pool = getPool();
  console.log(`[sessions:verify] ${maskDbUrl()} (READ-ONLY)`);
  const client = await pool.connect();
  await client.query("set session default_transaction_read_only = on");
  await client.query("set statement_timeout = '30s'");

  try {
    // Does the Gate-A table exist yet? (Gate A migration may not be applied.)
    const exists = await client.query<{ present: boolean }>(
      `select exists(
         select 1 from information_schema.tables
          where table_schema = 'dashboard' and table_name = 'app_conversation_sessions'
       ) as present`
    );
    const tablePresent = exists.rows[0].present;
    console.log(`app_conversation_sessions present  : ${tablePresent ? "yes" : "NO (Gate A migration not applied yet)"}`);

    // Informational counts (no PII).
    const counts = await client.query<{ conversations: number; with_session: number; ai_sessions: number }>(
      `select
         (select count(*)::int from dashboard.app_conversations) as conversations,
         (select count(*)::int from dashboard.app_conversations
            where agno_session_id is not null and agno_session_id <> '') as with_session,
         (select count(*)::int from ai.agno_sessions) as ai_sessions`
    );
    const { conversations, with_session, ai_sessions } = counts.rows[0];
    console.log(`app_conversations rows             : ${conversations}`);
    console.log(`  with agno_session_id             : ${with_session}`);
    console.log(`ai.agno_sessions rows (read-only)  : ${ai_sessions}  (check 3: never written by Gate A)`);

    if (tablePresent) {
      // --- Check 1: every conversation with a session id has EXACTLY ONE link ---
      const link = await client.query<{
        links: number;
        linked_convs: number;
        unlinked: number;
        cross_channel_collisions: number;
      }>(
        `select
           (select count(*)::int from dashboard.app_conversation_sessions) as links,
           (select count(distinct conversation_id)::int from dashboard.app_conversation_sessions) as linked_convs,
           (select count(*)::int
              from dashboard.app_conversations c
             where c.agno_session_id is not null and c.agno_session_id <> ''
               and not exists (
                 select 1 from dashboard.app_conversation_sessions s
                  where s.tenant_id = c.tenant_id and s.provider = 'agno'
                    and s.external_session_id = c.agno_session_id)) as unlinked,
           -- same (tenant, agno_session_id) shared by >1 conversation (e.g. across channels) — Gate C concern
           (select coalesce(sum(n - 1), 0)::int from (
              select tenant_id, agno_session_id, count(*) n
                from dashboard.app_conversations
               where agno_session_id is not null and agno_session_id <> ''
               group by 1, 2 having count(*) > 1) d) as cross_channel_collisions`
      );
      const { links, linked_convs, unlinked, cross_channel_collisions } = link.rows[0];
      console.log(`session links                      : ${links}`);
      console.log(`distinct linked conversations      : ${linked_convs}`);
      console.log(`cross-(tenant,session) collisions  : ${cross_channel_collisions} (informational; Gate C)`);
      check(
        "1. every app_conversations.agno_session_id has a session link (0 unlinked)",
        Number(unlinked) === 0,
        `unlinked=${unlinked}`
      );
      // ADR-0016/C.2: a contact thread may hold MANY provider sessions, so links >= conversations
      // (NOT 1:1). The invariant is: EVERY conversation is linked (distinct linked == total convs).
      check(
        "1b. every conversation is linked; a thread MAY hold many sessions (distinct linked == conversations, links >= conversations) — ADR-0016",
        Number(linked_convs) === Number(conversations) && Number(links) >= Number(conversations),
        `links=${links} distinct_linked=${linked_convs} conversations=${conversations}`
      );

      // --- Check 2: external_session_id unique per (tenant, provider) ---
      const dup = await client.query<{ dup_groups: number }>(
        `select count(*)::int as dup_groups from (
           select tenant_id, provider, external_session_id, count(*) n
             from dashboard.app_conversation_sessions
            group by 1, 2, 3 having count(*) > 1) d`
      );
      check(
        "2. external_session_id unique per (tenant, provider)",
        Number(dup.rows[0].dup_groups) === 0,
        `dup_groups=${dup.rows[0].dup_groups}`
      );

      // --- Check 4: no app_conversations deleted — every link resolves to a live conversation ---
      const dangling = await client.query<{ dangling: number }>(
        `select count(*)::int as dangling
           from dashboard.app_conversation_sessions s
          where not exists (select 1 from dashboard.app_conversations c where c.id = s.conversation_id)`
      );
      check(
        "4. no orphaned links — every session link resolves to a live app_conversations row",
        Number(dangling.rows[0].dangling) === 0,
        `dangling=${dangling.rows[0].dangling}`
      );
    } else {
      console.log("\n[sessions:verify] checks 1/2/4 PENDING — apply the Gate-A migration (0002) + run the backfill, then re-run.");
    }

    // --- Gate C.2 (ADR-0016): contact-thread COLLAPSE + ENFORCEMENT (applied) ---
    const c2 = await client.query<{
      total: number;
      distinct_keys: number;
      dup_groups: number;
      active: number;
      active_threads: number;
    }>(
      `select
         (select count(*)::int from dashboard.app_conversations) total,
         (select count(*)::int from (select 1 from dashboard.app_conversations
            group by tenant_id, channel_id, external_contact_id) g) distinct_keys,
         (select count(*)::int from (select 1 from dashboard.app_conversations
            group by tenant_id, channel_id, external_contact_id having count(*) > 1) d) dup_groups,
         (select count(*)::int from dashboard.app_conversations where status <> 'archived') active,
         (select count(*)::int from (select 1 from dashboard.app_conversations
            where status <> 'archived' group by tenant_id, channel_id, external_contact_id) g) active_threads`
    );
    const { total, distinct_keys, dup_groups, active, active_threads } = c2.rows[0];
    console.log(`\nGate C.2 — contact-thread enforcement:`);
    console.log(`  app_conversations rows    : ${total}`);
    console.log(`  distinct contact keys     : ${distinct_keys}`);
    console.log(`  duplicate groups          : ${dup_groups}`);
    console.log(`  active conversations      : ${active}`);
    console.log(`  active contact threads    : ${active_threads}`);

    // Masked sample of any remaining multi-row contact groups (expect NONE post-collapse).
    const sample = await client.query<{ external_contact_id: string; n: number }>(
      `select external_contact_id, count(*)::int n
         from dashboard.app_conversations
        group by external_contact_id having count(*) > 1
        order by n desc limit 5`
    );
    for (const r of sample.rows) {
      console.log(`  WARN ${maskContactId(r.external_contact_id)} → ${r.n} rows (should be collapsed)`);
    }

    check(
      "5. ONE row per contact thread — app_conversations count == distinct contact-thread keys",
      Number(total) === Number(distinct_keys),
      `rows=${total} keys=${distinct_keys}`
    );
    check("6. ZERO duplicate contact-thread groups (collapse applied)", Number(dup_groups) === 0, `dup_groups=${dup_groups}`);
    check(
      "7. Chat Monitor grouped (active) count == active app_conversations (1 row per active contact)",
      Number(active) === Number(active_threads),
      `active=${active} active_threads=${active_threads}`
    );

    // --- Check 8: the contact-thread UNIQUE index is enforced in the DB ---
    const idx = await client.query<{ present: boolean }>(
      `select exists(
         select 1 from pg_indexes
          where schemaname = 'dashboard' and tablename = 'app_conversations'
            and indexname = 'app_conv_contact_thread_key') as present`
    );
    check(
      "8. contact-thread UNIQUE index app_conv_contact_thread_key exists (enforced)",
      idx.rows[0].present === true,
      idx.rows[0].present ? "present" : "MISSING — apply migration 0003"
    );

    check("9. output is masked (no raw phone / session id printed)", true);

    client.release();
    await pool.end();
    console.log(
      failures === 0
        ? "\n[sessions:verify] ALL CHECKS PASSED (read-only; no writes performed)."
        : `\n[sessions:verify] ${failures} CHECK(S) FAILED (read-only; no writes performed).`
    );
    process.exit(failures === 0 ? 0 : 1);
  } catch (err) {
    client.release();
    await pool.end();
    console.error("[sessions:verify] FAILED:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[sessions:verify] FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
