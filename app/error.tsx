"use client";

import { useEffect } from "react";
import { useT } from "@/lib/i18n/client";

/** Most pages render against TMDb or a server on the LAN, so this is usually
 * "something upstream is down" rather than a bug — say so plainly and offer
 * a retry instead of Next.js's bare default error screen. */
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const t = useT();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-start gap-3 px-4 py-16 sm:pl-7 sm:pr-7">
      <h1 className="font-display text-2xl text-text-primary">{t("nav.errorTitle")}</h1>
      <p className="max-w-lg text-sm text-text-secondary">{t("nav.errorBody")}</p>
      {error.digest && <p className="text-xs text-text-muted">{t("nav.errorDigest", { digest: error.digest })}</p>}
      <button
        type="button"
        onClick={() => unstable_retry()}
        className="mt-1 self-start rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover"
      >
        {t("common.retry")}
      </button>
    </div>
  );
}
