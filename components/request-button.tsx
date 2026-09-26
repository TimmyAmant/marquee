"use client";

import { useActionState } from "react";
import { createRequestAction } from "@/lib/requests/actions";
import type { MediaType } from "@/lib/db/schema";

export function RequestButton({
  mediaType,
  tmdbId,
  title,
  posterPath,
  compact = false,
  alreadyRequested = false,
  formId,
}: {
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  /** Small, full-width, hover-reveal styling for a poster card's quick-action
   * slot — matches QuickAddButton so franchise/similar-titles rows read the
   * same way for members as they do for the admin's Add button. */
  compact?: boolean;
  /** Server-known request state (e.g. from getActiveRequestStatusMap) for
   * rows rendering many titles at once — without this the button only knows
   * about a request made in the current client session, so a franchise/
   * similar-titles row would show "Request" again for something already
   * requested on an earlier visit. */
  alreadyRequested?: boolean;
  /** The form's id, for an Advanced section elsewhere on the page to send
   * its fields with it (components/add-advanced-options.tsx). */
  formId?: string;
}) {
  const action = createRequestAction.bind(null, mediaType, tmdbId, title, posterPath);
  const [state, formAction, isPending] = useActionState(action, undefined);

  if (state?.success || alreadyRequested) {
    return (
      <span
        className={
          compact
            ? "block rounded-full bg-info-bg px-2 py-1 text-center text-[10px] font-medium text-info"
            : "rounded-full bg-info-bg px-4 py-1.5 text-xs font-medium text-info"
        }
      >
        {compact ? "Requested" : "Requested — waiting for approval"}
      </span>
    );
  }

  return (
    <form
      id={formId}
      action={formAction}
      className={
        compact
          ? "opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
          : undefined
      }
    >
      <button
        type="submit"
        disabled={isPending}
        className={
          compact
            ? "w-full rounded-full bg-accent px-2 py-1 text-[10px] font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
            : "rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
        }
      >
        {isPending ? "Requesting…" : "Request"}
      </button>
      {state?.error && (
        <p
          className={
            compact
              ? "mt-1 rounded bg-bg-0/90 px-1.5 py-0.5 text-center text-[9px] text-red-400"
              : "mt-1.5 text-xs text-red-400"
          }
        >
          {state.error}
        </p>
      )}
    </form>
  );
}
