"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { requestSeasonsAction } from "@/lib/requests/actions";
import { SeasonPickerDialog, type SeasonPickerRow } from "@/components/season-picker-dialog";

export type { SeasonPickerRow };

/**
 * A member's Request button for a TV show: opens a list of the show's
 * seasons (same order as the Episodes accordion) to pick which ones to ask
 * for. Seasons already in the library, monitored, or already requested show
 * why they can't be picked instead of a checkbox. Escape, Cancel or a click
 * outside closes it and hands focus back to the button.
 */
export function SeasonRequestPicker({
  tmdbId,
  showName,
  rows,
  triggerLabel,
}: {
  tmdbId: number;
  showName: string;
  rows: SeasonPickerRow[];
  /** "Request" for a show not in the library yet, "Request more seasons" once it is. */
  triggerLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  async function submit(seasons: number[]): Promise<string | null> {
    const result = await requestSeasonsAction(tmdbId, seasons);
    if (result.error) return result.error;
    setOpen(false);
    // The pending state comes from the server render, same as the
    // whole-series Request button's after a refresh.
    router.refresh();
    return null;
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="flex h-8 items-center rounded-full bg-accent px-4 text-[13px] font-semibold text-bg-0 transition-colors hover:bg-accent-hover"
      >
        {triggerLabel}
      </button>

      {open && (
        <SeasonPickerDialog
          heading="Request seasons"
          subheading={showName}
          rows={rows}
          submitLabel={(count, pending) =>
            pending
              ? "Requesting…"
              : count === 0
                ? "Request seasons"
                : `Request ${count} season${count === 1 ? "" : "s"}`
          }
          onSubmit={submit}
          onClose={close}
        />
      )}
    </>
  );
}
