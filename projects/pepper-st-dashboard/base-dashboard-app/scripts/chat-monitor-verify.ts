import { getDb, getPool, maskDbUrl } from "../lib/db/client";
import { getChatMonitorData } from "../lib/chat-monitor/service";

/**
 * Slice 5 — READ-ONLY Chat Monitor verification. Loads the exact payload the page
 * sends to the client and proves: conversations present, masked contacts, retention
 * label, and (critically) that NO raw external_contact_id / session id leaks into the
 * serialized payload. Only SELECTs. Run: `npm run db:chat:verify` (needs DATABASE_URL).
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
  console.log(`[chat:verify] ${maskDbUrl()} (read-only)`);

  const data = await getChatMonitorData(getDb(), pool);
  console.log(`tenant                 : ${data.tenantName}`);
  console.log(`channel                : ${data.channelLabel}`);
  console.log(`retention              : ${data.retentionLabel}`);
  console.log(`conversations in window: ${data.conversations.length}`);
  console.log(`restricted (out of win): ${data.restrictedCount}`);
  console.log(
    `sample masked contacts : ${data.conversations
      .slice(0, 5)
      .map((c) => c.maskedContact)
      .join(", ")}`
  );

  // The raw phone / session ids that MUST NOT appear in the client payload.
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

  const serialized = JSON.stringify(data);
  const leaked = [...rawIds].filter((id) => id.length >= 6 && serialized.includes(id));

  check("conversations are present", data.conversations.length > 0);
  check(
    "every conversation has a masked contact id",
    data.conversations.every((c) => c.maskedContact.includes("•"))
  );
  check("no raw external_contact_id / session id leaks into the client payload", leaked.length === 0, leaked.length ? `${leaked.length} leaked` : "");
  check(
    "no system messages appear in any transcript",
    !data.conversations.some((c) =>
      c.transcript.messages.some((m) => (m.sender as string) === "system")
    )
  );
  check(
    "no tool/debug messages are shown by default",
    !data.conversations.some((c) => c.transcript.messages.some((m) => m.sender === "tool"))
  );

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
