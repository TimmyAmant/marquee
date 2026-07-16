"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addMovieToRadarr, addSeriesToSonarr } from "@/app/title/[type]/[id]/actions";
import type { MediaType } from "@/lib/db/schema";

export function AddAllButton({
  items,
}: {
  /** Only titles not already owned/tracked — callers filter before passing
   * these in, so every id here actually needs adding. */
  items: { mediaType: MediaType; tmdbId: number }[];
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "pending" | "done">("idle");
  const [failures, setFailures] = useState(0);

  if (items.length === 0) return null;

  async function handleClick() {
    const confirmed = window.confirm(
      `Add all ${items.length} missing title${items.length === 1 ? "" : "s"} to Sonarr/Radarr?`,
    );
    if (!confirmed) return;

    setState("pending");
    const results = await Promise.allSettled(
      items.map((item) =>
        item.mediaType === "movie"
          ? addMovieToRadarr(item.tmdbId, undefined, new FormData())
          : addSeriesToSonarr(item.tmdbId, undefined, new FormData()),
      ),
    );
    const failed = results.filter(
      (r) => r.status === "rejected" || (r.status === "fulfilled" && r.value.error),
    ).length;
    setFailures(failed);
    setState("done");
    router.refresh();
  }

  if (state === "done") {
    return (
      <span className="text-xs text-text-secondary">
        {failures > 0
          ? `Added ${items.length - failures} of ${items.length} — ${failures} failed`
          : `Added all ${items.length}`}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={state === "pending"}
      className="rounded-full border border-border-strong px-3.5 py-1.5 text-xs text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
    >
      {state === "pending" ? "Adding…" : `Add all ${items.length} missing`}
    </button>
  );
}
