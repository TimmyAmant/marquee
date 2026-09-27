import { getStoredDiscoverLocale, setStoredDiscoverLocale } from "@/lib/integrations/app-settings";
import { failT } from "@/lib/core-failure";
import type { CoreResult } from "@/lib/core-result";
import {
  ANY_LANGUAGE,
  DISCOVER_LANGUAGES,
  STREAMING_REGIONS,
  parseLanguageInput,
  parseRegionInput,
  resolveDiscoverLocale,
  serverLocaleTag,
} from "@/lib/discover/locale";
import { revalidatePath } from "next/cache";

/** Settings › Discover › Region & language, as the API and the settings
 * page see it: what's stored (null: the default) and what that comes to. */
export type DiscoverLocaleSettings = {
  /** ISO 3166-1 country for "Currently streaming on" and release dates;
   * null follows the server's own locale, else US. */
  streamingRegion: string | null;
  /** The region Popular/Upcoming are for; null for TMDb's worldwide answer. */
  discoverRegion: string | null;
  /** The original language Popular/Upcoming and the Movies/Series grids
   * are limited to; null is English (as always), "any" no limit. */
  discoverLanguage: string | null;
  /** What those come to in practice. */
  effective: { streamingRegion: string; discoverRegion: string | null; discoverLanguage: string | null };
  /** What may be chosen. */
  regions: readonly string[];
  languages: readonly string[];
};

export async function getDiscoverLocaleSettings(): Promise<DiscoverLocaleSettings> {
  const stored = await getStoredDiscoverLocale();
  return {
    ...stored,
    effective: resolveDiscoverLocale(stored, serverLocaleTag()),
    regions: STREAMING_REGIONS,
    languages: [ANY_LANGUAGE, ...DISCOVER_LANGUAGES],
  };
}

/** Only the fields sent change. `""`/null clears one back to its default. */
export async function saveDiscoverLocaleSettings(body: Record<string, unknown>): Promise<CoreResult<{ settings: DiscoverLocaleSettings }>> {
  const patch: { streamingRegion?: string | null; discoverRegion?: string | null; discoverLanguage?: string | null } = {};
  for (const key of ["streamingRegion", "discoverRegion"] as const) {
    if (!(key in body)) continue;
    const parsed = parseRegionInput(body[key]);
    if (!parsed.ok) return await failT("invalid", "server.regionInvalid", { field: key });
    patch[key] = parsed.value;
  }
  if ("discoverLanguage" in body) {
    const parsed = parseLanguageInput(body.discoverLanguage);
    if (!parsed.ok) return await failT("invalid", "server.discoverLanguageInvalid");
    patch.discoverLanguage = parsed.value;
  }
  if (Object.keys(patch).length === 0) return await failT("invalid", "server.nothingToChange");
  await setStoredDiscoverLocale(patch);
  revalidatePath("/discover");
  revalidatePath("/movies");
  revalidatePath("/series");
  return { ok: true, settings: await getDiscoverLocaleSettings() };
}
