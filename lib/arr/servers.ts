import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { arrServers } from "@/lib/db/schema";
import type { ArrProvider, SonarrSeriesType } from "@/lib/db/schema";
import { decryptSecret } from "@/lib/crypto/encryption";
import type { ArrConfig } from "@/lib/radarr/client";

// Every Sonarr and Radarr the admin has connected — any number of each,
// standard or 4K. Titles go to the default server of their kind and 4K-ness
// unless a reviewer picks another under "Advanced" (lib/arr/add-options.ts).
// The standard servers together are the library: a title any of them has
// counts (lib/arr/sync.ts); the 4K ones are read live like before
// (lib/arr/fourk.ts). Mutations live in lib/arr/server-manage.ts.

export type ArrServer = {
  id: string;
  userId: string;
  kind: ArrProvider;
  name: string;
  baseUrl: string;
  /** Decrypted — never leaves the server (see toArrServerDto). */
  apiKey: string;
  is4k: boolean;
  isDefault: boolean;
  qualityProfileId: number | null;
  rootFolderPath: string | null;
  tags: number[];
  seriesType: SonarrSeriesType | null;
  seasonFolders: boolean | null;
  animeQualityProfileId: number | null;
  animeRootFolderPath: string | null;
  animeTags: number[];
  webhookSecret: string;
  createdAt: Date;
};

export type ArrServerRow = typeof arrServers.$inferSelect;

export function toArrServer(row: ArrServerRow): ArrServer {
  return {
    id: row.id,
    userId: row.userId,
    kind: row.kind,
    name: row.name,
    baseUrl: row.baseUrl,
    apiKey: decryptSecret({ ciphertext: row.apiKeyEnc, iv: row.apiKeyIv, tag: row.apiKeyTag }),
    is4k: row.is4k,
    isDefault: row.isDefault,
    qualityProfileId: row.qualityProfileId,
    rootFolderPath: row.rootFolderPath,
    tags: row.tags ?? [],
    seriesType: row.seriesType,
    seasonFolders: row.seasonFolders,
    animeQualityProfileId: row.animeQualityProfileId,
    animeRootFolderPath: row.animeRootFolderPath,
    animeTags: row.animeTags ?? [],
    webhookSecret: row.webhookSecret,
    createdAt: row.createdAt,
  };
}

export function arrConfig(server: Pick<ArrServer, "baseUrl" | "apiKey">): ArrConfig {
  return { baseUrl: server.baseUrl, apiKey: server.apiKey };
}

/** Has what adding a title needs: a quality profile and a root folder. */
export function isServerConfigured(
  server: Pick<ArrServer, "qualityProfileId" | "rootFolderPath"> | null | undefined,
): boolean {
  return Boolean(server?.qualityProfileId && server?.rootFolderPath);
}

/** The order servers are listed and tried in everywhere: Sonarr before
 * Radarr, standard before 4K, the default first, then oldest first. */
export function compareServers(
  a: Pick<ArrServer, "kind" | "is4k" | "isDefault" | "createdAt">,
  b: Pick<ArrServer, "kind" | "is4k" | "isDefault" | "createdAt">,
): number {
  if (a.kind !== b.kind) return a.kind === "sonarr" ? -1 : 1;
  if (a.is4k !== b.is4k) return a.is4k ? 1 : -1;
  if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
  return a.createdAt.getTime() - b.createdAt.getTime();
}

export type ArrServerFilter = { kind?: ArrProvider; fourK?: boolean };

/** The owner's servers (all of them, or one kind / 4K-ness), in
 * compareServers order. */
export async function listArrServers(ownerId: string, filter: ArrServerFilter = {}): Promise<ArrServer[]> {
  const conditions = [eq(arrServers.userId, ownerId)];
  if (filter.kind) conditions.push(eq(arrServers.kind, filter.kind));
  if (filter.fourK !== undefined) conditions.push(eq(arrServers.is4k, filter.fourK));
  const rows = await db
    .select()
    .from(arrServers)
    .where(and(...conditions))
    .orderBy(desc(arrServers.isDefault), asc(arrServers.createdAt));
  return rows.map(toArrServer).sort(compareServers);
}

/** The library's servers of a kind: every standard (non-4K) one. */
export function listLibraryServers(ownerId: string, kind: ArrProvider): Promise<ArrServer[]> {
  return listArrServers(ownerId, { kind, fourK: false });
}

export async function getArrServer(ownerId: string, serverId: string): Promise<ArrServer | null> {
  if (!UUID_PATTERN.test(serverId)) return null;
  const [row] = await db
    .select()
    .from(arrServers)
    .where(and(eq(arrServers.userId, ownerId), eq(arrServers.id, serverId)))
    .limit(1);
  return row ? toArrServer(row) : null;
}

/** Looked up by id alone — for the per-server webhook, which has only its URL. */
export async function getArrServerById(serverId: string): Promise<ArrServer | null> {
  if (!UUID_PATTERN.test(serverId)) return null;
  const [row] = await db.select().from(arrServers).where(eq(arrServers.id, serverId)).limit(1);
  return row ? toArrServer(row) : null;
}

/** Where titles of this kind (and 4K-ness) go when nobody picks: the
 * default server, or — should none be flagged — the oldest one. */
export async function getDefaultArrServer(
  ownerId: string,
  kind: ArrProvider,
  fourK: boolean,
): Promise<ArrServer | null> {
  const servers = await listArrServers(ownerId, { kind, fourK });
  return servers[0] ?? null;
}

export async function hasArrServer(ownerId: string, kind: ArrProvider, fourK?: boolean): Promise<boolean> {
  const conditions = [eq(arrServers.userId, ownerId), eq(arrServers.kind, kind)];
  if (fourK !== undefined) conditions.push(eq(arrServers.is4k, fourK));
  const [row] = await db
    .select({ id: arrServers.id })
    .from(arrServers)
    .where(and(...conditions))
    .limit(1);
  return Boolean(row);
}

/** Every owner with at least one standard server of this kind — whose
 * library the scheduled sync keeps up to date. */
export async function ownersWithLibraryServers(kind: ArrProvider): Promise<string[]> {
  const rows = await db
    .selectDistinct({ userId: arrServers.userId })
    .from(arrServers)
    .where(and(eq(arrServers.kind, kind), eq(arrServers.is4k, false)));
  return rows.map((r) => r.userId);
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function kindLabel(kind: ArrProvider): string {
  return kind === "sonarr" ? "Sonarr" : "Radarr";
}

/** A new server's name when none is given: "Radarr", "4K Sonarr", and
 * "Radarr 2", "Radarr 3"… once that's taken. */
export function defaultServerName(kind: ArrProvider, fourK: boolean, takenNames: readonly string[]): string {
  const base = fourK ? `4K ${kindLabel(kind)}` : kindLabel(kind);
  const taken = new Set(takenNames.map((n) => n.trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/** The per-server webhook URL: /api/webhooks/servers/{id}. */
export function arrServerWebhookUrl(baseUrl: string, server: Pick<ArrServer, "id" | "webhookSecret">): string {
  return `${baseUrl}/api/webhooks/servers/${server.id}?secret=${server.webhookSecret}`;
}

/** What clients see of a server (GET /settings/arr-servers and the
 * website's Settings): everything but the API key. */
export type ArrServerDto = {
  id: string;
  kind: ArrProvider;
  name: string;
  baseUrl: string;
  hasApiKey: true;
  is4k: boolean;
  isDefault: boolean;
  qualityProfileId: number | null;
  rootFolderPath: string | null;
  tags: number[];
  seriesType: SonarrSeriesType | null;
  seasonFolders: boolean | null;
  animeQualityProfileId: number | null;
  animeRootFolderPath: string | null;
  animeTags: number[];
  fullyConfigured: boolean;
  webhookUrl: string;
};

export function toArrServerDto(server: ArrServer, webhookBaseUrl: string): ArrServerDto {
  const sonarr = server.kind === "sonarr";
  return {
    id: server.id,
    kind: server.kind,
    name: server.name,
    baseUrl: server.baseUrl,
    hasApiKey: true,
    is4k: server.is4k,
    isDefault: server.isDefault,
    qualityProfileId: server.qualityProfileId,
    rootFolderPath: server.rootFolderPath,
    tags: server.tags,
    seriesType: sonarr ? (server.seriesType ?? "standard") : null,
    seasonFolders: sonarr ? (server.seasonFolders ?? false) : null,
    animeQualityProfileId: sonarr ? server.animeQualityProfileId : null,
    animeRootFolderPath: sonarr ? server.animeRootFolderPath : null,
    animeTags: sonarr ? server.animeTags : [],
    fullyConfigured: isServerConfigured(server),
    webhookUrl: arrServerWebhookUrl(webhookBaseUrl, server),
  };
}
