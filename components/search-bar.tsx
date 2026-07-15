"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { tmdbImageUrl } from "@/lib/tmdb/image";
import type { SearchSuggestion } from "@/app/api/search/suggest/route";

const TYPE_LABELS: Record<SearchSuggestion["mediaType"], string> = {
  person: "Actor",
  movie: "Movie",
  tv: "TV",
};

function hrefFor(suggestion: SearchSuggestion): string {
  return suggestion.mediaType === "person"
    ? `/person/${suggestion.id}`
    : `/title/${suggestion.mediaType}/${suggestion.id}`;
}

export function SearchBar({
  variant = "default",
  initialValue = "",
}: {
  variant?: "default" | "compact";
  initialValue?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(trimmed)}`);
        const data = await res.json();
        setSuggestions(data.results ?? []);
        setIsOpen(true);
      } catch {
        setSuggestions([]);
      }
    }, 250);
  }

  function goToSuggestion(suggestion: SearchSuggestion) {
    setIsOpen(false);
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
    setIsOpen(false);
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
          className={
            isCompact
              ? "w-full rounded-full border border-border bg-bg-1 px-4 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-accent"
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
                <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] text-text-muted">
                  {TYPE_LABELS[suggestion.mediaType]}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
