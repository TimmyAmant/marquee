"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { linkJellyfinAction, pollPlexLinkAction, startPlexLinkAction, unlinkAction } from "./media-actions";
import { runPlexApproval } from "./plex-approval";

const inputClass =
  "rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-text-primary outline-none transition-colors focus:border-accent";
const smallButtonClass =
  "rounded-full border border-border-strong px-3.5 py-1.5 text-xs text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-60";

function LinkedBadge() {
  return (
    <span className="rounded-full border border-owned/30 bg-owned-bg px-2.5 py-0.5 text-xs text-owned">Linked</span>
  );
}

function UnlinkButton({ provider, onError }: { provider: "plex" | "jellyfin"; onError: (e: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        onError(null);
        const result = await unlinkAction(provider);
        setBusy(false);
        if (result.error) onError(result.error);
        else router.refresh();
      }}
      className="text-xs text-text-secondary underline-offset-2 hover:text-red-400 hover:underline disabled:opacity-60"
    >
      {busy ? "Unlinking…" : "Unlink"}
    </button>
  );
}

function PlexRow({ linked, available }: { linked: boolean; available: boolean }) {
  const router = useRouter();
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    return () => {
      cancelled.current = true;
    };
  }, []);

  async function handleLink() {
    setError(null);
    setWaiting(true);
    cancelled.current = false;
    const failure = await runPlexApproval(startPlexLinkAction, pollPlexLinkAction, cancelled);
    if (cancelled.current) return;
    setWaiting(false);
    if (failure) setError(failure);
    else router.refresh();
  }

  return (
    <li className="flex flex-col gap-2 px-6 py-4 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-text-primary">Plex</span>
        <div className="flex items-center gap-3">
          {linked && <LinkedBadge />}
          {linked ? (
            <UnlinkButton provider="plex" onError={setError} />
          ) : waiting ? (
            <button
              type="button"
              onClick={() => {
                cancelled.current = true;
                setWaiting(false);
              }}
              className="text-xs text-text-secondary hover:text-accent"
            >
              Cancel
            </button>
          ) : (
            available && (
              <button type="button" onClick={handleLink} className={smallButtonClass}>
                Link Plex
              </button>
            )
          )}
        </div>
      </div>
      {waiting && <p className="text-xs text-text-muted">Waiting for Plex… finish in the tab that opened.</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </li>
  );
}

function JellyfinRow({ linked, available }: { linked: boolean; available: boolean }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A successful link revalidates the page, which comes back with `linked`
  // set — and the form below is only shown while it isn't.
  const [state, formAction, isPending] = useActionState(linkJellyfinAction, undefined);

  return (
    <li className="flex flex-col gap-3 px-6 py-4 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-text-primary">Jellyfin</span>
        <div className="flex items-center gap-3">
          {linked && <LinkedBadge />}
          {linked ? (
            <UnlinkButton provider="jellyfin" onError={setError} />
          ) : (
            available &&
            !open && (
              <button type="button" onClick={() => setOpen(true)} className={smallButtonClass}>
                Link Jellyfin
              </button>
            )
          )}
        </div>
      </div>
      {open && !linked && (
        <form action={formAction} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
            Jellyfin username
            <input type="text" name="username" required autoComplete="username" className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
            Jellyfin password
            <input type="password" name="password" required autoComplete="current-password" className={inputClass} />
          </label>
          {state?.error && <p className="text-xs text-red-400">{state.error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {isPending ? "Linking…" : "Link"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-border-strong px-4 py-2 text-sm text-text-primary transition-colors hover:border-accent hover:text-accent"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </li>
  );
}

/** Settings → Account's "Linked accounts": sign in with Plex or Jellyfin as
 * well as (or instead of) a password. A provider shows only while the
 * admin has it connected, or while this account is still linked to it (so
 * it can always be unlinked). */
export function LinkedAccounts({
  linked,
  available,
}: {
  linked: { plex: boolean; jellyfin: boolean };
  available: { plex: boolean; jellyfin: boolean };
}) {
  return (
    <ul className="divide-y divide-border">
      {(available.plex || linked.plex) && <PlexRow linked={linked.plex} available={available.plex} />}
      {(available.jellyfin || linked.jellyfin) && (
        <JellyfinRow linked={linked.jellyfin} available={available.jellyfin} />
      )}
    </ul>
  );
}
