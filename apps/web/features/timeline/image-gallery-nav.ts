/**
 * Pure navigation helpers for the timeline image viewer (lightbox). Kept free of
 * React/DOM so the swipe + index logic is unit-testable in the node vitest env
 * (the component in `components/image-lightbox.tsx` only wires these to events).
 */

export interface SwipeDelta {
  /** Horizontal travel in px (end − start); negative = finger moved left. */
  dx: number;
  /** Vertical travel in px (end − start); positive = finger moved down. */
  dy: number;
}

/** What a finished drag should do to the viewer. */
export type SwipeOutcome = "prev" | "next" | "close" | "none";

export interface SwipeThresholds {
  /** Min horizontal px for a left/right swipe to change image. */
  horizontal: number;
  /** Min downward px for a swipe to close the viewer. */
  down: number;
}

export const DEFAULT_SWIPE_THRESHOLDS: SwipeThresholds = { horizontal: 50, down: 90 };

/** Clamp an index into `[0, count)`; returns 0 for an empty gallery. */
export function clampIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(Math.max(index, 0), count - 1);
}

/** Move one step, clamped at the ends (no wrap-around). */
export function stepIndex(index: number, count: number, direction: 1 | -1): number {
  return clampIndex(index + direction, count);
}

/**
 * Classify a touch drag. A predominantly-horizontal drag past the horizontal
 * threshold navigates — swipe left (`dx` negative) → next, swipe right → prev; a
 * predominantly-vertical downward drag past the down threshold closes. Anything
 * shorter is a tap/jitter and does nothing.
 */
export function resolveSwipe(
  delta: SwipeDelta,
  thresholds: SwipeThresholds = DEFAULT_SWIPE_THRESHOLDS,
): SwipeOutcome {
  const { dx, dy } = delta;
  if (Math.abs(dx) > Math.abs(dy)) {
    if (dx <= -thresholds.horizontal) return "next";
    if (dx >= thresholds.horizontal) return "prev";
    return "none";
  }
  if (dy >= thresholds.down) return "close";
  return "none";
}
