import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { requireTmdbConfigured } from "@/lib/api/guards";
import { ApiError } from "@/lib/api/errors";
import { parseIdSegment } from "@/lib/api/request";
import { statusKey, titleCard } from "@/lib/api/mappers";
import { loadPersonPage } from "@/lib/pages/entities";
import type { PersonDetail } from "@/lib/api/types";

/** A person's page: bio plus acting filmography (newest first by release
 * date, as stored), each with status, favorite and quick-add eligibility. */
export const GET = withApi<{ id: string }>(async (request, params): Promise<PersonDetail> => {
  const ctx = await requireApiUser(request);
  const tmdbId = parseIdSegment(params.id, "TMDb person id");
  await requireTmdbConfigured();

  const data = await loadPersonPage(await ctx.viewer(), tmdbId);
  if (!data) throw ApiError.of("not_found", "No such person on TMDb.");

  const { person } = data;
  return {
    tmdbId,
    name: person.name,
    alsoKnownAs: person.alsoKnownAs ?? [],
    biography: person.biography,
    birthday: person.birthday,
    deathday: person.deathday,
    placeOfBirth: person.placeOfBirth,
    profilePath: person.profilePath,
    favorited: data.favorited,
    credits: data.entries.map((entry) =>
      titleCard(entry, {
        subtitle: entry.subtitle ?? null,
        status: entry.status ?? null,
        favorited: data.favoritedKeys.has(statusKey(entry.mediaType, entry.tmdbId)),
        canQuickAdd: !entry.status && data.arrConfigured[entry.mediaType],
      }),
    ),
  };
});
