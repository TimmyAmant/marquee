import Image from "next/image";
import Link from "next/link";
import { tmdbImageUrl } from "@/lib/tmdb/client";

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
        <Image
          src={logo}
          alt={name}
          width={40}
          height={40}
          className="h-6 w-auto object-contain brightness-0 invert"
        />
      )}
      <span className="text-sm text-text-primary">{name}</span>
    </Link>
  );
}
