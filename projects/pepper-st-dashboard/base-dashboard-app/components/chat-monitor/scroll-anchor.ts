/**
 * Pure scroll math for WhatsApp-like "load older messages" prepends.
 *
 * When older messages are prepended ABOVE the current view, the content grows at the top and the
 * reading position would otherwise jump. To preserve it we capture an anchor message element near
 * the top of the viewport BEFORE the load (its distance from the viewport top), then after the
 * prepend lands we measure where that same element now sits and scroll by the difference so it
 * returns to the same vertical position.
 *
 * This is measurement-based (element anchor), so it is immune to the loading spinner, the
 * "Load older messages" button toggling, day separators, and the browser's own scroll-anchoring.
 */

/**
 * How far the anchor element moved: its viewport-top AFTER the prepend minus where it was
 * BEFORE. This is the exact amount to add to `scrollTop` to cancel the shift. Pure.
 */
export function anchorCorrectionDelta(anchorTopBefore: number, anchorTopAfter: number): number {
  return anchorTopAfter - anchorTopBefore;
}

/**
 * The scrollTop that returns an anchor element to `desiredOffset` (its viewport-top distance
 * captured before the prepend), given where it sits now (`currentOffset`) and the container's
 * current `currentScrollTop`. If the prepend pushed the anchor DOWN (`currentOffset >
 * desiredOffset`) we scroll DOWN by the difference; the result is clamped to `>= 0`. Pure.
 */
export function reanchorScrollTop(
  currentScrollTop: number,
  currentOffset: number,
  desiredOffset: number
): number {
  return Math.max(0, currentScrollTop + anchorCorrectionDelta(desiredOffset, currentOffset));
}
