import { getDb, getPool, maskDbUrl } from "../lib/db/client";
import { getConversationList, getConversationTranscript } from "../lib/chat-monitor/service";

/**
 * Slice 7 — READ-ONLY Chat Monitor verification for the LAZY split. Proves: the cheap
 * list payload carries masked ids only and NO transcript bodies/counts; it is ordered by
 * last activity; per-conversation transcripts resolve, are masked, and hide system/tool
 * messages; NO raw external_contact_id / session id leaks into either payload; unknown /
 * malformed ids return null (tenant-scoped, IDOR-safe). Also reports list vs transcript
 * timing. Only SELECTs. Run: `npm run db:chat:verify` (needs DATABASE_URL).
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

function isSortedDescByLastAt(items: { lastAt: string | null }[]): boolean {
  for (let i = 1; i < items.length; i++) {
    const a = items[i - 1].lastAt ? Date.parse(items[i - 1].lastAt as string) : -Infinity;
    const b = items[i].lastAt ? Date.parse(items[i].lastAt as string) : -Infinity;
    if (a < b) return false;
  }
  return true;
}

async function main() {
  loadDotEnv();
  const pool = getPool();
  const db = getDb();
  console.log(`[chat:verify] ${maskDbUrl()} (read-only)`);

  const t0 = Date.now();
  const list = await getConversationList(db, pool);
  const listMs = Date.now() - t0;
  console.log(`tenant                 : ${list.tenantName}`);
  console.log(`channel                : ${list.channelLabel}`);
  console.log(`retention              : ${list.retentionLabel}`);
  console.log(`conversations in window: ${list.conversations.length}`);
  console.log(`restricted (out of win): ${list.restrictedCount}`);
  console.log(`LIST timing            : ${listMs}ms (no transcript parsing)`);
  console.log(
    `sample masked contacts : ${list.conversations.slice(0, 5).map((c) => c.maskedContact).join(", ")}`
  );

  // The raw phone / session ids that MUST NOT appear in either payload.
  const raw = await pool.query<{ external_contact_id: string; agno_session_id: string }>(
    `select c.external_contact_id, c.agno_session_id
       from dashboard.app_conversations c
       join dashboard.app_tenants t on t.id = c.tenant_id
      where t.slug = 'pepper-st'`
  );
  const rawIds = new Set<string>();
  for (const r of raw.rows) {
    if (r.external_contact_id) rawIds.add(String(r.external_contact_id));
    if (r.agno_session_id) rawIds.add(String(r.agno_session_id));
  }
  const leaks = (s: string) => [...rawIds].filter((id) => id.length >= 6 && s.includes(id));

  // ---- LIST payload (cheap; no transcripts) ----
  check("conversations are present", list.conversations.length > 0);
  check(
    "LIST items carry NO transcript messages or message counts",
    list.conversations.every(
      (c) => !("messages" in c) && !("transcript" in c) && !("messageCount" in c)
    )
  );
  check("LIST is ordered by last activity (desc)", isSortedDescByLastAt(list.conversations));
  check(
    "every LIST contact is masked",
    list.conversations.every((c) => c.maskedContact.includes("•"))
  );
  check("no raw id leaks in the LIST payload", leaks(JSON.stringify(list)).length === 0);

  // ---- TRANSCRIPT payloads (one fetch per conversation; parses ONE session each) ----
  let slowest = 0;
  let resolved = 0;
  let systemSeen = false;
  let toolSeen = false;
  let transcriptLeaks = 0;
  for (const c of list.conversations) {
    const tt = Date.now();
    const tr = await getConversationTranscript(db, pool, c.id);
    slowest = Math.max(slowest, Date.now() - tt);
    if (!tr) continue;
    resolved++;
    if (leaks(JSON.stringify(tr)).length > 0) transcriptLeaks++;
    if (tr.transcript.messages.some((m) => (m.sender as string) === "system")) systemSeen = true;
    if (tr.transcript.messages.some((m) => m.sender === "tool")) toolSeen = true;
  }
  console.log(`slowest single TRANSCRIPT: ${slowest}ms (parses ONE session)`);
  check("every conversation transcript resolves", resolved === list.conversations.length);
  check("no raw id leaks in any TRANSCRIPT payload", transcriptLeaks === 0);
  check("no system messages shown in transcripts", !systemSeen);
  check("no tool/debug messages shown in transcripts", !toolSeen);

  // ---- IDOR / robustness ----
  const bogus = await getConversationTranscript(db, pool, "00000000-0000-0000-0000-000000000000");
  check("unknown conversation id returns null (tenant-scoped, IDOR-safe)", bogus === null);
  const malformed = await getConversationTranscript(db, pool, "not-a-uuid");
  check("malformed id returns null (no crash)", malformed === null);

  await pool.end();
  console.log(
    failures === 0 ? "\n[chat:verify] ALL CHECKS PASSED" : `\n[chat:verify] ${failures} CHECK(S) FAILED`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("[chat:verify] FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
