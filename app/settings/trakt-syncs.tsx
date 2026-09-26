"use client";

import { useEffect, useRef, useState } from "react";
import {
  addTraktSyncAction,
  checkTraktSyncAction,
  refreshTraktSyncsAction,
  removeTraktSyncAction,
  updateTraktSyncAction,
  type TraktSyncActionResult,
  type TraktSyncsState,
} from "./trakt-sync-actions";
import type { TraktSync } from "@/lib/api/types";

const inputClass =
  "rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-sm text-text-primary outline-none transition-colors focus:border-accent";
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

function SyncRow({
  sync,
  mine,
  busy,
  apply,
}: {
  sync: TraktSync;
  mine: boolean;
  busy: boolean;
  apply: (action: Promise<TraktSyncActionResult>) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const lastSynced = sync.lastSyncedAt ? new Date(sync.lastSyncedAt) : null;
  const owner = sync.owner.displayName || sync.owner.username;

  return (
    <li className="flex flex-col gap-3 px-6 py-4 text-sm">
      <div className="min-w-0">
        <a href={sync.url} target="_blank" rel="noreferrer" className="font-medium text-text-primary hover:text-accent">
          {sync.name}
        </a>
        {!mine && <span className="ml-2 text-xs text-text-muted">{owner}&apos;s</span>}
        <p className="mt-0.5 text-xs text-text-muted">
          {lastSynced ? `Checked ${timeAgo(lastSynced)}` : "Checking…"}
          {sync.requestedCount > 0 &&
            ` · ${sync.requestedCount} ${sync.requestedCount === 1 ? "title" : "titles"} requested so far`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        {(["movies", "tv"] as const).map((kind) => (
          <label key={kind} className="flex items-center gap-2 text-text-secondary">
            <input
              type="checkbox"
              checked={sync[kind]}
              disabled={busy}
              onChange={(e) => apply(updateTraktSyncAction(sync.id, { [kind]: e.target.checked }))}
              className="h-4 w-4 rounded border-border accent-accent"
            />
            {kind === "movies" ? "Movies" : "TV shows"}
          </label>
        ))}
        <button type="button" disabled={busy} onClick={() => apply(checkTraktSyncAction(sync.id))} className={smallButtonClass}>
          Check now
        </button>
        {confirming ? (
          <span className="flex items-center gap-2 text-xs">
            <button type="button" disabled={busy} onClick={() => apply(removeTraktSyncAction(sync.id))} className="text-red-400 hover:underline">
              Stop syncing
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="text-text-secondary hover:text-accent">
              Keep
            </button>
          </span>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirming(true)}
            className="text-xs text-text-secondary underline-offset-2 hover:text-red-400 hover:underline disabled:opacity-60"
          >
            Remove
          </button>
        )}
      </div>
      {sync.lastError && <p className="text-xs text-red-400">{sync.lastError}</p>}
    </li>
  );
}

/** Settings → Account's "Trakt lists": public Trakt watchlists and lists
 * kept in sync — new titles on them are requested, like pressing Request. */
export function TraktSyncsCard({ initial, currentUserId }: { initial: TraktSyncsState; currentUserId: string }) {
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [movies, setMovies] = useState(true);
  const [tv, setTv] = useState(true);
  const [requestExisting, setRequestExisting] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function apply(action: Promise<TraktSyncActionResult>): Promise<void> {
    setBusy(true);
    setError(null);
    const result = await action;
    if (!mounted.current) return;
    setBusy(false);
    if (result.state) setState(result.state);
    setError(result.error ?? null);
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await addTraktSyncAction({ url, movies, tv, requestExisting });
    setBusy(false);
    if (result.state) setState(result.state);
    if (result.error) {
      setError(result.error);
      return;
    }
    setUrl("");
    // The first check of what's on it runs in the background; look again
    // shortly so its count and time fill in.
    if (requestExisting) {
      for (let tries = 0; tries < 6 && mounted.current; tries++) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        const next = await refreshTraktSyncsAction();
        if (!mounted.current || !next.state) return;
        setState(next.state);
        if (next.state.syncs.every((s) => s.lastSyncedAt || s.lastError)) return;
      }
    }
  }

  const mine = state.syncs.filter((s) => s.owner.id === currentUserId);
  const others = state.syncs.filter((s) => s.owner.id !== currentUserId);

  return (
    <div className="flex flex-col text-sm">
      <div className="p-6 pb-4">
        <p className="text-text-primary">Keep Trakt lists in sync</p>
        <p className="mt-1 text-xs text-text-muted">
          New movies and shows added to a public Trakt watchlist or list are requested for you every few hours, the
          same as pressing Request.
        </p>
      </div>

      {mine.length > 0 && (
        <ul className="divide-y divide-border border-t border-border">
          {mine.map((sync) => (
            <SyncRow key={sync.id} sync={sync} mine busy={busy} apply={apply} />
          ))}
        </ul>
      )}

      {state.available ? (
        <form onSubmit={add} className="flex flex-col gap-3 border-t border-border px-6 py-4">
          <label className="flex flex-col gap-1.5 text-text-secondary">
            Trakt link
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              placeholder="https://trakt.tv/users/you/watchlist"
              className={inputClass}
            />
          </label>
          <div className="flex flex-wrap gap-4 text-text-secondary">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={movies} onChange={(e) => setMovies(e.target.checked)} className="h-4 w-4 accent-accent" />
              Movies
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={tv} onChange={(e) => setTv(e.target.checked)} className="h-4 w-4 accent-accent" />
              TV shows
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={requestExisting}
                onChange={(e) => setRequestExisting(e.target.checked)}
                className="h-4 w-4 accent-accent"
              />
              Also request what&apos;s on it now
            </label>
          </div>
          <button type="submit" disabled={busy} className={`${smallButtonClass} self-start`}>
            {busy ? "Adding…" : "Keep in sync"}
          </button>
        </form>
      ) : (
        <p className="border-t border-border px-6 py-4 text-xs text-text-muted">
          Trakt isn&apos;t connected on this server yet. The admin can connect it in Settings → Integrations.
        </p>
      )}
      {error && <p className="px-6 pb-4 text-xs text-red-400">{error}</p>}

      {others.length > 0 && (
        <>
          <p className="border-t border-border px-6 pt-4 text-xs font-medium uppercase tracking-wide text-text-muted">
            Everyone else&apos;s
          </p>
          <ul className="divide-y divide-border">
            {others.map((sync) => (
              <SyncRow key={sync.id} sync={sync} mine={false} busy={busy} apply={apply} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
