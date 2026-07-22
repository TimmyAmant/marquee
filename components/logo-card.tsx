import Image from "next/image";
import Link from "next/link";
import { tmdbImageUrl } from "@/lib/tmdb/image";

/** A big logo tile for Discover's Studios/Networks rows — every logo is
 * forced to a flat white silhouette via CSS filter (`brightness-0 invert`)
 * regardless of its original colors, so a row of mismatched company logos
 * (some solid black marks, some full-color) reads as one consistent set
 * instead of a jumble of different treatments. */
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
      className="flex h-28 w-56 shrink-0 items-center justify-center rounded-xl border border-border bg-bg-1 p-6 transition-colors hover:border-border-strong"
    >
      {logo ? (
        <Image
          src={logo}
          alt={name}
          width={160}
          height={64}
          className="logo-mono h-full w-full object-contain"
        />
      ) : (
        <span className="text-center text-sm text-text-secondary">{name}</span>
      )}
    </Link>
  );
}
