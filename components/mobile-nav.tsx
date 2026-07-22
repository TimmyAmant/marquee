"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SearchBar } from "@/components/search-bar";
import { ThemeToggle } from "@/components/theme-toggle";

export function MobileNav({
  isSignedIn,
  isAdmin,
  pendingRequestCount,
  userLabel,
}: {
  isSignedIn: boolean;
  isAdmin: boolean;
  pendingRequestCount: number;
  userLabel: string | null;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={panelRef} className="relative md:hidden">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-border-strong text-text-secondary transition-colors hover:border-accent hover:text-accent"
      >
        {open ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4">
            <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4">
            <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-72 rounded-2xl border border-border bg-bg-1 p-4 shadow-2xl">
          <SearchBar variant="compact" />

          <nav className="mt-4 flex flex-col text-sm text-text-secondary">
            <Link
              href="/discover"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 transition-colors hover:bg-bg-2 hover:text-text-primary"
            >
              Discover
            </Link>
            <Link
              href="/movies"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 transition-colors hover:bg-bg-2 hover:text-text-primary"
            >
              Movies
            </Link>
            <Link
              href="/series"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 transition-colors hover:bg-bg-2 hover:text-text-primary"
            >
              Series
            </Link>

            {isSignedIn && (
              <>
                <Link
                  href="/favorites"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 transition-colors hover:bg-bg-2 hover:text-text-primary"
                >
                  Favorites
                </Link>
                <Link
                  href="/calendar"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 transition-colors hover:bg-bg-2 hover:text-text-primary"
                >
                  Calendar
                </Link>
              </>
            )}

            {isSignedIn && (
              <Link
                href="/requests"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 transition-colors hover:bg-bg-2 hover:text-text-primary"
              >
                Requests
                {isAdmin && pendingRequestCount > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-semibold text-bg-0">
                    {pendingRequestCount > 9 ? "9+" : pendingRequestCount}
                  </span>
                )}
              </Link>
            )}

            <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
              {isSignedIn ? (
                <Link
                  href="/settings"
                  onClick={() => setOpen(false)}
                  className="min-w-0 flex-1 truncate rounded-lg px-3 py-2.5 text-text-primary transition-colors hover:bg-bg-2"
                >
                  {userLabel}
                </Link>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="min-w-0 flex-1 rounded-lg px-3 py-2.5 text-text-primary transition-colors hover:bg-bg-2"
                >
                  Sign in
                </Link>
              )}
              <ThemeToggle compact />
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}
