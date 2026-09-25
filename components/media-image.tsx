"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";

/**
 * next/image wrapper that shows a shimmer skeleton until the artwork paints,
 * then fades it in. Fixes the "empty box, then the poster pops in" flash on
 * TMDb-backed art (those images finish loading a beat after the rest of the
 * page renders), which made a freshly-loaded grid — or a title's backdrop —
 * look broken for a moment.
 *
 * Drop-in for `<Image fill className="object-cover" .../>` inside a positioned,
 * `overflow-hidden` box: the skeleton is absolutely positioned to fill that
 * box, so the parent must establish a positioning context (all current callers
 * already do, via `relative`/`absolute` + `bg-bg-2`).
 */
export function MediaImage({ className, ...props }: ImageProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <>
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-0 z-0 bg-shimmer transition-opacity duration-500 ${
          loaded ? "opacity-0" : "opacity-100"
        }`}
      />
      {/* alt is required by ImageProps and supplied by every caller via the
          spread below; the a11y rule just can't see it through {...props}. */}
      {/* eslint-disable-next-line jsx-a11y/alt-text */}
      <Image
        {...props}
        onLoad={() => setLoaded(true)}
        // A callback ref covers images already in the browser cache: those
        // finish before React attaches `onLoad` during hydration, so onLoad
        // never fires and the skeleton would otherwise stay up forever.
        ref={(node) => {
          if (node?.complete) setLoaded(true);
        }}
        className={`${className ?? ""} transition-opacity duration-700 ${
          loaded ? "opacity-100" : "opacity-0"
        }`.trim()}
      />
    </>
  );
}
