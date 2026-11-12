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
import { useT } from "@/lib/i18n/client";
import { timeAgo } from "@/lib/i18n/format";
import { orError } from "@/lib/async/or-error";

const inputClass =
  "rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-sm text-text-primary outline-none transition-colors focus:border-accent";
const smallButtonClass =
  "rounded-full border border-border-strong px-3.5 py-1.5 text-xs text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-60";

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
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const lastSynced = sync.lastSyncedAt ? new Date(sync.lastSyncedAt) : null;
  const owner = sync.owner.displayName || sync.owner.username;

  return (
    <li className="flex flex-col gap-3 px-6 py-4 text-sm">
      <div className="min-w-0">
        <a href={sync.url} target="_blank" rel="noreferrer" className="font-medium text-text-primary hover:text-accent">
          {sync.name}
        </a>
        {!mine && <span className="ml-2 text-xs text-text-muted">{t("settings.traktOwner", { name: owner })}</span>}
        <p className="mt-0.5 text-xs text-text-muted">
          {lastSynced
            ? t("settings.watchlistChecked", { when: timeAgo(t, lastSynced) })
            : sync.lastError
              ? t("settings.notCheckedYet")
              : t("settings.checking")}
          {sync.requestedCount > 0 && ` · ${t("settings.watchlistRequestedSoFar", { count: sync.requestedCount })}`}
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
            {kind === "movies" ? t("common.movies") : t("common.tvShows")}
          </label>
        ))}
        <button type="button" disabled={busy} onClick={() => apply(checkTraktSyncAction(sync.id))} className={smallButtonClass}>
          {t("settings.checkNow")}
        </button>
        {confirming ? (
          <span className="flex items-center gap-2 text-xs">
            <button type="button" disabled={busy} onClick={() => apply(removeTraktSyncAction(sync.id))} className="text-red-400 hover:underline">
              {t("settings.stopSyncing")}
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="text-text-secondary hover:text-accent">
              {t("settings.keep")}
            </button>
          </span>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirming(true)}
            className="text-xs text-text-secondary underline-offset-2 hover:text-red-400 hover:underline disabled:opacity-60"
          >
            {t("common.remove")}
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
  const t = useT();
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
    const result = await orError(action, t("common.somethingWentWrong"));
    if (!mounted.current) return;
    setBusy(false);
    if (result.state) setState(result.state);
    setError(result.error ?? null);
  }

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await orError(addTraktSyncAction({ url, movies, tv, requestExisting }), t("common.somethingWentWrong"));
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
        const next = await refreshTraktSyncsAction().catch(() => null);
        if (!next) continue;
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
        <p className="text-text-primary">{t("settings.traktTitle")}</p>
        <p className="mt-1 text-xs text-text-muted">{t("settings.traktHelp")}</p>
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
            {t("settings.traktLink")}
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              placeholder={t("settings.traktLinkPlaceholder")}
              className={inputClass}
            />
          </label>
          <div className="flex flex-wrap gap-4 text-text-secondary">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={movies} onChange={(e) => setMovies(e.target.checked)} className="h-4 w-4 accent-accent" />
              {t("common.movies")}
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={tv} onChange={(e) => setTv(e.target.checked)} className="h-4 w-4 accent-accent" />
              {t("common.tvShows")}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={requestExisting}
                onChange={(e) => setRequestExisting(e.target.checked)}
                className="h-4 w-4 accent-accent"
              />
              {t("settings.traktRequestExisting")}
            </label>
          </div>
          <button type="submit" disabled={busy} className={`${smallButtonClass} self-start`}>
            {busy ? t("settings.adding") : t("settings.keepInSync")}
          </button>
        </form>
      ) : (
        <p className="border-t border-border px-6 py-4 text-xs text-text-muted">{t("settings.traktNotConnected")}</p>
      )}
      {error && <p className="px-6 pb-4 text-xs text-red-400">{error}</p>}

      {others.length > 0 && (
        <>
          <p className="border-t border-border px-6 pt-4 text-xs font-medium uppercase tracking-wide text-text-muted">
            {t("settings.everyoneElses")}
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
