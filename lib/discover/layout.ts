import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { discoverShelves } from "@/lib/db/schema";
import {
  applyLayoutOrder,
  customTitle,
  defaultLayout,
  defaultShelfTitle,
  isBuiltInShelf,
  isCustomShelfKind,
  isShelfUuid,
  MAX_CUSTOM_SHELVES,
  parseStoredSource,
  resolveLayout,
  validateShelfInput,
  validateSource,
  type LayoutShelf,
  type ShelfRow,
  type ShelfSource,
} from "@/lib/discover/shelves";
import { getT } from "@/lib/i18n/server";
import { englishT } from "@/lib/i18n/catalog";
import { getCompanyDetails, getKeywordDetails, getMovieGenres, getNetworkDetails, getTmdbList, getTvGenres } from "@/lib/tmdb/client";
import { fail, type CoreResult } from "@/lib/core-result";

// Settings → Discover: the admin's arrangement of the Discover rows, for the
// whole household. Callers check the admin (every route and action does);
// the rules themselves are pure in lib/discover/shelves.ts.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function readRows(tx: Tx | typeof db = db) {
  const rows = await tx.select().from(discoverShelves).orderBy(asc(discoverShelves.position));
  return rows.map(withoutSavedDefaultTitle);
}

/**
 * A row left unnamed is stored with no title and shown under its default
 * name in each reader's language. Rows saved before that kept their
 * (English) default name as their title: read those as unnamed too.
 */
function withoutSavedDefaultTitle<R extends ShelfRow>(row: R): R {
  if (row.builtIn !== null || row.title === null || !isCustomShelfKind(row.kind)) return row;
  const english = englishT();
  const source = parseStoredSource(row.kind, row.source, english);
  if (!source || row.title !== defaultShelfTitle(row.kind, source, english)) return row;
  return { ...row, title: null };
}

/** The Discover rows in the admin's order, hidden ones included. With
 * nothing saved, exactly the built-in rows in their usual order. Named in
 * the reader's language. */
export async function getDiscoverLayout(): Promise<LayoutShelf[]> {
  return resolveLayout(await readRows(), await getT());
}

async function readCustomRow(id: string) {
  if (!isShelfUuid(id)) return null;
  const [row] = await db.select().from(discoverShelves).where(eq(discoverShelves.id, id)).limit(1);
  if (!row || row.builtIn !== null) return null;
  return withoutSavedDefaultTitle(row);
}

export async function getCustomShelf(id: string): Promise<LayoutShelf | null> {
  const row = await readCustomRow(id);
  if (!row) return null;
  return resolveLayout([row], await getT()).find((shelf) => shelf.id === id) ?? null;
}

/** Writes every row's place: built-in rows get a row of their own the first
 * time anything is saved. */
async function writeOrder(tx: Tx, order: { id: string; hidden: boolean }[]) {
  const now = new Date();
  for (const [position, entry] of order.entries()) {
    if (isBuiltInShelf(entry.id)) {
      await tx
        .insert(discoverShelves)
        .values({ builtIn: entry.id, kind: entry.id, position, hidden: entry.hidden })
        .onConflictDoUpdate({
          target: discoverShelves.builtIn,
          set: { position, hidden: entry.hidden, updatedAt: now },
        });
    } else {
      await tx
        .update(discoverShelves)
        .set({ position, hidden: entry.hidden, updatedAt: now })
        .where(eq(discoverShelves.id, entry.id));
    }
  }
}

function refreshDiscover() {
  revalidatePath("/discover");
}

/** A new order and which rows show: `[{ id, hidden? }, …]` (see
 * applyLayoutOrder). Answers the whole layout. */
export async function saveDiscoverLayout(requested: unknown): Promise<CoreResult<{ shelves: LayoutShelf[] }>> {
  const t = await getT();
  const result = await db.transaction(async (tx) => {
    const order = applyLayoutOrder(resolveLayout(await readRows(tx), t), requested, t);
    if (!order.ok) return fail("invalid", order.error);
    await writeOrder(tx, order.value);
    return { ok: true as const };
  });
  if (!result.ok) return result;
  refreshDiscover();
  return { ok: true, shelves: await getDiscoverLayout() };
}

/** Fills in the name of what a row is built from, when the client didn't
 * send it, so the settings list and default titles read well. Soft: a TMDb
 * hiccup leaves it blank. */
async function withSourceName(kind: string, source: ShelfSource): Promise<ShelfSource> {
  if (source.name || source.tmdbId === null) return source;
  const id = source.tmdbId;
  const name = await (async () => {
    switch (kind) {
      case "keyword":
        return (await getKeywordDetails(id)).name;
      case "company":
        return (await getCompanyDetails(id)).name;
      case "network":
        return (await getNetworkDetails(id)).name;
      case "tmdbList":
        return (await getTmdbList(id, 1)).name;
      case "genre": {
        const { genres } = await (source.mediaType === "tv" ? getTvGenres() : getMovieGenres());
        return genres.find((genre) => genre.id === id)?.name ?? null;
      }
      default:
        return null;
    }
  })().catch(() => null);
  return name ? { ...source, name } : source;
}

/** Adds one of the admin's own rows at the end, shown. Body: `{ kind,
 * title?, mediaType?, tmdbId?, name?, url? }`. */
export async function createCustomShelf(body: Record<string, unknown>): Promise<CoreResult<{ shelf: LayoutShelf }>> {
  const t = await getT();
  const validated = validateShelfInput(body, t);
  if (!validated.ok) return fail("invalid", validated.error);
  const { kind } = validated.value;
  const source = await withSourceName(kind, validated.value.source);
  // Left unnamed, it's shown named after what it shows — now that the name
  // of the keyword or list is known — in each reader's language.
  const title = customTitle(body.title, t);
  if (!title.ok) return fail("invalid", title.error);

  const created = await db.transaction(async (tx) => {
    const rows = await readRows(tx);
    if (rows.filter((row) => row.builtIn === null).length >= MAX_CUSTOM_SHELVES) {
      return fail("conflict", t("discover.errorTooManyRows", { max: MAX_CUSTOM_SHELVES }));
    }
    // Pin every existing row's place before adding one after them.
    const layout = resolveLayout(rows, t);
    await writeOrder(
      tx,
      layout.map((shelf) => ({ id: shelf.id, hidden: shelf.hidden })),
    );
    const [row] = await tx
      .insert(discoverShelves)
      .values({ kind, title: title.value, source, position: layout.length, hidden: false })
      .returning({ id: discoverShelves.id });
    return { ok: true as const, id: row.id };
  });
  if (!created.ok) return created;
  refreshDiscover();
  const shelf = await getCustomShelf(created.id);
  return shelf ? { ok: true, shelf } : fail("internal", t("discover.errorReadBack"));
}

/** Renames a custom row, changes what it shows (same kind), or shows/hides
 * any row. Body: `{ title?, hidden?, mediaType?, tmdbId?, name?, url? }`. */
export async function updateShelf(id: string, body: Record<string, unknown>): Promise<CoreResult<{ shelf: LayoutShelf }>> {
  const t = await getT();
  if (body.hidden !== undefined && typeof body.hidden !== "boolean") return fail("invalid", t("discover.errorHiddenBoolean"));
  const hidden = body.hidden as boolean | undefined;

  if (isBuiltInShelf(id)) {
    const changesMore = ["title", "mediaType", "tmdbId", "name", "url"].some((key) => body[key] !== undefined);
    if (changesMore) return fail("invalid", t("discover.errorBuiltInOnlyHide"));
    if (hidden === undefined) return fail("invalid", t("discover.errorSendHidden"));
    await db.transaction(async (tx) => {
      const layout = resolveLayout(await readRows(tx), t);
      await writeOrder(
        tx,
        layout.map((shelf) => ({ id: shelf.id, hidden: shelf.id === id ? hidden : shelf.hidden })),
      );
    });
    refreshDiscover();
    const shelf = (await getDiscoverLayout()).find((s) => s.id === id)!;
    return { ok: true, shelf };
  }

  const row = await readCustomRow(id);
  const current = row ? resolveLayout([row], t).find((shelf) => shelf.id === id) : undefined;
  if (!row || !current) return fail("not_found", t("discover.errorRowGone"));
  if (isCustomShelfKind(current.kind)) {
    const changesSource = ["mediaType", "tmdbId", "name", "url"].some((key) => body[key] !== undefined);
    let source = current.source;
    if (changesSource || !source) {
      const merged = { ...(current.source ?? {}), ...body };
      const validated = validateSource(current.kind, merged, t);
      if (!validated.ok) return fail("invalid", validated.error);
      // A new keyword or list: its old name no longer applies.
      const sameThing = current.source && validated.value.tmdbId === current.source.tmdbId;
      source = await withSourceName(current.kind, {
        ...validated.value,
        name: body.name !== undefined || sameThing ? validated.value.name : null,
      });
    }
    // The name as stored: null (unnamed) keeps following what the row shows.
    let title = row.title;
    if (body.title !== undefined) {
      const validated = customTitle(body.title, t);
      if (!validated.ok) return fail("invalid", validated.error);
      title = validated.value;
    }
    await db
      .update(discoverShelves)
      .set({ title, source, ...(hidden !== undefined ? { hidden } : {}), updatedAt: new Date() })
      .where(eq(discoverShelves.id, id));
  } else if (hidden !== undefined) {
    // A row of a kind this version doesn't know: it can still be hidden.
    await db.update(discoverShelves).set({ hidden, updatedAt: new Date() }).where(eq(discoverShelves.id, id));
  }
  refreshDiscover();
  const shelf = await getCustomShelf(id);
  return shelf ? { ok: true, shelf } : fail("not_found", t("discover.errorRowGone"));
}

/** Removes one of the admin's own rows. A built-in row can only be hidden. */
export async function deleteShelf(id: string): Promise<CoreResult> {
  const t = await getT();
  if (isBuiltInShelf(id)) return fail("invalid", t("discover.errorBuiltInRemove"));
  if (!isShelfUuid(id)) return fail("not_found", t("discover.errorRowGone"));
  const deleted = await db
    .delete(discoverShelves)
    .where(eq(discoverShelves.id, id))
    .returning({ id: discoverShelves.id, builtIn: discoverShelves.builtIn });
  if (deleted.length === 0) return fail("not_found", t("discover.errorRowGone"));
  refreshDiscover();
  return { ok: true };
}

/** Back to the usual built-in rows, all shown, in their usual order; the
 * admin's own rows stay, after them, as they were. */
export async function resetDiscoverLayout(): Promise<{ shelves: LayoutShelf[] }> {
  const t = await getT();
  await db.transaction(async (tx) => {
    const custom = resolveLayout(await readRows(tx), t).filter((shelf) => shelf.custom);
    await writeOrder(tx, [
      ...defaultLayout(t).map((shelf) => ({ id: shelf.id, hidden: false })),
      ...custom.map((shelf) => ({ id: shelf.id, hidden: shelf.hidden })),
    ]);
  });
  refreshDiscover();
  return { shelves: await getDiscoverLayout() };
}
