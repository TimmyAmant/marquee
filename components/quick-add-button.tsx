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

  // No persistent "Added" pill here — this button has no way to update the
  // poster's real status badge (a sibling prop the parent computes from
  // server data), so claiming a confirmed state indefinitely was actively
  // misleading whenever router.refresh() didn't immediately re-flow this
  // specific card: it kept reading "Added" long after the click, correcting
  // itself only on a full reload. Hiding on success instead defers entirely
  // to the real badge, which the refresh above still updates as before.
  if (state?.success) {
    return null;
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
