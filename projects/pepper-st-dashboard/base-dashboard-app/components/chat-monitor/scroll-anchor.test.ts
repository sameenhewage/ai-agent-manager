import { describe, it, expect } from "vitest";
import {
  anchorCorrectionDelta,
  reanchorScrollTop,
  decideOlderScrollAction,
  olderPrefetchThreshold,
  OLDER_LOAD_THRESHOLD_PX,
  OLDER_PREFETCH_VIEWPORT_FACTOR,
} from "./scroll-anchor";

/**
 * Scroll-anchor preservation (WhatsApp-like). When older messages are prepended, the captured
 * anchor message must return to the SAME vertical offset within the viewport — not jump to the
 * newly prepended top, not jump to the bottom.
 */
describe("reanchorScrollTop", () => {
  it("scrolls DOWN by the height prepended above the anchor (the core fix)", () => {
    // Anchor was 10px below the viewport top; after a 400px-tall older page prepended above it,
    // it now sits 410px down. We must scroll down by 400 so it returns to 10px.
    expect(reanchorScrollTop(0, 410, 10)).toBe(400);
  });

  it("accounts for the existing scroll position", () => {
    // currentScrollTop 72, anchor now at 480, desired 80 → 72 + (480 - 80) = 472.
    expect(reanchorScrollTop(72, 480, 80)).toBe(472);
  });

  it("is a no-op when the anchor did not move (nothing to correct)", () => {
    expect(reanchorScrollTop(120, 30, 30)).toBe(120);
  });

  it("never returns a negative scrollTop (clamped to 0)", () => {
    expect(reanchorScrollTop(0, 0, 100)).toBe(0);
    expect(reanchorScrollTop(10, 5, 100)).toBe(0); // 10 + (5 - 100) = -85 → 0
  });

  it("keeps the SAME anchor within a small pixel delta across a realistic prepend", () => {
    // 20 older messages ≈ 900px prepended; anchor was at 8px, browser left it at 908px.
    const desired = 8;
    const newTop = reanchorScrollTop(0, 908, desired);
    // After applying newTop, the anchor's offset becomes desired (within sub-pixel).
    // Simulate: offset = previousOffset - (newScrollTop - previousScrollTop) = 908 - (900 - 0) = 8
    const resultingOffset = 908 - (newTop - 0);
    expect(Math.abs(resultingOffset - desired)).toBeLessThanOrEqual(1);
  });
});

describe("anchorCorrectionDelta", () => {
  it("is the distance the anchor moved (anchorTopAfter - anchorTopBefore)", () => {
    expect(anchorCorrectionDelta(10, 410)).toBe(400); // pushed down 400
    expect(anchorCorrectionDelta(250, 250)).toBe(0); // unchanged
    expect(anchorCorrectionDelta(300, 100)).toBe(-200); // moved up 200
  });

  it("composes with scrollTop to preserve the anchor: newScrollTop = scrollTop + delta", () => {
    const scrollTop = 72, before = 80, after = 480;
    const delta = anchorCorrectionDelta(before, after); // 400
    // reanchorScrollTop(scrollTop, currentOffset=after, desiredOffset=before) === scrollTop + delta
    expect(reanchorScrollTop(scrollTop, after, before)).toBe(scrollTop + delta);
    expect(reanchorScrollTop(scrollTop, after, before)).toBe(472);
  });
});

/**
 * `decideOlderScrollAction` — the contract that fixed TD-085's ~70px jump. The anchor must be
 * re-captured CONTINUOUSLY while an older page is in flight, so it tracks where the user actually
 * is when the prepend lands (they keep scrolling during the async fetch), not where they were when
 * the fetch began.
 */
describe("decideOlderScrollAction", () => {
  it("at/near the top (idle): captures the anchor AND triggers the fetch", () => {
    expect(decideOlderScrollAction({ hasMoreBefore: true, loadingOlder: false, scrollTop: 0 })).toEqual({
      capture: true,
      trigger: true,
    });
    expect(
      decideOlderScrollAction({ hasMoreBefore: true, loadingOlder: false, scrollTop: OLDER_LOAD_THRESHOLD_PX })
    ).toEqual({ capture: true, trigger: true });
  });

  it("REGRESSION (TD-085): while a page is in flight, keeps re-capturing the anchor but does NOT re-fetch", () => {
    // This is the whole fix: during the async fetch the user scrolls on toward the top, so the
    // anchor must keep updating. The old code early-returned here and the anchor went stale → jump.
    expect(decideOlderScrollAction({ hasMoreBefore: true, loadingOlder: true, scrollTop: 0 })).toEqual({
      capture: true,
      trigger: false,
    });
    expect(decideOlderScrollAction({ hasMoreBefore: true, loadingOlder: true, scrollTop: 300 })).toEqual({
      capture: true,
      trigger: false,
    });
  });

  it("mid-scroll (idle, above the threshold): does nothing — the anchor is only armed around a load", () => {
    expect(decideOlderScrollAction({ hasMoreBefore: true, loadingOlder: false, scrollTop: 600 })).toEqual({
      capture: false,
      trigger: false,
    });
  });

  it("no older page available: never captures or triggers, regardless of position", () => {
    expect(decideOlderScrollAction({ hasMoreBefore: false, loadingOlder: false, scrollTop: 0 })).toEqual({
      capture: false,
      trigger: false,
    });
    expect(decideOlderScrollAction({ hasMoreBefore: false, loadingOlder: true, scrollTop: 0 })).toEqual({
      capture: false,
      trigger: false,
    });
  });

  it("respects a custom threshold", () => {
    expect(
      decideOlderScrollAction({ hasMoreBefore: true, loadingOlder: false, scrollTop: 120, threshold: 150 })
    ).toEqual({ capture: true, trigger: true });
    expect(
      decideOlderScrollAction({ hasMoreBefore: true, loadingOlder: false, scrollTop: 200, threshold: 150 })
    ).toEqual({ capture: false, trigger: false });
  });

  it("PREFETCH (TD-086): triggers EARLY — within the threshold but far from the very top — when scrolling up", () => {
    // 900px from the top, threshold 942 (≈ a desktop viewport prefetch), moving up → load now,
    // long before scrollTop hits 0, so a fast scroll-up never waits at the top.
    expect(
      decideOlderScrollAction({ hasMoreBefore: true, loadingOlder: false, scrollTop: 900, threshold: 942, scrollingUp: true })
    ).toEqual({ capture: true, trigger: true });
  });

  it("DIRECTION GATE (TD-086): does NOT trigger when scrolling DOWN (e.g. the initial scroll-to-bottom / post-prepend correction)", () => {
    expect(
      decideOlderScrollAction({ hasMoreBefore: true, loadingOlder: false, scrollTop: 0, threshold: 942, scrollingUp: false })
    ).toEqual({ capture: false, trigger: false });
    // But a fetch already in flight still keeps the anchor fresh regardless of direction.
    expect(
      decideOlderScrollAction({ hasMoreBefore: true, loadingOlder: true, scrollTop: 0, threshold: 942, scrollingUp: false })
    ).toEqual({ capture: true, trigger: false });
  });

  it("defaults scrollingUp to true (position-only callers keep the eager behavior)", () => {
    expect(decideOlderScrollAction({ hasMoreBefore: true, loadingOlder: false, scrollTop: 10 })).toEqual({
      capture: true,
      trigger: true,
    });
  });
});

describe("olderPrefetchThreshold", () => {
  it("is a generous viewport-relative margin so loads start well before the top", () => {
    expect(olderPrefetchThreshold(628)).toBe(Math.round(628 * OLDER_PREFETCH_VIEWPORT_FACTOR)); // 942
    expect(olderPrefetchThreshold(900)).toBe(Math.round(900 * OLDER_PREFETCH_VIEWPORT_FACTOR)); // 1350
  });

  it("never drops below the base threshold for tiny viewports", () => {
    expect(olderPrefetchThreshold(10)).toBe(OLDER_LOAD_THRESHOLD_PX);
    expect(olderPrefetchThreshold(0)).toBe(OLDER_LOAD_THRESHOLD_PX);
  });

  it("is always larger than the old at-the-top threshold for real viewports (loads earlier)", () => {
    expect(olderPrefetchThreshold(628)).toBeGreaterThan(OLDER_LOAD_THRESHOLD_PX);
  });
});
