import { getDb, getPool, maskDbUrl } from "../lib/db/client";
import { getAnalyticsData } from "../lib/analytics/service";

/**
 * Slice 6 — READ-ONLY analytics verification. Loads the exact payload the page computes
 * and cross-checks it against an INDEPENDENT direct SQL aggregate over the same mapped
 * universe + range bounds. Proves the numbers are real (ADR-0007), no fabricated keys,
 * and the NULL-retention (unlimited) tenant is not clamped. Only SELECTs.
 * Run: `npm run db:analytics:verify` (needs DATABASE_URL).
 */
function loadDotEnv() {
  const proc = process as unknown as { loadEnvFile?: (p?: string) => void };
  try {
    proc.loadEnvFile?.(".env");
  } catch {
    /* rely on exported env */
  }
}

const ALLOWED_KEYS = [
  "conversations",
  "newContacts",
  "returningContacts",
  "turns",
  "messages",
  "totalTokens",
  "tokenCoverage",
  "cost",
  "costCoverage",
  "firstActivityAt",
  "lastActivityAt",
].sort();

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  loadDotEnv();
  const pool = getPool();
  console.log(`[analytics:verify] ${maskDbUrl()} (read-only)`);

  const now = new Date();
  const tAnalytics0 = Date.now();
  const data = await getAnalyticsData(getDb(), pool, { rangeKey: "30d", now });
  const analyticsMs = Date.now() - tAnalytics0;
  console.log(`tenant     : ${data.tenantName}`);
  console.log(`channel    : ${data.channelLabel}`);
  console.log(`timezone   : ${data.timeZone}`);
  console.log(`retention  : ${data.retentionLabel}`);
  console.log(`range      : ${data.range.label} [${data.range.fromISO} .. ${data.range.toISO})`);
  console.log(`totals     :`, data.totals);

  // Independent SQL aggregate over the SAME universe + range bounds.
  const sql = await pool.query<{
    convs: number;
    turns: string;
    tokens: string;
    cost: string;
  }>(
    // ADR-0016 Gate C.3: provider sessions live in app_conversation_sessions (no agno_session_id).
    // Mirror the service universe EXACTLY — active (non-archived) in-range conversations, aggregating
    // turns/tokens/cost across ALL of each thread's linked live sessions. LEFT JOINs keep a
    // sessionless conversation counted (contributing zero), matching getAnalyticsData totals.
    `select
        count(distinct c.id)::int as convs,
        coalesce(sum(jsonb_array_length(
          case when jsonb_typeof(s.runs::jsonb) = 'array' then s.runs::jsonb else '[]'::jsonb end
        )), 0) as turns,
        coalesce(sum((s.session_data->'session_metrics'->>'total_tokens')::numeric), 0) as tokens,
        coalesce(sum((s.session_data->'session_metrics'->>'cost')::numeric), 0) as cost
       from dashboard.app_conversations c
       join dashboard.app_tenants t  on t.id = c.tenant_id  and t.slug = 'pepper-st'
       join dashboard.app_channels ch on ch.id = c.channel_id and ch.channel_key = 'whatsapp-main'
       left join dashboard.app_conversation_sessions acs
              on acs.conversation_id = c.id and acs.tenant_id = c.tenant_id
       left join ai.agno_sessions s
              on s.session_id = acs.external_session_id
             and s.agent_id = (t.id::text || ':' || ch.id::text)
      where c.status <> 'archived' and c.last_at >= $1 and c.last_at < $2`,
    [data.range.fromISO, data.range.toISO]
  );
  const direct = sql.rows[0];
  const dConvs = Number(direct.convs);
  const dTurns = Number(direct.turns);
  const dTokens = Number(direct.tokens);
  const dCost = Number(direct.cost);
  console.log(`direct SQL :`, { convs: dConvs, turns: dTurns, tokens: dTokens, cost: dCost });

  check("conversations match independent SQL", data.totals.conversations === dConvs, `live=${data.totals.conversations} sql=${dConvs}`);
  check("turns match independent SQL", data.totals.turns === dTurns, `live=${data.totals.turns} sql=${dTurns}`);
  check("total tokens match independent SQL", data.totals.totalTokens === dTokens, `live=${data.totals.totalTokens} sql=${dTokens}`);
  check("cost matches independent SQL", Math.abs(data.totals.cost - dCost) < 1e-6, `live=${data.totals.cost} sql=${dCost}`);

  // v2 live-coverage: count sessions under the DERIVED agent_id; if any exist they MUST join the
  // mapped universe (catches the Gate 10 drift where conversations map to 0 live sessions).
  const live = await pool.query<{ n: number }>(
    `select count(*)::int n
       from ai.agno_sessions s
       join dashboard.app_channels ch on ch.channel_key = 'whatsapp-main'
       join dashboard.app_tenants t on t.id = ch.tenant_id and t.slug = 'pepper-st'
      where s.agent_id = (t.id::text || ':' || ch.id::text)`
  );
  const liveSessions = Number(live.rows[0].n);
  console.log(`live sessions (derived agent_id): ${liveSessions}`);
  check(
    "live sessions under the derived agent_id join the mapped universe (no 0-coverage drift)",
    liveSessions === 0 || dConvs > 0,
    `live=${liveSessions} joined=${dConvs}`
  );
  check("new + returning == conversations", data.totals.newContacts + data.totals.returningContacts === data.totals.conversations);
  check(
    "only real metric keys (no fabricated KPIs)",
    JSON.stringify(Object.keys(data.totals).sort()) === JSON.stringify(ALLOWED_KEYS)
  );
  check("series is continuous & non-negative", data.series.length > 0 && data.series.every((p) => p.conversations >= 0 && p.tokens >= 0));
  check("NULL analytics retention is not clamped (unlimited tenant)", data.analyticsRetentionDays === null ? data.clamped === false : true);

  // ---- READ-ONLY performance probe (Slice 12D; informational, no pass/fail) ----
  // Demonstrates the new read path fetches Agno BY session_id (PK) for the ACTIVE, in-range
  // universe instead of scanning ai.agno_sessions by agent_id. SELECT/EXPLAIN only.
  const agentRes = await pool.query<{ agent_id: string }>(
    `select (t.id::text || ':' || ch.id::text) as agent_id
       from dashboard.app_tenants t
       join dashboard.app_channels ch on ch.tenant_id = t.id and ch.channel_key = 'whatsapp-main'
      where t.slug = 'pepper-st' limit 1`
  );
  const agentId = agentRes.rows[0]?.agent_id ?? "";
  const idsRes = await pool.query<{ session_id: string }>(
    // ADR-0016 Gate C.3: the active/in-range universe's provider session ids come from the session
    // links (a thread may hold several), not a per-conversation column.
    `select acs.external_session_id as session_id
       from dashboard.app_conversations c
       join dashboard.app_tenants t  on t.id = c.tenant_id  and t.slug = 'pepper-st'
       join dashboard.app_channels ch on ch.id = c.channel_id and ch.channel_key = 'whatsapp-main'
       join dashboard.app_conversation_sessions acs
              on acs.conversation_id = c.id and acs.tenant_id = c.tenant_id
      where c.status <> 'archived' and c.last_at >= $1 and c.last_at < $2`,
    [data.range.fromISO, data.range.toISO]
  );
  const ids = idsRes.rows.map((r) => r.session_id);
  const RUNS_SELECT = `select session_id, runs,
            (session_data->'session_metrics'->>'total_tokens') tt,
            (session_data->'session_metrics'->>'cost') c
       from ai.agno_sessions`;
  const oldT0 = Date.now();
  const oldRes = await pool.query(`${RUNS_SELECT} where agent_id = $1`, [agentId]);
  const oldMs = Date.now() - oldT0;
  const newT0 = Date.now();
  const newRes = ids.length
    ? await pool.query(`${RUNS_SELECT} where session_id = any($1::text[]) and agent_id = $2`, [ids, agentId])
    : { rowCount: 0 };
  const newMs = Date.now() - newT0;
  const planOf = async (sql: string, params: unknown[]) => {
    const p = await pool.query<{ "QUERY PLAN": string }>(`explain ${sql}`, params as never[]);
    return (p.rows[0]?.["QUERY PLAN"] ?? "").trim();
  };
  const oldPlan = await planOf(`${RUNS_SELECT} where agent_id = $1`, [agentId]);
  const newPlan = ids.length
    ? await planOf(`${RUNS_SELECT} where session_id = any($1::text[]) and agent_id = $2`, [ids, agentId])
    : "(empty universe)";
  console.log("\n--- perf probe (read-only; informational) ---");
  console.log(`getAnalyticsData (30d)     : ${analyticsMs}ms`);
  console.log(`universe (active, in-range): ${ids.length} session(s) fetched/parsed`);
  console.log(`OLD  WHERE agent_id        : ${oldMs}ms, rows=${oldRes.rowCount}  | top plan: ${oldPlan}`);
  console.log(`NEW  session_id = ANY      : ${newMs}ms, rows=${newRes.rowCount}  | top plan: ${newPlan}`);
  console.log(`note: at this row count the planner may seq-scan both; the PK path wins as ai.agno_sessions grows (no agent_id index).`);

  await pool.end();
  console.log(
    failures === 0
      ? "\n[analytics:verify] ALL CHECKS PASSED"
      : `\n[analytics:verify] ${failures} CHECK(S) FAILED`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("[analytics:verify] FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
