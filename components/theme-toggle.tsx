"use client";

import { useEffect, useState } from "react";
import { resolveTheme, THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

/**
 * Icon-only toggle between the two themes. Starts undetermined (theme is
 * only known client-side) — rendering a neutral placeholder until mounted
 * avoids a server/client markup mismatch, since SSR has no way to know
 * which icon the visitor's saved/OS theme would resolve to. Reads from
 * localStorage via resolveTheme() rather than the DOM's data-theme
 * attribute, so this stays correct even if the pre-hydration script that
 * normally sets that attribute didn't run for some reason.
 */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    // Reading localStorage (an external system) is only possible
    // post-mount; the server has no localStorage to read, so starting at
    // `null` and updating here is what keeps hydration's first pass
    // matching the server-rendered markup instead of mismatching against it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(resolveTheme());
  }, []);

  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(THEME_STORAGE_KEY, next);
  }

  const size = compact ? "h-9 w-9" : "h-8 w-8";

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
      className={`flex ${size} shrink-0 items-center justify-center rounded-full border border-border-strong text-text-secondary transition-colors hover:border-accent hover:text-accent`}
    >
      {theme === null ? null : theme === "light" ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4">
          <circle cx="12" cy="12" r="4" />
          <path
            d="M12 3v1.5M12 19.5V21M4.6 4.6l1 1M18.4 18.4l1 1M3 12h1.5M19.5 12H21M4.6 19.4l1-1M18.4 5.6l1-1"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
