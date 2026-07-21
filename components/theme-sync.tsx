"use client";

import { useEffect } from "react";
import { resolveTheme } from "@/lib/theme";

/**
 * Belt-and-suspenders re-application of the saved theme on every mount.
 * The inline script (app/layout.tsx) is the primary, flash-free mechanism,
 * but it only ever runs once per true full document load — this exists as
 * a React-side fallback so the correct theme is still guaranteed to apply
 * even in a scenario where the inline script's DOM node gets recreated
 * (e.g. via a hydration-mismatch recovery) without executing, which browsers
 * never auto-run for scripts inserted that way. Renders nothing.
 */
export function ThemeSync() {
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolveTheme());
  }, []);

  return null;
}
