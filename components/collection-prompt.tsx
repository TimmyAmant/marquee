"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { MediaImage } from "@/components/media-image";
import { showToast } from "@/components/toast";
import { addCollectionRestAction, collectionRestAction } from "@/lib/collections/actions";
import type { CollectionRest } from "@/lib/collections/rest";
import { tmdbImageUrl } from "@/lib/tmdb/image";
import { useT } from "@/lib/i18n/client";

// "Dune is part of the Dune Collection — add the other 2 too?": after a
// movie's Add (the admin) or Request (a member) anywhere on the site, the
// rest of its collection the library doesn't have is offered in one go
// (lib/collections/rest.ts). The buttons call offerCollection(); the host,
// mounted once in app/layout.tsx, asks the server and opens the dialog.

const OFFER_EVENT = "marquee:collection-offer";
/** Collections the viewer said "Not now" to, this browser session. */
const DISMISSED_KEY = "marquee:collection-prompt-dismissed";

/** A movie was just added or requested: offer the rest of its collection. */
export function offerCollection(tmdbId: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<{ tmdbId: number }>(OFFER_EVENT, { detail: { tmdbId } }));
}

function dismissed(): number[] {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(DISMISSED_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((n): n is number => typeof n === "number") : [];
  } catch {
    return [];
  }
}

function dismiss(collectionId: number) {
  try {
    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...new Set([...dismissed(), collectionId])]));
  } catch {
    // Private mode: it just asks again next time.
  }
}

export function CollectionPromptHost() {
  const [offer, setOffer] = useState<{ tmdbId: number; rest: CollectionRest } | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    function onOffer(e: Event) {
      const { tmdbId } = (e as CustomEvent<{ tmdbId: number }>).detail;
      const ticket = ++latest.current;
      collectionRestAction(tmdbId)
        .then((rest) => {
          // Only the latest add counts, and never one already said no to.
          if (ticket !== latest.current || !rest || dismissed().includes(rest.collectionId)) return;
          setOffer({ tmdbId, rest });
        })
        .catch(() => undefined);
    }
    window.addEventListener(OFFER_EVENT, onOffer);
    return () => window.removeEventListener(OFFER_EVENT, onOffer);
  }, []);

  if (!offer) return null;
  return <CollectionPromptDialog key={offer.tmdbId} tmdbId={offer.tmdbId} rest={offer.rest} onClose={() => setOffer(null)} />;
}

function CollectionPromptDialog({ tmdbId, rest, onClose }: { tmdbId: number; rest: CollectionRest; onClose: () => void }) {
  const t = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const count = rest.items.length;
  const adding = rest.action === "add";

  const notNow = () => {
    dismiss(rest.collectionId);
    onClose();
  };
  const notNowRef = useRef(notNow);
  useEffect(() => {
    notNowRef.current = notNow;
  });

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const previous = document.activeElement as HTMLElement | null;
    panel.querySelector<HTMLElement>("[data-primary]")?.focus();
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        notNowRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>("button:not(:disabled)"));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previous?.focus?.();
    };
  }, []);

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await addCollectionRestAction(tmdbId).catch(() => ({ error: t("common.somethingWentWrong"), message: undefined }));
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.message) showToast(result.message);
      router.refresh();
      onClose();
    });
  }

  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="fixed inset-0 z-[58] flex items-end justify-center p-4 sm:items-center">
      <div aria-hidden onClick={notNow} className="absolute inset-0 bg-black/40" />
      <div
        ref={panelRef}
        className="nav-glass relative flex max-h-[min(80vh,640px)] w-full max-w-[440px] flex-col overflow-hidden rounded-[24px] shadow-[0_24px_60px_rgb(0_0_0/0.35)]"
      >
        <div className="px-5 pb-3 pt-5">
          <h2 id={titleId} className="font-display text-[18px] font-semibold leading-6 text-text-primary">
            {t("title.collectionPromptHeading", { collection: rest.name })}
          </h2>
          <p className="mt-1 text-[13px] text-text-secondary">
            {t(adding ? "title.collectionPromptBodyAdd" : "title.collectionPromptBodyRequest", { count })}
          </p>
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto px-5 pb-2">
          {rest.items.map((item) => {
            const src = tmdbImageUrl(item.posterPath, "w92");
            return (
              <li key={item.tmdbId} className="flex items-center gap-3 border-b border-[var(--marquee-glass-border)] py-2 last:border-b-0">
                <span className="relative h-[54px] w-9 shrink-0 overflow-hidden rounded-md bg-bg-2">
                  {src && <MediaImage src={src} alt="" fill sizes="36px" className="object-cover" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium text-text-primary">{item.name}</span>
                  {item.year && <span className="block text-[12px] text-text-muted">{item.year}</span>}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="border-t border-[var(--marquee-glass-border)] px-5 py-3">
          {error && (
            <p role="alert" className="mb-2 text-xs text-red-400">
              {error}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={notNow}
              disabled={isPending}
              className="flex h-8 items-center rounded-full border border-border-strong px-4 text-[13px] text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
            >
              {t("title.collectionPromptNotNow")}
            </button>
            <button
              type="button"
              data-primary
              onClick={confirm}
              disabled={isPending}
              className="flex h-8 items-center rounded-full bg-accent px-4 text-[13px] font-semibold text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
            >
              {isPending
                ? t(adding ? "title.adding" : "title.requesting")
                : t(adding ? "title.collectionPromptAdd" : "title.collectionPromptRequest", { count })}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
