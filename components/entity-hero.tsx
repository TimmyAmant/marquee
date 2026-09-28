import Link from "next/link";
import type { ReactNode } from "react";
import { MediaImage } from "@/components/media-image";
import { TitleBackdrop } from "@/components/title-backdrop";
import { tmdbImageUrl } from "@/lib/tmdb/image";
import { getT } from "@/lib/i18n/server";
import type { KnownForTitle } from "@/lib/pages/entities";

/** The band's height: a fixed one on a phone, then a little over half the
 * window (a person's header is shorter than a title's, so the band is too).
 * -mt lifts it under the floating top bar, like the title page's hero. */
const ENTITY_HERO_FRAME =
  "relative -mt-[52px] [--hero-h:300px] sm:[--hero-h:380px] md:rail-top:-mt-[72px] md:[--hero-h:max(420px,min(58svh,42vw))]";

/**
 * A person's or studio's header over the backdrop of the title they're best
 * known for (lib/tmdb/known-for.ts) — the title page's band, fades and veil
 * (components/title-backdrop.tsx) — with a small "From {title}" link to that
 * title at the band's bottom right. Without one, just the header in the
 * page's usual gutters.
 */
export async function EntityHero({
  knownFor,
  children,
}: {
  knownFor: KnownForTitle | null;
  children: ReactNode;
}) {
  if (!knownFor) return <div className="px-4 pt-6 sm:px-7 sm:pt-7">{children}</div>;

  const t = await getT();
  const backdrop = tmdbImageUrl(knownFor.backdropPath, "original");

  return (
    <div className={ENTITY_HERO_FRAME} data-testid="entity-hero">
      <TitleBackdrop>
        {backdrop && (
          <MediaImage
            src={backdrop}
            alt=""
            fill
            loading="eager"
            fetchPriority="high"
            sizes="100vw"
            quality={85}
            shimmer={false}
            className="object-cover object-[50%_25%]"
          />
        )}
      </TitleBackdrop>

      <div className="px-4 pt-[76px] sm:px-7 sm:pt-[120px] md:pt-[calc(var(--hero-h)*0.3)] lg:pt-[calc(var(--hero-h)*0.36)]">
        {/* Over the artwork above the header on a phone and a narrow window;
            pinned to the band's bottom right once there's room beside the
            header for it. */}
        <div className="mb-4 flex justify-end lg:absolute lg:right-10 lg:top-[calc(var(--hero-h)-60px)] lg:mb-0">
          <Link
            href={`/title/${knownFor.mediaType}/${knownFor.tmdbId}`}
            aria-label={t("discover.knownForFromLabel", { title: knownFor.name })}
            className="inline-flex h-7 max-w-[min(100%,320px)] items-center rounded-full border border-border bg-bg-0/40 px-3 text-[12px] text-text-secondary backdrop-blur-md transition-colors hover:border-accent hover:text-accent"
          >
            <span className="truncate">{t("discover.knownForFrom", { title: knownFor.name })}</span>
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}
