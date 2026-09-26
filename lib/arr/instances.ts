import type { ArrInstance, ArrProvider, MediaType } from "@/lib/db/schema";

// The four fixed Sonarr/Radarr "instances" of 0.37 — sonarr, radarr,
// sonarr4k, radarr4k — that the older settings endpoints, webhook URLs and
// callers still name. Since any number of servers exist (lib/arr/servers.ts)
// each one means the default server of that kind and 4K-ness. Pure.

/** The kind of service an instance is (which API it speaks). */
export function arrKindOf(instance: ArrInstance): ArrProvider {
  return instance === "sonarr" || instance === "sonarr4k" ? "sonarr" : "radarr";
}

export function isFourK(instance: ArrInstance): boolean {
  return instance === "sonarr4k" || instance === "radarr4k";
}

/** The instance a title of this type goes to. */
export function arrInstanceFor(mediaType: MediaType, fourK: boolean): ArrInstance {
  if (mediaType === "movie") return fourK ? "radarr4k" : "radarr";
  return fourK ? "sonarr4k" : "sonarr";
}

/** "Sonarr", "4K Radarr". */
export function arrInstanceLabel(instance: ArrInstance): string {
  const name = arrKindOf(instance) === "sonarr" ? "Sonarr" : "Radarr";
  return isFourK(instance) ? `4K ${name}` : name;
}
