import { sonarrSeriesTypeValues, type ArrProvider, type SonarrSeriesType } from "@/lib/db/schema";

// Validates what Settings sends for a Sonarr/Radarr server — the website's
// form and POST/PATCH /api/v1/settings/arr-servers alike. Pure. Every field
// is optional here: absent means "unchanged" on an edit and "the default"
// on a new server; the manage functions decide which are required.

export const SERVER_NAME_MAX_LENGTH = 60;

export type ArrServerInput = {
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  is4k?: boolean;
  isDefault?: boolean;
  qualityProfileId?: number | null;
  rootFolderPath?: string | null;
  tags?: number[];
  seriesType?: SonarrSeriesType;
  seasonFolders?: boolean;
  animeQualityProfileId?: number | null;
  animeRootFolderPath?: string | null;
  animeTags?: number[];
};

export type ParsedServerInput = { ok: true; input: ArrServerInput } | { ok: false; error: string };

export function parseArrKind(value: unknown): ArrProvider | null {
  return value === "sonarr" || value === "radarr" ? value : null;
}

/** Trailing slashes off, surrounding space off. */
export function normalizeServerUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function parseArrServerInput(body: Record<string, unknown>): ParsedServerInput {
  const input: ArrServerInput = {};

  for (const key of ["name", "baseUrl", "apiKey"] as const) {
    const value = body[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string") return { ok: false, error: `"${key}" must be a string.` };
    input[key] = key === "baseUrl" ? normalizeServerUrl(value) : value.trim();
  }
  if (input.name !== undefined && input.name.length > SERVER_NAME_MAX_LENGTH) {
    return { ok: false, error: `Name can be at most ${SERVER_NAME_MAX_LENGTH} characters.` };
  }
  if (input.baseUrl && !/^https?:\/\/[^\s/]+/i.test(input.baseUrl)) {
    return { ok: false, error: "Enter the server's full URL, starting with http:// or https://." };
  }

  for (const key of ["is4k", "isDefault", "seasonFolders"] as const) {
    const value = body[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== "boolean") return { ok: false, error: `"${key}" must be true or false.` };
    input[key] = value;
  }

  for (const key of ["qualityProfileId", "animeQualityProfileId"] as const) {
    const value = body[key];
    if (value === undefined) continue;
    if (value === null) {
      input[key] = null;
      continue;
    }
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
      return { ok: false, error: `"${key}" must be a number.` };
    }
    input[key] = value;
  }

  for (const key of ["rootFolderPath", "animeRootFolderPath"] as const) {
    const value = body[key];
    if (value === undefined) continue;
    if (value === null) {
      input[key] = null;
      continue;
    }
    if (typeof value !== "string") return { ok: false, error: `"${key}" must be a string.` };
    input[key] = value.trim() || null;
  }

  for (const key of ["tags", "animeTags"] as const) {
    const value = body[key];
    if (value === undefined || value === null) continue;
    if (
      !Array.isArray(value) ||
      !value.every((t) => typeof t === "number" && Number.isSafeInteger(t) && t > 0)
    ) {
      return { ok: false, error: `"${key}" must be a list of numbers.` };
    }
    input[key] = [...new Set(value as number[])].sort((a, b) => a - b);
  }

  const seriesType = body.seriesType;
  if (seriesType !== undefined && seriesType !== null) {
    if (typeof seriesType !== "string" || !(sonarrSeriesTypeValues as readonly string[]).includes(seriesType)) {
      return { ok: false, error: '"seriesType" must be standard, daily or anime.' };
    }
    input.seriesType = seriesType as SonarrSeriesType;
  }

  return { ok: true, input };
}
