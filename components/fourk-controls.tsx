"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestFourKAction } from "@/lib/requests/actions";
import { addToFourK } from "@/app/title/[type]/[id]/actions";
import type { MediaType } from "@/lib/db/schema";
import type { AddOverrides } from "@/lib/arr/add-options";
import { AddAdvancedPanel, AdvancedSplitToggle, useAddAdvancedOptions } from "@/components/add-advanced-options";
import { PILL } from "@/components/pill-styles";
import type { FourKViewerState } from "@/lib/api/types";
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translator";

const FOURK_LABEL: Record<FourKViewerState["status"], MessageKey | null> = {
  owned: "title.fourKOwned",
  tracked_downloading: "title.fourKDownloading",
  // Finished; still to be moved in by hand — to the viewer, on its way.
  ready_to_move: "title.fourKDownloading",
  tracked_monitored: "title.fourKMissing",
  tracked_unmonitored: "title.fourKUnmonitored",
  coming_soon: "title.fourKComingSoon",
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
  advanced = false,
}: {
  mediaType: MediaType;
  tmdbId: number;
  fourK: FourKViewerState;
  /** A member may pick the server, quality and folder (advancedRequests). */
  advanced?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestedNow, setRequestedNow] = useState(false);
  const [addedNow, setAddedNow] = useState(false);
  // The Advanced picks, when that's open; null sends none (the defaults).
  const [overrides, setOverrides] = useState<AddOverrides | null>(null);
  const labelKey = FOURK_LABEL[fourK.status];
  const label = labelKey ? t(labelKey) : null;
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
  const showRequest = !requested && fourK.canRequest;
  const showAdd = !addedNow && fourK.canAdd;
  const requestAdvanced = useAddAdvancedOptions({ mediaType, tmdbId, is4k: true, onChange: setOverrides, forRequest: true });
  const addAdvanced = useAddAdvancedOptions({ mediaType, tmdbId, is4k: true, onChange: setOverrides });
  const button = `${PILL} border border-accent px-4 font-semibold text-accent hover:bg-accent hover:text-bg-0`;

  // Items of the title page's action row, like Add / Request: "Advanced" is
  // a chevron on the button and its panel goes to the end of the row.
  return (
    <>
      {label && <span className={`${PILL} border border-accent/40 font-medium text-accent`}>{label}</span>}
      {requested && <span className={`${PILL} bg-info-bg font-medium text-info`}>{t("title.fourKRequested")}</span>}
      {showRequest && (
        <span className="inline-flex shrink-0 items-center">
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => requestFourKAction(mediaType, tmdbId, overrides ?? undefined), () => setRequestedNow(true))}
            className={`${button} ${advanced ? "rounded-r-none pr-3" : ""}`}
          >
            {busy ? t("title.requesting") : t("title.requestIn4k")}
          </button>
          {advanced && <AdvancedSplitToggle state={requestAdvanced} tone="outline" disabled={busy} />}
        </span>
      )}
      {showAdd && (
        <span className="inline-flex shrink-0 items-center">
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => addToFourK(mediaType, tmdbId, overrides ?? undefined), () => setAddedNow(true))}
            className={`${button} rounded-r-none pr-3`}
          >
            {busy ? t("title.adding") : t("title.addTo", { app: `4K ${arrName}` })}
          </button>
          <AdvancedSplitToggle state={addAdvanced} tone="outline" disabled={busy} />
        </span>
      )}
      {showRequest && advanced && requestAdvanced.open && (
        <div className="order-last basis-full">
          <AddAdvancedPanel state={requestAdvanced} />
        </div>
      )}
      {showAdd && addAdvanced.open && (
        <div className="order-last basis-full">
          <AddAdvancedPanel state={addAdvanced} />
        </div>
      )}
      {error && <span className="order-last basis-full text-xs text-red-400">{error}</span>}
    </>
  );
}
