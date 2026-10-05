"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { toggleFavorite } from "@/lib/favorites/actions";
import type { FavoriteEntityType } from "@/lib/db/schema";
import { useT } from "@/lib/i18n/client";
import { showToast } from "@/components/toast";

export function FavoriteButton({
  entityType,
  tmdbId,
  initialFavorited,
  compact = false,
}: {
  entityType: FavoriteEntityType;
  tmdbId: number;
  initialFavorited: boolean;
  /** Icon-only, no label — for placement inline next to a poster card's
   * year/subtitle line rather than as a standalone page-header action. */
  compact?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const action = toggleFavorite.bind(null, entityType, tmdbId);
  const [state, formAction, isPending] = useActionState(action, undefined);

  useEffect(() => {
    if (state?.favorited !== undefined) {
      // Refresh so a page listing favorites (e.g. /favorites) drops the item
      // immediately instead of leaving a stale card until the next navigation.
      router.refresh();
    }
  }, [state?.favorited, router]);

  // The compact star has no room for the error line under it: a toast says
  // it instead (once per try — each try's state is a new object).
  useEffect(() => {
    if (compact && state?.error) showToast(state.error, "error");
  }, [compact, state]);

  const favorited = state?.favorited ?? initialFavorited;

  if (compact) {
    return (
      <form action={formAction}>
        <button
          type="submit"
          disabled={isPending}
          aria-pressed={favorited}
          aria-label={favorited ? t("discover.removeFavorite") : t("discover.addFavorite")}
          title={state?.error}
          className={`flex h-5 w-5 items-center justify-center rounded-full text-sm leading-none transition-colors disabled:opacity-60 ${
            favorited ? "text-accent" : "text-text-muted hover:text-text-primary"
          }`}
        >
          {favorited ? "★" : "☆"}
        </button>
      </form>
    );
  }

  return (
    <form action={formAction}>
      <button
        type="submit"
        disabled={isPending}
        aria-pressed={favorited}
        className={`flex h-[26px] items-center gap-[5px] rounded-[13px] border pl-[9px] pr-[11px] text-[12px] font-medium transition-colors disabled:opacity-60 ${
          favorited
            ? "border-accent bg-accent/10 text-accent"
            : "border-border-strong text-text-primary hover:border-accent hover:text-accent"
        }`}
      >
        <span>{favorited ? "★" : "☆"}</span>
        {favorited ? t("discover.favorited") : t("discover.favorite")}
      </button>
      {state?.error && <p className="mt-1 text-xs text-red-400">{state.error}</p>}
    </form>
  );
}
