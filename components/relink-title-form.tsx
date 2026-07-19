"use client";

import { useState, useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { relinkTitleAction } from "@/app/title/[type]/[id]/actions";
import type { MediaType } from "@/lib/db/schema";

export function RelinkTitleForm({ mediaType, tmdbId }: { mediaType: MediaType; tmdbId: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const action = relinkTitleAction.bind(null, mediaType, tmdbId);
  const [state, formAction, isPending] = useActionState(action, undefined);

  useEffect(() => {
    if (state?.success && state.newTmdbId) {
      router.push(`/title/${mediaType}/${state.newTmdbId}`);
    }
  }, [state, mediaType, router]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-text-muted underline decoration-dotted hover:text-accent"
      >
        Wrong match? Fix ID
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="flex max-w-md flex-col gap-2 rounded-xl border border-border bg-bg-1 p-3 text-xs"
    >
      <p className="text-text-secondary">
        Fill in whichever id you have — this repoints your synced library to the correct title
        without needing to fix the match in Plex/Jellyfin/Sonarr itself.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          name="tmdbId"
          placeholder="TMDb ID"
          className="w-24 rounded-lg border border-border bg-bg-0 px-2.5 py-1.5 text-text-primary outline-none focus:border-accent"
        />
        <input
          type="text"
          name="imdbId"
          placeholder="IMDb ID (tt…)"
          className="w-32 rounded-lg border border-border bg-bg-0 px-2.5 py-1.5 text-text-primary outline-none focus:border-accent"
        />
        {mediaType === "tv" && (
          <input
            type="text"
            name="tvdbId"
            placeholder="TVDB ID"
            className="w-24 rounded-lg border border-border bg-bg-0 px-2.5 py-1.5 text-text-primary outline-none focus:border-accent"
          />
        )}
      </div>
      {state?.error && <p className="text-red-400">{state.error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-full bg-accent px-3 py-1.5 font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {isPending ? "Fixing…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-full border border-border-strong px-3 py-1.5 text-text-primary transition-colors hover:border-accent hover:text-accent"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
