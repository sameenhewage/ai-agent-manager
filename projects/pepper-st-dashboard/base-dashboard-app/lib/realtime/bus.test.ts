import { describe, expect, it, vi } from "vitest";
import { createEventBus, getEventBus } from "./bus";
import { conversationCreated, metricsUpdated } from "./events";

/**
 * In-memory pub/sub (ADR-0014 §4): one detector result fans out to every connected SSE client,
 * in-process, single instance, no Redis/queue. The bus must isolate a throwing subscriber, keep
 * an accurate count (so the detector can poll only while someone is watching), and expose a
 * stable process singleton.
 */

const UUID = "7f3e2b1a-9c8d-4e6f-a1b2-c3d4e5f60718";

describe("createEventBus", () => {
  it("delivers a published event to all subscribers", () => {
    const bus = createEventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.subscribe(a);
    bus.subscribe(b);
    const e = conversationCreated(UUID);
    bus.publish(e);
    expect(a).toHaveBeenCalledWith(e);
    expect(b).toHaveBeenCalledWith(e);
  });

  it("tracks subscriberCount and stops delivery after unsubscribe", () => {
    const bus = createEventBus();
    const fn = vi.fn();
    expect(bus.subscriberCount).toBe(0);
    const off = bus.subscribe(fn);
    expect(bus.subscriberCount).toBe(1);
    bus.publish(metricsUpdated());
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    expect(bus.subscriberCount).toBe(0);
    bus.publish(metricsUpdated());
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("is idempotent on double unsubscribe", () => {
    const bus = createEventBus();
    const off = bus.subscribe(vi.fn());
    off();
    expect(() => off()).not.toThrow();
    expect(bus.subscriberCount).toBe(0);
  });

  it("isolates a throwing subscriber so others still receive", () => {
    const bus = createEventBus();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error("boom");
    });
    const good = vi.fn();
    bus.subscribe(bad);
    bus.subscribe(good);
    expect(() => bus.publish(metricsUpdated())).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
    errSpy.mockRestore();
  });

  it("publish with no subscribers is a no-op", () => {
    const bus = createEventBus();
    expect(() => bus.publish(metricsUpdated())).not.toThrow();
  });

  it("does not deliver an in-flight event to a subscriber added during publish", () => {
    const bus = createEventBus();
    const late = vi.fn();
    const first = vi.fn(() => {
      bus.subscribe(late);
    });
    bus.subscribe(first);
    bus.publish(metricsUpdated());
    expect(first).toHaveBeenCalledTimes(1);
    expect(late).not.toHaveBeenCalled();
  });

  it("keeps instances independent", () => {
    const a = createEventBus();
    const b = createEventBus();
    const fa = vi.fn();
    const fb = vi.fn();
    a.subscribe(fa);
    b.subscribe(fb);
    a.publish(metricsUpdated());
    expect(fa).toHaveBeenCalledTimes(1);
    expect(fb).not.toHaveBeenCalled();
  });
});

describe("getEventBus", () => {
  it("returns a stable process singleton", () => {
    expect(getEventBus()).toBe(getEventBus());
  });
});
