"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelRequestAction, editRequestAction, requestEditOptionsAction } from "@/lib/requests/actions";
import { SeasonPickerDialog } from "@/components/season-picker-dialog";
import type { RequestEditOptions } from "@/lib/api/types";

// Changing your mind about a request while it waits for review: Cancel,
// and Edit (other seasons, or 4K). Reviewers get Edit on anyone's pending
// request too, before approving. The server re-checks everything
// (lib/requests/mutate.ts: cancelRequest, editRequest).

const linkButton = "text-xs text-text-secondary hover:text-accent disabled:opacity-60";

/** "Cancel request", then "Cancel it? Yes / Keep it". */
export function CancelRequestButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function cancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelRequestAction(requestId);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {confirming ? (
        <>
          <span className="text-xs text-text-secondary">Cancel it?</span>
          <button type="button" onClick={cancel} disabled={busy} className="text-xs font-medium text-red-400 hover:text-red-300 disabled:opacity-60">
            {busy ? "Cancelling…" : "Yes, cancel"}
          </button>
          <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={linkButton}>
            Keep it
          </button>
        </>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className={linkButton}>
          Cancel request
        </button>
      )}
      {error && <span className="basis-full text-xs text-red-400">{error}</span>}
    </span>
  );
}

/** "Edit": the season picker with this request's seasons ticked, plus
 * "Whole series" and "In 4K" where they apply. */
export function EditRequestButton({ requestId, label = "Edit" }: { requestId: string; label?: string }) {
  const router = useRouter();
  const [options, setOptions] = useState<RequestEditOptions | null>(null);
  const [whole, setWhole] = useState(false);
  const [fourK, setFourK] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const triggerRef = useRef<HTMLButtonElement>(null);

  function open() {
    setError(null);
    startLoading(async () => {
      const result = await requestEditOptionsAction(requestId);
      if (!result.options) {
        setError(result.error ?? "Couldn't load this request.");
        return;
      }
      setWhole(result.options.seasons === null);
      setFourK(result.options.is4k);
      setOptions(result.options);
    });
  }

  function close() {
    setOptions(null);
    triggerRef.current?.focus();
  }

  async function submit(seasons: number[]): Promise<string | null> {
    if (!options) return null;
    const isTv = options.mediaType === "tv";
    const result = await editRequestAction(requestId, {
      is4k: fourK,
      ...(isTv ? { seasons: fourK || whole ? null : seasons } : {}),
    });
    if (result.error) return result.error;
    setOptions(null);
    router.refresh();
    return null;
  }

  const isTv = options?.mediaType === "tv";
  return (
    <>
      <button ref={triggerRef} type="button" onClick={open} disabled={loading} className={linkButton} aria-haspopup="dialog">
        {loading ? "Loading…" : label}
      </button>
      {error && <span className="ml-2 text-xs text-red-400">{error}</span>}
      {options && (
        <SeasonPickerDialog
          heading="Change request"
          subheading={options.title}
          rows={options.seasonRows}
          initialSelected={options.seasons ?? []}
          listDisabled={!isTv || whole || fourK}
          allowEmpty={!isTv || whole || fourK}
          extra={
            <div className="flex flex-col gap-1.5 text-[13px] text-text-primary">
              {isTv && (
                <>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`scope-${requestId}`}
                      checked={whole}
                      disabled={fourK}
                      onChange={() => setWhole(true)}
                      className="h-4 w-4 accent-accent"
                    />
                    The whole series
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`scope-${requestId}`}
                      checked={!whole}
                      disabled={fourK}
                      onChange={() => setWhole(false)}
                      className="h-4 w-4 accent-accent"
                    />
                    Just these seasons
                  </label>
                </>
              )}
              {options.fourKAvailable ? (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={fourK}
                    onChange={(e) => setFourK(e.target.checked)}
                    className="h-4 w-4 accent-accent"
                  />
                  In 4K{isTv ? " (always the whole show)" : ""}
                </label>
              ) : (
                !isTv && <p className="text-text-muted">There&apos;s nothing to change: 4K isn&apos;t set up on this server.</p>
              )}
            </div>
          }
          submitLabel={(_count, pending) => (pending ? "Saving…" : "Save changes")}
          onSubmit={submit}
          onClose={close}
        />
      )}
    </>
  );
}
