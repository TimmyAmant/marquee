"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { unmonitorTitle } from "@/app/library/actions";

export function UnmonitorButton({
  mediaType,
  tmdbId,
}: {
  mediaType: "movie" | "tv";
  tmdbId: number;
}) {
  const router = useRouter();
  const action = unmonitorTitle.bind(null, mediaType, tmdbId);
  const [state, formAction, isPending] = useActionState(action, undefined);

  useEffect(() => {
    if (state?.success) {
      // Refresh so this title actually disappears from the list — it was
      // just told to stop being tracked, so it shouldn't still be here.
      router.refresh();
    }
  }, [state?.success, router]);

  if (state?.success) {
    return (
      <span className="block rounded-full bg-untracked-bg px-2 py-1 text-center text-[10px] font-medium text-text-secondary">
        Removed
      </span>
    );
  }

  return (
    <form action={formAction} className="opacity-0 transition-opacity group-hover:opacity-100">
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-full border border-border-strong bg-bg-0/90 px-2 py-1 text-[10px] font-medium text-text-primary backdrop-blur-sm transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
      >
        {isPending ? "Updating…" : "Stop monitoring"}
      </button>
      {state?.error && (
        <p className="mt-1 rounded bg-bg-0/90 px-1.5 py-0.5 text-center text-[9px] text-red-400">
          {state.error}
        </p>
      )}
    </form>
  );
}
