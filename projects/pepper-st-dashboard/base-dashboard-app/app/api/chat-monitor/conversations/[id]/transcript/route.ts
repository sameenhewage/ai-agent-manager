import { NextResponse } from "next/server";
import { getDb, getPool, maskDbUrl } from "@/lib/db/client";
import { getConversationMessagesPage } from "@/lib/chat-monitor/service";

/**
 * GET /api/chat-monitor/conversations/[id]/transcript?limit=&before= — WhatsApp-like
 * PAGINATED message feed for ONE conversation. Extends the original lazy-transcript route
 * (no duplicate route): parses ONLY the requested conversation (tenant/channel scoped,
 * IDOR-safe), reads `ai.agno_sessions` READ-ONLY, applies retention + masking, never
 * persists. Latest page first; older pages via the OPAQUE `before` cursor. Server-only.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const limitRaw = Number(searchParams.get("limit"));
  const before = searchParams.get("before");
  try {
    const data = await getConversationMessagesPage(getDb(), getPool(), id, {
      limit: Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined,
      before: before ?? null,
    });
    if (!data) {
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }
    return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    console.error(
      "[api/chat-monitor/transcript] failed:",
      maskDbUrl(),
      err instanceof Error ? err.message : err
    );
    return NextResponse.json({ error: "Failed to load messages." }, { status: 500 });
  }
}
