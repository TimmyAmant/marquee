import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { requireTmdbConfigured } from "@/lib/api/guards";
import { ApiError, msg } from "@/lib/api/errors";
import { parseIdSegment } from "@/lib/api/request";
import { statusKey, titleCard } from "@/lib/api/mappers";
import { posterActions } from "@/lib/api/poster-actions";
import { loadPosterActionRules } from "@/lib/api/poster-action-rules";
import { loadPersonPage } from "@/lib/pages/entities";
import type { PersonDetail } from "@/lib/api/types";

/** A person's page: bio plus acting filmography (newest first by release
 * date, as stored), each with status, favorite and the viewer's quick
 * action (lib/api/poster-actions.ts). */
export const GET = withApi<{ id: string }>(async (request, params): Promise<PersonDetail> => {
  const ctx = await requireApiUser(request);
  const tmdbId = parseIdSegment(params.id, "TMDb person id");
  await requireTmdbConfigured();

  const data = await loadPersonPage(await ctx.viewer(), tmdbId);
  if (!data) throw ApiError.of("not_found", msg("server.noSuchPerson"));
  const rules = await loadPosterActionRules(ctx.user, data.entries, data.arrConfigured);

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
        ...posterActions(rules, entry.mediaType, entry.tmdbId, entry.status),
      }),
    ),
  };
});
