"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { tmdbImageUrl } from "@/lib/tmdb/image";
import type { SearchSuggestion } from "@/app/api/search/suggest/route";
import type { LibraryStatus } from "@/components/status-badge";

const TYPE_LABELS: Record<SearchSuggestion["mediaType"], string> = {
  person: "Actor",
  movie: "Movie",
  tv: "TV",
};

const NEUTRAL_PILL_CLASS = "border-border text-text-muted";

/** The Movie/TV pill wears the title's library status, in the colors a
 * poster card uses for it: green when it's in the library (the Owned badge),
 * blue while downloading (the Downloading badge), and the poster status bar's
 * red for missing and purple for coming soon. Not in the library stays the
 * plain grey pill. */
const STATUS_PILL: Record<LibraryStatus, { label: string; className: string }> = {
  owned: { label: "In your library", className: "border-owned/40 bg-owned-bg text-owned" },
  tracked_downloading: { label: "Downloading", className: "border-tracked/40 bg-tracked-bg text-tracked" },
  tracked_monitored: { label: "Missing", className: "border-red-500/40 bg-red-500/10 text-red-500" },
  coming_soon: { label: "Coming soon", className: "border-purple-500/40 bg-purple-500/10 text-purple-500" },
  untracked: { label: "Not in your library", className: NEUTRAL_PILL_CLASS },
};

function TypePill({ suggestion }: { suggestion: SearchSuggestion }) {
  const typeLabel = TYPE_LABELS[suggestion.mediaType];
  // A status this build doesn't know (a newer server) reads as neutral.
  const status = suggestion.status ? STATUS_PILL[suggestion.status] : undefined;
  return (
    <span
      title={status ? `${typeLabel} · ${status.label}` : undefined}
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${status?.className ?? NEUTRAL_PILL_CLASS}`}
    >
      {typeLabel}
      {status && <span className="sr-only"> · {status.label}</span>}
    </span>
  );
}

function hrefFor(suggestion: SearchSuggestion): string {
  return suggestion.mediaType === "person"
    ? `/person/${suggestion.id}`
    : `/title/${suggestion.mediaType}/${suggestion.id}`;
}

export function SearchBar({
  variant = "default",
  initialValue = "",
  onNavigate,
  autoFocus = false,
}: {
  variant?: "default" | "compact";
  initialValue?: string;
  onNavigate?: () => void;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const latestRequestId = useRef(0);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // This search bar lives in the root layout's nav, so it never unmounts
  // between pages — a suggestion fetch that was still in flight when the
  // user pressed Enter/clicked a result can resolve after navigation and
  // reopen the dropdown on top of the destination page. Closing on every
  // route change (regardless of how navigation happened — click, Enter,
  // back/forward) is the one place that reliably catches all of those.
  // Adjusting state during render off a state comparison (rather than a
  // useEffect, and rather than a ref — this project's lint rules disallow
  // both for this "reset on prop change" pattern) per React's own guidance:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    if (isOpen) setIsOpen(false);
  }

  function handleChange(next: string) {
    setValue(next);
    setHighlightedIndex(-1);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = next.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    const requestId = ++latestRequestId.current;
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(trimmed)}`);
        const data = await res.json();
        // Ignore responses for requests superseded by a newer keystroke or a navigation.
        if (requestId !== latestRequestId.current) return;
        setSuggestions(data.results ?? []);
        setIsOpen(true);
      } catch {
        if (requestId === latestRequestId.current) setSuggestions([]);
      }
    }, 250);
  }

  function goToSuggestion(suggestion: SearchSuggestion) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    latestRequestId.current++;
    setIsOpen(false);
    onNavigate?.();
    router.push(hrefFor(suggestion));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
      goToSuggestion(suggestions[highlightedIndex]);
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    latestRequestId.current++;
    setIsOpen(false);
    onNavigate?.();
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Escape") {
      // Only the suggestions close; a search dialog around this box stays.
      e.stopPropagation();
      setIsOpen(false);
    }
  }

  const isCompact = variant === "compact";

  return (
    <div ref={containerRef} className="relative mx-auto w-full max-w-xl">
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setIsOpen(true)}
          placeholder="Search an actor, a studio, a title…"
          autoComplete="off"
          autoFocus={autoFocus}
          className={
            isCompact
              ? "h-8 w-full rounded-full border border-border bg-bg-2/70 px-3.5 text-[13px] text-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] backdrop-blur-[18px] placeholder:text-text-muted outline-none transition-colors focus:border-accent"
              : "w-full rounded-xl border border-border bg-bg-1 px-5 py-4 text-base text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-accent"
          }
        />
      </form>

      {isOpen && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-xl border border-border bg-bg-1 shadow-2xl">
          {suggestions.map((suggestion, index) => {
            const src = tmdbImageUrl(suggestion.posterPath, "w92");
            return (
              <button
                key={`${suggestion.mediaType}-${suggestion.id}`}
                type="button"
                onClick={() => goToSuggestion(suggestion)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${
                  index === highlightedIndex ? "bg-bg-2" : "hover:bg-bg-2"
                }`}
              >
                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-bg-2">
                  {src && <Image src={src} alt={suggestion.name} fill className="object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-text-primary">{suggestion.name}</p>
                  {suggestion.subtitle && (
                    <p className="truncate text-xs text-text-muted">{suggestion.subtitle}</p>
                  )}
                </div>
                <TypePill suggestion={suggestion} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
