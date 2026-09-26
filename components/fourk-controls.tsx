"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestFourKAction } from "@/lib/requests/actions";
import { addToFourK } from "@/app/title/[type]/[id]/actions";
import type { MediaType } from "@/lib/db/schema";
import type { AddOverrides } from "@/lib/arr/add-options";
import { AddAdvancedOptions } from "@/components/add-advanced-options";
import type { FourKViewerState } from "@/lib/api/types";

const FOURK_LABEL: Record<FourKViewerState["status"], string | null> = {
  owned: "In 4K",
  tracked_downloading: "4K downloading",
  tracked_monitored: "4K missing",
  coming_soon: "4K coming soon",
  untracked: null,
};

/**
 * The title page's 4K row, when the admin has a 4K Sonarr/Radarr for this
 * type (lib/arr/fourk.ts): what the 4K instance has, then "Request in 4K"
 * for a member or "Add to 4K Radarr" for the admin.
 */
export function FourKControls({
  mediaType,
  tmdbId,
  fourK,
}: {
  mediaType: MediaType;
  tmdbId: number;
  fourK: FourKViewerState;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestedNow, setRequestedNow] = useState(false);
  const [addedNow, setAddedNow] = useState(false);
  // The Advanced picks, when that's open; null sends none (the defaults).
  const [overrides, setOverrides] = useState<AddOverrides | null>(null);
  const label = FOURK_LABEL[fourK.status];
  const arrName = mediaType === "movie" ? "Radarr" : "Sonarr";

  async function run(action: () => Promise<{ error?: string; success?: boolean }>, onDone: () => void) {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (result.error) setError(result.error);
    else {
      onDone();
      router.refresh();
    }
  }

  const requested = requestedNow || fourK.requestStatus === "pending";
  return (
    <>
      {label && (
        <span className="flex h-8 items-center rounded-full border border-accent/40 px-3.5 text-[13px] font-medium text-accent">
          {label}
        </span>
      )}
      {requested && (
        <span className="flex h-8 items-center rounded-full bg-tracked-bg px-3.5 text-[13px] font-medium text-tracked">
          4K requested
        </span>
      )}
      {!requested && fourK.canRequest && (
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => requestFourKAction(mediaType, tmdbId), () => setRequestedNow(true))}
          className="flex h-8 items-center rounded-full border border-accent px-4 text-[13px] font-semibold text-accent transition-colors hover:bg-accent hover:text-bg-0 disabled:opacity-60"
        >
          {busy ? "Requesting…" : "Request in 4K"}
        </button>
      )}
      {!addedNow && fourK.canAdd && (
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => addToFourK(mediaType, tmdbId, overrides ?? undefined), () => setAddedNow(true))}
          className="flex h-8 items-center rounded-full border border-accent px-4 text-[13px] font-semibold text-accent transition-colors hover:bg-accent hover:text-bg-0 disabled:opacity-60"
        >
          {busy ? "Adding…" : `Add to 4K ${arrName}`}
        </button>
      )}
      {!addedNow && fourK.canAdd && (
        <div className="basis-full">
          <AddAdvancedOptions mediaType={mediaType} tmdbId={tmdbId} is4k onChange={setOverrides} disabled={busy} />
        </div>
      )}
      {error && <span className="basis-full text-xs text-red-400">{error}</span>}
    </>
  );
}
