"use client";

import { useActionState } from "react";
import { toggleFavorite } from "@/lib/favorites/actions";
import type { FavoriteEntityType } from "@/lib/db/schema";

export function FavoriteButton({
  entityType,
  tmdbId,
  initialFavorited,
}: {
  entityType: FavoriteEntityType;
  tmdbId: number;
  initialFavorited: boolean;
}) {
  const action = toggleFavorite.bind(null, entityType, tmdbId);
  const [state, formAction, isPending] = useActionState(action, undefined);

  const favorited = state?.favorited ?? initialFavorited;

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
