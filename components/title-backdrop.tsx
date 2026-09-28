import type { ReactNode } from "react";

/** The fades over a title's artwork: a scrim under the top bar, a long fall
 * into the page background at the bottom (the rows below continue on the
 * same colour), a wash from the left behind the poster and the text, and a
 * light veil over all of it. */
const FADES = [
  // Under the top bar.
  "linear-gradient(to bottom, color-mix(in srgb, var(--marquee-bg-0) 70%, transparent) 0%, color-mix(in srgb, var(--marquee-bg-0) 25%, transparent) 14%, transparent 28%)",
  // Into the page at the bottom, starting high enough that the links and the
  // rows below never sit on bright artwork.
  "linear-gradient(to bottom, transparent 24%, color-mix(in srgb, var(--marquee-bg-0) 50%, transparent) 54%, color-mix(in srgb, var(--marquee-bg-0) 88%, transparent) 78%, var(--marquee-bg-0) 100%)",
  // Behind the poster and the text column, strong enough across it that a
  // bright or busy frame (a grey sky, faces) never fights the logo, the pills
  // or the overview, and gone well before the right edge.
  "linear-gradient(to right, color-mix(in srgb, var(--marquee-bg-0) 94%, transparent) 0%, color-mix(in srgb, var(--marquee-bg-0) 84%, transparent) 30%, color-mix(in srgb, var(--marquee-bg-0) 62%, transparent) 52%, color-mix(in srgb, var(--marquee-bg-0) 26%, transparent) 74%, transparent 92%)",
  // A light veil over all of it, so a bright image sits at the same level as
  // a dark one.
  "linear-gradient(color-mix(in srgb, var(--marquee-bg-0) 22%, transparent), color-mix(in srgb, var(--marquee-bg-0) 22%, transparent))",
].join(", ");

/**
 * The band of artwork across the top of a title page, `--hero-h` tall and
 * bled under the nav rail. It's the same surface with or without the image —
 * a quiet bg-1 that the fades carry down into the page — so the loading page
 * (app/title/[type]/[id]/loading.tsx) shows exactly what the loaded page
 * shows until its artwork fades in, and a title with no backdrop looks like
 * one whose backdrop is still on its way.
 */
export function TitleBackdrop({
  children,
  className = "",
}: {
  children?: ReactNode;
  /** Extra classes on the band (the person and studio hero fades its grain
   * out at the bottom, where no rows cover the band's lower edge). */
  className?: string;
}) {
  return (
    <div
      className={`grain-overlay rail-under pointer-events-none absolute inset-x-0 top-0 -z-10 h-[var(--hero-h)] overflow-hidden bg-bg-1 ${className}`.trim()}
    >
      {children}
      <div className="absolute inset-0" style={{ background: FADES }} />
    </div>
  );
}

/** The hero's outer box. --hero-h is the artwork's height: a fixed band on a
 * phone, then min(70% of the window's height, 16:9 of its width) — the whole
 * backdrop without letterboxing on a laptop and never more than the first
 * screen on a wide monitor. -mt lifts the page under the floating top bar
 * (72px when the nav rail is a bar along the top), so the art starts at the
 * window's top edge. Shared with the loading page so the two line up. */
export const TITLE_HERO_FRAME =
  "relative -mt-[52px] [--hero-h:340px] sm:[--hero-h:440px] md:rail-top:-mt-[72px] md:[--hero-h:max(460px,min(70svh,56.25vw))]";

/** The same gutters as the rows under the hero (page.tsx). */
export const TITLE_HERO_GUTTERS = "px-6 xl:pl-12 xl:pr-10";

/** Poster | the title and everything about it | facts, from 1280px. */
export const TITLE_HERO_GRID =
  "grid grid-cols-1 gap-x-8 gap-y-8 pt-[150px] sm:grid-cols-[224px_minmax(0,1fr)] sm:pt-[190px] md:pt-[calc(var(--hero-h)*0.4)] xl:grid-cols-[224px_minmax(0,1fr)_300px] 3xl:grid-cols-[264px_minmax(0,1fr)_340px] 3xl:gap-x-12 4xl:grid-cols-[300px_minmax(0,1fr)_380px] 4xl:gap-x-16";

/** The poster's frame at each width. */
export const TITLE_POSTER_BOX =
  "relative h-[240px] w-[160px] overflow-hidden rounded-xl bg-bg-2 shadow-[0_28px_64px_rgba(0,0,0,0.65),0_8px_20px_rgba(0,0,0,0.45)] ring-1 ring-border-strong sm:h-[336px] sm:w-[224px] 3xl:h-[396px] 3xl:w-[264px] 4xl:h-[450px] 4xl:w-[300px]";

/** The facts card's surface. */
export const TITLE_FACTS_CARD =
  "rounded-2xl border border-border bg-bg-1/95 px-[18px] pb-4 pt-1 shadow-[0_18px_40px_rgba(0,0,0,0.35)] backdrop-blur-[20px]";
