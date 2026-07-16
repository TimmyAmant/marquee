"use client";

import { useRef } from "react";

export function PosterRow({ children }: { children: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  function scrollByAmount(direction: 1 | -1) {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: "smooth" });
  }

  return (
    <div className="group/row relative">
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto scroll-smooth pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>

      <button
        type="button"
        aria-label="Scroll left"
        onClick={() => scrollByAmount(-1)}
        className="absolute left-0 top-0 bottom-2 flex w-16 items-center justify-center bg-gradient-to-r from-bg-0 via-bg-0/80 to-transparent opacity-0 transition-opacity group-hover/row:opacity-100"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-bg-1 text-4xl leading-none text-text-primary shadow-lg transition-colors hover:text-accent">
          ‹
        </span>
      </button>
      <button
        type="button"
        aria-label="Scroll right"
        onClick={() => scrollByAmount(1)}
        className="absolute right-0 top-0 bottom-2 flex w-16 items-center justify-center bg-gradient-to-l from-bg-0 via-bg-0/80 to-transparent opacity-0 transition-opacity group-hover/row:opacity-100"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-bg-1 text-4xl leading-none text-text-primary shadow-lg transition-colors hover:text-accent">
          ›
        </span>
      </button>
    </div>
  );
}

export function PosterRowItem({ children }: { children: React.ReactNode }) {
  return <div className="w-36 shrink-0 sm:w-40">{children}</div>;
}
