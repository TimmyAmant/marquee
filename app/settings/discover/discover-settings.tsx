"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addDiscoverShelfAction,
  lookUpDiscoverSourceAction,
  removeDiscoverShelfAction,
  resetDiscoverAction,
  saveDiscoverOrderAction,
  updateDiscoverShelfAction,
  type DiscoverActionResult,
} from "./actions";
import { describeShelf, moveShelf, type CustomShelfKind, type LayoutShelf } from "@/lib/discover/shelves";
import type { DiscoverLookupResult } from "@/lib/api/types";
import { tmdbImageUrl } from "@/lib/tmdb/image";
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n/translator";
import { orError } from "@/lib/async/or-error";

const inputClass =
  "rounded-lg border border-border bg-bg-0 px-3.5 py-2.5 text-sm text-text-primary outline-none transition-colors focus:border-accent";
const smallButtonClass =
  "rounded-full border border-border-strong px-3 py-1 text-xs text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-40 disabled:hover:border-border-strong disabled:hover:text-text-primary";
const iconButtonClass =
  "flex h-7 w-7 items-center justify-center rounded-full border border-border-strong text-text-secondary transition-colors hover:border-accent hover:text-accent disabled:opacity-30 disabled:hover:border-border-strong disabled:hover:text-text-secondary";

const KIND_OPTIONS: { kind: CustomShelfKind; label: MessageKey; hint: MessageKey }[] = [
  { kind: "keyword", label: "integrations.shelfKindKeyword", hint: "integrations.shelfKindKeywordHint" },
  { kind: "genre", label: "integrations.shelfKindGenre", hint: "integrations.shelfKindGenreHint" },
  { kind: "company", label: "integrations.shelfKindCompany", hint: "integrations.shelfKindCompanyHint" },
  { kind: "network", label: "integrations.shelfKindNetwork", hint: "integrations.shelfKindNetworkHint" },
  { kind: "tmdbList", label: "integrations.shelfKindTmdbList", hint: "integrations.shelfKindTmdbListHint" },
  { kind: "traktList", label: "integrations.shelfKindTraktList", hint: "integrations.shelfKindTraktListHint" },
  { kind: "library", label: "integrations.shelfKindLibrary", hint: "integrations.shelfKindLibraryHint" },
];

type MediaChoice = "all" | "movie" | "tv";

function Arrow({ up }: { up: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
      <path d={up ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShelfRowEditor({
  shelf,
  index,
  count,
  busy,
  onMove,
  onToggle,
  onRename,
  onRemove,
}: {
  shelf: LayoutShelf;
  index: number;
  count: number;
  busy: boolean;
  onMove: (delta: -1 | 1) => void;
  onToggle: () => void;
  onRename: (title: string) => Promise<boolean>;
  onRemove: () => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(shelf.title);
  const [confirming, setConfirming] = useState(false);

  return (
    <li className={`flex flex-wrap items-center gap-3 px-5 py-3 ${shelf.hidden ? "opacity-60" : ""}`}>
      <div className="flex shrink-0 gap-1.5">
        <button
          type="button"
          aria-label={t("integrations.moveUp", { name: shelf.title })}
          disabled={busy || index === 0}
          onClick={() => onMove(-1)}
          className={iconButtonClass}
        >
          <Arrow up />
        </button>
        <button
          type="button"
          aria-label={t("integrations.moveDown", { name: shelf.title })}
          disabled={busy || index === count - 1}
          onClick={() => onMove(1)}
          className={iconButtonClass}
        >
          <Arrow up={false} />
        </button>
      </div>

      <div className="min-w-0 flex-1">
        {editing ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={async (event) => {
              event.preventDefault();
              if (await onRename(title)) setEditing(false);
            }}
          >
            <input
              value={title}
              maxLength={60}
              autoFocus
              onChange={(event) => setTitle(event.target.value)}
              aria-label={t("integrations.rowName")}
              className={`${inputClass} py-1.5`}
            />
            <button type="submit" disabled={busy} className={smallButtonClass}>
              {t("common.save")}
            </button>
            <button
              type="button"
              onClick={() => {
                setTitle(shelf.title);
                setEditing(false);
              }}
              className="text-xs text-text-secondary hover:text-accent"
            >
              {t("common.cancel")}
            </button>
          </form>
        ) : (
          <p className="truncate text-sm font-medium text-text-primary">
            {shelf.title}
            {shelf.hidden && <span className="ml-2 text-xs font-normal text-text-muted">{t("integrations.hidden")}</span>}
          </p>
        )}
        <p className="mt-0.5 truncate text-xs text-text-muted">{describeShelf(shelf, t)}</p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={!shelf.hidden}
            disabled={busy}
            onChange={onToggle}
            className="h-4 w-4 rounded border-border accent-accent"
          />
          {t("integrations.show")}
        </label>
        {shelf.custom && !editing && (
          <button type="button" disabled={busy} onClick={() => setEditing(true)} className="text-xs text-text-secondary hover:text-accent">
            {t("integrations.rename")}
          </button>
        )}
        {shelf.custom &&
          (confirming ? (
            <span className="flex items-center gap-2 text-xs">
              <button type="button" disabled={busy} onClick={onRemove} className="text-red-400 hover:underline">
                {t("integrations.removeIt")}
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="text-text-secondary hover:text-accent">
                {t("integrations.keep")}
              </button>
            </span>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming(true)}
              className="text-xs text-text-secondary hover:text-red-400"
            >
              {t("common.remove")}
            </button>
          ))}
      </div>
    </li>
  );
}

function SourcePicker({
  kind,
  mediaType,
  picked,
  onPick,
}: {
  kind: "keyword" | "company" | "network" | "genre";
  mediaType: MediaChoice;
  picked: DiscoverLookupResult | null;
  onPick: (result: DiscoverLookupResult | null) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DiscoverLookupResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const lists = kind === "genre" || kind === "network";
  const tooShort = !lists && query.trim().length < 2;

  useEffect(() => {
    let cancelled = false;
    // Genres and networks list straight away; keywords and studios wait
    // for something to search for.
    if (!lists && query.trim().length < 2) return;
    const timer = setTimeout(async () => {
      setSearching(true);
      const result = await orError(
        lookUpDiscoverSourceAction(kind, query, kind === "genre" ? (mediaType === "tv" ? "tv" : "movie") : null),
        t("common.somethingWentWrong"),
      );
      if (cancelled) return;
      setSearching(false);
      setError(result.error ?? null);
      setResults(result.results ?? []);
    }, lists ? 0 : 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [kind, query, mediaType, lists, t]);

  if (picked) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-text-primary">
          {picked.name}
          {picked.detail && <span className="ml-1 text-xs text-text-muted">({picked.detail})</span>}
        </span>
        <button type="button" onClick={() => onPick(null)} className="text-xs text-text-secondary hover:text-accent">
          {t("integrations.change")}
        </button>
      </div>
    );
  }

  const placeholder = t(
    kind === "keyword"
      ? "integrations.searchKeywords"
      : kind === "company"
        ? "integrations.searchStudios"
        : kind === "network"
          ? "integrations.filterNetworks"
          : "integrations.filterGenres",
  );

  return (
    <div className="flex flex-col gap-2">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={inputClass}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      {searching && !tooShort && results.length === 0 && <p className="text-xs text-text-muted">{t("integrations.searching")}</p>}
      {!tooShort && results.length > 0 && (
        <ul className="max-h-60 overflow-y-auto rounded-lg border border-border">
          {results.map((result) => (
            <li key={result.tmdbId}>
              <button
                type="button"
                onClick={() => onPick(result)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-text-primary hover:bg-bg-2"
              >
                {result.logoPath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={tmdbImageUrl(result.logoPath, "w92") ?? ""} alt="" className="h-5 w-10 object-contain" />
                ) : null}
                <span>{result.name}</span>
                {result.detail && <span className="text-xs text-text-muted">{result.detail}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddShelfForm({
  traktConfigured,
  onAdded,
}: {
  traktConfigured: boolean;
  onAdded: (result: DiscoverActionResult) => void;
}) {
  const t = useT();
  const [kind, setKind] = useState<CustomShelfKind>("keyword");
  const [mediaType, setMediaType] = useState<MediaChoice>("all");
  const [picked, setPicked] = useState<DiscoverLookupResult | null>(null);
  const [link, setLink] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const option = KIND_OPTIONS.find((o) => o.kind === kind)!;
  const mediaChoices: MediaChoice[] | null =
    kind === "genre" ? ["movie", "tv"] : kind === "keyword" || kind === "company" || kind === "library" ? ["all", "movie", "tv"] : null;

  function chooseKind(next: CustomShelfKind) {
    setKind(next);
    setPicked(null);
    setLink("");
    setError(null);
    setMediaType(next === "genre" ? "movie" : "all");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const body: Record<string, unknown> = { kind, title: title.trim() || undefined };
    if (kind === "keyword" || kind === "company" || kind === "network" || kind === "genre") {
      if (!picked) {
        setError(t("integrations.pickSourceFirst", { kind }));
        return;
      }
      body.tmdbId = picked.tmdbId;
      body.name = picked.name;
    }
    if (kind === "tmdbList" || kind === "traktList") body.url = link.trim();
    if (mediaChoices) body.mediaType = mediaType;
    setBusy(true);
    setError(null);
    const result = await orError(addDiscoverShelfAction(body), t("common.somethingWentWrong"));
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setPicked(null);
    setLink("");
    setTitle("");
    onAdded(result);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 p-5">
      <p className="text-sm font-medium text-text-primary">{t("integrations.addRowHeading")}</p>
      <div className="flex flex-wrap gap-2">
        {KIND_OPTIONS.map((o) => (
          <button
            key={o.kind}
            type="button"
            onClick={() => chooseKind(o.kind)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              o.kind === kind
                ? "border-accent bg-accent/10 text-accent"
                : "border-border-strong text-text-secondary hover:border-accent hover:text-accent"
            }`}
          >
            {t(o.label)}
          </button>
        ))}
      </div>
      <p className="text-xs text-text-muted">{t(option.hint)}</p>

      {mediaChoices && (
        <div className="flex flex-wrap gap-4 text-sm text-text-secondary">
          {mediaChoices.map((choice) => (
            <label key={choice} className="flex items-center gap-2">
              <input
                type="radio"
                name="mediaType"
                checked={mediaType === choice}
                onChange={() => {
                  setMediaType(choice);
                  if (kind === "genre") setPicked(null);
                }}
                className="accent-accent"
              />
              {choice === "all" ? t("integrations.mediaAll") : choice === "movie" ? t("common.movies") : t("common.series")}
            </label>
          ))}
        </div>
      )}

      {(kind === "keyword" || kind === "company" || kind === "network" || kind === "genre") && (
        <SourcePicker key={`${kind}-${kind === "genre" ? mediaType : ""}`} kind={kind} mediaType={mediaType} picked={picked} onPick={setPicked} />
      )}
      {kind === "tmdbList" && (
        <input
          value={link}
          onChange={(event) => setLink(event.target.value)}
          placeholder={t("integrations.tmdbListPlaceholder")}
          aria-label={t("integrations.tmdbListLabel")}
          className={inputClass}
        />
      )}
      {kind === "traktList" && (
        <>
          <input
            value={link}
            onChange={(event) => setLink(event.target.value)}
            placeholder="https://trakt.tv/users/someone/lists/favourites" // i18n-ignore
            aria-label={t("integrations.traktListLabel")}
            className={inputClass}
          />
          {!traktConfigured && (
            <p className="text-xs text-amber-300">{t("integrations.traktNotConnected")}</p>
          )}
        </>
      )}

      <label className="flex flex-col gap-1.5 text-sm text-text-secondary">
        {t("integrations.rowNameOptional")}
        <input
          value={title}
          maxLength={60}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={picked ? picked.name : t("integrations.rowNamePlaceholder")}
          className={inputClass}
        />
      </label>

      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="self-start rounded-full bg-accent px-4 py-2 text-sm font-medium text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {busy ? t("integrations.adding") : t("integrations.addRow")}
      </button>
    </form>
  );
}

/** Settings → Discover: the household's Discover rows — order, which show,
 * and the admin's own. */
export function DiscoverSettingsEditor({
  initial,
  traktConfigured,
  maxCustomShelves,
}: {
  initial: LayoutShelf[];
  traktConfigured: boolean;
  maxCustomShelves: number;
}) {
  const t = useT();
  const router = useRouter();
  const [shelves, setShelves] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const customCount = shelves.filter((s) => s.custom).length;

  async function apply(action: Promise<DiscoverActionResult>, optimistic?: LayoutShelf[]): Promise<boolean> {
    const before = shelves;
    if (optimistic) setShelves(optimistic);
    setBusy(true);
    setError(null);
    // A dropped connection or a server error is a failure too: the list
    // goes back to how it was rather than staying moved and greyed out.
    const result = await orError(action, t("common.somethingWentWrong"));
    setBusy(false);
    if (result.error) {
      setShelves(before);
      setError(result.error);
      return false;
    }
    if (result.shelves) setShelves(result.shelves);
    router.refresh();
    return true;
  }

  const saveOrder = (next: LayoutShelf[]) =>
    apply(saveDiscoverOrderAction(next.map((s) => ({ id: s.id, hidden: s.hidden }))), next);

  return (
    <div className="mt-6 flex max-w-2xl flex-col gap-6">
      <div className="overflow-hidden rounded-2xl border border-border bg-bg-1">
        <ul className="divide-y divide-border">
          {shelves.map((shelf, index) => (
            <ShelfRowEditor
              key={shelf.id}
              shelf={shelf}
              index={index}
              count={shelves.length}
              busy={busy}
              onMove={(delta) => saveOrder(moveShelf(shelves, index, delta))}
              onToggle={() => saveOrder(shelves.map((s) => (s.id === shelf.id ? { ...s, hidden: !s.hidden } : s)))}
              onRename={(title) => apply(updateDiscoverShelfAction(shelf.id, { title }))}
              onRemove={() => apply(removeDiscoverShelfAction(shelf.id), shelves.filter((s) => s.id !== shelf.id))}
            />
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
          <p className="text-xs text-text-muted">
            {error ? <span className="text-red-400">{error}</span> : t("integrations.changesApply")}
          </p>
          {confirmReset ? (
            <span className="flex items-center gap-3 text-xs">
              <span className="text-text-secondary">{t("integrations.resetConfirm")}</span>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setConfirmReset(false);
                  await apply(resetDiscoverAction());
                }}
                className="text-accent hover:underline"
              >
                {t("integrations.reset")}
              </button>
              <button type="button" onClick={() => setConfirmReset(false)} className="text-text-secondary hover:text-accent">
                {t("common.cancel")}
              </button>
            </span>
          ) : (
            <button type="button" disabled={busy} onClick={() => setConfirmReset(true)} className={smallButtonClass}>
              {t("integrations.resetToDefault")}
            </button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-bg-1">
        {customCount >= maxCustomShelves ? (
          <p className="p-5 text-sm text-text-muted">{t("integrations.maxCustomRows", { count: maxCustomShelves })}</p>
        ) : (
          <AddShelfForm
            traktConfigured={traktConfigured}
            onAdded={(result) => {
              if (result.shelves) setShelves(result.shelves);
              router.refresh();
            }}
          />
        )}
      </div>
    </div>
  );
}
