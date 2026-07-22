import Image from "next/image";
import Link from "next/link";
import { tmdbImageUrl } from "@/lib/tmdb/image";

export function StudioChip({
  tmdbId,
  name,
  logoPath,
  favoriteAction,
  href,
}: {
  tmdbId: number;
  name: string;
  logoPath: string | null;
  /** Rendered as a sibling of the link, not nested inside it, so a <button>
   * never ends up inside an <a>. */
  favoriteAction?: React.ReactNode;
  /** Defaults to the company detail page — overridden by callers like
   * Discover's Networks row, which has no per-network detail page and
   * instead links straight to a filtered /series listing. */
  href?: string;
}) {
  const logo = tmdbImageUrl(logoPath, "w185");

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-bg-1 pr-2 transition-colors hover:border-border-strong">
      <Link href={href ?? `/company/${tmdbId}`} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3">
        {logo && (
          // A plain white backdrop (not a CSS invert filter) so this renders
          // correctly regardless of whether TMDb's asset is a transparent dark
          // mark or a full-color logo with an opaque background baked in —
          // some studios (Marvel, Pascal, TSG) ship the latter, and inverting
          // those turned the whole chip into a solid color block.
          <div className="flex h-6 w-10 shrink-0 items-center justify-center rounded bg-white p-1">
            <Image
              src={logo}
              alt={name}
              width={40}
              height={24}
              className="h-full w-full object-contain"
            />
          </div>
        )}
        <span className="truncate text-sm text-text-primary">{name}</span>
      </Link>
      {favoriteAction && <div className="shrink-0">{favoriteAction}</div>}
    </div>
  );
}
