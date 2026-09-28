"use client";

import { useT } from "@/lib/i18n/client";
import {
  TITLE_FACTS_CARD,
  TITLE_HERO_FRAME,
  TITLE_HERO_GRID,
  TITLE_HERO_GUTTERS,
  TITLE_POSTER_BOX,
  TitleBackdrop,
} from "@/components/title-backdrop";

/** A quiet placeholder bar that breathes (still, with reduced motion). */
const BAR = "rounded-md bg-bg-2 motion-safe:animate-pulse";

/**
 * A title page while it loads: the loaded page's own shape — the backdrop's
 * surface, the poster frame, the title, meta line, action pills and overview
 * as bars, the facts card and the Cast row — in the page's colours. The
 * app-wide fallback (app/loading.tsx) is a poster grid, which flashed up
 * before every title page; this one lines up with the page that replaces it,
 * and the artwork then fades in over the same surface.
 */
export default function TitleLoading() {
  const t = useT();
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">{t("common.loading")}</span>
      <div className={TITLE_HERO_FRAME} aria-hidden>
        <TitleBackdrop />
        <div className={TITLE_HERO_GUTTERS}>
          <div className={TITLE_HERO_GRID}>
            <div className={`${TITLE_POSTER_BOX} motion-safe:animate-pulse`} />

            <div className="min-w-0">
              <div className={`${BAR} h-[40px] w-[min(80%,420px)] rounded-lg sm:h-[54px]`} />
              <div className={`${BAR} mt-4 h-3.5 w-[min(70%,260px)]`} />
              <div className="mt-5 flex gap-2">
                <div className={`${BAR} h-8 w-32 rounded-full`} />
                <div className={`${BAR} h-8 w-24 rounded-full`} />
                <div className={`${BAR} h-8 w-8 rounded-full`} />
              </div>
              <div className="max-w-[860px] 4xl:max-w-[980px]">
                <div className={`${BAR} mt-[30px] h-4 w-24`} />
                <div className="mt-3 flex flex-col gap-[11px]">
                  <div className={`${BAR} h-3 w-full`} />
                  <div className={`${BAR} h-3 w-[97%]`} />
                  <div className={`${BAR} h-3 w-[93%]`} />
                  <div className={`${BAR} h-3 w-[62%]`} />
                </div>
              </div>
            </div>

            <div className="min-w-0 sm:col-span-2 xl:col-span-1">
              <div className={TITLE_FACTS_CARD}>
                <div className="flex h-[50px] items-center">
                  <div className={`${BAR} h-5 w-24`} />
                </div>
                {[
                  ["w-16", "w-14"],
                  ["w-24", "w-20"],
                  ["w-20", "w-24"],
                  ["w-28", "w-12"],
                  ["w-14", "w-20"],
                  ["w-24", "w-16"],
                ].map(([label, value], i) => (
                  <div key={i} className="flex h-[38px] items-center justify-between border-t border-border">
                    <div className={`${BAR} h-2.5 ${label}`} />
                    <div className={`${BAR} h-2.5 ${value}`} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* The Cast row, between the same gutters as page.tsx's rows. */}
      <div className="flex flex-col gap-12 overflow-hidden px-6 pb-20 pt-12 xl:pl-12 xl:pr-10" aria-hidden>
        <section>
          <div className={`${BAR} mb-3 h-5 w-16`} />
          <div className="flex gap-4">
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} className="w-[112px] shrink-0">
                <div className={`${BAR} h-[124px] w-[112px] rounded-xl`} />
                <div className={`${BAR} mt-[9px] h-3 w-20`} />
                <div className={`${BAR} mt-1.5 h-2.5 w-14`} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
