"use client";

import { useActionState } from "react";
import { createRequestAction } from "@/lib/requests/actions";
import type { MediaType } from "@/lib/db/schema";

export function RequestButton({
  mediaType,
  tmdbId,
  title,
  posterPath,
}: {
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  posterPath: string | null;
}) {
  const action = createRequestAction.bind(null, mediaType, tmdbId, title, posterPath);
  const [state, formAction, isPending] = useActionState(action, undefined);

  if (state?.success) {
    return (
      <span className="rounded-full bg-tracked-bg px-4 py-1.5 text-xs font-medium text-tracked">
        Requested — waiting for approval
      </span>
    );
  }

  return (
    <form action={formAction}>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-full bg-accent px-4 py-1.5 text-xs font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {isPending ? "Requesting…" : "Request"}
      </button>
      {state?.error && <p className="mt-1.5 text-xs text-red-400">{state.error}</p>}
    </form>
  );
}
