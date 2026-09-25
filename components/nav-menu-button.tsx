"use client";

import { OPEN_NAV_EVENT } from "@/components/nav-menu";

/** The header's menu button on narrow screens, where the rail is hidden.
 * The menu itself lives in the root layout (components/nav-menu.tsx), so
 * this only asks it to open. */
export function NavMenuButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_NAV_EVENT))}
      aria-label="Open menu"
      aria-controls="nav-menu-panel"
      className="flex h-9 w-9 items-center justify-center rounded-full border border-border-strong text-text-secondary transition-colors hover:border-accent hover:text-accent md:hidden"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden className="h-4 w-4">
        <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
      </svg>
    </button>
  );
}
