import type { ArrProvider, MediaType, SonarrSeriesType } from "@/lib/db/schema";
import { sonarrSeriesTypeValues } from "@/lib/db/schema";
import type { ArrServer } from "@/lib/arr/servers";

// Where a title goes and how it's added — the server's defaults (its anime
// ones for an anime show), or what a reviewer picked under "Advanced" when
// approving a request or adding a title. Pure: the database and network
// side is in lib/arr/add-options-server.ts.

export type AddOverrides = {
  serverId?: string;
  qualityProfileId?: number;
  rootFolderPath?: string;
  tags?: number[];
  seriesType?: SonarrSeriesType;
};

export type AddDefaults = {
  qualityProfileId: number | null;
  rootFolderPath: string | null;
  tags: number[];
  /** Sonarr only; null for Radarr. */
  seriesType: SonarrSeriesType | null;
};

export function kindForMediaType(mediaType: MediaType): ArrProvider {
  return mediaType === "movie" ? "radarr" : "sonarr";
}

/** What a server adds a title with when nobody changes anything: its own
 * settings, or for an anime show on a Sonarr its anime profile, folder and
 * tags where it has them, and the "anime" series type. */
export function serverDefaults(
  server: Pick<
    ArrServer,
    | "kind"
    | "qualityProfileId"
    | "rootFolderPath"
    | "tags"
    | "seriesType"
    | "animeQualityProfileId"
    | "animeRootFolderPath"
    | "animeTags"
  >,
  anime: boolean,
): AddDefaults {
  if (server.kind === "radarr") {
    return {
      qualityProfileId: server.qualityProfileId,
      rootFolderPath: server.rootFolderPath,
      tags: [...server.tags],
      seriesType: null,
    };
  }
  if (anime) {
    return {
      qualityProfileId: server.animeQualityProfileId ?? server.qualityProfileId,
      rootFolderPath: server.animeRootFolderPath ?? server.rootFolderPath,
      tags: [...(server.animeTags.length > 0 ? server.animeTags : server.tags)],
      seriesType: "anime",
    };
  }
  return {
    qualityProfileId: server.qualityProfileId,
    rootFolderPath: server.rootFolderPath,
    tags: [...server.tags],
    seriesType: server.seriesType ?? "standard",
  };
}

/** The server's defaults with the reviewer's picks laid over them. */
export function resolveAdd(
  server: Parameters<typeof serverDefaults>[0],
  anime: boolean,
  overrides: AddOverrides = {},
): AddDefaults {
  const defaults = serverDefaults(server, anime);
  return {
    qualityProfileId: overrides.qualityProfileId ?? defaults.qualityProfileId,
    rootFolderPath: overrides.rootFolderPath ?? defaults.rootFolderPath,
    tags: overrides.tags ? [...new Set(overrides.tags)] : defaults.tags,
    seriesType: server.kind === "sonarr" ? (overrides.seriesType ?? defaults.seriesType) : null,
  };
}

export function hasOverrides(overrides: AddOverrides | null | undefined): boolean {
  return Boolean(
    overrides &&
      (overrides.serverId !== undefined ||
        overrides.qualityProfileId !== undefined ||
        overrides.rootFolderPath !== undefined ||
        overrides.tags !== undefined ||
        overrides.seriesType !== undefined),
  );
}

export type ParsedOverrides = { ok: true; overrides: AddOverrides } | { ok: false; error: string };

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/** The overrides in an /api/v1 JSON body (approve, add). Absent or null
 * fields are "use the default"; anything else must be the right type. */
export function parseAddOverrides(body: Record<string, unknown>, mediaType: MediaType): ParsedOverrides {
  const overrides: AddOverrides = {};

  const serverId = body.serverId;
  if (serverId !== undefined && serverId !== null) {
    if (typeof serverId !== "string") return { ok: false, error: '"serverId" must be a string.' };
    if (serverId.trim()) overrides.serverId = serverId.trim();
  }

  const qualityProfileId = body.qualityProfileId;
  if (qualityProfileId !== undefined && qualityProfileId !== null) {
    if (!isPositiveInt(qualityProfileId)) return { ok: false, error: '"qualityProfileId" must be a number.' };
    overrides.qualityProfileId = qualityProfileId;
  }

  const rootFolderPath = body.rootFolderPath;
  if (rootFolderPath !== undefined && rootFolderPath !== null) {
    if (typeof rootFolderPath !== "string") return { ok: false, error: '"rootFolderPath" must be a string.' };
    if (rootFolderPath.trim()) overrides.rootFolderPath = rootFolderPath.trim();
  }

  const tags = body.tags;
  if (tags !== undefined && tags !== null) {
    if (!Array.isArray(tags) || !tags.every(isPositiveInt)) {
      return { ok: false, error: '"tags" must be a list of numbers.' };
    }
    overrides.tags = [...new Set(tags as number[])];
  }

  const seriesType = body.seriesType;
  if (seriesType !== undefined && seriesType !== null && mediaType === "tv") {
    if (typeof seriesType !== "string" || !(sonarrSeriesTypeValues as readonly string[]).includes(seriesType)) {
      return { ok: false, error: '"seriesType" must be standard, daily or anime.' };
    }
    overrides.seriesType = seriesType as SonarrSeriesType;
  }

  return { ok: true, overrides };
}

/** The same from the website's Advanced fields (form data: strings, tags
 * repeated). An empty field is "use the default". */
export function parseAddOverridesForm(formData: FormData, mediaType: MediaType): ParsedOverrides {
  // Only a form whose Advanced section was opened sends these at all.
  if (formData.get("advanced") !== "1") return { ok: true, overrides: {} };
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  };
  const number = (key: string) => {
    const value = text(key);
    return value === undefined ? undefined : Number(value);
  };
  return parseAddOverrides(
    {
      serverId: text("serverId"),
      qualityProfileId: number("qualityProfileId"),
      rootFolderPath: text("rootFolderPath"),
      tags: formData.getAll("tags").map((t) => Number(t)),
      seriesType: text("seriesType"),
    },
    mediaType,
  );
}
