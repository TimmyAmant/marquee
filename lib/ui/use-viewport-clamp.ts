"use client";

import { type RefObject, useLayoutEffect } from "react";
import { clampShift } from "./viewport-clamp";

/**
 * Keeps an absolutely positioned popover inside the window while it's open:
 * once it's laid out (and on every resize) it's measured and slid sideways
 * so it never runs past either edge, e.g. a "…" menu that opens from the end
 * of a wrapped row on a narrow phone. 8px stays clear on both sides.
 */
export function useViewportClamp(open: boolean, panelRef: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;
    function place() {
      if (!panel) return;
      panel.style.translate = "";
      const rect = panel.getBoundingClientRect();
      const shift = clampShift(rect.left, rect.right, document.documentElement.clientWidth);
      if (shift !== 0) panel.style.translate = `${shift}px 0`;
    }
    place();
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("resize", place);
      panel.style.translate = "";
    };
  }, [open, panelRef]);
}
