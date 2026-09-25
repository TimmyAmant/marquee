"use client";

import { useState } from "react";

function initialsOf(label: string): string {
  return (
    label
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => Array.from(word)[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/**
 * A round profile picture: the account's photo when it has one (served by
 * /api/avatars/[id], see lib/users/avatar.ts), otherwise its initials on the
 * accent gradient, which is also what shows if the photo fails to load.
 * Decorative: the name always sits beside it or in the control's label.
 */
export function UserAvatar({ label, src, size }: { label: string; src?: string | null; size: number }) {
  // Remembers which URL failed rather than a plain flag, so a new photo
  // (a new ?v= URL) gets its own chance to load.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showPhoto = Boolean(src) && failedSrc !== src;

  return (
    <span
      aria-hidden
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-bg-0 ring-2 ring-white/15"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: "linear-gradient(140deg, var(--marquee-accent-hover), var(--marquee-accent) 45%, #c2583a)",
      }}
    >
      {initialsOf(label)}
      {showPhoto && (
        // A plain <img>: the photo is already a small square JPEG, and it's
        // private to the session, so next/image's optimizer has nothing to
        // add (and would cache it outside the browser).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src!}
          alt=""
          width={size}
          height={size}
          onError={() => setFailedSrc(src ?? null)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </span>
  );
}
