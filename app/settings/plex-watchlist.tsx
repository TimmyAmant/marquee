"use client";

import { useEffect, useRef, useState } from "react";
import type { WatchlistState } from "@/lib/plex/watchlist";
import {
  disablePlexWatchlistAction,
  getPlexWatchlistAction,
  pollPlexWatchlistAction,
  setPlexWatchlistTypesAction,
  startPlexWatchlistAction,
  syncPlexWatchlistAction,
  type WatchlistActionResult,
} from "./media-actions";
import { runPlexApproval } from "./plex-approval";

const smallButtonClass =
  "rounded-full border border-border-strong px-3.5 py-1.5 text-xs text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-60";

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Settings → Account's "Plex Watchlist": request what the signed-in
 * account adds to its own Plex Watchlist. Shown once Plex is linked. */
export function PlexWatchlistCard({ initial }: { initial: WatchlistState }) {
  const [state, setState] = useState(initial);
  const [waiting, setWaiting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    return () => {
      cancelled.current = true;
    };
  }, []);

  async function apply(action: Promise<WatchlistActionResult>) {
    setBusy(true);
    setError(null);
    const result = await action;
    setBusy(false);
    if (result.state) setState(result.state);
    if (result.error) setError(result.error);
  }

  async function handleTurnOn() {
    setError(null);
    setWaiting(true);
    cancelled.current = false;
    const failure = await runPlexApproval(startPlexWatchlistAction, pollPlexWatchlistAction, cancelled);
    if (cancelled.current) return;
    setWaiting(false);
    if (failure) {
      setError(failure);
      return;
    }
    await apply(getPlexWatchlistAction());
    // The first read runs in the background on the server; pick up its
    // result shortly after.
    setTimeout(() => {
      if (!cancelled.current) getPlexWatchlistAction().then((r) => r.state && setState(r.state));
    }, 8000);
  }

  const lastSynced = state.lastSyncedAt ? new Date(state.lastSyncedAt) : null;

  return (
    <div className="flex flex-col gap-4 p-6 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-text-primary">Request from my Plex Watchlist</p>
          <p className="mt-1 text-xs text-text-muted">
            New movies and shows you add to your Watchlist on Plex are requested for you, the same as pressing
            Request. Marquee keeps a Plex sign-in for this until you turn it off.
          </p>
        </div>
        {state.enabled ? (
          <span className="shrink-0 rounded-full border border-owned/30 bg-owned-bg px-2.5 py-0.5 text-xs text-owned">
            On
          </span>
        ) : waiting ? (
          <button
            type="button"
            onClick={() => {
              cancelled.current = true;
              setWaiting(false);
            }}
            className="shrink-0 text-xs text-text-secondary hover:text-accent"
          >
            Cancel
          </button>
        ) : (
          <button type="button" onClick={handleTurnOn} className={`${smallButtonClass} shrink-0`}>
            Turn on
          </button>
        )}
      </div>

      {waiting && <p className="text-xs text-text-muted">Waiting for Plex… finish in the tab that opened.</p>}

      {state.enabled && (
        <>
          <div className="flex flex-wrap gap-4">
            {(["movies", "tv"] as const).map((kind) => (
              <label key={kind} className="flex items-center gap-2 text-text-secondary">
                <input
                  type="checkbox"
                  checked={state[kind]}
                  disabled={busy}
                  onChange={(e) => apply(setPlexWatchlistTypesAction({ [kind]: e.target.checked }))}
                  className="h-4 w-4 rounded border-border accent-accent"
                />
                {kind === "movies" ? "Movies" : "TV shows"}
              </label>
            ))}
          </div>
          <p className="text-xs text-text-muted">
            {lastSynced ? `Checked ${timeAgo(lastSynced)}` : "Checking your watchlist…"}
            {state.requestedCount > 0 &&
              ` · ${state.requestedCount} ${state.requestedCount === 1 ? "title" : "titles"} requested so far`}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => apply(syncPlexWatchlistAction())}
              className={smallButtonClass}
            >
              {busy ? "Checking…" : "Check now"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => apply(disablePlexWatchlistAction())}
              className="text-xs text-text-secondary underline-offset-2 hover:text-red-400 hover:underline disabled:opacity-60"
            >
              Turn off
            </button>
          </div>
        </>
      )}

      {state.lastError && <p className="text-xs text-red-400">{state.lastError}</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
