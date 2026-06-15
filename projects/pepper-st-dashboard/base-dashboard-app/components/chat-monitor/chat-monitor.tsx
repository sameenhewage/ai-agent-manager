"use client";

import * as React from "react";
import {
  ArrowLeft,
  Bot,
  Clock,
  Hash,
  Inbox,
  Lock,
  MessageSquare,
  MessagesSquare,
  RefreshCw,
  TriangleAlert,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  ConversationListItem,
  ConversationListPayload,
  TranscriptPayload,
} from "@/lib/chat-monitor/presenter";

/**
 * Chat Monitor (Slice 7) — CLIENT component. The page shell paints instantly; this
 * component LAZILY fetches the conversation list, then the selected transcript, each with
 * its own loading / error / retry state. It never parses transcripts and never sees raw
 * ids — the server endpoints return masked, retention-applied, serializable JSON only.
 */

type ListState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: ConversationListPayload };

type TranscriptState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: TranscriptPayload };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

/** Deterministic UTC formatting (same on server + client) to avoid hydration drift. */
function fmtShort(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
function fmtFull(iso: string | null): string {
  if (!iso) return "Unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(
    d.getUTCHours()
  )}:${pad(d.getUTCMinutes())} UTC`;
}

export function ChatMonitor() {
  const [list, setList] = React.useState<ListState>({ status: "loading" });
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [mobileView, setMobileView] = React.useState<"list" | "detail">("list");
  const [transcripts, setTranscripts] = React.useState<Record<string, TranscriptState>>({});

  const transcriptsRef = React.useRef(transcripts);
  React.useEffect(() => {
    transcriptsRef.current = transcripts;
  }, [transcripts]);

  const loadTranscript = React.useCallback(async (id: string, force = false) => {
    const cur = transcriptsRef.current[id];
    if (!force && cur && cur.status === "ready") return; // cached
    setTranscripts((prev) => ({ ...prev, [id]: { status: "loading" } }));
    try {
      const res = await fetch(`/api/chat-monitor/conversations/${id}/transcript`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: TranscriptPayload = await res.json();
      setTranscripts((prev) => ({ ...prev, [id]: { status: "ready", data } }));
    } catch (e) {
      setTranscripts((prev) => ({
        ...prev,
        [id]: { status: "error", message: e instanceof Error ? e.message : "Failed to load" },
      }));
    }
  }, []);

  const loadList = React.useCallback(async () => {
    setList({ status: "loading" });
    try {
      const res = await fetch("/api/chat-monitor/conversations", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ConversationListPayload = await res.json();
      setList({ status: "ready", data });
      const first = data.conversations[0]?.id ?? null;
      setSelectedId((prev) => prev ?? first);
      if (first) loadTranscript(first);
    } catch (e) {
      setList({ status: "error", message: e instanceof Error ? e.message : "Failed to load" });
    }
  }, [loadTranscript]);

  React.useEffect(() => {
    loadList();
  }, [loadList]);

  function openConversation(id: string) {
    setSelectedId(id);
    setMobileView("detail");
    loadTranscript(id);
  }

  const conversations = list.status === "ready" ? list.data.conversations : [];
  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const selectedTranscript = selectedId ? transcripts[selectedId] : undefined;

  return (
    <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-4 lg:grid-cols-[340px_1fr]">
      {/* Conversation list */}
      <Card
        className={cn(
          "flex min-h-0 flex-col overflow-hidden",
          mobileView === "detail" && "hidden lg:flex"
        )}
      >
        <CardHeader className="flex-col items-start gap-1">
          <CardTitle>
            <Inbox className="text-accent" /> Conversations
          </CardTitle>
          <CardDescription>
            {list.status === "ready"
              ? `${conversations.length} in window · ${list.data.channelLabel} · retention ${list.data.retentionLabel}`
              : list.status === "loading"
                ? "Loading\u2026"
                : "Couldn\u2019t load"}
          </CardDescription>
        </CardHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {list.status === "loading" ? (
            <ListSkeleton />
          ) : list.status === "error" ? (
            <InlineError message="The conversation list could not be loaded." onRetry={loadList} />
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <MessagesSquare className="size-6 text-faint" />
              <p className="text-[13px] text-muted">No conversations yet.</p>
            </div>
          ) : (
            <>
              {conversations.map((c) => (
                <ConversationRow
                  key={c.id}
                  conversation={c}
                  active={selected?.id === c.id}
                  onClick={() => openConversation(c.id)}
                />
              ))}
              {list.data.restrictedCount > 0 ? (
                <div className="flex items-center gap-2 border-t border-line px-4 py-3 text-[12px] text-faint">
                  <Lock className="size-3.5" />
                  {list.data.restrictedCount} conversation{list.data.restrictedCount === 1 ? "" : "s"} outside
                  your retention window.
                </div>
              ) : null}
            </>
          )}
        </div>
      </Card>

      {/* Conversation detail / transcript */}
      <Card
        className={cn(
          "flex min-h-0 flex-col overflow-hidden",
          mobileView === "list" && "hidden lg:flex"
        )}
      >
        {selected ? (
          <ConversationDetail
            item={selected}
            transcriptState={selectedTranscript}
            onBack={() => setMobileView("list")}
            onRetry={() => {
              if (selectedId) loadTranscript(selectedId, true);
            }}
          />
        ) : list.status === "loading" ? (
          <DetailSkeleton />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="flex size-12 items-center justify-center rounded-lg bg-accent-weak text-accent">
              <MessagesSquare className="size-6" strokeWidth={1.9} />
            </div>
            <div className="text-[15px] font-bold">Select a conversation</div>
            <p className="max-w-[360px] text-[13px] text-muted">
              Choose a conversation from the list to read its live transcript.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

function ConversationRow({
  conversation,
  active,
  onClick,
}: {
  conversation: ConversationListItem;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full flex-col gap-1 border-b border-line px-4 py-3 text-left transition-colors hover:bg-hover",
        active && "bg-accent-weak hover:bg-accent-weak"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[13px] font-bold text-text">{conversation.maskedContact}</span>
        <span className="text-[11px] text-faint">{fmtShort(conversation.lastAt)}</span>
      </div>
      <div className="flex items-center gap-3 text-[11.5px] text-muted">
        <span className="inline-flex items-center gap-1">
          <Hash className="size-3" /> {conversation.turnCount} turn{conversation.turnCount === 1 ? "" : "s"}
        </span>
      </div>
    </button>
  );
}

function ConversationDetail({
  item,
  transcriptState,
  onBack,
  onRetry,
}: {
  item: ConversationListItem;
  transcriptState: TranscriptState | undefined;
  onBack: () => void;
  onRetry: () => void;
}) {
  const tv =
    transcriptState && transcriptState.status === "ready" ? transcriptState.data.transcript : null;
  return (
    <>
      <CardHeader className="flex-col items-stretch gap-2">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBack}
            className="flex size-7 items-center justify-center rounded-lg text-muted hover:bg-hover lg:hidden"
            aria-label="Back to conversations"
          >
            <ArrowLeft className="size-4" />
          </button>
          <span className="font-mono text-[15px] font-extrabold text-text">{item.maskedContact}</span>
          <Badge variant="wa">WhatsApp</Badge>
          <Badge variant="ai">Read-only</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" /> Last activity {fmtFull(tv?.lastActivityAt ?? item.lastAt)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Hash className="size-3" /> {tv ? tv.turnCount : item.turnCount} turns
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="size-3" /> {tv ? `${tv.messageCount} messages` : "\u2026 messages"}
          </span>
        </div>
      </CardHeader>

      <div className="min-h-0 flex-1 overflow-y-auto bg-panel2 p-4">
        {!transcriptState || transcriptState.status === "loading" ? (
          <TranscriptSkeleton />
        ) : transcriptState.status === "error" ? (
          <InlineError message="This transcript could not be loaded." onRetry={onRetry} />
        ) : tv && tv.state === "restricted" ? (
          <StateBlock
            icon={<Lock className="size-6" strokeWidth={1.9} />}
            title="Outside your retention window"
          >
            This conversation&apos;s most recent activity is older than the tenant&apos;s retention
            limit, so its transcript is not available. The upstream Agno session is never modified
            or deleted.
          </StateBlock>
        ) : tv && tv.state === "empty" ? (
          <StateBlock
            icon={<MessagesSquare className="size-6" strokeWidth={1.9} />}
            title="No messages in the retention window"
          >
            There are no customer or agent messages to display for this conversation within the
            current window.
          </StateBlock>
        ) : (
          <div className="flex flex-col gap-3">
            {(tv?.messages ?? []).map((m, idx) => (
              <MessageBubble key={m.id ?? `m-${idx}`} sender={m.sender} content={m.content} at={m.at} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function MessageBubble({
  sender,
  content,
  at,
}: {
  sender: "customer" | "bot" | "tool";
  content: string;
  at: string | null;
}) {
  const isBot = sender === "bot";
  return (
    <div className={cn("flex flex-col gap-1", isBot ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed shadow-sm",
          isBot
            ? "rounded-br-md bg-ai text-[var(--on-ai)]"
            : "rounded-bl-md border border-line bg-panel text-text"
        )}
      >
        <div className="mb-0.5 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide opacity-75">
          {isBot ? <Bot className="size-3" /> : <User className="size-3" />}
          {isBot ? "AI agent" : "Customer"}
        </div>
        <div className="whitespace-pre-wrap break-words">{content}</div>
      </div>
      <span className="px-1 text-[10.5px] text-faint">{fmtShort(at)}</span>
    </div>
  );
}

function StateBlock({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div className="flex size-12 items-center justify-center rounded-lg bg-accent-weak text-accent">
        {icon}
      </div>
      <div className="text-[15px] font-bold">{title}</div>
      <p className="max-w-[420px] text-[13px] leading-relaxed text-muted">{children}</p>
    </div>
  );
}

/* ---- Loading / error states (Slice 7) ------------------------------------- */

function ListSkeleton() {
  return (
    <div className="flex flex-col" aria-busy="true" aria-label="Loading conversations">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2 border-b border-line px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="h-3.5 w-24 animate-pulse rounded bg-hover" />
            <div className="h-3 w-12 animate-pulse rounded bg-hover" />
          </div>
          <div className="h-3 w-16 animate-pulse rounded bg-hover" />
        </div>
      ))}
    </div>
  );
}

function TranscriptSkeleton() {
  const rows: { w: string; end: boolean }[] = [
    { w: "58%", end: false },
    { w: "72%", end: true },
    { w: "46%", end: false },
    { w: "66%", end: true },
    { w: "52%", end: false },
  ];
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading transcript">
      {rows.map((r, i) => (
        <div key={i} className={cn("flex", r.end ? "justify-end" : "justify-start")}>
          <div className="h-14 animate-pulse rounded-2xl bg-hover" style={{ width: r.w }} />
        </div>
      ))}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <>
      <CardHeader className="flex-col items-stretch gap-2">
        <div className="h-4 w-40 animate-pulse rounded bg-hover" />
        <div className="h-3 w-56 animate-pulse rounded bg-hover" />
      </CardHeader>
      <div className="min-h-0 flex-1 bg-panel2 p-4">
        <TranscriptSkeleton />
      </div>
    </>
  );
}

function InlineError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex size-12 items-center justify-center rounded-lg bg-warn-weak text-warn">
        <TriangleAlert className="size-6" strokeWidth={1.9} />
      </div>
      <div className="text-[15px] font-bold">Something went wrong</div>
      <p className="max-w-[360px] text-[13px] text-muted">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-1.5 text-[12.5px] font-semibold text-text transition-colors hover:bg-hover"
      >
        <RefreshCw className="size-3.5" /> Retry
      </button>
    </div>
  );
}
