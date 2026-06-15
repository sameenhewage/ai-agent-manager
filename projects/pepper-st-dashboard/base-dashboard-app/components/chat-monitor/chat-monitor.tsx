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
  ShieldCheck,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ChatMonitorConversation, ChatMonitorData } from "@/lib/chat-monitor/presenter";

/**
 * Chat Monitor (Slice 5) — CLIENT component. Handles only interaction state
 * (which conversation is selected + the mobile panel toggle). All data is already
 * server-fetched, masked, retention-applied and serializable; no DB access, no
 * secrets, and no raw contact/session ids reach this layer.
 */

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

export function ChatMonitor({ data }: { data: ChatMonitorData }) {
  const [selectedId, setSelectedId] = React.useState<string | null>(
    data.conversations[0]?.id ?? null
  );
  const [mobileView, setMobileView] = React.useState<"list" | "detail">("list");

  const selected =
    data.conversations.find((c) => c.id === selectedId) ?? data.conversations[0] ?? null;

  function openConversation(id: string) {
    setSelectedId(id);
    setMobileView("detail");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 rounded-lg border border-ai-line bg-ai-weak px-4 py-3">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-panel text-ai">
          <ShieldCheck className="size-[15px]" strokeWidth={2} />
        </span>
        <p className="text-[13px] text-muted">
          <span className="font-semibold text-text">Read-only.</span> Transcripts render
          live from the WhatsApp AI agent and are <span className="font-semibold">never stored</span>{" "}
          in this dashboard. Contact numbers are masked. Retention window:{" "}
          <span className="font-mono text-text">{data.retentionLabel}</span>.
        </p>
      </div>

      <div className="grid gap-4 lg:h-[calc(100vh-230px)] lg:min-h-[520px] lg:grid-cols-[340px_1fr]">
        {/* Conversation list */}
        <Card
          className={cn(
            "flex flex-col overflow-hidden max-lg:max-h-[75vh]",
            mobileView === "detail" && "hidden lg:flex"
          )}
        >
          <CardHeader className="flex-col items-start gap-1">
            <CardTitle>
              <Inbox className="text-accent" /> Conversations
            </CardTitle>
            <CardDescription>
              {data.conversations.length} in window · {data.channelLabel}
            </CardDescription>
          </CardHeader>

          <div className="flex-1 overflow-y-auto">
            {data.conversations.map((c) => (
              <ConversationRow
                key={c.id}
                conversation={c}
                active={selected?.id === c.id}
                onClick={() => openConversation(c.id)}
              />
            ))}
            {data.restrictedCount > 0 ? (
              <div className="flex items-center gap-2 border-t border-line px-4 py-3 text-[12px] text-faint">
                <Lock className="size-3.5" />
                {data.restrictedCount} conversation{data.restrictedCount === 1 ? "" : "s"} outside
                your retention window.
              </div>
            ) : null}
          </div>
        </Card>

        {/* Conversation detail / transcript */}
        <Card
          className={cn(
            "flex flex-col overflow-hidden max-lg:min-h-[60vh]",
            mobileView === "list" && "hidden lg:flex"
          )}
        >
          {selected ? (
            <ConversationDetail
              conversation={selected}
              onBack={() => setMobileView("list")}
            />
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
    </div>
  );
}

function ConversationRow({
  conversation,
  active,
  onClick,
}: {
  conversation: ChatMonitorConversation;
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
        <span className="inline-flex items-center gap-1">
          <MessageSquare className="size-3" /> {conversation.messageCount} msg
        </span>
      </div>
    </button>
  );
}

function ConversationDetail({
  conversation,
  onBack,
}: {
  conversation: ChatMonitorConversation;
  onBack: () => void;
}) {
  const { transcript } = conversation;
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
          <span className="font-mono text-[15px] font-extrabold text-text">
            {conversation.maskedContact}
          </span>
          <Badge variant="wa">WhatsApp</Badge>
          <Badge variant="ai">Read-only</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px] text-muted">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" /> Last activity {fmtFull(transcript.lastActivityAt ?? conversation.lastAt)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Hash className="size-3" /> {transcript.turnCount} turns
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="size-3" /> {transcript.messageCount} messages
          </span>
        </div>
      </CardHeader>

      <div className="flex-1 overflow-y-auto bg-panel2 p-4">
        {transcript.state === "restricted" ? (
          <StateBlock
            icon={<Lock className="size-6" strokeWidth={1.9} />}
            title="Outside your retention window"
          >
            This conversation&apos;s most recent activity is older than the tenant&apos;s retention
            limit, so its transcript is not available. The upstream Agno session is never modified
            or deleted.
          </StateBlock>
        ) : transcript.state === "empty" ? (
          <StateBlock
            icon={<MessagesSquare className="size-6" strokeWidth={1.9} />}
            title="No messages in the retention window"
          >
            There are no customer or agent messages to display for this conversation within the
            current window.
          </StateBlock>
        ) : (
          <div className="flex flex-col gap-3">
            {transcript.messages.map((m, idx) => (
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
