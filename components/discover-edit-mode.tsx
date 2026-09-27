"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { resetDiscoverAction, saveDiscoverOrderAction } from "@/app/settings/discover/actions";
import { layoutChanged, layoutOrder, moveShelf, toggleShelfHidden, type EditableShelf } from "@/lib/discover/edit-mode";
import { showToast } from "@/components/toast";
import { useT } from "@/lib/i18n/client";

const PILL =
  "flex h-8 items-center gap-1.5 rounded-full border border-border-strong px-3.5 text-[13px] text-text-primary transition-colors hover:border-accent hover:text-accent disabled:opacity-50";

function Arrow({ up }: { up: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden className="h-4 w-4">
      <path d={up ? "m6 15 6-6 6 6" : "m6 9 6 6 6-6"} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Discover's rows with the admin's inline edit mode, after Seerr's: a pencil
 * beside the page's top turns every row into an editable one — a switch to
 * show or hide it, and up / down to move it — with Reset, Save and Stop
 * editing in a bar that stays at the top. Saves through the same call as
 * Settings › Discover (the full editor, for adding rows, stays there).
 * Hidden rows aren't loaded, so while editing they show as just their name
 * until saved.
 */
export function DiscoverEditMode({
  editable,
  shelves,
  rendered,
}: {
  /** The admin: the pencil shows. */
  editable: boolean;
  /** Every row in the saved order, hidden ones too (only for the admin). */
  shelves: EditableShelf[];
  /** Each row as the page draws it, by id; empty and hidden rows have none. */
  rendered: { id: string; node: ReactNode }[];
}) {
  const t = useT();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [working, setWorking] = useState<EditableShelf[]>(shelves);
  const [saved, setSaved] = useState<EditableShelf[]>(shelves);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const nodes = new Map(rendered.map((row) => [row.id, row.node]));

  // A refresh after saving brings a new saved layout: start from it.
  const [prevShelves, setPrevShelves] = useState(shelves);
  if (prevShelves !== shelves) {
    setPrevShelves(shelves);
    setSaved(shelves);
    if (!editing) setWorking(shelves);
  }

  function startEditing() {
    setWorking(saved);
    setError(null);
    setEditing(true);
  }

  function stopEditing() {
    setWorking(saved);
    setError(null);
    setEditing(false);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveDiscoverOrderAction(layoutOrder(working));
      if (result.error || !result.shelves) {
        setError(result.error ?? t("common.somethingWentWrong"));
        return;
      }
      const next = result.shelves.map(({ id, title, hidden }) => ({ id, title, hidden }));
      setSaved(next);
      setWorking(next);
      setEditing(false);
      showToast(t("discover.editSaved"));
      router.refresh();
    });
  }

  function reset() {
    setError(null);
    startTransition(async () => {
      const result = await resetDiscoverAction();
      if (result.error || !result.shelves) {
        setError(result.error ?? t("common.somethingWentWrong"));
        return;
      }
      const next = result.shelves.map(({ id, title, hidden }) => ({ id, title, hidden }));
      setSaved(next);
      setWorking(next);
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <>
        {editable && (
          <div className="-mb-8 flex justify-end pr-4 sm:pr-7">
            <button type="button" onClick={startEditing} className={PILL} aria-label={t("discover.editDiscover")}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden className="h-4 w-4">
                <path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="hidden sm:inline">{t("discover.editDiscover")}</span>
            </button>
          </div>
        )}
        {rendered.map((row) => (
          <div key={row.id}>{row.node}</div>
        ))}
      </>
    );
  }

  const changed = layoutChanged(saved, working);

  return (
    <>
      <div className="sticky top-[60px] z-20 mr-4 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-bg-1/95 p-3 shadow-lg backdrop-blur sm:mr-7">
        <p className="mr-auto text-[14px] font-medium text-text-primary">{t("discover.editingDiscover")}</p>
        {error && (
          <p role="alert" className="w-full text-xs text-red-400 sm:order-last">
            {error}
          </p>
        )}
        <button type="button" onClick={reset} disabled={isPending} className={PILL}>
          {t("discover.editReset")}
        </button>
        <button type="button" onClick={stopEditing} disabled={isPending} className={PILL}>
          {t("discover.editStop")}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={isPending || !changed}
          className="flex h-8 items-center rounded-full bg-accent px-4 text-[13px] font-semibold text-bg-0 transition-colors hover:bg-accent-hover disabled:opacity-60"
        >
          {isPending ? t("discover.editSaving") : t("discover.editSave")}
        </button>
      </div>

      {working.map((shelf, index) => {
        const node = nodes.get(shelf.id);
        return (
          <section key={shelf.id} aria-label={shelf.title} className="flex flex-col gap-3">
            <div className="mr-4 flex items-center gap-3 rounded-xl border border-dashed border-border-strong px-3 py-2 sm:mr-7">
              <button
                type="button"
                role="switch"
                aria-checked={!shelf.hidden}
                aria-label={t("discover.editShowRow", { title: shelf.title })}
                onClick={() => setWorking((prev) => toggleShelfHidden(prev, shelf.id))}
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${shelf.hidden ? "bg-text-primary/20" : "bg-accent"}`}
              >
                <span
                  aria-hidden
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] ${shelf.hidden ? "left-0.5" : "left-[18px]"}`}
                />
              </button>
              <span className={`min-w-0 flex-1 truncate text-[14px] font-medium ${shelf.hidden ? "text-text-muted" : "text-text-primary"}`}>
                {shelf.title}
                {shelf.hidden && <span className="ml-2 text-[12px] font-normal">{t("discover.editHidden")}</span>}
              </span>
              <button
                type="button"
                onClick={() => setWorking((prev) => moveShelf(prev, index, -1))}
                disabled={index === 0}
                aria-label={t("discover.editMoveUp", { title: shelf.title })}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-text-secondary hover:border-accent hover:text-accent disabled:opacity-30"
              >
                <Arrow up />
              </button>
              <button
                type="button"
                onClick={() => setWorking((prev) => moveShelf(prev, index, 1))}
                disabled={index === working.length - 1}
                aria-label={t("discover.editMoveDown", { title: shelf.title })}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-border text-text-secondary hover:border-accent hover:text-accent disabled:opacity-30"
              >
                <Arrow up={false} />
              </button>
            </div>
            {node && <div className={shelf.hidden ? "pointer-events-none opacity-40" : ""}>{node}</div>}
          </section>
        );
      })}
    </>
  );
}
