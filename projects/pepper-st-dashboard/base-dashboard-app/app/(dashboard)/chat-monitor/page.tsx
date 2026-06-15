import type { Metadata } from "next";
import { MessagesSquare, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/shell/empty-state";
import { Badge } from "@/components/ui/badge";
import { getDb, getPool, maskDbUrl } from "@/lib/db/client";
import { getChatMonitorData } from "@/lib/chat-monitor/service";
import type { ChatMonitorData } from "@/lib/chat-monitor/presenter";
import { ChatMonitor } from "@/components/chat-monitor/chat-monitor";

export const metadata: Metadata = { title: "Chat Monitor" };

// Reads the database at request time (tenant-scoped, live Agno transcript) — never
// prerendered at build, so `next build` never opens a DB connection.
export const dynamic = "force-dynamic";

export default async function ChatMonitorPage() {
  let data: ChatMonitorData | null = null;
  let failed = false;
  try {
    data = await getChatMonitorData(getDb(), getPool());
  } catch (err) {
    failed = true;
    // Mask connection details; never log secrets or raw phone numbers.
    console.error(
      "[chat-monitor] failed to load:",
      maskDbUrl(),
      err instanceof Error ? err.message : err
    );
  }

  return (
    <>
      <PageHeader
        title="Chat Monitor"
        description="Tenant-scoped conversation list and live transcript, read-only from the WhatsApp AI agent."
      >
        <Badge variant="wa">WhatsApp</Badge>
        <Badge variant="ai">Read-only</Badge>
      </PageHeader>

      {failed || !data ? (
        <EmptyState icon={TriangleAlert} title="Couldn&rsquo;t load conversations">
          The conversation index couldn&rsquo;t be loaded right now. Confirm the dashboard
          database is reachable, then refresh. The upstream Agno data is never modified.
        </EmptyState>
      ) : data.conversations.length === 0 ? (
        <EmptyState icon={MessagesSquare} title="No conversations yet">
          Once WhatsApp sessions are mapped for {data.tenantName}, they appear here &mdash;
          read-only and PII-masked. Transcripts are never copied into this dashboard.
        </EmptyState>
      ) : (
        <ChatMonitor data={data} />
      )}
    </>
  );
}
