"use client";

import { useActionState } from "react";
import { showToast } from "@/components/toast";
import { offerCollection } from "@/components/collection-prompt";
import { createRequestAction } from "@/lib/requests/actions";
import type { MediaType } from "@/lib/db/schema";
import { useT } from "@/lib/i18n/client";
import { PILL, PILL_ACCENT } from "@/components/pill-styles";

export function RequestButton({
  mediaType,
  tmdbId,
  title,
  posterPath,
  compact = false,
  alreadyRequested = false,
  formId,
  autoApprove = false,
  split,
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
  /** The request will be approved at once — shown as a hint under the button. */
  autoApprove?: boolean;
  /** Joined onto the right of the Request capsule (the title page's
   * "Advanced" chevron, making it a split button). */
  split?: React.ReactNode;
}) {
  const t = useT();
  const request = createRequestAction.bind(null, mediaType, tmdbId, title, posterPath);
  // Told from the action itself, not an effect: the page's refresh after a
  // request can swap this button out before an effect would run.
  const action: typeof request = async (prev, formData) => {
    const result = await request(prev, formData);
    if (result?.success) {
      showToast(t("title.requestedToast", { title }));
      // A movie in a collection: offer the rest of it.
      if (mediaType === "movie") offerCollection(tmdbId);
    }
    return result;
  };
  const [state, formAction, isPending] = useActionState(action, undefined);

  if (state?.success || alreadyRequested) {
    return compact ? (
      <span className="block rounded-full bg-info-bg px-2 py-1 text-center text-[10px] font-medium text-info">
        {t("title.requested")}
      </span>
    ) : (
      <span className={`${PILL} bg-info-bg font-medium text-info`}>{t("title.requestedWaiting")}</span>
    );
  }

  if (compact) {
    return (
      <form
        id={formId}
        action={formAction}
        className="opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
      >
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-full bg-accent px-2 py-1 text-[10px] font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {isPending ? t("title.requesting") : t("common.request")}
        </button>
        {state?.error && (
          <p className="mt-1 rounded bg-bg-0/90 px-1.5 py-0.5 text-center text-[9px] text-red-400">{state.error}</p>
        )}
      </form>
    );
  }

  // The title page's action row: the form's box is dropped (`contents`) so
  // the capsule lines up with its neighbours, and the hint / error go to a
  // line of their own at the end of the row.
  return (
    <form id={formId} action={formAction} className="contents">
      <span className="inline-flex shrink-0 items-center">
        <button type="submit" disabled={isPending} className={`${PILL_ACCENT} ${split ? "rounded-r-none pr-3" : ""}`}>
          {isPending ? t("title.requesting") : t("common.request")}
        </button>
        {split}
      </span>
      {state?.error && <p className="order-last basis-full text-xs text-red-400">{state.error}</p>}
      {autoApprove && !state?.error && (
        <p className="order-last basis-full text-[11px] text-text-muted">{t("title.autoApproveBanner")}</p>
      )}
    </form>
  );
}
