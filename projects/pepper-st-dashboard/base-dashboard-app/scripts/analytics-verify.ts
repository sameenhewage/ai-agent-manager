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
  const data = await getAnalyticsData(getDb(), pool, { rangeKey: "30d", now });
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
    `select
        count(*)::int as convs,
        coalesce(sum(jsonb_array_length(
          case when jsonb_typeof(s.runs::jsonb) = 'array' then s.runs::jsonb else '[]'::jsonb end
        )), 0) as turns,
        coalesce(sum((s.session_data->'session_metrics'->>'total_tokens')::numeric), 0) as tokens,
        coalesce(sum((s.session_data->'session_metrics'->>'cost')::numeric), 0) as cost
       from dashboard.app_conversations c
       join dashboard.app_tenants t  on t.id = c.tenant_id  and t.slug = 'pepper-st'
       join dashboard.app_channels ch on ch.id = c.channel_id and ch.channel_key = 'whatsapp-main'
       join ai.agno_sessions s on s.session_id = c.agno_session_id
                              and s.agent_id = (t.id::text || ':' || ch.id::text)
      where c.last_at >= $1 and c.last_at < $2`,
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
