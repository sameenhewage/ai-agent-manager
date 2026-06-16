/**
 * In-memory realtime pub/sub (Slice 12F, ADR-0014 §4). One detector tick fans a safe event out to
 * every connected SSE client, in-process, single instance — NO Redis/queue (over-engineering for a
 * single self-hosted instance; revisit only when scaling out, a future ADR). A throwing subscriber
 * is isolated so it cannot break the fan-out; `subscriberCount` lets the detector poll only while
 * someone is actually watching. `getEventBus()` is a process singleton that survives Next dev HMR
 * and per-request route module evaluation (stored on globalThis).
 */

import type { RealtimeEvent } from "./events";

export type RealtimeListener = (event: RealtimeEvent) => void;

export interface EventBus {
  subscribe(listener: RealtimeListener): () => void;
  publish(event: RealtimeEvent): void;
  readonly subscriberCount: number;
}

export function createEventBus(): EventBus {
  const listeners = new Set<RealtimeListener>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    publish(event) {
      // Snapshot so subscribe/unsubscribe during delivery can't mutate the in-flight iteration.
      for (const listener of [...listeners]) {
        try {
          listener(event);
        } catch (err) {
          // Isolate a bad subscriber — never let it break the fan-out to the others.
          console.error("[realtime] subscriber threw; isolating", err);
        }
      }
    },
    get subscriberCount() {
      return listeners.size;
    },
  };
}

const GLOBAL_KEY = "__pepperRealtimeEventBus__";

/** Process-wide singleton bus (stable across HMR / route re-evaluation). */
export function getEventBus(): EventBus {
  const g = globalThis as typeof globalThis & { [GLOBAL_KEY]?: EventBus };
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = createEventBus();
  return g[GLOBAL_KEY];
}
