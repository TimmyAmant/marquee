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
    <nav aria-label={t("library.sections")} className="flex flex-wrap gap-1 rounded-full border border-border p-1 text-sm">
      {tabs.map((tab) => (
        <Link
          key={tab}
          href={tab === "all" ? allHref : `/library?tab=${tab}`}
          aria-current={current === tab ? "page" : undefined}
          className={`rounded-full px-3.5 py-1.5 transition-colors ${
            current === tab ? "bg-accent text-bg-0" : "text-text-secondary hover:bg-bg-1 hover:text-text-primary"
          }`}
        >
          {t(LABELS[tab])}
        </Link>
      ))}
    </nav>
  );
}
