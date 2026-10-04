"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { removeFromArrAction } from "@/app/title/[type]/[id]/actions";
import type { MediaType } from "@/lib/db/schema";
import { useT } from "@/lib/i18n/client";
import { MENU_ITEM } from "@/components/pill-styles";
import { showToast } from "@/components/toast";
import { ReasonChoices } from "@/components/decline-reason-chooser";
import { CUSTOM_REJECTION_REASON } from "@/lib/requests/rejection-reasons";

/** "Remove from Radarr/Sonarr" in the title page's "…" menu (admin): asks
 * first, with "Also delete the files" off and an optional reason for whoever
 * requested it (the decline chooser's presets), then takes the title off
 * every server that has it (lib/arr/remove.ts). With `fourK`, "Remove from
 * Radarr 4K": the same, for the 4K servers. */
export function RemoveFromArrButton({
  mediaType,
  tmdbId,
  tvdbId,
  name,
  fourK = false,
}: {
  mediaType: MediaType;
  tmdbId: number;
  tvdbId: number | null;
  name: string;
  fourK?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [reason, setReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const app = `${mediaType === "movie" ? "Radarr" : "Sonarr"}${fourK ? " 4K" : ""}`;

  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("input, button")?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !isPending) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, isPending]);

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await removeFromArrAction(mediaType, tmdbId, tvdbId, deleteFiles, fourK, {
        preset: reason,
        custom: customReason,
      }).catch(() => ({
        error: t("common.somethingWentWrong"),
        removedFrom: undefined,
      }));
      if (result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      showToast(t("title.removedFromArr", { app }));
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          // The "…" menu closes on Escape (components/title-more-menu.tsx),
          // so the dialog isn't drawn over it.
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
          setDeleteFiles(false);
          setReason("");
          setCustomReason("");
          setError(null);
          setOpen(true);
        }}
        className={`${MENU_ITEM} hover:text-red-400`}
      >
        {t("title.removeFromArr", { app })}
      </button>
      {open &&
        createPortal(
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="fixed inset-0 z-[58] flex items-end justify-center p-4 sm:items-center"
          >
            <div aria-hidden onClick={() => !isPending && setOpen(false)} className="absolute inset-0 bg-black/40" />
            <div
              ref={panelRef}
              className="nav-glass relative flex w-full max-w-[420px] flex-col gap-4 rounded-[24px] p-5 shadow-[0_24px_60px_rgb(0_0_0/0.35)]"
            >
              <div>
                <h2 id={titleId} className="font-display text-[18px] font-semibold leading-6 text-text-primary">
                  {t("title.removeFromArrTitle", { name, app })}
                </h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">{t("title.removeFromArrBody", { app })}</p>
              </div>
              <label className="flex items-start gap-2.5 text-[13px] text-text-primary">
                <input
                  type="checkbox"
                  checked={deleteFiles}
                  onChange={(e) => setDeleteFiles(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-red-400"
                />
                <span>
                  {t("title.removeFromArrDeleteFiles")}
                  <span className="mt-0.5 block text-xs text-text-muted">{t("title.removeFromArrDeleteFilesHelp")}</span>
                </span>
              </label>
              <fieldset className="flex flex-col gap-2 text-[13px]">
                <legend className="mb-2 text-text-secondary">{t("title.removeFromArrReason")}</legend>
                <ReasonChoices
                  reason={reason}
                  onReasonChange={setReason}
                  customReason={customReason}
                  onCustomReasonChange={setCustomReason}
                  optional
                />
              </fieldset>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={isPending}
                  className="rounded-full border border-border-strong px-4 py-2 text-sm text-text-primary hover:border-accent hover:text-accent disabled:opacity-60"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={remove}
                  disabled={isPending || (reason === CUSTOM_REJECTION_REASON && !customReason.trim())}
                  className="rounded-full bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-60"
                >
                  {isPending
                    ? t("title.removingFromArr")
                    : deleteFiles
                      ? t("title.removeAndDelete")
                      : t("common.remove")}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
