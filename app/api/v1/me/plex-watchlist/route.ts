import { withApi } from "@/lib/api/handler";
import { requireApiUser } from "@/lib/api/auth";
import { invalid, optionalBoolean, readJsonBody } from "@/lib/api/request";
import { plexWatchlistDto } from "@/lib/api/routes/plex-watchlist";
import { disableWatchlist, setWatchlistTypes } from "@/lib/plex/watchlist";
import type { PlexWatchlist } from "@/lib/api/types";

/** The signed-in account's "request what's on my Plex Watchlist" state. */
export const GET = withApi(async (request): Promise<PlexWatchlist> => {
  const ctx = await requireApiUser(request);
  return plexWatchlistDto(ctx.user.id);
});

/** Body `{ movies?, tv? }`: which kinds of titles to request. */
export const PATCH = withApi(async (request): Promise<PlexWatchlist> => {
  const ctx = await requireApiUser(request);
  const body = await readJsonBody(request);
  const movies = optionalBoolean(body, "movies");
  const tv = optionalBoolean(body, "tv");
  if (movies === undefined && tv === undefined) throw invalid('Send "movies" and/or "tv".');
  await setWatchlistTypes(ctx.user.id, { movies, tv });
  return plexWatchlistDto(ctx.user.id);
});

/** Turns it off and forgets the Plex token it used. */
export const DELETE = withApi(async (request): Promise<PlexWatchlist> => {
  const ctx = await requireApiUser(request);
  await disableWatchlist(ctx.user.id);
  return plexWatchlistDto(ctx.user.id);
});
