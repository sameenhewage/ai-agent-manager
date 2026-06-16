import { describe, it, expect } from "vitest";
import { anchorCorrectionDelta, reanchorScrollTop } from "./scroll-anchor";

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
