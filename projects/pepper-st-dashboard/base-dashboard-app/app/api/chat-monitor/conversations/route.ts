import { NextResponse } from "next/server";
import { getDb, getPool, maskDbUrl } from "@/lib/db/client";
import { getConversationList } from "@/lib/chat-monitor/service";

/**
 * GET /api/chat-monitor/conversations — lazy conversation LIST (Slice 7).
 * Server-only (imports `pg` via the service, so it can never reach the client bundle).
 * Returns a masked, serializable list with NO transcript bodies. Read-only; never writes.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getConversationList(getDb(), getPool(), { withPreview: true });
    return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error(
      "[api/chat-monitor/conversations] failed:",
      maskDbUrl(),
      err instanceof Error ? err.message : err
    );
    return NextResponse.json({ error: "Failed to load conversations." }, { status: 500 });
  }
}
