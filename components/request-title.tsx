"use client";

import Link from "next/link";
import { seasonsLabel } from "@/lib/requests/labels";
import type { MediaType } from "@/lib/db/schema";
import { useT } from "@/lib/i18n/client";

/** A request's title as the Requests page lists it — a link to the title
 * page, with the seasons asked for underneath when it's a season request. */
export function RequestTitle({
  mediaType,
  tmdbId,
  title,
  seasons,
  is4k = false,
}: {
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  seasons: number[] | null;
  /** Asked for in 4K (lib/arr/fourk.ts). */
  is4k?: boolean;
}) {
  const t = useT();
  const label = [seasonsLabel(t, seasons), is4k ? t("requests.in4k") : null].filter(Boolean).join(" · ");
  return (
    <div className="min-w-0">
      <Link
        href={`/title/${mediaType}/${tmdbId}`}
        className="text-sm font-medium text-text-primary hover:text-accent"
      >
        {title}
      </Link>
      {label && <p className="mt-0.5 text-xs text-text-muted">{label}</p>}
    </div>
  );
}
