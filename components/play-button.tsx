"use client";

import { useEffect, useRef, useState } from "react";
import type { PlayLink } from "@/lib/media-servers/play-links";
import { useT } from "@/lib/i18n/client";
import { PILL as PILL_BASE } from "@/components/pill-styles";

const PILL = `${PILL_BASE} bg-text-primary px-4 font-semibold text-bg-0 hover:bg-text-primary/85`;

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-3.5 w-3.5">
      <path d="M8 5.5v13l11-6.5-11-6.5Z" />
    </svg>
  );
}

/**
 * "Play on Plex" / "Play on Jellyfin" on a title page, when the library
 * sync found the title on a household media server. One server: a single
 * pill that opens its page in a new tab. Two or more: the pill opens a
 * small menu with one entry per server. A Plex link also carries the
 * plex:// scheme; the web link is what a browser can always open.
 */
export function PlayButton({ links }: { links: PlayLink[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (links.length === 0) return null;
  if (links.length === 1) {
    const link = links[0];
    return (
      <a href={link.url} target="_blank" rel="noreferrer" className={PILL} title={link.serverName ?? undefined}>
        <PlayIcon />
        {link.label}
      </a>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} className={PILL}>
        <PlayIcon />
        {t("title.play")}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-3 w-3">
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div role="menu" className="nav-glass absolute left-0 top-full z-30 mt-1.5 min-w-[180px] rounded-xl p-1.5">
          {links.map((link) => (
            <a
              key={`${link.server}:${link.url}`}
              role="menuitem"
              href={link.url}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className="flex flex-col rounded-lg px-3 py-2 text-sm text-text-primary hover:bg-text-primary/10"
            >
              <span className="font-medium">{link.label}</span>
              {link.serverName && <span className="text-[11px] text-text-muted">{link.serverName}</span>}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
