"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { UserAvatar } from "@/components/user-avatar";
import { listShareMembersAction, shareTitleAction, type ShareMember } from "@/lib/sharing/actions";
import { MAX_SHARE_NOTE, marqueeUrl, outsideShareTargets } from "@/lib/sharing/parse";
import type { MediaType } from "@/lib/db/schema";

const inputClass =
  "rounded-lg border border-border bg-bg-0 px-3 py-2 text-sm text-text-primary outline-none transition-colors focus:border-accent";
const pillClass =
  "flex h-8 items-center rounded-full border border-border-strong px-3.5 text-[13px] text-text-secondary transition-colors hover:border-accent hover:text-accent";

type LinkChoice = "marquee" | "tmdb" | "imdb";

const noop = () => () => {};

/** Whether this browser has Web Share (the phone's share sheet). False on the
 * server and in browsers without it, where the dialog offers copy and quick
 * links instead. */
function useCanWebShare(): boolean {
  return useSyncExternalStore(
    noop,
    () => typeof navigator.share === "function",
    () => false,
  );
}

function useIsTouch(): boolean {
  return useSyncExternalStore(
    noop,
    () => navigator.maxTouchPoints > 0,
    () => false,
  );
}

/**
 * "Share" on a title page (and, links only, a person's page): send it to
 * someone else in the household — they get a notification that opens it —
 * or share a link outside Marquee through the phone's share sheet, with copy
 * and quick links where the browser has none. The Marquee link needs a
 * sign-in, so TMDb's (and IMDb's) public page is offered for anyone else.
 */
export function ShareButton({
  name,
  path,
  publicBase,
  links,
  sendTo,
}: {
  name: string;
  /** The page's own path, e.g. "/title/movie/425". */
  path: string;
  /** Marquee's public address when one is set; else this page's origin. */
  publicBase: string | null;
  links: { tmdb: string; imdb: string | null };
  /** The title to send to household members; omitted on a person's page. */
  sendTo?: { mediaType: MediaType; tmdbId: number };
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [members, setMembers] = useState<ShareMember[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentText, setSentText] = useState<string | null>(null);
  const [choice, setChoice] = useState<LinkChoice>("marquee");
  const [copied, setCopied] = useState(false);
  const canWebShare = useCanWebShare();
  const isTouch = useIsTouch();
  const here = useSyncExternalStore(
    noop,
    () => window.location.origin,
    () => "",
  );
  const origin = publicBase ?? here;

  const url =
    choice === "tmdb" ? links.tmdb : choice === "imdb" && links.imdb ? links.imdb : marqueeUrl(origin, path);
  const text = choice === "marquee" ? `${name} on Marquee` : name;
  const targets = outsideShareTargets(text, url);

  function open() {
    setError(null);
    setSentText(null);
    setCopied(false);
    dialogRef.current?.showModal();
    if (sendTo && members === null) {
      listShareMembersAction()
        .then(setMembers)
        .catch(() => setMembers([]));
    }
  }

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function send() {
    if (!sendTo) return;
    if (picked.size === 0) {
      setError("Pick who to share it with.");
      return;
    }
    setBusy(true);
    setError(null);
    setSentText(null);
    const result = await shareTitleAction(sendTo.mediaType, sendTo.tmdbId, [...picked], note).catch(() => ({
      error: "Couldn't send it. Try again.",
      sharedWith: undefined,
    }));
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    const names = (members ?? []).filter((m) => picked.has(m.id)).map((m) => m.label);
    setSentText(names.length === 1 ? `Sent to ${names[0]}.` : `Sent to ${result.sharedWith ?? names.length} people.`);
    setPicked(new Set());
    setNote("");
  }

  async function webShare() {
    try {
      await navigator.share({ title: name, text, url });
    } catch {
      // Dismissed, or the browser refused: nothing to report.
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const noteLength = Array.from(note).length;

  return (
    <>
      <button type="button" onClick={open} className={pillClass}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden className="mr-1.5 h-3.5 w-3.5">
          <path d="M12 3v12M7 8l5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Share
      </button>
      <dialog
        ref={dialogRef}
        aria-label={`Share ${name}`}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[min(28rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-border bg-bg-1 p-0 text-text-primary backdrop:bg-black/60"
      >
        <div className="flex flex-col gap-5 p-6">
          <div className="flex items-start justify-between gap-4">
            <h3 className="font-display text-xl">Share “{name}”</h3>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label="Close"
              className="-mr-2 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors hover:text-text-primary"
            >
              ✕
            </button>
          </div>

          {sendTo && (
            <section className="flex flex-col gap-3">
              <h4 className="text-sm font-medium text-text-primary">Send to someone in the household</h4>
              {members === null ? (
                <p className="text-sm text-text-secondary">Loading…</p>
              ) : members.length === 0 ? (
                <p className="text-sm text-text-secondary">No one else has an account here yet.</p>
              ) : (
                <>
                  <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
                    {members.map((member) => (
                      <li key={member.id}>
                        <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm text-text-primary transition-colors hover:bg-bg-0">
                          <input
                            type="checkbox"
                            checked={picked.has(member.id)}
                            onChange={() => toggle(member.id)}
                            className="h-4 w-4 accent-accent"
                          />
                          <UserAvatar label={member.label} src={member.avatarUrl} size={28} />
                          <span className="truncate">{member.label}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
                    <span className="flex justify-between">
                      Add a note (optional)
                      {noteLength > MAX_SHARE_NOTE - 40 && (
                        <span className={noteLength > MAX_SHARE_NOTE ? "text-red-400" : ""}>
                          {noteLength}/{MAX_SHARE_NOTE}
                        </span>
                      )}
                    </span>
                    <textarea
                      value={note}
                      rows={2}
                      maxLength={MAX_SHARE_NOTE * 2}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="e.g. You'd love this one"
                      className={inputClass}
                    />
                  </label>
                  {error && <p className="text-sm text-red-400">{error}</p>}
                  {sentText && <p className="text-sm text-accent">{sentText}</p>}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={busy || picked.size === 0}
                      onClick={send}
                      className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
                    >
                      {busy ? "Sending…" : "Send"}
                    </button>
                  </div>
                </>
              )}
            </section>
          )}

          <section className={`flex flex-col gap-3 ${sendTo ? "border-t border-border pt-5" : ""}`}>
            <h4 className="text-sm font-medium text-text-primary">Share a link</h4>
            <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Which link">
              {(
                [
                  ["marquee", "Marquee", "they'll need to sign in"],
                  ["tmdb", "TMDb", "anyone can open it"],
                  ...(links.imdb ? ([["imdb", "IMDb", "anyone can open it"]] as const) : []),
                ] as const
              ).map(([value, label, hint]) => (
                <label key={value} className="flex items-center gap-2 text-sm text-text-secondary">
                  <input
                    type="radio"
                    name="share-link"
                    checked={choice === value}
                    onChange={() => {
                      setChoice(value);
                      setCopied(false);
                    }}
                    className="h-4 w-4 accent-accent"
                  />
                  <span>
                    <span className="text-text-primary">{label}</span> — {hint}
                  </span>
                </label>
              ))}
            </div>
            <p className="truncate rounded-lg bg-bg-0 px-3 py-2 font-mono text-[12px] text-text-secondary" title={url}>
              {url}
            </p>
            <div className="flex flex-wrap gap-2">
              {canWebShare && (
                <button
                  type="button"
                  onClick={webShare}
                  className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover"
                >
                  Share…
                </button>
              )}
              <button type="button" onClick={copy} className={pillClass}>
                {copied ? "Copied" : "Copy link"}
              </button>
              {!canWebShare && (
                <>
                  <a href={targets.sms} className={pillClass}>
                    Text message
                  </a>
                  <a href={targets.email} className={pillClass}>
                    Email
                  </a>
                  <a href={targets.whatsapp} target="_blank" rel="noopener noreferrer" className={pillClass}>
                    WhatsApp
                  </a>
                  {isTouch && (
                    <a href={targets.messenger} className={pillClass}>
                      Messenger
                    </a>
                  )}
                </>
              )}
            </div>
          </section>
        </div>
      </dialog>
    </>
  );
}
