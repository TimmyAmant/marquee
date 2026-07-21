"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { addMovieToRadarr, addSeriesToSonarr } from "@/app/title/[type]/[id]/actions";

export function QuickAddButton({
  mediaType,
  tmdbId,
}: {
  mediaType: "movie" | "tv";
  tmdbId: number;
}) {
  const router = useRouter();
  const action =
    mediaType === "movie" ? addMovieToRadarr.bind(null, tmdbId) : addSeriesToSonarr.bind(null, tmdbId);
  const [state, formAction, isPending] = useActionState(action, undefined);

  useEffect(() => {
    if (state?.success) {
      // Refresh so server-rendered badges/hide-owned filtering pick up the
      // add immediately, instead of waiting for the next full navigation.
      router.refresh();
    }
  }, [state?.success, router]);

  if (state?.success) {
    return (
      <span className="block rounded-full bg-owned-bg px-2 py-1 text-center text-[10px] font-medium text-owned">
        Added
      </span>
    );
  }

  return (
    <form
      action={formAction}
      className="opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
    >
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-full bg-accent px-2 py-1 text-[10px] font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {isPending ? "Adding…" : `+ Add to ${mediaType === "movie" ? "Radarr" : "Sonarr"}`}
      </button>
      {state?.error && (
        <p className="mt-1 rounded bg-bg-0/90 px-1.5 py-0.5 text-center text-[9px] text-red-400">
          {state.error}
        </p>
      )}
    </form>
  );
}
