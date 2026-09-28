"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translator";

export type LibraryTab = "all" | "collections" | "duplicates" | "storage";

const LABELS: Record<LibraryTab, MessageKey> = {
  all: "library.tabAll",
  collections: "library.tabCollections",
  duplicates: "library.tabDuplicates",
  storage: "library.tabStorage",
};

/** The Library page's sections. The All tab keeps its filters in the
 * address; the other tabs drop them. */
export function LibraryTabs({
  current,
  showDuplicates,
  query,
}: {
  current: LibraryTab;
  /** The admin only. */
  showDuplicates: boolean;
  /** The current address's parameters, kept when going back to All. */
  query: Record<string, string | undefined>;
}) {
  const t = useT();
  const tabs: LibraryTab[] = ["all", "collections", ...(showDuplicates ? (["duplicates"] as const) : []), "storage"];
  const allParams = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value && key !== "tab") allParams.set(key, value);
  const allHref = allParams.toString() ? `/library?${allParams}` : "/library";

  return (
    // Settings' tab row (components/settings-nav.tsx): one line of pills
    // that scrolls sideways on a phone instead of wrapping inside a frame.
    <nav aria-label={t("library.sections")} className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0">
      <div className="flex w-max min-w-full gap-0.5 border-b border-border pb-3">
        {tabs.map((tab) => (
          <Link
            key={tab}
            href={tab === "all" ? allHref : `/library?tab=${tab}`}
            aria-current={current === tab ? "page" : undefined}
            className={`flex h-8 shrink-0 items-center whitespace-nowrap rounded-full px-3 text-[13.5px] font-medium transition-colors ${
              current === tab ? "bg-text-primary text-bg-0" : "text-text-secondary hover:bg-text-primary/10 hover:text-text-primary"
            }`}
          >
            {t(LABELS[tab])}
          </Link>
        ))}
      </div>
    </nav>
  );
}
