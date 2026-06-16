import { getEventBus } from "@/lib/realtime/bus";
import { toSseData } from "@/lib/realtime/events";

/**
 * GET /api/events/stream — the Slice 12F realtime transport (ADR-0014 §1). A long-lived
 * Server-Sent Events stream: one-way, read-only, auto-reconnecting (`EventSource`). It subscribes
 * the connection to the in-process event bus and writes each SAFE event as `data: <json>`; an
 * unsafe event throws in `toSseData` and is dropped (never streamed). A `: ping` heartbeat keeps
 * proxies from closing idle connections. On client disconnect (`req.signal` abort / stream cancel)
 * the subscription + heartbeat are torn down so nothing leaks.
 *
 * Node runtime (the bus singleton + the detector live in-process); never cached.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const fetchCache = "force-no-store";

const HEARTBEAT_MS = 25_000;

export async function GET(req: Request) {
  const bus = getEventBus();
  const encoder = new TextEncoder();
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: (() => void) | undefined;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Controller already closed (client gone) — ignore.
        }
      };
      const cleanup = () => {
        if (closed) return;
        closed = true;
        unsubscribe?.();
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      // SSE preamble: client reconnect hint + an open-confirmation comment (proves the stream).
      send("retry: 3000\n\n");
      send(": connected\n\n");

      unsubscribe = bus.subscribe((event) => {
        try {
          send(toSseData(event)); // asserts safety; unsafe events never reach the client
        } catch (err) {
          console.error(
            "[api/events/stream] blocked unsafe event:",
            err instanceof Error ? err.message : err
          );
        }
      });

      heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);

      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      closed = true;
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      // Disable proxy buffering (e.g. nginx) so events flush immediately.
      "X-Accel-Buffering": "no",
    },
  });
}
