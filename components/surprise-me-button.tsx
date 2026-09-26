"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { surpriseMeAction, type SurpriseMeParams } from "@/app/discover/actions";
import { useT } from "@/lib/i18n/client";

export function SurpriseMeButton(params: SurpriseMeParams) {
  const t = useT();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await surpriseMeAction(params);
      if (result.href) router.push(result.href);
      else setError(result.error ?? t("common.somethingWentWrong"));
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="rounded-full border border-accent/50 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:bg-accent hover:text-bg-0 disabled:opacity-60"
      >
        {isPending ? t("discover.picking") : t("discover.surpriseMe")}
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
