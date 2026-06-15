import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { ChatMonitor } from "@/components/chat-monitor/chat-monitor";

export const metadata: Metadata = { title: "Chat Monitor" };

/**
 * Chat Monitor (Slice 7B) — full-height WORKSPACE shell. The page fills the app frame
 * (h-full) and never grows the document; the client `<ChatMonitor/>` owns two internally
 * scrolling panes (list + transcript). Data is still lazy (list, then the selected
 * transcript) via API routes — the shell holds no DB access and no secrets. The read-only,
 * PII-masked guarantee lives in the header + the per-transcript badge + the topbar pill.
 */
export default function ChatMonitorPage() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader
        title="Chat Monitor"
        description="Tenant-scoped conversations and live, read-only transcripts — contact numbers are masked and nothing is stored in this dashboard."
      >
        <Badge variant="wa">WhatsApp</Badge>
        <Badge variant="ai">Read-only</Badge>
      </PageHeader>

      <ChatMonitor />
    </div>
  );
}
