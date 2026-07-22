import Image from "next/image";
import Link from "next/link";
import { tmdbImageUrl } from "@/lib/tmdb/image";

// A fixed color per well-known genre id (movie and TV ids overlap for
// several genres, e.g. Animation/Comedy/Crime/Drama share the same id in
// both namespaces, which is a happy accident rather than something relied
// on) — cycles through the rest of PALETTE for anything not listed here.
const GENRE_COLORS: Record<number, string> = {
  28: "bg-red-800", // Action
  10759: "bg-red-800", // Action & Adventure (tv)
  12: "bg-purple-800", // Adventure
  16: "bg-teal-700", // Animation
  35: "bg-yellow-700", // Comedy
  80: "bg-blue-900", // Crime
  99: "bg-emerald-800", // Documentary
  18: "bg-slate-700", // Drama
  10751: "bg-sky-700", // Family
  14: "bg-indigo-800", // Fantasy
  36: "bg-amber-800", // History
  27: "bg-neutral-800", // Horror
  10402: "bg-pink-800", // Music
  9648: "bg-violet-900", // Mystery
  10749: "bg-rose-800", // Romance
  878: "bg-cyan-800", // Science Fiction
  10765: "bg-cyan-800", // Sci-Fi & Fantasy (tv)
  10770: "bg-stone-700", // TV Movie
  53: "bg-orange-900", // Thriller
  10752: "bg-zinc-800", // War
  10768: "bg-zinc-800", // War & Politics (tv)
  37: "bg-yellow-900", // Western
  10762: "bg-lime-800", // Kids
  10763: "bg-blue-800", // News
  10764: "bg-fuchsia-800", // Reality
  10766: "bg-rose-900", // Soap
  10767: "bg-teal-800", // Talk
};

const FALLBACK_PALETTE = [
  "bg-red-800",
  "bg-purple-800",
  "bg-teal-700",
  "bg-yellow-700",
  "bg-blue-900",
  "bg-emerald-800",
];

export function genreColorClass(genreId: number, fallbackIndex: number): string {
  return GENRE_COLORS[genreId] ?? FALLBACK_PALETTE[fallbackIndex % FALLBACK_PALETTE.length];
}

export function GenreCard({
  name,
  href,
  backdropPath,
  colorClass,
}: {
  name: string;
  href: string;
  backdropPath: string | null;
  colorClass: string;
}) {
  const src = tmdbImageUrl(backdropPath, "w780");

  return (
    <Link
      href={href}
      className={`group relative flex h-40 w-72 shrink-0 items-center justify-center overflow-hidden rounded-xl ${colorClass}`}
    >
      {src && (
        <Image
          src={src}
          alt=""
          fill
          sizes="288px"
          className="object-cover opacity-45 transition-opacity group-hover:opacity-60"
        />
      )}
      <span className="relative px-4 text-center font-display text-2xl font-bold text-white drop-shadow-md">
        {name}
      </span>
    </Link>
  );
}
