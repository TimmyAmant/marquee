"use client";

import { useEffect, useState } from "react";

export function TrailerButton({ videoKey }: { videoKey: string }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-[30px] items-center gap-1.5 rounded-[15px] border border-border-strong pl-[11px] pr-[13px] text-[12.5px] text-text-primary transition-colors hover:border-accent hover:text-accent"
      >
        <span className="text-accent">▶</span> Trailer
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-3xl overflow-hidden rounded-xl bg-bg-1 shadow-2xl ring-1 ring-border-strong"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close trailer"
              className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-bg-0/80 text-text-primary transition-colors hover:text-accent"
            >
              ✕
            </button>
            <div className="aspect-video w-full">
              <iframe
                className="h-full w-full"
                src={`https://www.youtube.com/embed/${videoKey}?autoplay=1`}
                title="Trailer"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
