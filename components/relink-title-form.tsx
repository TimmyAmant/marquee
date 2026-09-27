"use client";

import { useState, useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { relinkTitleAction } from "@/app/title/[type]/[id]/actions";
import type { MediaType } from "@/lib/db/schema";
import { useT } from "@/lib/i18n/client";
import { MENU_ITEM, PILL_OUTLINE } from "@/components/pill-styles";

/** "Fix ID": a pill, or a row of the title page's "…" menu
 * (`variant="menu"`), that opens the relink form in place. */
export function RelinkTitleForm({
  mediaType,
  tmdbId,
  variant = "pill",
}: {
  mediaType: MediaType;
  tmdbId: number;
  variant?: "pill" | "menu";
}) {
  const t = useT();
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
        className={variant === "menu" ? MENU_ITEM : PILL_OUTLINE}
      >
        {t("title.fixId")}
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className={`flex max-w-md flex-col gap-2 text-xs ${
        variant === "menu" ? "px-3 py-2" : "rounded-xl border border-border bg-bg-1 p-3"
      }`}
    >
      <p className="text-text-secondary">
        {t("title.fixIdHelp")}
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          name="tmdbId"
          placeholder={t("title.tmdbIdPlaceholder")}
          className="w-24 rounded-lg border border-border bg-bg-0 px-2.5 py-1.5 text-text-primary outline-none focus:border-accent"
        />
        <input
          type="text"
          name="imdbId"
          placeholder={t("title.imdbIdPlaceholder")}
          className="w-32 rounded-lg border border-border bg-bg-0 px-2.5 py-1.5 text-text-primary outline-none focus:border-accent"
        />
        {mediaType === "tv" && (
          <input
            type="text"
            name="tvdbId"
            placeholder={t("title.tvdbIdPlaceholder")}
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
          {isPending ? t("title.fixing") : t("common.save")}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-full border border-border-strong px-3 py-1.5 text-text-primary transition-colors hover:border-accent hover:text-accent"
        >
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
