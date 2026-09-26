import { randomBytes } from "crypto";
import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { arrServers, arrStatusCache } from "@/lib/db/schema";
import type { ArrProvider } from "@/lib/db/schema";
import { encryptSecret } from "@/lib/crypto/encryption";
import { revalidatePathSafely as revalidatePath } from "@/lib/cache/revalidate";
import { fail, type CoreResult } from "@/lib/core-result";
import {
  defaultServerName,
  getArrServer,
  kindLabel,
  listArrServers,
  toArrServer,
  type ArrServer,
} from "@/lib/arr/servers";
import { fetchPickerOptions, type ArrPickerOptions } from "@/lib/arr/add-options-server";
import type { ArrServerInput } from "@/lib/arr/server-input";
import { resyncArrLibrary, waitForArrSync } from "@/lib/arr/sync";
import * as sonarr from "@/lib/sonarr/client";
import * as radarr from "@/lib/radarr/client";

// Adding, editing and removing Sonarr/Radarr servers — Settings →
// Integrations on the website and /api/v1/settings/arr-servers. Callers have
// already checked the actor is the admin; `ownerId` is that admin.

export const SERVER_NOT_FOUND = "Server not found.";
export const URL_NEEDS_KEY = "Enter the API key again to change the URL.";
export const CONNECT_FAILED = "Couldn't connect. Check the URL and API key and try again.";

export function newWebhookSecret(): string {
  return randomBytes(24).toString("hex");
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Runs `fn` in a transaction holding this owner's server lock, so two
 * edits can't both pick a default (or both remove the last one) at once. */
async function withServerLock<T>(ownerId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`arr-servers:${ownerId}`}))`);
    return fn(tx);
  });
}

/** Makes sure every kind + 4K-ness that has servers has exactly one
 * default: where there's none (the default was removed or moved), the
 * oldest server there takes over. */
async function ensureDefaults(tx: Tx, ownerId: string): Promise<void> {
  const rows = await tx
    .select({ id: arrServers.id, kind: arrServers.kind, is4k: arrServers.is4k, isDefault: arrServers.isDefault, createdAt: arrServers.createdAt })
    .from(arrServers)
    .where(eq(arrServers.userId, ownerId));
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.kind}:${row.is4k}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  for (const group of groups.values()) {
    if (group.some((r) => r.isDefault)) continue;
    const oldest = [...group].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
    await tx.update(arrServers).set({ isDefault: true }).where(eq(arrServers.id, oldest.id));
  }
}

async function clearOtherDefaults(tx: Tx, ownerId: string, kind: ArrProvider, fourK: boolean, exceptId: string | null) {
  const conditions = [
    eq(arrServers.userId, ownerId),
    eq(arrServers.kind, kind),
    eq(arrServers.is4k, fourK),
    eq(arrServers.isDefault, true),
  ];
  if (exceptId) conditions.push(ne(arrServers.id, exceptId));
  await tx.update(arrServers).set({ isDefault: false }).where(and(...conditions));
}

export type ArrConnectionCheck = ArrPickerOptions & { version: string | null };

async function checkConnection(
  kind: ArrProvider,
  baseUrl: string,
  apiKey: string,
): Promise<CoreResult<ArrConnectionCheck>> {
  if (!baseUrl || !apiKey) return fail("invalid", "URL and API key are required.");
  const client = kind === "sonarr" ? sonarr : radarr;
  let version: string | null = null;
  try {
    const status = await client.testConnection({ baseUrl, apiKey });
    version = typeof status?.version === "string" ? status.version : null;
  } catch {
    return fail("upstream", CONNECT_FAILED);
  }
  try {
    const options = await fetchPickerOptions({ kind, baseUrl, apiKey });
    return { ok: true, version, ...options };
  } catch {
    return fail("upstream", CONNECT_FAILED);
  }
}

/** "Test": checks a connection without saving anything. With `serverId`
 * and no `apiKey`, uses that server's saved key — but only against its
 * saved URL, so a saved key is never sent anywhere new. */
export async function testArrServerConnection(
  ownerId: string,
  input: { kind?: unknown; serverId?: unknown; baseUrl?: string; apiKey?: string },
): Promise<CoreResult<ArrConnectionCheck>> {
  if (typeof input.serverId === "string" && input.serverId) {
    const server = await getArrServer(ownerId, input.serverId);
    if (!server) return fail("not_found", SERVER_NOT_FOUND);
    const baseUrl = input.baseUrl || server.baseUrl;
    const apiKey = input.apiKey || (baseUrl === server.baseUrl ? server.apiKey : "");
    if (!input.apiKey && baseUrl !== server.baseUrl) return fail("invalid", URL_NEEDS_KEY);
    return checkConnection(server.kind, baseUrl, apiKey);
  }
  const kind = input.kind === "sonarr" || input.kind === "radarr" ? input.kind : null;
  if (!kind) return fail("invalid", '"kind" must be sonarr or radarr.');
  return checkConnection(kind, input.baseUrl ?? "", input.apiKey ?? "");
}

function revalidateServers() {
  revalidatePath("/settings/integrations");
  revalidatePath("/discover");
}

/** Re-reads the library of a kind after its standard servers changed, in
 * the background: a server added, removed, or moved in or out of 4K. */
function resyncInBackground(ownerId: string, kind: ArrProvider) {
  resyncArrLibrary(ownerId, kind).catch((err) => {
    console.error(`[arr-servers] ${kind} resync failed for user ${ownerId}:`, err);
  });
}

/** "Add server": tests the connection, then saves it. Quality profile and
 * root folder default to the server's first when not given. */
export async function createArrServer(
  ownerId: string,
  kind: ArrProvider,
  input: ArrServerInput,
): Promise<CoreResult<{ server: ArrServer }>> {
  const baseUrl = input.baseUrl ?? "";
  const apiKey = input.apiKey ?? "";
  const check = await checkConnection(kind, baseUrl, apiKey);
  if (!check.ok) return check;

  const sonarrServer = kind === "sonarr";
  const fourK = input.is4k ?? false;
  const encrypted = encryptSecret(apiKey);

  const id = await withServerLock(ownerId, async (tx) => {
    const existing = await tx
      .select({ name: arrServers.name, kind: arrServers.kind, is4k: arrServers.is4k })
      .from(arrServers)
      .where(eq(arrServers.userId, ownerId));
    const name = input.name || defaultServerName(kind, fourK, existing.map((s) => s.name));
    const firstOfItsKind = !existing.some((s) => s.kind === kind && s.is4k === fourK);
    const makeDefault = firstOfItsKind || input.isDefault === true;
    if (makeDefault) await clearOtherDefaults(tx, ownerId, kind, fourK, null);

    const [row] = await tx
      .insert(arrServers)
      .values({
        userId: ownerId,
        kind,
        name,
        baseUrl,
        apiKeyEnc: encrypted.ciphertext,
        apiKeyIv: encrypted.iv,
        apiKeyTag: encrypted.tag,
        is4k: fourK,
        isDefault: makeDefault,
        qualityProfileId:
          input.qualityProfileId === undefined ? (check.qualityProfiles[0]?.id ?? null) : input.qualityProfileId,
        rootFolderPath:
          input.rootFolderPath === undefined ? (check.rootFolders[0]?.path ?? null) : input.rootFolderPath,
        tags: input.tags ?? [],
        seriesType: sonarrServer ? (input.seriesType ?? "standard") : null,
        seasonFolders: sonarrServer ? (input.seasonFolders ?? true) : null,
        animeQualityProfileId: sonarrServer ? (input.animeQualityProfileId ?? null) : null,
        animeRootFolderPath: sonarrServer ? (input.animeRootFolderPath ?? null) : null,
        animeTags: sonarrServer ? (input.animeTags ?? []) : [],
        webhookSecret: newWebhookSecret(),
      })
      .returning({ id: arrServers.id });
    return row.id;
  });

  if (!fourK) resyncInBackground(ownerId, kind);
  revalidateServers();
  const server = await getArrServer(ownerId, id);
  if (!server) return fail("internal", SERVER_NOT_FOUND);
  return { ok: true, server };
}

/** "Save" on an edited server. Omitted fields stay as they are; a blank
 * API key keeps the saved one. A new URL or key is tested first. */
export async function updateArrServer(
  ownerId: string,
  serverId: string,
  input: ArrServerInput,
): Promise<CoreResult<{ server: ArrServer }>> {
  const current = await getArrServer(ownerId, serverId);
  if (!current) return fail("not_found", SERVER_NOT_FOUND);

  const baseUrl = input.baseUrl || current.baseUrl;
  const urlChanged = baseUrl !== current.baseUrl;
  if (urlChanged && !input.apiKey) return fail("invalid", URL_NEEDS_KEY);
  const apiKey = input.apiKey || current.apiKey;
  if (urlChanged || input.apiKey) {
    const check = await checkConnection(current.kind, baseUrl, apiKey);
    if (!check.ok) return check;
  }
  if (input.name !== undefined && !input.name) return fail("invalid", "Give the server a name.");

  const sonarrServer = current.kind === "sonarr";
  const fourK = input.is4k ?? current.is4k;
  const movedGroup = fourK !== current.is4k;
  if (!movedGroup && current.isDefault && input.isDefault === false) {
    return fail("conflict", "Make another server the default instead.");
  }

  const encrypted = input.apiKey ? encryptSecret(input.apiKey) : null;
  await withServerLock(ownerId, async (tx) => {
    const isDefault = input.isDefault === true ? true : movedGroup ? false : current.isDefault;
    if (input.isDefault === true) await clearOtherDefaults(tx, ownerId, current.kind, fourK, serverId);
    await tx
      .update(arrServers)
      .set({
        name: input.name ?? current.name,
        baseUrl,
        ...(encrypted ? { apiKeyEnc: encrypted.ciphertext, apiKeyIv: encrypted.iv, apiKeyTag: encrypted.tag } : {}),
        is4k: fourK,
        isDefault,
        ...(input.qualityProfileId !== undefined ? { qualityProfileId: input.qualityProfileId } : {}),
        ...(input.rootFolderPath !== undefined ? { rootFolderPath: input.rootFolderPath } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
        ...(sonarrServer && input.seriesType !== undefined ? { seriesType: input.seriesType } : {}),
        ...(sonarrServer && input.seasonFolders !== undefined ? { seasonFolders: input.seasonFolders } : {}),
        ...(sonarrServer && input.animeQualityProfileId !== undefined
          ? { animeQualityProfileId: input.animeQualityProfileId }
          : {}),
        ...(sonarrServer && input.animeRootFolderPath !== undefined
          ? { animeRootFolderPath: input.animeRootFolderPath }
          : {}),
        ...(sonarrServer && input.animeTags !== undefined ? { animeTags: input.animeTags } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(arrServers.userId, ownerId), eq(arrServers.id, serverId)));
    await ensureDefaults(tx, ownerId);
  });

  // In or out of the library, or pointed at another server: read it again.
  if (movedGroup || urlChanged || input.apiKey) resyncInBackground(ownerId, current.kind);
  revalidateServers();
  const server = await getArrServer(ownerId, serverId);
  if (!server) return fail("not_found", SERVER_NOT_FOUND);
  return { ok: true, server };
}

/** "Remove". Its titles stop counting once the library re-syncs, which
 * starts right away; with no standard server of that kind left, its cached
 * statuses go at once (as disconnecting did before). */
export async function deleteArrServer(ownerId: string, serverId: string): Promise<CoreResult> {
  const current = await getArrServer(ownerId, serverId);
  if (!current) return fail("not_found", SERVER_NOT_FOUND);

  await withServerLock(ownerId, async (tx) => {
    await tx.delete(arrServers).where(and(eq(arrServers.userId, ownerId), eq(arrServers.id, serverId)));
    await ensureDefaults(tx, ownerId);
  });

  if (!current.is4k) {
    const remaining = await listArrServers(ownerId, { kind: current.kind, fourK: false });
    if (remaining.length === 0) {
      // A sync still running would write rows back after the delete below;
      // with no server left it stops at its next check, so wait for that.
      await waitForArrSync(ownerId, current.kind);
      await db
        .delete(arrStatusCache)
        .where(and(eq(arrStatusCache.userId, ownerId), eq(arrStatusCache.provider, current.kind)));
    } else {
      resyncInBackground(ownerId, current.kind);
    }
  }
  revalidateServers();
  return { ok: true };
}

export async function regenerateArrServerSecret(
  ownerId: string,
  serverId: string,
): Promise<CoreResult<{ server: ArrServer }>> {
  const [row] = await db
    .update(arrServers)
    .set({ webhookSecret: newWebhookSecret(), updatedAt: new Date() })
    .where(and(eq(arrServers.userId, ownerId), eq(arrServers.id, serverId)))
    .returning();
  if (!row) return fail("not_found", SERVER_NOT_FOUND);
  revalidateServers();
  return { ok: true, server: toArrServer(row) };
}

/** A saved server's pickers (Settings' dropdowns). */
export async function getArrServerOptions(
  ownerId: string,
  serverId: string,
): Promise<CoreResult<ArrPickerOptions>> {
  const server = await getArrServer(ownerId, serverId);
  if (!server) return fail("not_found", SERVER_NOT_FOUND);
  try {
    return { ok: true, ...(await fetchPickerOptions(server)) };
  } catch {
    return fail("upstream", `Couldn't reach ${server.name}. Check its connection in Settings.`);
  }
}

// ---- The older one-server-per-provider settings (0.37's Sonarr, Radarr, 4K
// Sonarr, 4K Radarr cards and /settings/integrations/{provider}), now acting
// on the default server of that kind and 4K-ness.

/** "Test & save" of the old cards: updates the default server's URL and key
 * (or adds one), and resets its profile and folder to the first, as before. */
export async function saveDefaultServerConnection(
  ownerId: string,
  kind: ArrProvider,
  fourK: boolean,
  input: { baseUrl: string; apiKey: string },
): Promise<CoreResult<{ server: ArrServer; check: ArrConnectionCheck }>> {
  const check = await checkConnection(kind, input.baseUrl, input.apiKey);
  if (!check.ok) return check;
  const [current] = await listArrServers(ownerId, { kind, fourK });
  const fields = {
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    qualityProfileId: check.qualityProfiles[0]?.id ?? null,
    rootFolderPath: check.rootFolders[0]?.path ?? null,
  };
  const result = current
    ? await updateArrServer(ownerId, current.id, fields)
    : await createArrServer(ownerId, kind, { ...fields, is4k: fourK, isDefault: true, name: kindName(kind, fourK) });
  if (!result.ok) return result;
  return { ok: true, server: result.server, check };
}

function kindName(kind: ArrProvider, fourK: boolean) {
  return fourK ? `4K ${kindLabel(kind)}` : kindLabel(kind);
}

export async function saveDefaultServerDefaults(
  ownerId: string,
  kind: ArrProvider,
  fourK: boolean,
  input: { qualityProfileId: number; rootFolderPath: string },
): Promise<CoreResult> {
  const [current] = await listArrServers(ownerId, { kind, fourK });
  if (!current) return fail("conflict", `Connect ${kindName(kind, fourK)} in Settings first.`);
  const result = await updateArrServer(ownerId, current.id, input);
  return result.ok ? { ok: true } : result;
}

export async function deleteDefaultServer(ownerId: string, kind: ArrProvider, fourK: boolean): Promise<void> {
  const [current] = await listArrServers(ownerId, { kind, fourK });
  if (current) await deleteArrServer(ownerId, current.id);
}
