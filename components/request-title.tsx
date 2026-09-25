import Link from "next/link";
import { seasonsLabel } from "@/lib/requests/labels";
import type { MediaType } from "@/lib/db/schema";

/** A request's title as the Requests page lists it — a link to the title
 * page, with the seasons asked for underneath when it's a season request. */
export function RequestTitle({
  mediaType,
  tmdbId,
  title,
  seasons,
}: {
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  seasons: number[] | null;
}) {
  const label = seasonsLabel(seasons);
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
