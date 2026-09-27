"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { tmdbImageUrl } from "@/lib/tmdb/image";
import type { SearchSuggestion } from "@/app/api/search/suggest/route";
import { TONE_CLASS, isLibraryStatus, statusText, statusTone } from "@/lib/library/status-tone";
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translator";
import { groupRuns, suggestionGroup, type SuggestionGroup } from "@/lib/search/suggestion-groups";
import { companyHref } from "@/lib/search/links";

const TYPE_LABELS: Record<SearchSuggestion["mediaType"], MessageKey> = {
  person: "nav.typeActor",
  movie: "common.movie",
  tv: "nav.typeTv",
  company: "nav.typeStudio",
  network: "nav.typeNetwork",
};

/** The small label over each group, in the search page's order. */
const GROUP_LABELS: Record<SuggestionGroup, MessageKey> = {
  movie: "nav.groupMovies",
  tv: "nav.groupTv",
  person: "nav.groupPeople",
  company: "nav.groupStudiosNetworks",
};

/** A poster for titles, a round photo for people, a logo on white for
 * studios and networks. */
function SuggestionThumb({ suggestion }: { suggestion: SearchSuggestion }) {
  const src = tmdbImageUrl(suggestion.posterPath, suggestion.mediaType === "company" || suggestion.mediaType === "network" ? "w185" : "w92");
  if (suggestion.mediaType === "person") {
    return (
      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-bg-2">
        {src && <Image src={src} alt="" fill sizes="40px" className="object-cover object-top" />}
      </div>
    );
  }
  if (suggestion.mediaType === "company" || suggestion.mediaType === "network") {
    return (
      <div className="relative flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-white p-1.5">
        {src ? (
          <Image src={src} alt="" width={48} height={28} className="h-full w-full object-contain" />
        ) : (
          <span className="truncate px-1 text-[9px] font-semibold text-neutral-700" aria-hidden>
            {suggestion.name}
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="relative h-12 w-8 shrink-0 overflow-hidden rounded bg-bg-2">
      {src && <Image src={src} alt="" fill sizes="32px" className="object-cover" />}
    </div>
  );
}

const NEUTRAL_PILL_CLASS = "border-border text-text-muted";

/** The Movie/TV pill wears the title's library status in the same tone as a
 * poster's badge and strip (lib/library/status-tone.ts): green in the
 * library, blue downloading, orange missing, purple coming soon. Not in the
 * library stays the plain grey pill. */
function TypePill({ suggestion }: { suggestion: SearchSuggestion }) {
  const t = useT();
  const typeLabel = t(TYPE_LABELS[suggestion.mediaType]);
  // A status this build doesn't know (a newer server) reads as neutral.
  const known = isLibraryStatus(suggestion.status) ? suggestion.status : undefined;
  const tone = statusTone(known);
  const statusLabel = known ? statusText(t, known).name : undefined;
  return (
    <span
      title={statusLabel ? t("nav.typeWithStatus", { type: typeLabel, status: statusLabel }) : undefined}
      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${tone === "neutral" ? NEUTRAL_PILL_CLASS : TONE_CLASS[tone].pill}`}
    >
      {typeLabel}
      {statusLabel && <span className="sr-only"> · {statusLabel}</span>}
    </span>
  );
}

function hrefFor(suggestion: SearchSuggestion): string {
  switch (suggestion.mediaType) {
    case "person":
      return `/person/${suggestion.id}`;
    case "company":
      return companyHref({ kind: "studio", tmdbId: suggestion.id });
    case "network":
      return companyHref({ kind: "network", tmdbId: suggestion.id });
    default:
      return `/title/${suggestion.mediaType}/${suggestion.id}`;
  }
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
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const latestRequestId = useRef(0);
  const listId = `search-suggestions-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

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
        // Grouped server-side (movies, TV, people, studios & networks);
        // anything this page can't open is dropped.
        const results: SearchSuggestion[] = data.results ?? [];
        setSuggestions(results.filter((s) => suggestionGroup(s.mediaType) !== null));
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
    if (isOpen && highlightedIndex >= 0 && suggestions[highlightedIndex]) {
      goToSuggestion(suggestions[highlightedIndex]);
      return;
    }
    submitQuery();
  }

  /** The full results page for what's typed. */
  function submitQuery() {
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

    // ↑↓ walk the flat list, straight across the groups; past either end
    // wraps around.
    let next: number | null = null;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      next = (highlightedIndex + 1) % suggestions.length;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      next = highlightedIndex <= 0 ? suggestions.length - 1 : highlightedIndex - 1;
    } else if (e.key === "Escape") {
      // Only the suggestions close; a search dialog around this box stays.
      e.stopPropagation();
      setIsOpen(false);
    }
    if (next !== null) {
      setHighlightedIndex(next);
      // The list scrolls on a short screen: keep the picked row in view.
      document.getElementById(`${listId}-option-${next}`)?.scrollIntoView({ block: "nearest" });
    }
  }

  const isCompact = variant === "compact";
  const expanded = isOpen && suggestions.length > 0;

  return (
    <div ref={containerRef} className="relative mx-auto w-full max-w-xl">
      <form onSubmit={handleSubmit} role="search">
        <input
          type="text"
          role="combobox"
          aria-label={t("nav.searchPlaceholder")}
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={expanded ? listId : undefined}
          aria-activedescendant={expanded && highlightedIndex >= 0 ? `${listId}-option-${highlightedIndex}` : undefined}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setIsOpen(true)}
          placeholder={t("nav.searchPlaceholder")}
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
        <div
          id={listId}
          role="listbox"
          aria-label={t("nav.searchSuggestions")}
          className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[min(70vh,560px)] overflow-y-auto overscroll-contain rounded-xl border border-border bg-bg-1 py-1 shadow-2xl"
        >
          {groupRuns(suggestions).map((run, runIndex) => (
            <div key={`${run.group}-${runIndex}`} role="group" aria-labelledby={`${listId}-${run.group}-${runIndex}`}>
              <p
                id={`${listId}-${run.group}-${runIndex}`}
                className={`px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-muted ${
                  runIndex > 0 ? "mt-1 border-t border-border" : ""
                }`}
              >
                {t(GROUP_LABELS[run.group])}
              </p>
              {run.items.map(({ item: suggestion, index }) => (
                <button
                  key={`${suggestion.mediaType}-${suggestion.id}`}
                  id={`${listId}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === highlightedIndex}
                  tabIndex={-1}
                  onClick={() => goToSuggestion(suggestion)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`flex w-full items-center gap-3 px-3 py-1.5 text-left transition-colors ${
                    index === highlightedIndex ? "bg-bg-2" : "hover:bg-bg-2"
                  }`}
                >
                  <SuggestionThumb suggestion={suggestion} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-text-primary">{suggestion.name}</p>
                    {suggestion.subtitle && <p className="truncate text-xs text-text-muted">{suggestion.subtitle}</p>}
                  </div>
                  <TypePill suggestion={suggestion} />
                </button>
              ))}
            </div>
          ))}
          <button
            type="button"
            tabIndex={-1}
            onClick={() => submitQuery()}
            className="mt-1 flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-xs text-text-secondary transition-colors hover:bg-bg-2 hover:text-accent"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 shrink-0" aria-hidden>
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l4.5 4.5" strokeLinecap="round" />
            </svg>
            <span className="truncate">{t("nav.searchAllResults", { query: value.trim() })}</span>
          </button>
        </div>
      )}
    </div>
  );
}
