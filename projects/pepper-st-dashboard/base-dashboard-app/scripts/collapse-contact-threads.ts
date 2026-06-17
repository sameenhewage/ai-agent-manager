import { getPool, maskDbUrl } from "../lib/db/client";
import { maskContactId } from "../lib/agno/mask";

/**
 * Gate C.2 — Contact-thread COLLAPSE (live apply, reversible, dashboard-only).
 *
 * Collapses `dashboard.app_conversations` to ONE row per contact-thread key
 * (tenant_id + channel_id + external_contact_id) using the approved canonical rule, MOVING the
 * provider/session links to the canonical row BEFORE retiring the non-canonical rows (the FK is
 * ON DELETE CASCADE, so links must move first). NEVER touches `ai.*`. NEVER removes
 * `agno_session_id`. Wrapped in ONE transaction with pre/post row-count assertions.
 *
 * Default = DRY-RUN (rolls back, no writes). Pass `--confirm` to APPLY. Pass `--force` to apply
 * even if live counts differ from the Gate C.1-approved expectations (explicit override only).
 *
 *   npm run db:contacts:collapse            # dry-run (read-only effect)
 *   npm run db:contacts:collapse -- --confirm
 */
const CONFIRM = process.argv.includes("--confirm");
const FORCE = process.argv.includes("--force");

// Gate C.1-approved expected impact. If live differs and --force is absent, we STOP.
const EXPECT = { dupGroups: 3, retire: 3, moveLinks: 3 };

function loadDotEnv() {
  const proc = process as unknown as { loadEnvFile?: (path?: string) => void };
  try {
    proc.loadEnvFile?.(".env");
  } catch {
    /* rely on exported env vars */
  }
}

// Approved canonical rule (rn = 1 is canonical): non-archived first, then latest last_at, then id.
const CANON_ORDER = `(status = 'archived')::int, last_at DESC NULLS LAST, id`;

async function main() {
  loadDotEnv();
  const pool = getPool();
  const mode = CONFIRM ? "APPLY (--confirm)" : "DRY-RUN";
  console.log(`[contacts:collapse] ${maskDbUrl()}  mode=${mode}${FORCE ? " --force" : ""}\n`);
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query("set local statement_timeout = '60s'");

    // Snapshot the canonical ranking for the WHOLE table inside the txn (consistent across steps).
    await client.query(
      `create temp table _collapse_ranked on commit drop as
         select id, tenant_id, channel_id, external_contact_id, status, first_at, last_at,
                row_number() over (partition by tenant_id, channel_id, external_contact_id
                  order by ${CANON_ORDER}) as rn,
                first_value(id) over (partition by tenant_id, channel_id, external_contact_id
                  order by ${CANON_ORDER}) as canonical_id
           from dashboard.app_conversations`
    );

    const pre = await client.query<{
      total: number;
      active: number;
      archived: number;
      distinct_keys: number;
      dup_groups: number;
      multi_active: number;
      non_canonical: number;
      links_total: number;
      links_to_move: number;
    }>(
      `select
         (select count(*)::int from dashboard.app_conversations) total,
         (select count(*)::int from dashboard.app_conversations where status <> 'archived') active,
         (select count(*)::int from dashboard.app_conversations where status = 'archived') archived,
         (select count(distinct canonical_id)::int from _collapse_ranked) distinct_keys,
         (select count(*)::int from (select canonical_id from _collapse_ranked
            group by canonical_id having count(*) > 1) d) dup_groups,
         (select count(*)::int from (
            select 1 from dashboard.app_conversations
             group by tenant_id, channel_id, external_contact_id
            having count(*) filter (where status <> 'archived') > 1) m) multi_active,
         (select count(*)::int from _collapse_ranked where rn > 1) non_canonical,
         (select count(*)::int from dashboard.app_conversation_sessions) links_total,
         (select count(*)::int from dashboard.app_conversation_sessions s
            join _collapse_ranked r on r.id = s.conversation_id where r.rn > 1) links_to_move`
    );
    const p = pre.rows[0];
    console.log("Preflight (masked):");
    console.log(`  app_conversations total   : ${p.total}`);
    console.log(`  active / archived         : ${p.active} / ${p.archived}`);
    console.log(`  distinct contact keys     : ${p.distinct_keys}`);
    console.log(`  duplicate groups (n>1)    : ${p.dup_groups}`);
    console.log(`  groups w/ >1 ACTIVE row   : ${p.multi_active}`);
    console.log(`  non-canonical rows        : ${p.non_canonical}`);
    console.log(`  session links (total)     : ${p.links_total}`);
    console.log(`  session links to move     : ${p.links_to_move}\n`);

    const sample = await client.query<{ external_contact_id: string; n: number; n_active: number }>(
      `select external_contact_id, count(*)::int n,
              count(*) filter (where status <> 'archived')::int n_active
         from _collapse_ranked
        group by tenant_id, channel_id, external_contact_id
       having count(*) > 1 order by n desc limit 10`
    );
    if (sample.rows.length) {
      console.log("Groups to collapse (masked):");
      for (const r of sample.rows)
        console.log(`  ${maskContactId(r.external_contact_id)} → ${r.n} rows (${r.n_active} active)`);
      console.log("");
    }

    // SAFETY: never merge two ACTIVE rows (would risk real content loss). Always enforced.
    if (Number(p.multi_active) > 0) {
      await client.query("rollback");
      console.error(`STOP: ${p.multi_active} group(s) have >1 ACTIVE row — refusing to merge active conversations.`);
      process.exit(1);
    }

    // Count gate vs Gate C.1 expectations.
    const mismatch =
      Number(p.dup_groups) !== EXPECT.dupGroups ||
      Number(p.non_canonical) !== EXPECT.retire ||
      Number(p.links_to_move) !== EXPECT.moveLinks;
    if (mismatch && !FORCE) {
      await client.query("rollback");
      console.error(
        `STOP: live counts differ from Gate C.1 expectations ` +
          `(dup_groups=${p.dup_groups}/${EXPECT.dupGroups}, retire=${p.non_canonical}/${EXPECT.retire}, ` +
          `move_links=${p.links_to_move}/${EXPECT.moveLinks}). Re-run with --force only after re-approval.`
      );
      process.exit(1);
    }

    if (!CONFIRM) {
      await client.query("rollback");
      console.log("[contacts:collapse] DRY-RUN complete — NO writes. Re-run with --confirm to apply.");
      process.exit(0);
    }

    // ---- APPLY (inside the transaction) ----
    // 1) Preserve metadata on the canonical row of each COLLAPSING group only (leave clean rows alone).
    const upd = await client.query(
      `with dup as (select canonical_id from _collapse_ranked group by canonical_id having count(*) > 1),
            agg as (
              select r.canonical_id,
                     min(r.first_at) min_first_at, max(r.last_at) max_last_at,
                     bool_or(r.status <> 'archived') has_active,
                     bool_or(r.status = 'resolved') has_resolved
                from _collapse_ranked r join dup using (canonical_id)
               group by r.canonical_id)
       update dashboard.app_conversations c
          set first_at = least(c.first_at, a.min_first_at),
              last_at  = greatest(c.last_at, a.max_last_at),
              status   = case when a.has_active then 'open'
                              when a.has_resolved then 'resolved' else 'archived' end,
              updated_at = now()
         from agg a where c.id = a.canonical_id`
    );

    // 2) Move session links to the canonical row BEFORE deleting (FK is ON DELETE CASCADE).
    const moved = await client.query(
      `update dashboard.app_conversation_sessions s
          set conversation_id = r.canonical_id, updated_at = now()
         from _collapse_ranked r
        where s.conversation_id = r.id and r.rn > 1`
    );

    // 3) Retire the non-canonical rows.
    const del = await client.query(
      `delete from dashboard.app_conversations c
         using _collapse_ranked r where c.id = r.id and r.rn > 1`
    );

    // 4) Post-assert inside the txn — rollback on any violation.
    const post = await client.query<{
      total: number;
      distinct_keys: number;
      dup_groups: number;
      dangling: number;
      links_total: number;
    }>(
      `select
         (select count(*)::int from dashboard.app_conversations) total,
         (select count(*)::int from (select 1 from dashboard.app_conversations
            group by tenant_id, channel_id, external_contact_id) g) distinct_keys,
         (select count(*)::int from (select 1 from dashboard.app_conversations
            group by tenant_id, channel_id, external_contact_id having count(*) > 1) d) dup_groups,
         (select count(*)::int from dashboard.app_conversation_sessions s
            where not exists (select 1 from dashboard.app_conversations c where c.id = s.conversation_id)) dangling,
         (select count(*)::int from dashboard.app_conversation_sessions) links_total`
    );
    const q = post.rows[0];
    const ok =
      Number(q.total) === Number(q.distinct_keys) &&
      Number(q.dup_groups) === 0 &&
      Number(q.dangling) === 0 &&
      Number(q.links_total) === Number(p.links_total);

    console.log("Applied (row counts):");
    console.log(`  metadata rows updated     : ${upd.rowCount}`);
    console.log(`  session links moved       : ${moved.rowCount}`);
    console.log(`  non-canonical rows retired: ${del.rowCount}\n`);
    console.log("Post-assert (masked):");
    console.log(`  app_conversations total   : ${q.total}`);
    console.log(`  distinct contact keys     : ${q.distinct_keys}`);
    console.log(`  duplicate groups          : ${q.dup_groups}  (expect 0)`);
    console.log(`  dangling session links    : ${q.dangling}  (expect 0)`);
    console.log(`  session links (total)     : ${q.links_total}  (expect ${p.links_total}, unchanged)\n`);

    if (!ok) {
      await client.query("rollback");
      console.error("STOP: post-assert FAILED — transaction ROLLED BACK, no changes applied.");
      process.exit(1);
    }

    await client.query("commit");
    console.log("[contacts:collapse] COMMITTED — contact-thread collapse applied (ai.* untouched).");
    process.exit(0);
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      /* ignore */
    }
    console.error("[contacts:collapse] FAILED (rolled back):", err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[contacts:collapse] FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
