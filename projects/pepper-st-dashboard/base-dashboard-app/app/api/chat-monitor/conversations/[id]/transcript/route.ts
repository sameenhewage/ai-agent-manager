import { NextResponse } from "next/server";
import { getDb, getPool, maskDbUrl } from "@/lib/db/client";
import { getConversationTranscript } from "@/lib/chat-monitor/service";

/**
 * GET /api/chat-monitor/conversations/[id]/transcript — lazy SINGLE transcript (Slice 7).
 * Parses ONLY the requested conversation (tenant/channel scoped, IDOR-safe), reads
 * `ai.agno_sessions` READ-ONLY, applies retention + masking, never persists. Server-only.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const data = await getConversationTranscript(getDb(), getPool(), id);
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
    return NextResponse.json({ error: "Failed to load transcript." }, { status: 500 });
  }
}
