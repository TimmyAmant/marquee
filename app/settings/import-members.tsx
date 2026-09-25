"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ImportCandidate } from "@/lib/auth/media-signin";
import { importMembersAction, listImportCandidatesAction, setMediaServerSignupAction } from "./media-actions";

const LABEL = { plex: "Plex", jellyfin: "Jellyfin" } as const;
type Provider = keyof typeof LABEL;

const buttonClass =
  "rounded-full border border-border-strong px-4 py-2 text-sm text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-60";

/** The people on the admin's Plex/Jellyfin, each with a checkbox; the ones
 * already linked to an account are shown but can't be picked. */
function ImportDialog({ provider, onClose }: { provider: Provider; onClose: (message?: string) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [candidates, setCandidates] = useState<ImportCandidate[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    dialogRef.current?.showModal();
    let active = true;
    listImportCandidatesAction(provider).then((result) => {
      if (!active) return;
      if (result.error) setError(result.error);
      else setCandidates(result.results ?? []);
    });
    return () => {
      active = false;
    };
  }, [provider]);

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleImport() {
    setBusy(true);
    setError(null);
    const result = await importMembersAction(provider, [...selected]);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    const created = result.created ?? 0;
    onClose(created === 1 ? "Added 1 household member." : `Added ${created} household members.`);
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={() => onClose()}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-border bg-bg-1 p-0 text-text-primary backdrop:bg-black/60"
    >
      <div className="p-6">
        <h3 className="font-display text-xl">Import from {LABEL[provider]}</h3>
        <p className="mt-1 text-sm text-text-secondary">
          Each person gets a member account and signs in with {LABEL[provider]}.
        </p>

        <div className="mt-4 max-h-80 overflow-y-auto rounded-xl border border-border">
          {candidates === null && !error && <p className="px-4 py-3 text-sm text-text-muted">Loading…</p>}
          {candidates?.length === 0 && (
            <p className="px-4 py-3 text-sm text-text-muted">Nobody else has access to your {LABEL[provider]} server.</p>
          )}
          {candidates && candidates.length > 0 && (
            <ul className="divide-y divide-border">
              {candidates.map((c) => (
                <li key={c.id}>
                  <label className="flex items-center gap-3 px-4 py-3 text-sm">
                    <input
                      type="checkbox"
                      disabled={c.alreadyMember}
                      checked={c.alreadyMember || selected.has(c.id)}
                      onChange={() => toggle(c.id)}
                      className="h-4 w-4 rounded border-border accent-accent"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{c.displayName || c.username}</span>
                      {c.displayName && <span className="block truncate text-text-muted">{c.username}</span>}
                    </span>
                    {c.alreadyMember && <span className="text-xs text-text-muted">Already a member</span>}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={() => dialogRef.current?.close()} className={buttonClass}>
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || selected.size === 0}
            onClick={handleImport}
            className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {busy ? "Importing…" : selected.size > 0 ? `Import ${selected.size}` : "Import"}
          </button>
        </div>
      </div>
    </dialog>
  );
}

/** The admin's "Import from Plex / Jellyfin" buttons (only for a connected
 * server) and the "New accounts from Plex/Jellyfin sign-in" setting. */
export function ImportMembers({
  available,
  mediaServerSignup,
}: {
  available: { plex: boolean; jellyfin: boolean };
  mediaServerSignup: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<Provider | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [signup, setSignup] = useState(mediaServerSignup);
  const [signupError, setSignupError] = useState<string | null>(null);

  const providers = (["plex", "jellyfin"] as const).filter((p) => available[p]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {providers.map((provider) => (
          <button
            key={provider}
            type="button"
            onClick={() => {
              setMessage(null);
              setOpen(provider);
            }}
            className={buttonClass}
          >
            Import from {LABEL[provider]}
          </button>
        ))}
      </div>
      {message && <p className="text-sm text-owned">{message}</p>}

      <label className="flex items-start gap-2 text-sm text-text-secondary">
        <input
          type="checkbox"
          checked={signup}
          onChange={async (e) => {
            const value = e.target.checked;
            setSignup(value);
            setSignupError(null);
            const result = await setMediaServerSignupAction(value);
            if (result.error) {
              setSignup(!value);
              setSignupError(result.error);
            }
          }}
          className="mt-0.5 h-4 w-4 rounded border-border accent-accent"
        />
        <span>
          New accounts from {providers.map((p) => LABEL[p]).join("/")} sign-in
          <span className="mt-0.5 block text-xs text-text-muted">
            Anyone who can use your server gets a member account the first time they sign in, including anyone you
            remove here, who can come straight back. Off: only the people you import (or who link their account)
            can sign in that way.
          </span>
        </span>
      </label>
      {signupError && <p className="text-sm text-red-400">{signupError}</p>}

      {open && (
        <ImportDialog
          provider={open}
          onClose={(done) => {
            setOpen(null);
            if (done) {
              setMessage(done);
              router.refresh();
            }
          }}
        />
      )}
    </div>
  );
}
