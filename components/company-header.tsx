import Image from "next/image";
import { tmdbImageUrl } from "@/lib/tmdb/client";

export function CompanyHeader({
  name,
  description,
  logoPath,
  count,
  favoriteAction,
}: {
  name: string;
  description: string | null;
  logoPath: string | null;
  count: number;
  favoriteAction?: React.ReactNode;
}) {
  const src = tmdbImageUrl(logoPath, "w342");

  return (
    <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
      <div className="flex h-24 w-40 shrink-0 items-center justify-center rounded-xl border border-border bg-bg-1 p-4">
        {src ? (
          <Image
            src={src}
            alt={name}
            width={140}
            height={80}
            className="max-h-full w-auto object-contain brightness-0 invert"
          />
        ) : (
          <span className="font-display text-lg text-text-primary">{name}</span>
        )}
      </div>
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-4xl text-text-primary">{name}</h1>
          {favoriteAction}
        </div>
        <p className="mt-1 text-sm text-text-muted">{count} titles in the catalog</p>
        {description && (
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary">
            {description.length > 400 ? `${description.slice(0, 400)}…` : description}
          </p>
        )}
      </div>
    </div>
  );
}
