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

/** Minimum distance (px) from the top at which loading the previous page may start. */
export const OLDER_LOAD_THRESHOLD_PX = 72;

/**
 * How far ahead of the top to PREFETCH the previous page, as a multiple of the viewport height.
 * Generous on purpose: a fast scroll-up should find the next page already loading before the user
 * reaches the top, so they never sit waiting at the top.
 */
export const OLDER_PREFETCH_VIEWPORT_FACTOR = 1.5;

/**
 * The scrollTop at/under which to begin loading the previous page, given the viewport height.
 * Viewport-relative (adapts to screen size) and floored at {@link OLDER_LOAD_THRESHOLD_PX}. Pure.
 */
export function olderPrefetchThreshold(viewportHeight: number): number {
  return Math.max(OLDER_LOAD_THRESHOLD_PX, Math.round(viewportHeight * OLDER_PREFETCH_VIEWPORT_FACTOR));
}

export interface OlderScrollState {
  /** Whether an older page exists to load. */
  hasMoreBefore: boolean;
  /** Whether an older-page fetch is already in flight. */
  loadingOlder: boolean;
  /** The container's current scrollTop. */
  scrollTop: number;
  /** Whether this scroll moved TOWARD the top (only then do we start a new fetch). Defaults true. */
  scrollingUp?: boolean;
  /** The scrollTop at/under which to start a fetch (defaults to {@link OLDER_LOAD_THRESHOLD_PX}). */
  threshold?: number;
}

/** What a scroll event near the top should do for older-message loading. */
export interface OlderScrollAction {
  /** Re-capture the top anchor NOW (pin it to where the user currently is). */
  capture: boolean;
  /** Begin fetching the previous page. */
  trigger: boolean;
}

/**
 * Decide, on each scroll, whether to (re)capture the scroll anchor and/or start an older-page
 * fetch. The critical rule (TD-085): while a fetch is ALREADY in flight we keep re-capturing the
 * anchor — the user keeps scrolling during the async load, so the anchor must track where they ARE
 * when the prepend lands, not where they were when the fetch began (capturing only at fetch-start
 * caused a ~70px upward snap). Pure: no DOM, no side effects.
 */
export function decideOlderScrollAction(state: OlderScrollState): OlderScrollAction {
  if (!state.hasMoreBefore) return { capture: false, trigger: false };
  // A page is loading: keep the anchor fresh as the user continues scrolling, but don't re-fetch.
  if (state.loadingOlder) return { capture: true, trigger: false };
  const threshold = state.threshold ?? OLDER_LOAD_THRESHOLD_PX;
  const scrollingUp = state.scrollingUp ?? true;
  // Approaching the top WHILE moving up: capture the current position AND prefetch the next page.
  // The `scrollingUp` gate stops the initial scroll-to-bottom (a downward jump) from triggering a
  // load on open, and means we only fetch ahead in the direction the user is actually heading.
  if (state.scrollTop <= threshold && scrollingUp) return { capture: true, trigger: true };
  // Otherwise nothing (the anchor is only armed around an actual load).
  return { capture: false, trigger: false };
}
