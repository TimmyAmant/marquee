/** How far a popover keeps from the window's edges on a phone. */
export const VIEWPORT_MARGIN = 8;

/**
 * How far to slide a popover sideways so it stays inside the window:
 * positive moves it right, negative left, 0 when it already fits. When it's
 * wider than the window it lines up with the left margin (its width is
 * capped by CSS, so that only happens for a pixel or two).
 */
export function clampShift(left: number, right: number, viewportWidth: number, margin = VIEWPORT_MARGIN): number {
  if (left < margin) return margin - left;
  if (right > viewportWidth - margin) {
    const shift = viewportWidth - margin - right;
    return left + shift < margin ? margin - left : shift;
  }
  return 0;
}
