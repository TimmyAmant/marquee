import Image from "next/image";
import Link from "next/link";
import { tmdbImageUrl } from "@/lib/tmdb/image";

/** A big logo tile for Discover's Studios/Networks rows — shown in the
 * company's own colors, on a white backdrop behind the artwork itself
 * (not the whole card) so a black-line-art mark and a full-color logo are
 * both readable, the same fix StudioChip already uses for the same reason:
 * TMDb assets are a mix of transparent dark marks and opaque full-color
 * logos, and only one of those is visible against this app's dark cards. */
export function LogoCard({
  href,
  name,
  logoPath,
}: {
  href: string;
  name: string;
  logoPath: string | null;
}) {
  const logo = tmdbImageUrl(logoPath, "w500");

  return (
    <Link
      href={href}
      className="flex h-28 w-56 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-bg-1 transition-colors hover:border-border-strong"
    >
      {logo ? (
        <div className="flex h-full w-full items-center justify-center bg-white p-5">
          <Image
            src={logo}
            alt={name}
            width={160}
            height={64}
            className="h-full w-full object-contain"
          />
        </div>
      ) : (
        <span className="px-4 text-center text-sm text-text-secondary">{name}</span>
      )}
    </Link>
  );
}
