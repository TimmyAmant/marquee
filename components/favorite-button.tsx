"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { toggleFavorite } from "@/lib/favorites/actions";
import type { FavoriteEntityType } from "@/lib/db/schema";

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

  const favorited = state?.favorited ?? initialFavorited;

  if (compact) {
    return (
      <form action={formAction}>
        <button
          type="submit"
          disabled={isPending}
          aria-pressed={favorited}
          aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
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
        className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
          favorited
            ? "border-accent bg-accent/10 text-accent"
            : "border-border text-text-secondary hover:border-border-strong hover:text-text-primary"
        }`}
      >
        <span>{favorited ? "★" : "☆"}</span>
        {favorited ? "Favorited" : "Favorite"}
      </button>
      {state?.error && <p className="mt-1 text-xs text-red-400">{state.error}</p>}
    </form>
  );
}
