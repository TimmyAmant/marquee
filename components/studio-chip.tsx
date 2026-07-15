import Image from "next/image";
import Link from "next/link";
import { tmdbImageUrl } from "@/lib/tmdb/image";

export function StudioChip({
  tmdbId,
  name,
  logoPath,
}: {
  tmdbId: number;
  name: string;
  logoPath: string | null;
}) {
  const logo = tmdbImageUrl(logoPath, "w185");

  return (
    <Link
      href={`/company/${tmdbId}`}
      className="flex items-center gap-3 rounded-xl border border-border bg-bg-1 px-4 py-3 transition-colors hover:border-border-strong"
    >
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
      <span className="text-sm text-text-primary">{name}</span>
    </Link>
  );
}
