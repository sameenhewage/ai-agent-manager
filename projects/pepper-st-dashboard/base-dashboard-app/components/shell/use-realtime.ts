"use client";

import * as React from "react";
import { parseRealtimeMessage, type RealtimeEvent } from "@/lib/realtime/events";

/**
 * Slice 12F (ADR-0014 §1/§6) — client realtime hook. Opens ONE `EventSource` to
 * `/api/events/stream`, re-validates every frame through `parseRealtimeMessage` (the client trusts
 * nothing), and forwards safe events to `onEvent`. `EventSource` auto-reconnects, so a dropped
 * connection self-heals. The latest `onEvent` is held in a ref so a parent re-render never tears
 * down / reopens the stream. SSR/no-EventSource environments are a no-op.
 */
export type RealtimeStatus = "connecting" | "open";

const STREAM_URL = "/api/events/stream";

export function useRealtime(
  onEvent: (event: RealtimeEvent) => void,
  opts: { enabled?: boolean; url?: string } = {}
): { status: RealtimeStatus } {
  const { enabled = true, url = STREAM_URL } = opts;
  const onEventRef = React.useRef(onEvent);
  onEventRef.current = onEvent;
  const [status, setStatus] = React.useState<RealtimeStatus>("connecting");

  React.useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined" || typeof EventSource === "undefined") return;

    const es = new EventSource(url);
    es.onopen = () => setStatus("open");
    es.onmessage = (ev: MessageEvent<string>) => {
      const event = parseRealtimeMessage(ev.data);
      if (event) onEventRef.current(event);
    };
    es.onerror = () => {
      // EventSource reconnects on its own; reflect the transient drop without tearing down.
      setStatus("connecting");
    };
    return () => {
      es.close();
    };
  }, [enabled, url]);

  return { status };
}
