"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ChangelogEntry } from "@/lib/changelog";
import { decideWhatsNew, whatsNewStorageKey } from "@/lib/whats-new";
import { whatsNewAction } from "@/lib/whats-new-actions";

type Shown = { version: string; entries: ChangelogEntry[]; hasMore: boolean };

function readStored(key: string): { ok: true; value: string | null } | { ok: false } {
  try {
    return { ok: true, value: localStorage.getItem(key) };
  } catch {
    return { ok: false };
  }
}

function remember(key: string, version: string) {
  try {
    localStorage.setItem(key, version);
  } catch {
    // Storage blocked: readStored fails too, so it never shows here.
  }
}

/** "Sep 26, 2026": the changelog's day, read as UTC so it never shifts a day. */
function formatDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/**
 * "What's new in Marquee 0.45.3": after the server is upgraded, once per
 * version on each device (and account), lists the releases since the one
 * this device last saw (lib/whats-new.ts). Only for a signed-in page, so it
 * never comes up over sign-in or setup. A modal <dialog>: Escape, a click
 * outside and OK all dismiss it, and focus goes back where it was. A bottom
 * sheet at phone width, a centred card from sm up.
 */
export function WhatsNew({ userId, serverVersion }: { userId: string; serverVersion: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const key = useRef<string | null>(null);

  useEffect(() => {
    const storageKey = whatsNewStorageKey(window.location.origin, userId);
    key.current = storageKey;
    const stored = readStored(storageKey);
    // Without storage it would show on every page; better never.
    if (!stored.ok) return;
    const decision = decideWhatsNew(stored.value, serverVersion);
    if (decision.kind === "first-run") {
      remember(storageKey, serverVersion);
      return;
    }
    if (decision.kind !== "show") return;
    let cancelled = false;
    whatsNewAction(decision.since)
      .then((result) => {
        if (cancelled || !result) return;
        if (result.entries.length === 0) {
          remember(storageKey, result.version);
          return;
        }
        setShown(result);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [userId, serverVersion]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (shown && dialog && !dialog.open) dialog.showModal();
  }, [shown]);

  if (!shown) return null;

  function onClose() {
    if (key.current && shown) remember(key.current, shown.version);
    setShown(null);
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="whats-new-title"
      onClose={onClose}
      // A click on the backdrop lands on the <dialog> itself; the card
      // inside it fills the dialog, so clicks on the card never do.
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      className="mb-0 mt-auto max-h-[85dvh] w-full max-w-none overflow-hidden rounded-t-2xl border border-border bg-bg-1 p-0 text-text-primary backdrop:bg-black/60 open:flex open:flex-col sm:m-auto sm:max-h-[min(40rem,calc(100dvh-2rem))] sm:w-[min(32rem,calc(100vw-2rem))] sm:rounded-2xl"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="px-6 pb-3 pt-6">
          <h2 id="whats-new-title" className="font-display text-xl leading-tight">
            What&rsquo;s new in Marquee {shown.version}
          </h2>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-2">
          {shown.entries.map((entry) => (
            <section key={entry.version} className="border-t border-border py-4 first:border-t-0 first:pt-1">
              <h3 className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
                <span>Marquee {entry.version}</span>
                <span className="text-xs font-normal text-text-muted">{formatDay(entry.date)}</span>
              </h3>
              <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-[13.5px] leading-5 text-text-secondary marker:text-text-muted">
                {entry.changes.map((change, i) => (
                  <li key={i}>{change}</li>
                ))}
              </ul>
            </section>
          ))}
          {shown.hasMore && (
            <p className="pb-2 text-[13px] text-text-muted">And more in earlier releases.</p>
          )}
        </div>
        <div className="flex flex-col gap-3 border-t border-border px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/changelog"
            onClick={() => dialogRef.current?.close()}
            className="text-center text-[13px] text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
          >
            See all changes
          </Link>
          <button
            type="button"
            autoFocus
            onClick={() => dialogRef.current?.close()}
            className="rounded-full bg-accent px-8 py-2.5 text-sm font-semibold text-bg-0 transition-colors hover:bg-accent-hover sm:py-2"
          >
            OK
          </button>
        </div>
      </div>
    </dialog>
  );
}
