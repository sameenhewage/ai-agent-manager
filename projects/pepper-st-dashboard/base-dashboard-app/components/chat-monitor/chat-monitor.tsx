"use client";

import * as React from "react";
import {
  ArrowLeft,
  CheckCheck,
  Inbox,
  Loader2,
  Lock,
  MessagesSquare,
  Mic,
  Plus,
  RefreshCw,
  Search,
  Smile,
  TriangleAlert,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { messageAlignment, primaryContactLabel } from "@/lib/chat-monitor/presenter";
import type {
  ConversationListItem,
  ConversationListPayload,
} from "@/lib/chat-monitor/presenter";
import type {
  ChatMessageDto,
  ConversationMessagesPageDto,
  ConversationMessagesState,
} from "@/lib/chat-monitor/message-pagination";
import { createChatInitialLoad, resolveInitialSelection } from "./initial-load";
import { reanchorScrollTop } from "./scroll-anchor";

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

/** Per-conversation chat panel state: the loaded message PAGE(s) + cursor, never the list. */
type ChatState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      messages: ChatMessageDto[];
      hasMoreBefore: boolean;
      beforeCursor: string | null;
      state: ConversationMessagesState;
      loadingOlder: boolean;
    };

// Chat Monitor transcript page size (client). Mirrors the server `DEFAULT_PAGE_SIZE` so the
// initial open and every scroll-up request the latest/older 20 messages — never the whole chat.
const CHAT_MESSAGE_PAGE_SIZE = 20;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const pad = (n: number) => String(n).padStart(2, "0");
const dayKeyUTC = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

function fmtFull(iso: string | null): string {
  if (!iso) return "Unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(
    d.getUTCHours()
  )}:${pad(d.getUTCMinutes())} UTC`;
}

/** WhatsApp-style clock, e.g. "4:51 AM". Deterministic (UTC) to avoid hydration drift. */
function fmtClock(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  let h = d.getUTCHours();
  const m = pad(d.getUTCMinutes());
  const ampm = h >= 12 ? "PM" : "AM";
  h %= 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

/** Centered date-separator label: Today / Yesterday / "16 June 2026" (UTC, client-rendered). */
function fmtDayLabel(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const yd = new Date(now.getTime() - 86_400_000);
  const k = dayKeyUTC(d);
  if (k === dayKeyUTC(now)) return "Today";
  if (k === dayKeyUTC(yd)) return "Yesterday";
  return `${d.getUTCDate()} ${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Compact list timestamp (WhatsApp): time today, "Yesterday", short date this year, else m/d/yy. */
function fmtListStamp(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const yd = new Date(now.getTime() - 86_400_000);
  const k = dayKeyUTC(d);
  if (k === dayKeyUTC(now)) return fmtClock(iso);
  if (k === dayKeyUTC(yd)) return "Yesterday";
  if (d.getUTCFullYear() === now.getUTCFullYear()) return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/${String(d.getUTCFullYear()).slice(2)}`;
}

/** Stable per-contact avatar colour (deterministic from a seed) + clean initials. */
const AVATAR_COLORS = ["#e17076", "#7bc862", "#65aadd", "#a695e7", "#ee7aae", "#6ec9cb", "#f3a85b", "#ef9a9a"];
function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function avatarInitials(name: string): string {
  const out: string[] = [];
  for (const w of name.trim().split(/\s+/).filter(Boolean)) {
    const ch = [...w].find((c) => /[\p{L}\p{N}]/u.test(c));
    if (ch) out.push(ch.toUpperCase());
    if (out.length >= 2) break;
  }
  return out.join("") || "#";
}

export function ChatMonitor() {
  const [list, setList] = React.useState<ListState>({ status: "loading" });
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [mobileView, setMobileView] = React.useState<"list" | "detail">("list");
  const [chats, setChats] = React.useState<Record<string, ChatState>>({});
  const [query, setQuery] = React.useState("");

  const chatsRef = React.useRef(chats);
  React.useEffect(() => {
    chatsRef.current = chats;
  }, [chats]);

  // Synchronous in-flight guard for older-page fetches. The `loadingOlder` flag lives in async
  // React state (committed via the effect above), so rapid scroll events near the top can read a
  // stale `false` and double-fire the SAME older page. This ref is set/cleared synchronously so
  // each older page is fetched exactly ONCE (no repeated requests), independent of render timing.
  const inFlightOlderRef = React.useRef<Set<string>>(new Set());

  // Load the LATEST page of messages for a conversation. Touches ONLY this chat panel's
  // state — the conversation list is never refetched or reset when switching chats.
  const loadChat = React.useCallback(async (id: string, force = false) => {
    const cur = chatsRef.current[id];
    if (!force && cur && cur.status === "ready") return; // cached
    setChats((prev) => ({ ...prev, [id]: { status: "loading" } }));
    try {
      const res = await fetch(
        `/api/chat-monitor/conversations/${id}/transcript?limit=${CHAT_MESSAGE_PAGE_SIZE}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ConversationMessagesPageDto = await res.json();
      setChats((prev) => ({
        ...prev,
        [id]: {
          status: "ready",
          messages: data.messages,
          hasMoreBefore: data.hasMoreBefore,
          beforeCursor: data.beforeCursor,
          state: data.state,
          loadingOlder: false,
        },
      }));
    } catch (e) {
      setChats((prev) => ({
        ...prev,
        [id]: { status: "error", message: e instanceof Error ? e.message : "Failed to load" },
      }));
    }
  }, []);

  // Fetch the previous (older) page via the opaque cursor and PREPEND it (de-duped). The
  // list and the already-loaded messages stay put; the panel keeps the reading position.
  const loadOlder = React.useCallback(async (id: string) => {
    const cur = chatsRef.current[id];
    if (!cur || cur.status !== "ready" || cur.loadingOlder || !cur.hasMoreBefore || !cur.beforeCursor) {
      return;
    }
    if (inFlightOlderRef.current.has(id)) return; // an older-page fetch is already in flight
    inFlightOlderRef.current.add(id);
    setChats((prev) => {
      const c = prev[id];
      return c && c.status === "ready" ? { ...prev, [id]: { ...c, loadingOlder: true } } : prev;
    });
    try {
      const res = await fetch(
        `/api/chat-monitor/conversations/${id}/transcript?limit=${CHAT_MESSAGE_PAGE_SIZE}&before=${encodeURIComponent(
          cur.beforeCursor
        )}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ConversationMessagesPageDto = await res.json();
      setChats((prev) => {
        const c = prev[id];
        if (!c || c.status !== "ready") return prev;
        const seen = new Set(c.messages.map((m) => m.id));
        const older = data.messages.filter((m) => !seen.has(m.id)); // never duplicate
        return {
          ...prev,
          [id]: {
            ...c,
            messages: [...older, ...c.messages],
            hasMoreBefore: data.hasMoreBefore,
            beforeCursor: data.beforeCursor,
            loadingOlder: false,
          },
        };
      });
    } catch {
      setChats((prev) => {
        const c = prev[id];
        return c && c.status === "ready" ? { ...prev, [id]: { ...c, loadingOlder: false } } : prev;
      });
    } finally {
      inFlightOlderRef.current.delete(id);
    }
  }, []);

  // ONE owner of the conversation LIST. Loads the list and AUTO-SELECTS the first conversation
  // (idempotent; never overrides the user's choice). It does NOT load any transcript — that is
  // owned solely by the selected-id effect below, so a list load can never fan out into a
  // duplicate transcript fetch (the original root cause).
  const loadList = React.useCallback(async () => {
    setList({ status: "loading" });
    try {
      const res = await fetch("/api/chat-monitor/conversations", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ConversationListPayload = await res.json();
      setList({ status: "ready", data });
      const first = data.conversations[0]?.id ?? null;
      setSelectedId((prev) => resolveInitialSelection(prev, first));
    } catch (e) {
      setList({ status: "error", message: e instanceof Error ? e.message : "Failed to load" });
    }
  }, []);

  // Single-owner initial-load coordinator (see initial-load.ts). Created once; `loadList` and
  // `loadChat` are stable useCallbacks so capturing them here is safe. This makes the load-once
  // contract testable and immune to React StrictMode's dev double-mount WITHOUT any global
  // request de-dupe.
  const loaderRef = React.useRef<ReturnType<typeof createChatInitialLoad> | null>(null);
  if (loaderRef.current === null) {
    loaderRef.current = createChatInitialLoad({
      loadList: () => void loadList(),
      loadTranscript: (id) => void loadChat(id),
    });
  }

  // ONE owner: the conversation list. The mount effect may run twice (React StrictMode dev) —
  // the coordinator guarantees a single list load.
  React.useEffect(() => {
    loaderRef.current!.ensureListLoaded();
  }, []);

  // ONE owner: the selected transcript. Fires for the auto-selected first conversation AND for
  // user selections; loads each conversation's latest page exactly once.
  React.useEffect(() => {
    loaderRef.current!.ensureTranscriptLoaded(selectedId);
  }, [selectedId]);

  // Selecting a conversation only sets state; the selected-id effect owns the transcript load.
  function openConversation(id: string) {
    setSelectedId(id);
    setMobileView("detail");
  }

  const conversations = list.status === "ready" ? list.data.conversations : [];
  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const selectedChat = selectedId ? chats[selectedId] : undefined;

  const q = query.trim().toLowerCase();
  const visible = q
    ? conversations.filter(
        (c) =>
          (c.displayName ?? "").toLowerCase().includes(q) ||
          c.maskedContact.toLowerCase().includes(q) ||
          (c.lastMessagePreview ?? "").toLowerCase().includes(q)
      )
    : conversations;

  return (
    <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)] gap-4 lg:grid-cols-[340px_1fr]">
      {/* Conversation list */}
      <Card
        className={cn(
          "flex min-h-0 flex-col overflow-hidden",
          mobileView === "detail" && "hidden lg:flex"
        )}
      >
        <CardHeader className="flex-col items-stretch gap-2.5">
          <div className="flex flex-col gap-1">
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
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or message"
              aria-label="Search conversations"
              className="w-full rounded-full border border-line bg-panel2 py-1.5 pl-8 pr-3 text-[12.5px] text-text outline-none placeholder:text-faint focus:border-accent-line"
            />
          </div>
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
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <Search className="size-6 text-faint" />
              <p className="text-[13px] text-muted">No matches for “{query.trim()}”.</p>
            </div>
          ) : (
            <>
              {visible.map((c) => (
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
            key={selected.id}
            item={selected}
            chat={selectedChat}
            onBack={() => setMobileView("list")}
            onRetry={() => {
              if (selectedId) loadChat(selectedId, true);
            }}
            onLoadOlder={() => {
              if (selectedId) loadOlder(selectedId);
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
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex w-full items-center gap-3 border-b border-line2 px-3 py-2.5 text-left transition-colors hover:bg-hover",
        active && "bg-accent-weak hover:bg-accent-weak"
      )}
    >
      <Avatar seed={conversation.id} name={conversation.displayName} size={44} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className={cn(
              "min-w-0 truncate text-[14px] font-semibold text-text",
              !conversation.displayName && "font-mono"
            )}
          >
            {primaryContactLabel(conversation)}
          </span>
          <span className="shrink-0 text-[11px] text-faint">
            {fmtListStamp(conversation.lastMessageAt ?? conversation.lastAt)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1 text-[12.5px] text-muted">
            {conversation.lastMessagePreview ? (
              <>
                {conversation.lastMessageRole === "assistant" ? (
                  <CheckCheck className="size-3.5 shrink-0 text-[var(--wa-tick)]" />
                ) : null}
                <span className="truncate">{conversation.lastMessagePreview}</span>
              </>
            ) : (
              <span className="truncate italic text-faint">No messages yet</span>
            )}
          </span>
          <span className="shrink-0 rounded-full bg-wa-weak px-1.5 py-px text-[10.5px] font-semibold text-wa-deep">
            {conversation.turnCount}
          </span>
        </div>
      </div>
    </button>
  );
}

/** The message bubble nearest the TOP of the scroll viewport + its distance from the viewport
 *  top — a stable anchor for restoring the reading position across an older-page prepend. Reads
 *  layout (not pure); pairs with the pure `reanchorScrollTop`. */
function captureTopAnchor(el: HTMLElement): { id: string; offset: number } | null {
  const containerTop = el.getBoundingClientRect().top;
  const nodes = el.querySelectorAll<HTMLElement>("[data-mid]");
  for (const node of nodes) {
    const offset = node.getBoundingClientRect().top - containerTop;
    if (offset >= 0) return { id: node.dataset.mid ?? "", offset }; // first bubble at/below the top
  }
  return null;
}

/** Find a rendered message bubble by its opaque message id (`data-mid`). */
function findMessageNode(el: HTMLElement, id: string): HTMLElement | null {
  const nodes = el.querySelectorAll<HTMLElement>("[data-mid]");
  for (const node of nodes) if (node.dataset.mid === id) return node;
  return null;
}

function ConversationDetail({
  item,
  chat,
  onBack,
  onRetry,
  onLoadOlder,
}: {
  item: ConversationListItem;
  chat: ChatState | undefined;
  onBack: () => void;
  onRetry: () => void;
  onLoadOlder: () => void;
}) {
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const didInitialScroll = React.useRef(false);
  // Anchor captured the instant an older-page load is triggered: the message nearest the top of
  // the viewport + its distance from the viewport top. Restored ONLY once the prepend lands.
  const anchorRef = React.useRef<{ id: string; offset: number } | null>(null);

  const ready = chat && chat.status === "ready" ? chat : null;
  const messages = ready ? ready.messages : [];

  // Scroll behaviour. Keyed on the MESSAGES array identity ONLY — so the `loadingOlder` spinner
  // toggle (which changes `ready` but NOT `messages`) can never consume the anchor before the real
  // prepend lands. (1) Older prepend: re-anchor the captured message to its previous viewport
  // offset, MEASURED after the DOM updates — immune to the spinner/button/day-separator heights
  // and the browser's own scroll anchoring (WhatsApp-style: the same message stays put, no jump).
  // (2) First load: jump to the bottom (latest messages).
  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const anchor = anchorRef.current;
    if (anchor) {
      anchorRef.current = null;
      // Re-anchor the captured message to its pre-prepend viewport offset. INSTANT (never
      // animated). Two passes: synchronously before paint (so no uncorrected frame is shown)
      // and once on the next frame to absorb any residual layout shift (variable bubble heights
      // / late reflow). Browser scroll-anchoring is disabled on the container (overflow-anchor:
      // none) so nothing fights this correction.
      const correct = () => {
        const node = findMessageNode(el, anchor.id);
        if (!node) return;
        const currentOffset = node.getBoundingClientRect().top - el.getBoundingClientRect().top;
        el.scrollTop = reanchorScrollTop(el.scrollTop, currentOffset, anchor.offset);
      };
      correct();
      const raf = requestAnimationFrame(correct);
      return () => cancelAnimationFrame(raf);
    }
    if (messages.length > 0 && !didInitialScroll.current) {
      el.scrollTop = el.scrollHeight;
      didInitialScroll.current = true;
    }
  }, [messages]);

  // Capture the anchor at the user's CURRENT top-visible message, then start the load. Used by the
  // "Load older messages" button (the scroll path re-captures continuously in handleScroll).
  function beginLoadOlder() {
    const el = scrollRef.current;
    if (el) anchorRef.current = captureTopAnchor(el);
    onLoadOlder();
  }

  function handleScroll() {
    const el = scrollRef.current;
    if (!el || !ready || !ready.hasMoreBefore) return;
    // Keep the anchor pinned to the user's CURRENT top message — continuously WHILE an older page
    // is in flight and they keep scrolling toward the top. The earlier code captured the anchor
    // only at fetch-START (scrollTop ≈ 72); during the async fetch the user scrolls on (often all
    // the way to scrollTop 0), so by the time the prepend landed that anchor was stale and the
    // correction snapped the view back up by ≈ the trigger threshold (the ~70px jump in the
    // video). Re-capturing on every scroll restores where the user ACTUALLY is when it commits.
    if (ready.loadingOlder) {
      anchorRef.current = captureTopAnchor(el);
      return;
    }
    if (el.scrollTop <= 72) beginLoadOlder();
  }

  return (
    <>
      <CardHeader className="gap-2.5 px-3 py-2.5">
        <button
          type="button"
          onClick={onBack}
          className="-ml-1 flex size-7 shrink-0 items-center justify-center rounded-full text-muted hover:bg-hover lg:hidden"
          aria-label="Back to conversations"
        >
          <ArrowLeft className="size-4" />
        </button>
        <Avatar seed={item.id} name={item.displayName} size={40} />
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "truncate text-[14.5px] font-bold leading-tight text-text",
              !item.displayName && "font-mono"
            )}
          >
            {primaryContactLabel(item)}
          </div>
          <div className="truncate text-[11.5px] leading-tight text-muted">
            last seen {fmtFull(item.lastAt)}
          </div>
        </div>
        <Badge variant="wa">WhatsApp</Badge>
        <Badge variant="ai">Read-only</Badge>
      </CardHeader>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        // overflow-anchor: none disables the browser's native scroll anchoring so it can't fight
        // the manual element-anchor correction below (the source of the post-load shift).
        style={{ overflowAnchor: "none" }}
        className="wa-chat-bg min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-6"
      >
        {!chat || chat.status === "loading" ? (
          <TranscriptSkeleton />
        ) : chat.status === "error" ? (
          <InlineError message="This conversation could not be loaded." onRetry={onRetry} />
        ) : chat.state === "restricted" ? (
          <StateBlock
            icon={<Lock className="size-6" strokeWidth={1.9} />}
            title="Outside your retention window"
          >
            This conversation&apos;s most recent activity is older than the tenant&apos;s retention
            limit, so its messages are not available. The upstream Agno session is never modified
            or deleted.
          </StateBlock>
        ) : messages.length === 0 ? (
          <StateBlock
            icon={<MessagesSquare className="size-6" strokeWidth={1.9} />}
            title="No messages in the retention window"
          >
            There are no customer or agent messages to display for this conversation within the
            current window.
          </StateBlock>
        ) : (
          // Full-width thread, bottom-aligned (WhatsApp): rows hug the panel edges — NOT a
          // centered max-width column (that made customer bubbles float mid-panel).
          <div className="flex min-h-full flex-col justify-end">
            {ready && ready.hasMoreBefore ? (
              // Fixed height so the button↔spinner swap never changes layout (no anchor bump).
              <div className="flex h-11 items-center justify-center">
                {ready.loadingOlder ? (
                  <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted">
                    <Loader2 className="size-3.5 animate-spin" /> Loading older messages…
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={beginLoadOlder}
                    className="rounded-full border border-line bg-panel px-3 py-1 text-[11.5px] font-medium text-muted transition-colors hover:bg-hover"
                  >
                    Load older messages
                  </button>
                )}
              </div>
            ) : null}
            {messages.map((m, idx, arr) => {
              const prev = idx > 0 ? arr[idx - 1] : null;
              const showDay =
                !!m.createdAt &&
                (!prev ||
                  !prev.createdAt ||
                  dayKeyUTC(new Date(prev.createdAt)) !== dayKeyUTC(new Date(m.createdAt)));
              const grouped = !!prev && !showDay && prev.role === m.role;
              return (
                <React.Fragment key={m.id}>
                  {showDay ? <DateSeparator label={fmtDayLabel(m.createdAt)} /> : null}
                  <MessageBubble id={m.id} role={m.role} text={m.text} createdAt={m.createdAt} grouped={grouped} />
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      <ReadOnlyComposer turnCount={item.turnCount} lastActivity={fmtFull(item.lastAt)} />
    </>
  );
}

function MessageBubble({
  id,
  role,
  text,
  createdAt,
  grouped,
}: {
  id: string;
  role: "customer" | "assistant";
  text: string;
  createdAt: string | null;
  grouped: boolean;
}) {
  // customer → LEFT (incoming), assistant → RIGHT (outgoing). Full-width row, never centered.
  const { row, outgoing } = messageAlignment(role);
  return (
    // `data-mid` = the scroll anchor used to preserve the reading position on older-page prepend.
    <div data-mid={id} className={cn("flex", row, grouped ? "mt-0.5" : "mt-2")}>
      <div
        className={cn(
          "relative max-w-[80%] rounded-lg px-2.5 py-1.5 text-[13.5px] leading-snug shadow-sm sm:max-w-[72%]",
          outgoing
            ? "bg-[var(--wa-out-bg)] text-[var(--wa-bubble-text)]"
            : "bg-[var(--wa-in-bg)] text-[var(--wa-bubble-text)]",
          !grouped && (outgoing ? "rounded-tr-sm" : "rounded-tl-sm")
        )}
      >
        {/* Floated first so the message text wraps to its left, WhatsApp-style. */}
        <span
          className="float-right ml-2 mt-1 inline-flex translate-y-0.5 select-none items-center gap-0.5 text-[10px] leading-none"
          style={{ color: "var(--wa-bubble-meta)" }}
        >
          {fmtClock(createdAt)}
          {outgoing ? <CheckCheck className="size-3" style={{ color: "var(--wa-tick)" }} /> : null}
        </span>
        <span className="whitespace-pre-wrap break-words">{text}</span>
      </div>
    </div>
  );
}

/** Stable per-contact avatar: coloured initials when a name is known, else a neutral icon. */
function Avatar({ seed, name, size }: { seed: string; name: string | null; size: number }) {
  const initials = name ? avatarInitials(name) : null;
  return (
    <div
      className="flex shrink-0 select-none items-center justify-center rounded-full font-bold text-white"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.36),
        background: initials ? avatarColor(seed) : "var(--faint)",
      }}
      aria-hidden="true"
    >
      {initials ?? <User size={Math.round(size * 0.5)} strokeWidth={2} />}
    </div>
  );
}

function DateSeparator({ label }: { label: string }) {
  if (!label) return null;
  return (
    <div className="my-2 flex justify-center">
      <span
        className="rounded-md px-3 py-1 text-[11px] font-medium uppercase tracking-wide shadow-sm"
        style={{ background: "var(--wa-sep-bg)", color: "var(--wa-sep-text)" }}
      >
        {label}
      </span>
    </div>
  );
}

/** Read-only “composer”: keeps the WhatsApp look while making clear this console never sends.
 *  Also carries the slim ops meta (turns / last activity). */
function ReadOnlyComposer({ turnCount, lastActivity }: { turnCount: number; lastActivity: string }) {
  return (
    <div className="border-t border-line bg-panel px-3 py-2.5">
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 px-1 text-[11px] text-faint">
        <span>{turnCount} turns</span>
        <span aria-hidden="true">·</span>
        <span>last activity {lastActivity}</span>
      </div>
      <div
        className="flex items-center gap-2 rounded-full px-3 py-2"
        style={{ background: "var(--wa-composer)" }}
      >
        <Smile className="size-5 shrink-0 text-faint" />
        <Plus className="size-5 shrink-0 text-faint" />
        <span className="flex flex-1 items-center gap-1.5 truncate text-[12.5px] text-faint">
          <Lock className="size-3.5 shrink-0" /> Read-only — replies are handled in WhatsApp
        </span>
        <Mic className="size-5 shrink-0 text-faint" />
      </div>
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
