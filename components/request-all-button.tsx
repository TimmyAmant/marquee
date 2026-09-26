"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestAllMissingAction } from "@/lib/requests/actions";
import type { MediaType } from "@/lib/db/schema";

/** A household member's "Request all N missing" on a franchise row — the
 * admin's AddAllButton counterpart. `count` is only what the button says:
 * the server works the set out again from the title the row sits on. */
export function RequestAllButton({
  mediaType,
  tmdbId,
  count,
}: {
  /** The title page this row is on (not one of the row's titles). */
  mediaType: MediaType;
  tmdbId: number;
  count: number;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "pending" | "done">("idle");
  const [message, setMessage] = useState("");

  if (count === 0 && state === "idle") return null;

  async function handleClick() {
    const confirmed = window.confirm(`Request all ${count} missing title${count === 1 ? "" : "s"}?`);
    if (!confirmed) return;

    setState("pending");
    const result = await requestAllMissingAction(mediaType, tmdbId).catch(() => ({
      error: "Something went wrong. Try again.",
      message: undefined,
    }));
    setMessage(result.error ?? result.message ?? "");
    setState("done");
    // The posters pick up their "Requested" state.
    router.refresh();
  }

  if (state === "done") {
    return (
      <span role="status" className="text-xs text-text-secondary">
        {message}
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
      {state === "pending" ? "Requesting…" : `Request all ${count} missing`}
    </button>
  );
}
