"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { blockTitleAction, unblockTitleAction } from "@/lib/requests/blocklist-actions";
import type { MediaType } from "@/lib/db/schema";
import { useT } from "@/lib/i18n/client";
import { MENU_ITEM, PILL_NOTE, PILL_OUTLINE } from "@/components/pill-styles";

/** The admin's "Block requests" / "Unblock requests" on a title page
 * (lib/requests/blocklist.ts). A title blocked by a keyword can only be
 * unblocked from Settings, where the keyword is. */
export function BlockRequestsButton({
  mediaType,
  tmdbId,
  blocked,
  variant = "pill",
}: {
  mediaType: MediaType;
  tmdbId: number;
  blocked: { reason: string | null; keyword: string | null } | null;
  /** A row of the title page's "…" menu instead of a pill. */
  variant?: "pill" | "menu";
}) {
  const t = useT();
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<{ error?: string }>) {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (result.error) setError(result.error);
    else {
      setAsking(false);
      setReason("");
      router.refresh();
    }
  }

  const menu = variant === "menu";
  const outline = `${PILL_OUTLINE} hover:border-red-400 hover:text-red-400`;
  const pill = menu ? `${MENU_ITEM} hover:text-red-400` : outline;

  if (blocked?.keyword) {
    return (
      <span className={menu ? "px-3 py-1.5 text-[13px] text-text-muted" : `${PILL_NOTE} text-text-muted`}>
        {t("title.blockedByKeyword", { keyword: blocked.keyword })}
      </span>
    );
  }
  if (blocked) {
    return (
      <button type="button" disabled={busy} onClick={() => run(() => unblockTitleAction(mediaType, tmdbId))} className={pill}>
        {busy ? t("title.unblocking") : t("title.unblockRequests")}
      </button>
    );
  }
  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className={pill}>
        {t("title.blockRequests")}
      </button>
    );
  }
  return (
    <span className={menu ? "flex flex-col gap-2 px-3 py-2" : "flex basis-full flex-wrap items-center gap-2"}>
      <input
        value={reason}
        maxLength={200}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t("title.blockReasonPlaceholder")}
        className="h-8 min-w-0 flex-1 rounded-full border border-border bg-bg-0 px-3.5 text-[13px] text-text-primary outline-none focus:border-accent"
      />
      <span className="flex items-center gap-2">
        <button type="button" disabled={busy} onClick={() => run(() => blockTitleAction(mediaType, tmdbId, reason))} className={outline}>
          {busy ? t("title.blocking") : t("title.block")}
        </button>
        <button type="button" onClick={() => setAsking(false)} className="text-xs text-text-secondary hover:text-accent">
          {t("common.cancel")}
        </button>
      </span>
      {error && <span className="basis-full text-xs text-red-400">{error}</span>}
    </span>
  );
}
