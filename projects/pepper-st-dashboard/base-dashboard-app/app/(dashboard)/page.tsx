import { MessagesSquare, Activity, Coins, Wallet, Info } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/shell/empty-state";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Slice 1 is the shell only. These are layout placeholders — NO fabricated
 * metrics. Real values are wired in after the schema (Slice 2–3) and the Agno
 * read service (Slice 4) land.
 */
const PLACEHOLDER_METRICS = [
  { label: "Conversations", icon: MessagesSquare },
  { label: "Messages", icon: Activity },
  { label: "Total tokens", icon: Coins },
  { label: "Est. cost", icon: Wallet },
];

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Operations overview for the PEPPER ST. WhatsApp AI agent. This is the application shell — live data connects in later slices."
      >
        <Badge variant="ai">Shell preview</Badge>
      </PageHeader>

      <div className="mb-4 flex items-start gap-3 rounded-lg border border-line bg-panel px-4 py-3 shadow-card">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-ai-weak text-ai">
          <Info className="size-[15px]" strokeWidth={2} />
        </span>
        <p className="text-[13px] text-muted">
          <span className="font-semibold text-text">
            This is the app shell.
          </span>{" "}
          Conversations, analytics and headline metrics connect in later slices
          (schema &rarr; seed &rarr; Agno read service). Nothing is fetched,
          stored, or fabricated on this screen.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {PLACEHOLDER_METRICS.map(({ label, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="relative">
              <div className="text-[11.5px] font-semibold text-muted">
                {label}
              </div>
              <div className="mt-2 text-[23px] font-extrabold tracking-[-0.02em] text-faint">
                &mdash;
              </div>
              <div className="mt-1.5">
                <Badge>Awaiting data</Badge>
              </div>
              <span className="absolute right-3.5 top-3.5 flex size-[30px] items-center justify-center rounded-[9px] bg-accent-weak text-accent">
                <Icon className="size-[15px]" strokeWidth={2} />
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Recent conversations</CardTitle>
            <CardDescription>Live from WhatsApp · read-only</CardDescription>
          </CardHeader>
          <CardContent>
            <EmptyState icon={MessagesSquare} title="No conversations yet">
              The conversation feed renders live from the Agno session store
              once the read service lands (Slice 4&ndash;5). Transcripts are
              never copied into this dashboard.
            </EmptyState>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
            <CardDescription>Volume · turns · tokens · cost</CardDescription>
          </CardHeader>
          <CardContent>
            <EmptyState icon={Activity} title="Awaiting data">
              Real, date-filtered metrics appear after Analytics (Slice 6),
              computed in the tenant timezone.
            </EmptyState>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
