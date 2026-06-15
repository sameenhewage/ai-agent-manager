import type { Metadata } from "next";
import { MessagesSquare } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/shell/empty-state";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Chat Monitor" };

export default function ChatMonitorPage() {
  return (
    <>
      <PageHeader
        title="Chat Monitor"
        description="Tenant-scoped conversation list and live transcript, read-only from the WhatsApp AI agent."
      >
        <Badge variant="wa">WhatsApp</Badge>
      </PageHeader>

      <EmptyState icon={MessagesSquare} title="Chat Monitor lands in a later slice">
        The conversation list and live transcript are built in Slice 5, reading
        directly from the Agno session store (read-only, PII-masked). No
        transcripts are duplicated into this dashboard.
      </EmptyState>
    </>
  );
}
