import { getArrCredential } from "@/lib/integrations/credentials";
import * as radarr from "@/lib/radarr/client";
import * as sonarr from "@/lib/sonarr/client";

export type DiskSpaceInfo = { path: string; freeSpace: number };

/** Free space remaining on each unique root folder across connected
 * Radarr/Sonarr instances. The same disk can back both a movies and a TV
 * root folder, so dedupe by path rather than summing every root folder
 * from every provider — that would double-count shared disks. */
export async function getDiskSpaceSummary(userId: string): Promise<DiskSpaceInfo[]> {
  const [radarrCred, sonarrCred] = await Promise.all([
    getArrCredential(userId, "radarr"),
    getArrCredential(userId, "sonarr"),
  ]);

  const byPath = new Map<string, number>();

  if (radarrCred) {
    const folders = await radarr
      .getRootFolders({ baseUrl: radarrCred.baseUrl, apiKey: radarrCred.apiKey })
      .catch(() => []);
    for (const folder of folders) {
      if (typeof folder.freeSpace === "number") byPath.set(folder.path, folder.freeSpace);
    }
  }

  if (sonarrCred) {
    const folders = await sonarr
      .getRootFolders({ baseUrl: sonarrCred.baseUrl, apiKey: sonarrCred.apiKey })
      .catch(() => []);
    for (const folder of folders) {
      if (typeof folder.freeSpace === "number") byPath.set(folder.path, folder.freeSpace);
    }
  }

  return [...byPath.entries()].map(([path, freeSpace]) => ({ path, freeSpace }));
}
