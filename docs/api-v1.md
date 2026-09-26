# Marquee API v1 — full reference

The JSON API native clients (Marquee for Mac) use as their only backend. Every
piece of data a website page shows and every action it offers is reachable
here, with the same permission rules. Available from server version **0.22.0**.

This document extends the fixed core contract (`MarqueeMac/Docs/API_V1_CORE.md`).
Everything in the core contract holds; the section below lists the few places
where the real server needed something the core contract didn't spell out.

---

## ⚠️ Deviations from / additions to the core contract

1. **Image paths are not always TMDb-relative.** `posterPath`, `backdropPath`,
   `profilePath`, `logoPath` and `stillPath` are normally TMDb paths
   (`"/abc.jpg"`), but a poster or backdrop can be a **full `https://` URL**
   (a TheTVDB artwork fallback the server stores when TMDb has no image). Rule
   for clients: if the value starts with `http://` or `https://`, use it
   as-is; otherwise build `https://image.tmdb.org/t/p/<size><path>`. (Same
   rule as the website's `tmdbImageUrl`.)
2. **`deviceName` is optional** on login and setup. Missing/blank becomes
   `"Unnamed device"`; longer than 100 characters is truncated.
3. **Setup can return `429 rate_limited`.** The web `/setup` action allows 5
   attempts per hour per client IP (first `X-Forwarded-For` hop, else
   "unknown"); `POST /auth/setup` shares that bucket.
4. **Token expiry granularity.** `expires_at` slides forward at most once per
   hour, so a token expires 90 days after its last *recorded* use (up to one
   hour earlier than 90 days after the literal last request). The `expiresAt`
   returned at login/setup is 90 days from issue. An expired token is deleted
   the first time it is presented.
5. **Password changes revoke the caller's own token too.** `PATCH /users/{id}`
   with a `password` deletes every token of that account — including the
   calling device's when you change your own password. Sign in again.
6. **Not every list is paginated.** Only the Movies/Series grids use the
   `{page, totalPages, totalResults, results}` shape. Lists the website shows
   whole are returned whole as `{"results": [...]}`. For the grids, a "page"
   is a batch of several TMDb pages (see `GET /movies`), so page sizes vary
   and `totalResults` is TMDb's count before de-duplication and hide-owned
   filtering.
7. **TMDb not configured is reported as `502 upstream`.** The website renders
   TMDb-backed pages as empty shelves when no TMDb credential exists. The API
   instead answers every TMDb-backed endpoint with
   `502 {"code":"upstream","error":"TMDb isn't configured on this server. An admin needs to add a TMDb access token in Settings → Integrations."}`.
8. **`X-Marquee-API: 1` on everything under `/api/v1`**, including responses
   Next.js generates itself (`405 Method Not Allowed`, automatic `OPTIONS`).
   Those two have empty bodies rather than the `{error, code}` shape. Unknown
   `/api/v1/...` paths return a normal `404 not_found` JSON error.
9. **Season requests (additive).** `POST /titles/tv/{id}/request` takes an
   optional `{"seasons": [1, 2]}`; the request DTOs carry `seasons` and
   `seasonsLabel`; the title detail's `viewer` has `canRequestSeasons` and
   `requestedSeasons`, and each `seasons[]` entry has `monitored`,
   `requested` and `requestable`. A client that sends no `seasons` gets the
   whole-series request it always did, and a server older than this simply
   leaves the new fields out — treat missing as null/false and keep the
   whole-series Request button.
10. **Sign in with Plex / Jellyfin, linked accounts, import (additive).**
    `GET /server-info` has `signIn`; new public `POST /auth/plex/start`,
    `POST /auth/plex/poll` and `POST /auth/jellyfin` answer like
    `POST /auth/login`; `/me` and `HouseholdMember` carry `linked` and
    `hasPassword`; `/me/links/*`, `/users/import/{provider}` and
    `/settings/sign-in` are new. A server older than this has no `signIn` in
    `server-info` — offer password sign-in only. Accounts made through Plex
    or Jellyfin may have no password (`hasPassword: false`): they set their
    first one without `currentPassword`. New error code `410 expired` (a
    Plex poll whose handle is used, unknown or past its 10 minutes).

---

## Conventions (recap)

- Base: `{server}/api/v1`. JSON bodies, `Content-Type: application/json`, camelCase keys.
- Auth: `Authorization: Bearer mqt_<43 base64url chars>` on everything except
  `server-info`, `auth/login`, `auth/setup`, `auth/plex/start`,
  `auth/plex/poll` and `auth/jellyfin`.
- Timestamps: ISO-8601 UTC with milliseconds. Calendar dates: `"YYYY-MM-DD"`.
  `year` fields are 4-character strings (`"1999"`) or `null`.
- Nullable fields are always present.
- Every response: `X-Marquee-API: 1`, `Cache-Control: no-store`.
- Action endpoints that take no parameters accept an empty body or `{}`.

### Errors

Non-2xx responses are `{"error": "<message safe to show>", "code": "<code>"}`.

| Status | code | When |
|---|---|---|
| 400 | `invalid` | Bad input — the message is the website's own validation text |
| 401 | `unauthorized` | Missing / malformed / unknown / expired / revoked token → return to sign-in |
| 401 | `invalid_credentials` | Wrong username or password at login |
| 403 | `forbidden` | Admin-only endpoint called by a member, or an action the caller may not take |
| 404 | `not_found` | Unknown id, bad path segment (non-numeric id, unknown media type), unknown endpoint |
| 409 | `conflict` | State conflict: already requested, already reviewed, integration not connected / not fully configured, not tracked in Sonarr/Radarr |
| 409 | `setup_complete` | `auth/setup` once an account exists |
| 410 | `expired` | Plex sign-in/link poll with a handle that's used, unknown or older than 10 minutes — start again |
| 429 | `rate_limited` | Login, setup, Plex/Jellyfin sign-in rate limit |
| 500 | `internal` | Server bug; details are only in the server log |
| 502 | `upstream` | A connected service (TMDb, Sonarr, Radarr, Plex, Jellyfin, Trakt…) failed, timed out, or TMDb isn't configured |

Business-rule messages are exactly the website's strings, so they match the
**Error reference** (`GET /help/errors`). One is significant for control flow:
approving a TV request can fail with `409` and the message
**`Couldn't resolve this show for Sonarr.`** — the website then offers
"Manually approve" (`POST /requests/{id}/manual-approve`) and an "Add manually
in Sonarr" link built as `{sonarrUrl}/add/new?term={url-encoded title}`.

### Auth levels

- **public** — no token.
- **user** — any signed-in account (admin or member).
- **admin** — `403 forbidden` for members.

Members see the household library through the admin: every library status is
computed against `libraryOwnerId` (from `/me`), exactly like the website.

### Shared shapes

#### `TitleCard` (a poster card)

```json
{
  "mediaType": "movie",
  "tmdbId": 603,
  "name": "The Matrix",
  "posterPath": "/aOIuZAjPaRIE6CMzbazvcHuHXDc.jpg",
  "year": "1999",
  "subtitle": null,
  "overview": null,
  "rating": null,
  "status": null,
  "favorited": false,
  "requested": null,
  "canQuickAdd": false,
  "canRequest": false
}
```

| Field | Type | Meaning |
|---|---|---|
| `mediaType` | `"movie" \| "tv"` | |
| `tmdbId` | int | |
| `name` | string | |
| `posterPath` | string \| null | see deviation 1 |
| `year` | string \| null | |
| `subtitle` | string \| null | Role/character on a person's credits; genre name on the Movies/Series grid; otherwise null |
| `overview`, `rating` | string \| null, number \| null | Movies/Series grid only (`rating` = TMDb vote average 0–10) |
| `status` | `LibraryStatus` \| null | null = not in the library (the website shows no badge) |
| `favorited` | bool \| null | null where the website shows no favorite star on that list |
| `requested` | bool \| null | You already have a pending or approved request (franchise/similar rows); null elsewhere |
| `canQuickAdd` | bool | Show the "+ Add" quick action (`POST /titles/{type}/{id}/add`) |
| `canRequest` | bool | Show the "Request" quick action — unless `requested` is true, then show "Requested" |

`LibraryStatus`: `"owned"` (badge "Owned" / "Already in your library"),
`"tracked_downloading"` ("Downloading"), `"tracked_monitored"` ("Missing"),
`"coming_soon"` ("Coming soon"), `"untracked"` ("Not owned" / "Not in your library").

#### `PersonCard`, `CompanyCard`, `NetworkCard`

```json
{ "tmdbId": 6384, "name": "Keanu Reeves", "profilePath": "/8RZL.jpg", "knownForDepartment": "Acting", "favorited": false }
{ "tmdbId": 420, "name": "Marvel Studios", "logoPath": "/hUze.png", "favorited": false }
{ "tmdbId": 213, "name": "Netflix", "logoPath": "/wwem.png" }
```

`favorited` is null where the website shows no star (Discover's Studios shelf).

#### `RequestPerson`

```json
{ "userId": "83c55a49-…", "displayName": null, "username": "member1", "label": "member1" }
```

`label` is what the website prints (display name, else username). `userId` is
null where the underlying query doesn't carry it.

---

## 1. Discovery & Auth

### `GET /server-info` — public

Cheap: a few small queries (3 s timeout together), no calls to integrations.

```json
{
  "app": "marquee",
  "apiVersion": 1,
  "version": "0.22.0",
  "setupComplete": true,
  "status": "ok",
  "signIn": { "password": true, "plex": true, "jellyfin": false }
}
```

`signIn` says which sign-in buttons to show: `plex` / `jellyfin` are true
while the admin has that server connected in Settings → Integrations (Plex
also needs its first library sync done). Missing on older servers — show
password sign-in only.

Database unreachable → still `200` with `"setupComplete": null, "status": "degraded"`
and `signIn` password-only.
Legacy (pre-0.22.0) servers redirect this path to `/login` (HTML) — see core contract.

### `POST /auth/login` — public

Body:

| Field | Type | |
|---|---|---|
| `username` | string | required, exact (case-sensitive) |
| `password` | string | required |
| `deviceName` | string | optional (deviation 2) |

```json
{
  "token": "mqt_qHnY…43 chars…",
  "expiresAt": "2026-12-16T17:10:57.920Z",
  "user": {
    "id": "54caac33-73d6-4864-8e12-1ea6b212d2f1",
    "username": "timmy",
    "displayName": "Timmy",
    "role": "admin",
    "libraryOwnerId": "54caac33-73d6-4864-8e12-1ea6b212d2f1",
    "avatarUrl": null
  }
}
```

Errors: `400 invalid` ("Enter your username and password." — missing/blank
field), `401 invalid_credentials` ("Incorrect username or password"),
`429 rate_limited` ("Too many attempts. Try again in a few minutes.").
Rate limits are the web sign-in's own buckets: after 5 failures for a username
or 20 for an IP within 15 minutes, both web and API sign-in are refused until
the window ends. Only failures count. The IP is the first `X-Forwarded-For`
hop, else `X-Real-IP`.

### `POST /auth/setup` — public

First-run only: creates the first account as **admin** (same validation as the
web setup form) and signs this device in.

| Field | Type | Rules |
|---|---|---|
| `username` | string | 3–32 chars, letters/numbers/`_ . -` |
| `password` | string | ≥ 8 chars |
| `displayName` | string | optional, 1–80 chars (blank = none) |
| `deviceName` | string | optional |

Response: same shape as login (`libraryOwnerId` = the new admin's id).

Errors: `409 setup_complete` ("Setup has already been completed. Please sign in
instead." — checked first), `429 rate_limited` ("Too many attempts. Try again
later."), `400 invalid` (first failing rule, e.g. "Username must be at least 3
characters", "Password must be at least 8 characters").

### `POST /auth/logout` — user

Revokes the calling token only (other devices stay signed in).

```json
{ "ok": true }
```

### Sign in with Plex / Jellyfin — public

Who may sign in: a **Plex** account the admin's Plex server is shared with
(a friend, a Plex Home user, or the server's owner), or a **Jellyfin** user
of the admin's Jellyfin server. The first sign-in of someone with no linked
Marquee account creates a **member** account for them (username from
Plex/Jellyfin, made unique with a number; no password) — unless the admin
turned "New accounts from Plex/Jellyfin sign-in" off (`GET /settings/sign-in`),
then it's `403` "Ask the admin to add you first.". Accounts are matched only
by a link to that Plex/Jellyfin user, never by username or email; the Plex
account that owns the server signs in as the admin (and is linked to it) if
the admin has no Plex link yet.

#### `POST /auth/plex/start` — public

No body. Starts a Plex PIN on the server.

```json
{
  "handle": "u8Zq3…43 chars…",
  "authUrl": "https://app.plex.tv/auth#?clientID=…&code=…&context%5Bdevice%5D%5Bproduct%5D=Marquee",
  "expiresAt": "2026-09-25T17:40:00.000Z"
}
```

Open `authUrl` in the default browser, then poll with `handle` every 2 s
until `expiresAt` (10 minutes). The handle is the only way to reach this
sign-in — keep it to yourself; the Plex token never leaves the server.
Errors: `409 conflict` "Plex sign-in isn't set up on this server.", `502
upstream` "Couldn't start Plex sign-in. Try again.", `429 rate_limited` (30
starts per client address per 10 minutes; 120 shared when the server can't
tell addresses apart).

#### `POST /auth/plex/poll` — public

| Field | Type | |
|---|---|---|
| `handle` | string | required, from `start` |
| `deviceName` | string | optional (deviation 2) |

- **`202`** `{ "status": "pending" }` — not approved on plex.tv yet; poll again.
- **`200`** — signed in; exactly the body of `POST /auth/login` (`{ token, expiresAt, user }`). The handle is used up.
- **`410 expired`** "That Plex sign-in expired. Try again." — handle unknown, already used, or older than 10 minutes.
- **`403 forbidden`** "This Plex account doesn't have access to this server." or "Ask the admin to add you first.".
- `502 upstream` "Couldn't reach Plex. Try again." (the handle is used up; start again), `429 rate_limited`.

```bash
curl -s -X POST "$SERVER/api/v1/auth/plex/start"
# → {"handle":"u8Zq…","authUrl":"https://app.plex.tv/auth#?…","expiresAt":"…"}
curl -s -X POST "$SERVER/api/v1/auth/plex/poll" -H 'Content-Type: application/json' \
  -d '{"handle":"u8Zq…","deviceName":"Anna’s Mac"}'
# → 202 {"status":"pending"} … then 200 {"token":"mqt_…","expiresAt":"…","user":{…}}
```

#### `POST /auth/jellyfin` — public

| Field | Type | |
|---|---|---|
| `username` | string | required — the Jellyfin username |
| `password` | string | required — the Jellyfin password |
| `deviceName` | string | optional |

Checked with the admin's Jellyfin server (`/Users/AuthenticateByName`); the
password is sent there and nowhere else, and never stored. Response: same as
`POST /auth/login`.

Errors: `400 invalid` "Enter your Jellyfin username and password.", `401
invalid_credentials` "Incorrect Jellyfin username or password", `403
forbidden` "Ask the admin to add you first.", `409 conflict` "Jellyfin
sign-in isn't set up on this server.", `502 upstream` "Couldn't reach
Jellyfin. Try again.", `429 rate_limited` — the same limits as `POST
/auth/login`, in buckets of their own.

```bash
curl -s -X POST "$SERVER/api/v1/auth/jellyfin" -H 'Content-Type: application/json' \
  -d '{"username":"anna","password":"…","deviceName":"Anna’s PC"}'
```

### `GET /me` — user

```json
{
  "id": "54caac33-73d6-4864-8e12-1ea6b212d2f1",
  "username": "timmy",
  "displayName": "Timmy",
  "role": "admin",
  "libraryOwnerId": "54caac33-73d6-4864-8e12-1ea6b212d2f1",
  "avatarUrl": "/api/v1/users/54caac33-73d6-4864-8e12-1ea6b212d2f1/avatar?v=1790334036549",
  "autoApproveMovies": false,
  "autoApproveTv": false,
  "createdAt": "2026-09-17T17:10:57.821Z",
  "linked": { "plex": true, "jellyfin": false },
  "hasPassword": true
}
```

`linked` says which media-server accounts this account signs in with (see
"Linked accounts" in section 11). `hasPassword` is false for an account made
by Plex/Jellyfin sign-in or import that hasn't set a password yet — it can
set one with `PATCH /users/{id}` without `currentPassword`.

Use `role` to decide which admin UI to show (Integrations/Activity/Jobs
settings tabs, request review, Add buttons). The role is re-read on every
request, so a demotion takes effect immediately (`403`s).

### `GET /badges` — user

The header counters in one call, suitable for polling (website: bell every
30 s, requests badge every 20 s).

```json
{ "unreadNotifications": 2, "pendingRequests": 1, "openIssues": 1 }
```

`pendingRequests` is always `0` for members (as on the website).
`openIssues` (0.38+; an older server omits it): open problem reports, also
`0` for members. The website's Requests badge shows `pendingRequests +
openIssues`, since both wait on that page.

---

## 2. Discover / Browse / Search

All endpoints in this section need TMDb (`502 upstream` otherwise — deviation 7).

### `GET /discover` — user

The Discover landing page, shelves in page order. Cards carry `status` only
(the website shows no favorite/add buttons on these shelves). Empty shelves
are empty arrays — the website hides them. Genre tiles link to
`/movies?genre=` / `/series?genre=`; studio logos to `/companies/{id}`;
network logos to `/series?network=`.

```json
{
  "recentlyAdded": [ /* TitleCard, from Plex/Jellyfin, newest first, max 20 */ ],
  "trending": [
    { "mediaType": "tv", "tmdbId": 299939, "name": "Monster: The Lizzie Borden Story", "posterPath": "/57XS.jpg", "year": "2026",
      "subtitle": null, "overview": null, "rating": null, "status": null, "favorited": null, "requested": null, "canQuickAdd": false, "canRequest": false }
  ],
  "popularMovies": [ /* TitleCard ×20 — "See all" → GET /movies */ ],
  "movieGenres": [ { "id": 28, "name": "Action", "backdropPath": "/qeQJ.jpg" } ],
  "upcomingMovies": [ /* TitleCard, release date today or later */ ],
  "studios": [ { "tmdbId": 2, "name": "Walt Disney Pictures", "logoPath": "/wdrC.png", "favorited": null } ],
  "popularSeries": [ /* TitleCard ×20 — "See all" → GET /series */ ],
  "seriesGenres": [ { "id": 10759, "name": "Action & Adventure", "backdropPath": "/…jpg" } ],
  "upcomingSeries": [ /* TitleCard */ ],
  "networks": [ { "tmdbId": 213, "name": "Netflix", "logoPath": "/wwem.png" } ]
}
```

### `GET /movies` and `GET /series` — user

The Movies / Series results grid (infinite scroll on the website).

| Query | Type | Default | |
|---|---|---|---|
| `sort` | `popularity` \| `top_rated` \| `newest` | `popularity` | |
| `genre` | int | — | TMDb genre id (from `/extras`) |
| `year` | int 1800–3000 | — | release / first-air year |
| `network` | int | — | **series only** (ignored for movies) |
| `hideOwned` | `true`/`false`/`1`/`0` | `true` | Hide anything already in the library (the website's default when signed in) |
| `page` | int 1–500 | 1 | |

Each page is a batch of 4 TMDb pages (10 with `hideOwned`), de-duplicated.
Continue while `page < totalPages`. Titles can reappear across pages because
TMDb's ranking shifts; skip ones you already show (as the website does).

```json
{
  "page": 2,
  "totalPages": 23,
  "totalResults": 4584,
  "results": [
    { "mediaType": "movie", "tmdbId": 502, "name": "Fail Safe", "posterPath": "/qrsj.jpg", "year": "1964",
      "subtitle": "Thriller",
      "overview": "Because of a technical defect an American bomber team mistakenly orders the destruction of Moscow…",
      "rating": 7.832, "status": null, "favorited": false, "requested": null, "canQuickAdd": false, "canRequest": false }
  ]
}
```

Errors: `400 invalid` (bad `sort`, non-integer or out-of-range numbers).

Empty `results` on page 1: the website says "Nothing left here — try a
different genre or year, or turn off "Hide titles you already track"."

### `GET /movies/extras` and `GET /series/extras` — user

Everything on those pages besides the grid: the genre filter options, the
active network chip, and the "Because you watched …" row.

| Query | Type | |
|---|---|---|
| `genre` | int | "Because you watched" only appears with no genre… |
| `year` | int | …and no year filter |
| `network` | int | series only — resolves the network chip |

```json
{
  "genres": [ { "id": 10759, "name": "Action & Adventure" } ],
  "network": { "tmdbId": 213, "name": "Netflix", "logoPath": "/wwem.png" },
  "becauseYouWatched": {
    "title": "Severance",
    "items": [ /* TitleCard ×≤12 with status, favorited, canQuickAdd */ ]
  }
}
```

`network` is null without `?network=`; `becauseYouWatched` is null when there's
no Plex watch history of that media type (it rotates daily through the last 10
watched titles).

### `POST /surprise` — user

"🎲 Surprise me": one random title from the full TMDb result set for the filters.

| Body field | Type | Default |
|---|---|---|
| `type` | `"movie"` \| `"tv"` \| `"all"` | `"all"` (random per call) |
| `genreId` | int | — |
| `year` | int | — |
| `hideOwned` | bool | `true` (re-rolls up to 5 times to skip library titles) |

```json
{ "mediaType": "movie", "tmdbId": 424694 }
```

Errors: `404 not_found` — "Nothing matches those filters — try loosening
them." or "Couldn't find something new — try different filters.";
`400 invalid` (bad `type`/numbers).

### `GET /search?q=` — user

The search results page. `q` is required (`400` if blank).

```json
{
  "query": "keanu",
  "people": [ { "tmdbId": 6384, "name": "Keanu Reeves", "profilePath": "/8RZL.jpg", "knownForDepartment": "Acting", "favorited": false } ],
  "studios": [ { "tmdbId": 420, "name": "Marvel Studios", "logoPath": "/hUze.png", "favorited": false } ],
  "titles": [ /* TitleCard with status, favorited, canQuickAdd */ ],
  "theme": {
    "label": "Science Fiction",
    "items": [ /* TitleCard — section heading on the website: "<label> movies & TV" */ ]
  }
}
```

`theme` is non-null when the query (minus words like "movies"/"shows") names a
TMDb genre or keyword. All four empty → the website shows "No results for "…"."

### `GET /search/suggest?q=` — user

Header type-ahead: up to 7 people/movies/series. `q` shorter than 2 characters
→ `{"results": []}` without calling TMDb (and without the TMDb check).

```json
{
  "results": [
    { "id": 603, "mediaType": "movie", "name": "The Matrix", "posterPath": "/aOIu.jpg", "subtitle": "1999" },
    { "id": 6384, "mediaType": "person", "name": "Keanu Reeves", "posterPath": "/8RZL.jpg", "subtitle": "Acting" }
  ]
}
```

`subtitle` is the year for titles and the known-for department for people.
Website labels: person → "Actor", movie → "Movie", tv → "TV".

---

## 3. Title

### `GET /titles/{type}/{tmdbId}` — user

Everything the title page renders. `type` is `movie` or `tv`.

```json
{
  "mediaType": "movie",
  "tmdbId": 603,
  "tvdbId": null,
  "imdbId": "tt0133093",
  "name": "The Matrix",
  "overview": "Set in the 22nd century, The Matrix tells the story of a computer hacker…",
  "tagline": "Believe the unbelievable.",
  "posterPath": "/aOIuZAjPaRIE6CMzbazvcHuHXDc.jpg",
  "backdropPath": "/lrtSb1skJayPydZk0OSMAKjBOVe.jpg",
  "year": "1999",
  "releaseDate": "1999-03-31",
  "tmdbStatus": "Released",
  "facts": {
    "runtimeMinutes": 136,
    "runtimeLabel": "2h 16m",
    "ratingPercent": 83,
    "genres": ["Action", "Science Fiction"],
    "yearRange": "1999",
    "statusLabel": "Released",
    "network": null,
    "releaseDateLabel": "March 30, 1999",
    "nextAirDate": null,
    "nextAirDateLabel": null,
    "originalLanguage": "en",
    "originalLanguageLabel": "English",
    "productionCountry": { "code": "US", "name": "United States of America", "flag": "🇺🇸" },
    "watchProviders": [ { "name": "YouTube TV", "logoPath": "/48bV.png" } ]
  },
  "credits": [ { "role": "Director", "name": "Lana Wachowski" }, { "role": "Director", "name": "Lilly Wachowski" } ],
  "keywords": ["man vs machine", "martial arts", "cyberpunk"],
  "links": {
    "trailerYoutubeKey": "FVI84Dfx2-I",
    "imdbId": "tt0133093",
    "tvdbId": null,
    "facebookId": "TheMatrixMovie",
    "instagramId": null,
    "twitterId": null,
    "external": [
      { "label": "IMDb", "url": "https://www.imdb.com/title/tt0133093" },
      { "label": "Facebook", "url": "https://www.facebook.com/TheMatrixMovie" }
    ]
  },
  "library": {
    "status": "owned",
    "provider": "plex",
    "configured": true,
    "file": {
      "path": "/movies/The Matrix (1999)/The Matrix.mkv",
      "sizeBytes": 31229390464,
      "quality": "Bluray-2160p",
      "resolutionTier": "4K",
      "resolution": "3840x1600",
      "videoCodec": "x265",
      "dynamicRange": "HDR10",
      "audioCodec": "TrueHD Atmos",
      "audioChannels": 7.1,
      "container": "MKV",
      "bitrateKbps": 58421,
      "dateAdded": "2025-11-02T09:14:00.000Z",
      "releaseGroup": "FraMeSToR",
      "edition": null
    }
  },
  "viewer": {
    "isAdmin": true,
    "favorited": false,
    "requestStatus": null,
    "alreadyRequested": false,
    "otherRequesters": [],
    "canAdd": false,
    "needsArrSetup": false,
    "canRequest": false,
    "canRequestSeasons": false,
    "requestedSeasons": null,
    "canRelink": true,
    "arrTracking": { "arrId": 412, "monitored": true },
    "fourK": { "status": "untracked", "requestStatus": null, "canRequest": false, "canAdd": true },
    "canReport": false,
    "openReports": 0
  },
  "seasons": [],
  "cast": [
    { "tmdbId": 6384, "name": "Keanu Reeves", "character": "Neo", "profilePath": "/8RZL.jpg", "order": 0, "favorited": false }
  ],
  "franchise": {
    "title": "The Matrix Collection",
    "collectionId": 2344,
    "collectionFavorited": false,
    "items": [ /* TitleCard with status, favorited, requested, canQuickAdd, canRequest — oldest first */ ],
    "addAllMissing": [ { "mediaType": "movie", "tmdbId": 604 } ]
  },
  "studios": [ { "tmdbId": 79, "name": "Village Roadshow Pictures", "logoPath": "/at4u.png", "favorited": false } ],
  "similar": [ /* TitleCard with status, favorited, requested, canQuickAdd, canRequest */ ]
}
```

Field notes:

- `facts` is the sidebar and the line under the title. `runtimeLabel` is
  `"2h 16m"` for movies and `"~42m/episode"` (average) for TV; both null when
  TMDb has no runtime. `ratingPercent` = TMDb vote average × 10. `statusLabel`
  relabels TMDb's "Returning Series" as "Continuing". `genres` is capped at 3.
  `yearRange` is `"2011–2019"` for an ended show. The date labels are
  pre-formatted in the server's locale/time zone (`releaseDate` /
  `nextAirDate` are the raw TMDb dates). Website sidebar labels: "Status",
  "Release Date" (movie) / "First Air Date" (TV), "Next Air Date", "Original
  Language", "Production Country" (flag + name), "Network", "Currently
  Streaming On" (US flat-rate providers).
- `credits`: Director + Screenplay/Writer (movies) or Creator + Executive
  Producer (TV), max 6.
- `links.external` is the ordered button row after the "▶ Trailer" button
  (`https://www.youtube.com/watch?v={trailerYoutubeKey}`).
- `library.status`/`provider`: where ownership came from (`plex`, `jellyfin`,
  `sonarr`, `radarr`, or null). `configured`: the library owner's
  Radarr (movies) / Sonarr (TV) has a root folder and quality profile.
- `viewer.fourK` (0.37+; an older server omits it): the 4K copy, when the
  admin has set up a 4K Radarr (movies) / 4K Sonarr (TV); null otherwise.
  `status` is how the 4K instance has the title (read live; "untracked" when
  it doesn't), independent of `library.status`. `requestStatus` is the
  viewer's own 4K request (`pending`/`approved`, null when none or declined).
  `canRequest`: a member may press "Request in 4K" (`POST …/request` with
  `{"is4k": true}`); `canAdd`: the admin may press "Add to 4K Radarr/Sonarr"
  (`POST …/add` with `{"is4k": true}`). Website, in the hero's action row:
  a gold outline chip "In 4K" / "4K downloading" / "4K missing" / "4K coming
  soon" when `status` isn't untracked, a "4K requested" chip while the 4K
  request is pending, and the outline buttons "Request in 4K" / "Add to 4K
  Radarr".
- `library.file` ("File details" card) is non-null for `owned` titles, and
  for a show Sonarr has some episodes of (`tracked_downloading`: its folder,
  size on disk so far and quality profile).
  Website rows, in order, each skipped when its value is null: Location (with
  Copy), Size, Runtime (`facts.runtimeLabel`), Added, Resolution
  (`resolutionTier ?? resolution`), Quality profile, Video (`videoCodec`),
  Dynamic range, Audio (`"<codec> <channels>ch"`), Container, Bitrate
  (rendered as `"58.4 Mbps"`, or `"<n> kbps"` under 1000), Edition, Release
  group.
- Which fields `library.file` has depends on what owns the title:

  | Field | Radarr | Sonarr | Plex | Jellyfin |
  | --- | --- | --- | --- | --- |
  | `path`, `sizeBytes`, `dateAdded` | yes | yes (no `dateAdded`) | yes | movies only for `sizeBytes` |
  | `quality`, `releaseGroup`, `edition` | yes | `quality` only | from the *arr, if it also tracks the title | same |
  | `resolution`, `videoCodec`, `audioCodec`, `audioChannels` | yes | no | movies, and TV aggregated across the show's episodes | movies only |
  | `dynamicRange` | yes | no | movies | movies only |
  | `container`, `bitrateKbps` | no | no | movies + TV | movies only |

  Where both an *arr and a media server know a field, the *arr's value wins —
  it's authoritative about the release it fetched. `container` and
  `bitrateKbps` are the two fields no *arr reports at all.
- Spelling of the media-detail fields, so a client can match on them:
  `resolutionTier` is `"4K" | "1080p" | "720p" | null`; `resolution` is that
  same tier from a media server (`"4K"`, `"1080p"`, `"720p"`, `"576p"`,
  `"480p"`, `"SD"`, `"8K"`), a raw `"1920x816"` when the dimensions don't land
  on a tier, or Radarr's own raw `"3840x1600"`; `videoCodec` is Radarr's
  (`"x265"`, `"h264"`) or a media server's normalized `"HEVC" | "H.264" |
  "AV1" | "VC-1" | "MPEG-2" | "VP9"`; `dynamicRange` is `"DV" | "HDR10" |
  "HDR10Plus" | "HLG" | "PQ" | "SDR"` (`"SDR"` only ever from a media server —
  Radarr leaves it empty — and `null` means "not known", not "SDR");
  `audioCodec` is `"TrueHD" | "EAC3" | "AC3" | "DTS" | "DTS-HD MA" | "AAC" |
  "FLAC" | "Opus" | "PCM" | …`, with `" Atmos"` appended when the track
  carries it (`"TrueHD Atmos"`); `container` is uppercase (`"MKV"`, `"MP4"`,
  `"TS"`, `"AVI"`); `bitrateKbps` is an integer, the whole file's bitrate in
  kbps.
- `viewer` decides the action area under the title:
  - `canAdd` → "Add to Radarr/Sonarr" button (`POST …/add`).
  - `needsArrSetup` → "Connect Radarr/Sonarr to add this title" link (admin → Integrations).
  - `canRequest` → "Request" button (`POST …/request`); when
    `alreadyRequested` show "Requested — waiting for approval" instead; when
    `otherRequesters` is non-empty and you haven't requested, show "Also
    requested by A, B".
  - `canRequestSeasons` (member, TV): nothing of yours is pending for the show
    and at least one entry of `seasons` is `requestable`. The website then
    makes "Request" open a season picker instead (and, once the show is in
    the library — `library.status` isn't `untracked` — shows "Request more
    seasons", which opens the same picker). Unlike `canRequest` it can be true
    for a show that's already tracked or owned. Picker rows are `seasons` in
    the same order: a checkbox when `requestable`, otherwise a tag — "In
    library" (complete in Sonarr), "Monitored" (`monitored`), or "Requested"
    (`requested`). "Select all" checks every requestable row; the button reads
    "Request N season(s)" and sends `POST …/request` with `{"seasons": [...]}`.
  - `requestedSeasons`: the seasons of your pending request (null when nothing
    is pending or it's for the whole series). With it, the pending text reads
    "Requested Seasons 1–3 — waiting for approval" (format it the way
    `seasonsLabel` does in `/requests/mine`).
  - Always show the status badge for `library.status`.
  - `arrTracking` (admin only, non-null when Radarr/Sonarr has the title) →
    "Search now" (`POST …/search`) and "Stop/Start monitoring" (`PUT …/monitored`).
  - `canRelink` (admin, title in library) → "Wrong match? Fix ID" (`POST …/relink`).
  - `favorited` → the star (`PUT`/`DELETE /favorites/{type}/{tmdbId}`).
- `seasons` (TV only, "Episodes" accordion): seasons with episodes, **newest
  first**. `have`/`total` are Sonarr episode-file counts ("3/10" badge, green
  when complete) or null when Sonarr doesn't track the show. Load episodes
  with `GET …/seasons/{n}`. For the season picker, each also has:
  `monitored` — Sonarr will fetch it (the season and the series are
  monitored), null when Sonarr isn't connected or doesn't track the show;
  `requested` — in one of your pending or approved requests for this show (a
  pending whole-series request counts for every season); `requestable` — you
  are a member and it isn't complete, monitored or already requested by you.
  A season is complete when Sonarr has a file for every episode (for an
  unmonitored season, every episode it lists, not just the aired monitored
  ones `total` counts).

  ```json
  { "seasonNumber": 2, "name": "Season 2", "episodeCount": 10, "airDate": "2025-01-17",
    "posterPath": "/abc.jpg", "have": null, "total": null,
    "monitored": null, "requested": false, "requestable": true }
  ```
- `cast`: top 20 by billing order.
- `franchise`: a TMDb collection (movies) or a curated TV crossover group.
  `collectionId`/`collectionFavorited` are null for TV groups; the star next to
  the heading favorites the collection (`/favorites/collection/{collectionId}`).
  `addAllMissing` is the admin's "Add all N missing" set (empty for members);
  add each with `POST /titles/{type}/{id}/add`.
- `studios`: production companies (or networks for thinly-credited streaming
  originals), heading "Studio".
- `similar`: TMDb recommendations, heading "More like this".

Errors: `404 not_found` (bad type/id, or TMDb has no such title), `502 upstream`.

### `GET /titles/tv/{tmdbId}/seasons/{seasonNumber}` — user

One season's episodes (an expanded accordion row).

```json
{
  "tmdbId": 1399,
  "seasonNumber": 1,
  "episodes": [
    {
      "id": 63056,
      "episodeNumber": 1,
      "name": "Winter Is Coming",
      "overview": "Jon Arryn, the Hand of the King, is dead…",
      "airDate": "2011-04-17",
      "stillPath": "/o4IX9Mm0kpLITVANJMx7inyEUaY.jpg",
      "hasFile": true
    }
  ]
}
```

`hasFile` is Sonarr's per-episode file presence ("Have it" / "Missing"), null
when Sonarr doesn't track the show. The website truncates overviews at 220
characters. An empty `episodes` list → "No episode data for this season."

Errors: `404 not_found` (movie, bad numbers, unknown show), `502 upstream`.

---

## 4. Library status & Sonarr/Radarr actions

### `GET /titles/{type}/{tmdbId}/status` — user

Just `library` + `viewer` from the title detail — a cheap refresh after add /
request / monitor / favorite.

```json
{
  "mediaType": "movie",
  "tmdbId": 603,
  "library": { "status": "tracked_monitored", "provider": "radarr", "configured": true, "file": null },
  "viewer": {
    "isAdmin": true, "favorited": false, "requestStatus": null, "alreadyRequested": false, "otherRequesters": [],
    "canAdd": false, "needsArrSetup": false, "canRequest": false,
    "canRequestSeasons": false, "requestedSeasons": null, "canRelink": true,
    "arrTracking": { "arrId": 412, "monitored": true },
    "fourK": null,
    "canReport": false,
    "openReports": 0
  }
}
```

### `POST /titles/{type}/{tmdbId}/add` — user (admin enforced)

"Add to Radarr/Sonarr" and poster quick-add. Uses **the caller's own**
Radarr/Sonarr connection; re-enables monitoring if the title already exists
there unmonitored.

```json
{ "ok": true }
```

Body (optional): `{ "is4k": true }` adds it to the 4K Radarr/Sonarr instead
(0.37+) — errors then say "the 4K Radarr" / "the 4K Sonarr".

Errors: `403 forbidden` "Only the admin can add titles.", `409 conflict`
"Connect Radarr in Settings first." / "Connect Sonarr in Settings first." (not
connected or no defaults) / "Couldn't resolve this show for Sonarr." (no TVDB
id), `502 upstream` "Couldn't add this movie to Radarr." / "Couldn't add this
series to Sonarr.".

### `POST /titles/{type}/{tmdbId}/search` — admin

"Search now": queues a Radarr/Sonarr search for a tracked title.

```json
{ "ok": true }
```

Website success text: "Search queued." Errors: `409 conflict` "Not tracked in
Radarr/Sonarr." / "Connect Radarr in Settings first.", `502 upstream`
"Couldn't queue a search — the *arr app didn't accept the request.",
`403` "Only the admin can trigger a search.".

### `PUT /titles/{type}/{tmdbId}/monitored` — admin

Body: `{ "monitored": false }` (required bool).

```json
{ "ok": true, "monitored": false }
```

Errors: `400 invalid`, `409 conflict` "Not tracked in Radarr/Sonarr.",
`502 upstream` "Couldn't update monitoring — the *arr app didn't accept the
request.", `403` "Only the admin can change monitoring.".

### `POST /titles/{type}/{tmdbId}/relink` — admin

"Wrong match? Fix ID": repoints this title's synced Plex/Jellyfin/Sonarr/Radarr
rows to another TMDb title and remembers the override for future syncs.
Provide one of (checked in this order):

| Body field | Type | |
|---|---|---|
| `tmdbId` | number or string | positive integer |
| `imdbId` | string | `tt0133093` or `0133093` |
| `tvdbId` | number or string | TV only |

```json
{ "ok": true, "newTmdbId": 604 }
```

Navigate to the new title afterwards. Errors (`400 invalid` unless noted):
"Enter a TMDb ID, IMDb ID, or TVDB ID.", "TMDb ID must be a positive number.",
"TVDB ID must be a positive number.", "A TVDB ID only applies to TV shows.",
"That's already the current match."; `404 not_found` "Couldn't find that IMDb
ID on TMDb." / "Couldn't find that TVDB ID on TMDb." / "Couldn't find that
title on TMDb. Check the ID and try again."; `409 conflict` "Couldn't update —
the corrected title may already be linked to something else in your library.".

---

## 5. Person / Company

### `GET /people/{tmdbId}` — user

```json
{
  "tmdbId": 6384,
  "name": "Keanu Reeves",
  "alsoKnownAs": ["Keanu Charles Reeves"],
  "biography": "Keanu Charles Reeves is a Canadian actor…",
  "birthday": "1964-09-02",
  "deathday": null,
  "placeOfBirth": "Beirut, Lebanon",
  "profilePath": "/8RZLOyYGsoRe9p44q3xin9QkMHv.jpg",
  "favorited": true,
  "credits": [
    { "mediaType": "movie", "tmdbId": 1638103, "name": "Constantine 2", "posterPath": "/aAcC.jpg", "year": null,
      "subtitle": "John Constantine", "overview": null, "rating": null, "status": null,
      "favorited": false, "requested": null, "canQuickAdd": false, "canRequest": false }
  ]
}
```

`credits` is the acting filmography (`subtitle` = character) with status,
favorites and quick-add. The website's list defaults to **"Newest first"
(by year, unknown years last)** and offers client-side sorts ("Oldest first",
"A–Z"), a type filter (All/Movies/TV), a title search and a grid/table toggle
("Role" column) — do those locally. Empty → "No processed filmography found
for this person yet." Errors: `404` (unknown person), `502 upstream`.

### `GET /companies/{tmdbId}` — user

```json
{
  "tmdbId": 420,
  "name": "Marvel Studios",
  "description": null,
  "logoPath": "/hUzeosd33nzE5MCNsZxCGEKTXaQ.png",
  "titleCount": 137,
  "favorited": false,
  "titles": [ /* TitleCard with status, favorited, canQuickAdd */ ]
}
```

Header: "{titleCount} titles in the catalog"; the website truncates
`description` at 400 characters. Same client-side list controls as a person.
Empty → "No titles found for this studio yet." Errors: `404`, `502 upstream`.

---

## 6. Favorites

`entityType` is one of `movie`, `tv`, `person`, `company`, `collection`.

### `GET /favorites` — user

Most recently favorited first within each section. Website section order:
Movies, TV Shows, Collections, People, Studios. All empty → "Nothing favorited
yet — star anything from its page or card to see it here."

```json
{
  "movies": [ { "mediaType": "movie", "tmdbId": 603, "name": "The Matrix", "posterPath": "/aOIu.jpg", "year": "1999",
                "subtitle": null, "overview": null, "rating": null, "status": null, "favorited": true, "requested": null,
                "canQuickAdd": false, "canRequest": false } ],
  "tv": [],
  "collections": [ { "collectionId": 2344, "name": "The Matrix Collection", "posterPath": "/bV9q.jpg", "firstMovieTmdbId": 603 } ],
  "people": [ { "tmdbId": 6384, "name": "Keanu Reeves", "profilePath": "/8RZL.jpg", "knownForDepartment": null, "favorited": true } ],
  "studios": [ { "tmdbId": 420, "name": "Marvel Studios", "logoPath": "/hUze.png", "favorited": true } ]
}
```

A collection card opens its earliest movie (`firstMovieTmdbId`, null if it has
none). Collections are fetched live from TMDb; one that fails is omitted.

### `GET /favorites/{entityType}/{tmdbId}` — user

```json
{ "entityType": "movie", "tmdbId": 603, "favorited": false }
```

### `PUT /favorites/{entityType}/{tmdbId}` — user

Favorite (idempotent). Also caches the entity so it appears on `GET /favorites`.
Response: same shape, `"favorited": true`.

### `DELETE /favorites/{entityType}/{tmdbId}` — user

Unfavorite (idempotent). Response: same shape, `"favorited": false`.

### `POST /favorites/{entityType}/{tmdbId}/toggle` — user

The website's star button: flips and returns the new state.

```json
{ "entityType": "person", "tmdbId": 6384, "favorited": true }
```

Errors for all: `404 not_found` (unknown entity type or bad id).

---

## 7. Requests

The website's Requests page shows members their own requests (`/requests/mine`)
and the admin the review queue (`/requests/pending`) plus "Past requests"
(`/requests/history`).

### `POST /titles/{type}/{tmdbId}/request` — user

"Request" a title. Name and poster come from the server's TMDb cache. If the
admin enabled auto-approval for this member and media type, it's approved
immediately (and stays pending if that approval fails).

Body (optional, TV only): `{ "seasons": [1, 2] }` — request just those seasons.
No body, `{}`, or `"seasons": null` requests the whole series, exactly as
before; `seasons` is ignored for a movie.

`{ "is4k": true }` (0.37+) asks for the 4K copy instead, once the admin has a
4K Radarr/Sonarr (`viewer.fourK.canRequest`). It's always the whole title
(`seasons` ignored) and separate from a regular request: either can exist
alongside the other. It's blocked by your own pending or approved 4K request,
or by the 4K instance already having the title (the main library doesn't
count). Approving it adds the title to the 4K instance; the member's
auto-approval applies as usual. Errors: `409 conflict` "4K requests aren't
set up on this server." / "You've already requested this in 4K." / "It's
already in the 4K library or on its way.", `502 upstream` "Couldn't look this
title up with TMDb right now.".

```json
{ "ok": true, "requestId": "28713d50-27f2-4230-9c95-c1e6a000f6c0" }
```

Whole-series rules: blocked if you already have a pending or approved request
for the title, or it's already tracked or owned.

Season rules: `seasons` must be a non-empty list of at most 100 whole numbers,
each a season TMDb lists for the show (0 = specials, only if TMDb has them);
it's stored sorted and de-duplicated. Only a *pending* request of yours blocks
it — asking for more seasons after an earlier request was approved is fine,
and so is a show that's already tracked or owned. Seasons Sonarr already
monitors, or has every episode of, are dropped; the request keeps the rest.

Errors: `400 invalid` "Seasons must be a list of season numbers." / "Pick at
least one season." / "That's too many seasons for one request." / "Season
numbers must be whole numbers." / "Season 7 isn't listed for this show." /
"This show has no specials listed." (also "Request body isn't valid JSON.");
`409 conflict` "You've already requested this." / "You already have this in
your library." (whole series) / "You've already requested this — it's waiting
for approval." / "Those seasons are already in your library or on their way."
(seasons); `404` / `502` (TMDb).

### `GET /requests/mine` — user

Your own requests, newest first.

```json
{
  "results": [
    {
      "id": "28713d50-27f2-4230-9c95-c1e6a000f6c0",
      "mediaType": "movie",
      "tmdbId": 603,
      "title": "The Matrix",
      "posterPath": "/aOIuZAjPaRIE6CMzbazvcHuHXDc.jpg",
      "seasons": null,
      "seasonsLabel": null,
      "is4k": false,
      "status": "approved",
      "manuallyApproved": false,
      "rejectionReason": null,
      "libraryStatus": "tracked_downloading",
      "statusLabel": "Downloading",
      "statusTone": "downloading",
      "createdAt": "2026-09-17T17:12:41.415Z",
      "reviewedAt": "2026-09-17T18:00:02.118Z"
    }
  ]
}
```

`libraryStatus` is live for approved requests only (null otherwise).
`statusLabel`/`statusTone`: `pending` "Pending review", `declined` "Declined",
`owned` "In your library", `downloading` "Downloading", `coming_soon` "Coming
soon", `approved` "Manually approved" or "Approved". `rejectionReason` is why
the admin declined it (e.g. `"Not enough space on the server right now"`),
null unless `status` is `rejected` and a reason was given; the website shows
it as a second line under the "Declined" badge ("Reason: …"). Empty → "You
haven't requested anything yet — find a title and hit Request."

Every request DTO (here, `/requests/pending` and `/requests/history`) has
`seasons` — the TV seasons asked for, ascending, or null for the whole series
(every movie, and every request made before season requests existed) — and
`seasonsLabel`, the same in words: `"Season 2"`, `"Seasons 1–3, 5, 7–8"`,
`"Specials"`, `"Specials, Season 1"`, or null. The website shows the label
as a small second line under the title.

`is4k` (0.37+; an older server omits it, meaning false): asked for in 4K. The
website adds "In 4K" to that second line ("Season 2 · In 4K" or just "In 4K").
For an approved 4K request, `libraryStatus` is the 4K instance's status, not
the main library's.

### `GET /requests/pending` — admin

The review queue, newest first. Like the website, loading it first
auto-approves (and notifies the requester about) any pending request whose
title is already in the library, and leaves those out. A season request is
only settled that way once every season it asks for is monitored or complete
in Sonarr — the show itself being in the library doesn't count.

```json
{
  "sonarrUrl": "http://192.168.1.10:8989",
  "rejectionReasons": [
    "Already available on a streaming service we have",
    "Not released yet, ask again once it's out",
    "Not enough space on the server right now",
    "Not a fit for the household library",
    "Couldn't find a good copy of it"
  ],
  "results": [
    {
      "id": "28713d50-27f2-4230-9c95-c1e6a000f6c0",
      "mediaType": "movie",
      "tmdbId": 603,
      "title": "The Matrix",
      "posterPath": "/aOIuZAjPaRIE6CMzbazvcHuHXDc.jpg",
      "seasons": null,
      "seasonsLabel": null,
      "is4k": false,
      "requestedBy": { "userId": "83c55a49-6153-4cb9-ae22-4a42d48f4cf3", "displayName": null, "username": "member1", "label": "member1" },
      "createdAt": "2026-09-17T17:12:41.415Z"
    },
    {
      "id": "5b0f1d8e-8a8c-4f5e-9d51-1f0c7a0e2b44",
      "mediaType": "tv",
      "tmdbId": 95396,
      "title": "Severance",
      "posterPath": "/pPHpeI2X1qEd1CS1SeyrdhZ4qnT.jpg",
      "seasons": [2],
      "seasonsLabel": "Season 2",
      "is4k": false,
      "requestedBy": { "userId": "83c55a49-6153-4cb9-ae22-4a42d48f4cf3", "displayName": null, "username": "member1", "label": "member1" },
      "createdAt": "2026-09-17T17:10:02.001Z"
    }
  ]
}
```

`sonarrUrl` is the admin's Sonarr base URL (null if not connected), for the
"Add manually in Sonarr" link. `rejectionReasons` is the preset list the
website's Reject chooser offers, in order; show the same list plus an "Other"
choice with a free-text field, and send the chosen text to
`POST /requests/{id}/reject`. The website shows "Approve all" only when more
than one request is pending. Empty → "No pending requests."

### `GET /requests/history` — admin

"Past requests": the 50 most recently reviewed.

```json
{
  "results": [
    {
      "id": "28713d50-27f2-4230-9c95-c1e6a000f6c0",
      "mediaType": "movie",
      "tmdbId": 603,
      "title": "The Matrix",
      "posterPath": "/aOIuZAjPaRIE6CMzbazvcHuHXDc.jpg",
      "seasons": null,
      "seasonsLabel": null,
      "is4k": false,
      "status": "rejected",
      "manuallyApproved": false,
      "rejectionReason": "Not enough space on the server right now",
      "statusLabel": "Rejected",
      "requestedBy": { "userId": null, "displayName": null, "username": "member1", "label": "member1" },
      "createdAt": "2026-09-17T17:12:41.415Z",
      "reviewedAt": "2026-09-17T17:12:41.468Z"
    }
  ]
}
```

`statusLabel`: "Approved", "Manually approved" or "Rejected". `rejectionReason`
as in `/requests/mine`: the website shows it under the "Rejected" badge.

### `GET /requests/pending-count` — user

```json
{ "count": 3 }
```

Always `0` for members. (`GET /badges` returns this together with the unread count.)

### `POST /requests/{id}/approve` — admin

Adds the title with the admin's Radarr/Sonarr, marks it approved, notifies the
requester. `{ "ok": true }`.

For a season request: a show Sonarr doesn't have yet is added with only the
requested seasons monitored (and searched for); a show it already has keeps
what it monitors, gains the requested seasons, and gets a search queued for
each of them. The notification names the seasons: `"Severance" (Season 2)
was approved — it's on its way to your library.`

Errors: `404` "Request not found or already reviewed.", `409` "Request was
already reviewed." / "Connect Radarr in Settings first." / "Connect Sonarr in
Settings first." / **"Couldn't resolve this show for Sonarr."** (offer manual
approval) / "Sonarr doesn't list the requested seasons for this show.", `502`
"Couldn't add this movie to Radarr." / "Couldn't add this series to Sonarr.".

### `POST /requests/{id}/manual-approve` — admin

Marks approved without touching Sonarr/Radarr (the admin is downloading it by
hand); the requester sees "Manually approved". `{ "ok": true }`.
Errors: `404` "Request not found or already reviewed.", `409` "Request was already reviewed.".

### `POST /requests/{id}/reject` — admin

Declines and notifies the requester. Takes an optional JSON body with why.
Body: `{ "reason": "Not enough space on the server right now" }` (optional string).

`reason` is free text: one of the `rejectionReasons` from `/requests/pending`
or the admin's own words (no preset id, clients send the text itself).
Whitespace is trimmed and collapsed, longer than 200 characters is truncated
rather than rejected, and blank or absent means no reason (the website
requires one; the API doesn't, so older clients keep working). It's stored as
`rejectionReason` and appended to the requester's notification: `"The Matrix"
was declined: Not enough space on the server right now` (with no reason the
message stays `"The Matrix" was declined.`).

`{ "ok": true }`. Errors as for manual approval, plus `400 invalid`
`"reason" must be a string.`

### `POST /requests/approve-all` — admin

Approves every pending request one at a time; failures stay pending.

```json
{ "ok": true, "approvedCount": 4, "failedCount": 1, "message": "1 request(s) couldn't be approved." }
```

`message` is null when nothing failed. If requests were pending and **none**
could be approved, the first failure is returned as the error response instead
(same codes as `approve`). No pending requests → `approvedCount: 0`.

### Problem reports (0.38+)

"Report a problem" on a title — bad video or audio, missing subtitles, won't
play, the wrong movie or episode. The admin is notified (`issue_reported`),
sees open reports on the Requests page under "Reported problems", can have
Sonarr/Radarr look for another copy, and marks them fixed with an optional
note; the reporter is then notified (`issue_resolved`, not relayed to
Discord etc.). Members see their own under "Your problem reports".

#### `POST /titles/{type}/{tmdbId}/issues` — user

```json
{ "kind": "audio", "message": "Out of sync after 20 minutes", "seasonNumber": 2, "episodeNumber": 5 }
```

`kind`: `video` "Bad video quality", `audio` "Audio problem", `subtitles`
"Subtitles missing or wrong", `wont_play` "Won't play", `wrong_title` "Wrong
movie or episode", `other` "Something else". `message`: up to 1000
characters, required for `other`. `seasonNumber` / `episodeNumber`: TV only,
optional (an episode needs its season), ignored for a movie. Answers
`{ "ok": true, "issueId": "…" }`. Errors: `400 invalid` "Pick what's
wrong." / "Say what's wrong." / "Keep it under 1000 characters." / "Season
and episode are whole numbers." / "Pick the season too.", `429 rate_limited`
"You have a lot of open reports already. Wait until some are fixed." (20
open per person), `502 upstream` (TMDb unreachable).

The title's `viewer.canReport` is true once the title (or its 4K copy) is
owned or downloading, and `viewer.openReports` counts the viewer's own open
reports for it. Website: a "Report a problem" outline pill in the hero's
action row (shown while `canReport`), opening a dialog with the six kinds as
radio buttons, for TV a "Season (optional)" picker ("Whole show", "Specials",
"Season N") and an "Episode" number, a note ("Anything else? (optional)", or
"What's wrong?" for `other`), and "Send report"; afterwards (or while
`openReports > 0`) a "Problem reported" pill instead.

#### `GET /issues` — user

```json
{
  "results": [
    {
      "id": "83bedf64-c5d8-4f43-98a0-bb615c4b9897",
      "mediaType": "tv",
      "tmdbId": 1396,
      "title": "Breaking Bad",
      "posterPath": "/ggFHVNu6YYI5L9pCfOacjizRGt.jpg",
      "seasonNumber": 2,
      "episodeNumber": 5,
      "episodeLabel": "S2 E5",
      "kind": "audio",
      "kindLabel": "Audio problem",
      "message": "Out of sync after 20 minutes",
      "status": "open",
      "resolution": null,
      "reportedBy": { "userId": "2d0b…", "displayName": "Member", "username": "member", "label": "Member" },
      "isMine": false,
      "createdAt": "2026-09-26T02:40:11.000Z",
      "resolvedAt": null
    }
  ],
  "kinds": [
    { "id": "video", "label": "Bad video quality" },
    { "id": "audio", "label": "Audio problem" },
    { "id": "subtitles", "label": "Subtitles missing or wrong" },
    { "id": "wont_play", "label": "Won't play" },
    { "id": "wrong_title", "label": "Wrong movie or episode" },
    { "id": "other", "label": "Something else" }
  ]
}
```

The admin gets every open report (newest first) followed by the 30 most
recently fixed; a member only their own (up to 100). `episodeLabel`: "S2 E5",
"Season 2", "Specials" or null. `resolution`: the admin's note, when fixed.
Website rows: poster, title (link) and episode label, "Audio problem ·
Member · 9/26/2026" (the reporter only for the admin), the note in quotes,
"Fixed: <note>" once fixed; open ones have "Search again", "Mark fixed"
(which opens a note field and its own "Mark fixed") and "Remove" for the
admin, "Withdraw" for the member's own. Fixed ones sit behind "Show fixed (N)".

- **`POST /issues/{id}/resolve`** — admin. Body (optional) `{ "note": "…" }`
  (up to 500 characters). `404` "That report isn't open any more.".
- **`POST /issues/{id}/search`** — admin. Asks Radarr/Sonarr to search for the
  title again. `409` "Not tracked in Radarr/Sonarr.".
- **`DELETE /issues/{id}`** — your own while it's open, or (admin) any. `404`
  "Report not found.".

---

## 8. Notifications

`eventType`: `grabbed` (⬇️ started downloading), `downloaded` (✅ finished),
`request_approved` (👍), `request_rejected` (👎), and from 0.38
`issue_reported` (⚠️, to the admin) and `issue_resolved` (🛠️, to the
reporter). Tapping one opens
`/titles/{mediaType}/{tmdbId}` and marks it read.

### `GET /notifications` — user

| Query | Type | Default |
|---|---|---|
| `limit` | int 1–100 | 20 (the website's dropdown) |

```json
{
  "unreadCount": 1,
  "results": [
    {
      "id": "bedcb20b-fa30-4683-b000-42affc320087",
      "mediaType": "movie",
      "tmdbId": 603,
      "title": "The Matrix",
      "eventType": "request_rejected",
      "message": "\"The Matrix\" was declined: Not enough space on the server right now",
      "read": false,
      "createdAt": "2026-09-17T17:12:41.470Z"
    }
  ]
}
```

Newest first. Empty → "No notifications yet." The website shows relative
times ("just now", "5m ago", "3h ago", "2d ago") and a "9+" badge cap. A
`request_rejected` message carries the admin's reason after a colon when one
was given; without one it's just `"The Matrix" was declined.`

### `GET /notifications/unread-count` — user

```json
{ "count": 1 }
```

### `POST /notifications/read-all` — user

"Mark all read". `{ "ok": true }`.

### `POST /notifications/{id}/read` — user

`{ "ok": true }`. `404 not_found` "Notification not found." for an unknown id
or someone else's notification.

### `GET /notifications/stream` — user

Live notifications for an app that's running: a
[Server-Sent Events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
stream (`Content-Type: text/event-stream`) that stays open. The app shows each
event as a system notification itself, so nothing goes through Apple's,
Google's or anyone else's push service.

```
retry: 5000

event: ready
data: {}

event: notification
id: a23f7682-41ae-4e8a-8b17-14d903ab017a
data: {"id":"a23f7682-41ae-4e8a-8b17-14d903ab017a","mediaType":"movie","tmdbId":27205,"title":"Inception","eventType":"request_rejected","message":"\"Inception\" was declined: Already available on a streaming service we have","read":false,"createdAt":"2026-09-25T11:25:16.885Z"}

event: signed-out
data: {}
```

- `ready` arrives first. After it, a `notification` event (one
  `NotificationItem`, exactly as `GET /notifications` lists it) arrives the
  moment the server creates one for this account.
- A `: keep-alive` comment comes every 25 seconds. Each one is also when
  the server re-checks the token: once it's revoked (Sign out, a password
  change), the stream sends `signed-out` and closes. Sign in again.
- The stream can drop (the server restarted, the Mac slept, a proxy timed
  out). Reconnect after the `retry` delay, and catch up on anything missed
  with `GET /notifications`, whose newest items a client compares with the
  newest one it has already shown.
- Behind nginx and similar proxies the response carries `X-Accel-Buffering:
  no`, so events aren't held back; proxies with their own buffering need it
  turned off for this path.

The website doesn't use this: its notifications are Web Push, sent to the
browsers that turned them on under Settings › Account › Notifications.

---

## 9. Calendar

### `GET /calendar` — user

| Query | Type | Default |
|---|---|---|
| `month` | `YYYY-MM` | current month (server time) |

Upcoming Radarr releases ("In theaters", "Digital release", "On disc") and
Sonarr episode air dates ("S01E03") from the library owner's connections,
covering the website's Sunday-to-Saturday month grid (server local time).

```json
{
  "configured": true,
  "month": "2026-09",
  "gridStart": "2026-08-30",
  "gridEnd": "2026-10-03",
  "today": "2026-09-17",
  "prevMonth": "2026-08",
  "nextMonth": "2026-10",
  "timeZone": "America/New_York",
  "entries": [
    { "date": "2026-09-18", "mediaType": "tv", "tmdbId": 95396, "name": "Severance", "posterPath": "/pPHp.jpg", "subtitle": "S03E02" },
    { "date": "2026-09-22", "mediaType": "movie", "tmdbId": 1061474, "name": "Superman", "posterPath": "/wPLy.jpg", "subtitle": "Digital release" }
  ]
}
```

Entries are sorted by date; a movie can appear once per matching release type.
The website shows at most 4 per day ("+N more"). `configured: false` (neither
Sonarr nor Radarr connected, `entries` empty) → admin: "Connect Sonarr or
Radarr to see upcoming releases and air dates here." with a link to
Integrations; member: "The household admin hasn't connected Sonarr or Radarr yet."

Errors: `400 invalid` for a malformed `month`.

---

## 10. Activity

### `GET /settings/activity` — admin

Settings → Activity: the 50 most recent request events.

```json
{
  "results": [
    {
      "id": "44476b7f-d130-4873-8211-e11e17f6b211",
      "eventType": "request_rejected",
      "verb": "declined",
      "mediaType": "movie",
      "tmdbId": 603,
      "title": "The Matrix",
      "actor": { "userId": null, "displayName": "Timmy", "username": "timmy", "label": "Timmy" },
      "createdAt": "2026-09-17T17:12:41.470Z"
    }
  ]
}
```

Rendered as "{actor.label} {verb} {title}". `eventType` → `verb`:
`request_created` requested, `request_approved` approved, `request_rejected`
declined, `request_manually_approved` manually approved. Empty → "Nothing yet."

---

## 11. Settings — Account & household members

The Account tab shows your name/username with "Sign out" (`POST /auth/logout`),
then the member list ("Household members" for the admin, "Your account" for a
member) and, for the admin, "Add a household member".

`HouseholdMember`:

```json
{
  "id": "83c55a49-6153-4cb9-ae22-4a42d48f4cf3",
  "username": "member1",
  "displayName": "Kid",
  "role": "member",
  "autoApproveMovies": false,
  "autoApproveTv": true,
  "createdAt": "2026-09-17T17:12:40.991Z",
  "isCurrentUser": false,
  "avatarUrl": null,
  "linked": { "plex": false, "jellyfin": true },
  "hasPassword": false,
  "lastActiveAt": "2026-09-25T18:42:10.000Z"
}
```

`linked` / `hasPassword`: as on `/me`. Website: a small "Plex" / "Jellyfin"
tag on linked rows.

`lastActiveAt`: the last time the account used the website or an app, kept
to within 5 minutes; null when it never has (at first, it's when the
account's app sign-ins were last used). Website, admin only, under each
other member's name: "Active now" (under 10 minutes), "Active 25 minutes
ago", "Active 5 hours ago", "Active yesterday", "Active 6 days ago", then
"Last active Jul 4, 2026" past 30 days; "Never signed in" for null. An older
server omits the field.

`avatarUrl` (here, on `/me` and on the login/setup `user`) is the account's
profile photo as a server-relative path, or null when there's none: fetch it
with the same bearer token (see "Profile photo" below). It changes whenever
the photo does, so a client can cache the image under that URL for good.
Website: the round picture in the navigation menu and beside each member,
initials on the accent gradient when there's no photo.

### `GET /users` — user

Admin: every account, oldest first. Member: only their own account.

```json
{ "results": [ /* HouseholdMember */ ] }
```

Website badges: "Admin" (role), "You" (`isCurrentUser`). "Edit" is offered on
every row for the admin and on your own row for a member; "Remove" only for
the admin on non-admin rows.

### `POST /users` — admin

| Body field | Type | Rules |
|---|---|---|
| `username` | string | 3–32 chars, letters/numbers/`_ . -`, unique |
| `password` | string | ≥ 8 chars |
| `displayName` | string | optional, 1–80 chars |

`201 Created` with the new `HouseholdMember`. Website success text: "Account
created — they can now sign in at /login."

Errors: `400 invalid` (validation message), `409 conflict` "An account with that
username already exists", `403` "Only the admin can add household members.".

### `PATCH /users/{id}` — user (self) / admin (anyone)

The edit form. All fields are sent the way the form sends them:

| Body field | Type | |
|---|---|---|
| `username` | string | **required** (3–32 chars, as above; unique) |
| `displayName` | string | optional, ≤ 80 chars; omitted or empty = unchanged |
| `password` | string | optional, ≥ 8 chars; omitted or empty = unchanged |
| `currentPassword` | string | **required with `password` when editing your own account that has a password** (the admin resetting someone else's password doesn't send it, nor does an account with `hasPassword: false` setting its first one). Website: "Current password", shown only on your own row when it has a password |
| `autoApproveMovies` | bool | admin only (silently ignored for members); omitted = unchanged. Website: "Auto-approve movie requests", shown only for non-admin rows |
| `autoApproveTv` | bool | same, "Auto-approve TV requests" |

```json
{ "ok": true, "user": { /* HouseholdMember */ }, "tokensRevoked": true }
```

`tokensRevoked` is true when a password was set — every API token of that
account is gone (deviation 5). Errors: `403` "You can only edit your own
account.", `404` "Account not found.", `400 invalid` (including "Enter your
current password to set a new one." and "Your current password is
incorrect."), `429 rate_limited` "Too many attempts. Try again in a few
minutes." (5 wrong current passwords per account per 15 minutes), `409
conflict` "An account with that username already exists".

### `DELETE /users/{id}` — admin

Removes a member and everything of theirs (favorites, requests, tokens…).
`{ "ok": true }`. Errors: `403` "You can't remove your own account." / "Can't
remove the admin account." / "Only the admin can remove household members.",
`404` "Account not found.".

### Profile photo — user (self) / admin (anyone)

Photos are stored by the Marquee server itself (in its database) and never
sent anywhere else. Every client reads them from here.

- **`GET /users/{id}/avatar`** answers with the image itself: a 512×512 JPEG.
  `404` when the account has no photo, or when it isn't yours to see (a
  member only sees their own; the admin sees everyone's). The URL from
  `avatarUrl` carries `?v=`; under it the response is `Cache-Control:
  private, max-age=31536000, immutable`. There's an `ETag` too, so
  `If-None-Match` gets a `304`.
- **`PUT /users/{id}/avatar`**: the request body is the image file (JPEG,
  PNG, WebP, GIF or AVIF, at most 15 MB; send its own `Content-Type`). The
  server turns it upright from its EXIF orientation, crops a square around
  the most detailed area, re-encodes it as JPEG and drops all metadata (GPS
  position included). HEIC isn't read: convert it to JPEG on the device
  first. Response: `{ "ok": true, "avatarUrl": "/api/v1/users/…/avatar?v=…" }`.
  Errors: `400 invalid` "That file isn't a photo Marquee can read. Use a JPEG,
  PNG or WebP image." / "That photo is too big. Pick one under 15 MB." /
  "Choose a photo to upload.", `403` "You can only change your own photo.",
  `404` "Account not found.".
- **`DELETE /users/{id}/avatar`** removes it (fine if there's none):
  `{ "ok": true, "avatarUrl": null }`.

Website: "Add photo" / "Change photo" / "Remove" at the top of a member's
Edit form, saved as soon as a photo is picked (the form's Save isn't
involved).

### Linked accounts — user (your own account)

Website: "Linked accounts" on Settings → Account, shown when the admin has
Plex or Jellyfin connected (or the account is still linked to one). Each of
these answers the updated **`Me`** (as `GET /me`).

- **`POST /me/links/plex/start`** — no body. Same answer as
  `POST /auth/plex/start` (`{ handle, authUrl, expiresAt }`); the handle
  works only for this account's link, not for sign-in.
- **`POST /me/links/plex/poll`** — `{ "handle": "…" }`. `202 { "status":
  "pending" }` until approved on plex.tv, then `200` `Me`. `410 expired`,
  `403` "This Plex account doesn't have access to this server.", `409`
  "This Plex account is already linked to another Marquee account.".
- **`POST /me/links/jellyfin`** — `{ "username": "…", "password": "…" }`,
  checked with the admin's Jellyfin server (not stored). `200` `Me`. `401
  invalid_credentials` "Incorrect Jellyfin username or password", `409`
  "This Jellyfin account is already linked to another Marquee account.",
  `429` as `POST /auth/jellyfin`.
- **`DELETE /me/links/plex`**, **`DELETE /me/links/jellyfin`** — `200`
  `Me` (also when it wasn't linked). `409` "Set a password first — without
  Plex, there'd be no way to sign in to this account." when the account has
  no password and no other link.

Linking and unlinking never sign anything out. Removing a member removes
their links with them. Unlinking Plex also turns off the Plex Watchlist.

### `GET /me/plex-watchlist` — user (your own account)

"Request from my Plex Watchlist". Website: a card under "Linked accounts" on
Settings → Account, shown while Plex is linked.

```json
{
  "available": true,
  "enabled": true,
  "movies": true,
  "tv": false,
  "lastSyncedAt": "2026-09-25T18:40:05.000Z",
  "lastError": null,
  "requestedCount": 3
}
```

`available`: Plex is linked to this account, so it can be turned on.
`enabled`: it's on. Every 10 minutes (the `plex-watchlist` job) the server
reads the account's own Plex Watchlist — newest 100 titles — and requests
each movie/show not handled before, as this account, the way
`POST /titles/{type}/{tmdbId}/request` would (whole series for TV; the
member's auto-approve applies). A title waits while TMDb can't be reached.
Titles already owned, or that this account already requested (pending,
approved, or some of a show's seasons), are skipped. Each title is tried once, so one the admin declined isn't asked
for again, even after turning it off and on. At most 25 new titles per
check; the rest follow on the next. `movies` / `tv`: which kinds are
requested (both on by default). `lastSyncedAt`: last successful check,
null before the first. `lastError`: why the last check failed, or why it
switched itself off — e.g. "Plex stopped accepting Marquee's access to your
watchlist (for example after signing out of all devices). Turn it on again
to reconnect." (then `enabled` is false). `requestedCount`: titles requested
from the watchlist so far.

Turning it on stores this account's own Plex sign-in (encrypted) — reading a
watchlist needs its owner's token. It's deleted when turned off or when Plex
is unlinked.

- **`POST /me/plex-watchlist/start`** — no body. Same answer as
  `POST /auth/plex/start`; open `authUrl` in the browser. `409` "Link your
  Plex account first.".
- **`POST /me/plex-watchlist/poll`** — `{ "handle": "…" }`. `202 { "status":
  "pending" }` until approved on plex.tv, then `200` `PlexWatchlist` (the
  first check then runs in the background; `lastSyncedAt` fills in shortly).
  `410 expired`; `403` "That's a different Plex account from the one linked
  here. Sign in to plex.tv as that one."; `409` "Link your Plex account
  first.".
- **`PATCH /me/plex-watchlist`** — `{ "movies"?: bool, "tv"?: bool }` (at
  least one). `200` `PlexWatchlist`.
- **`POST /me/plex-watchlist/sync`** — "Check now": checks immediately and
  answers `PlexWatchlist` once done. `429` "Checked a moment ago. Try again
  in a minute." after 5 in 5 minutes.
- **`DELETE /me/plex-watchlist`** — turns it off and deletes the stored
  Plex sign-in. `200` `PlexWatchlist` (also when it was off).

### Import from Plex / Jellyfin — admin

Website: "Import from your media server" under "Add a household member",
with an "Import from Plex" / "Import from Jellyfin" button per connected
server, each opening a checklist.

#### `GET /users/import/{provider}` — admin

`provider` is `plex` or `jellyfin` (anything else `404`).

```json
{
  "results": [
    {
      "id": "1234567",
      "username": "anna.berg",
      "displayName": "Anna Berg",
      "thumb": "https://plex.tv/users/a1b2c3d4e5f6a7b8/avatar?c=1690000000",
      "alreadyMember": false
    },
    { "id": "3333", "username": "Kids", "displayName": null, "thumb": null, "alreadyMember": true }
  ]
}
```

Plex: the admin's Plex friends with one of the admin's servers shared with
them, and Plex Home users (the admin's own account isn't listed). Jellyfin:
every enabled user of the admin's Jellyfin server; `thumb` is then a URL on
that server (null without a picture), `id` its 32-hex user id.
`alreadyMember`: an account is already linked to them (website: "Already a
member", checkbox disabled). `username` is theirs on Plex/Jellyfin — the
Marquee username an import creates is that, made to fit the username rules
and unique. Errors: `409 conflict` "Connect Plex in Settings first." /
"Connect Jellyfin in Settings first.", `502 upstream` "Couldn't reach Plex.
Try again." / "Couldn't reach Jellyfin. Try again.", `403` "Only the admin
can add household members.".

#### `POST /users/import/{provider}` — admin

Body: `{ "ids": ["1234567", "2222"] }` (at most 200). Creates a member
account (no password — they sign in with Plex/Jellyfin) linked to each.

```json
{ "created": [ /* HouseholdMember */ ], "skipped": 1 }
```

`skipped` counts ids that aren't in a fresh listing any more or are already
members. Errors: `400 invalid` '"ids" must be a list of ids.' / "Choose at
least one person to import." / "Import at most 200 people at a time.", plus
the `GET` errors.

### `GET /settings/sign-in` · `PUT` — admin

```json
{ "mediaServerSignup": true }
```

"New accounts from Plex/Jellyfin sign-in" (default off): whether someone who
may use the admin's Plex/Jellyfin server but has no linked account gets a
member account on their first sign-in. `PUT` takes the same body
(`mediaServerSignup` required, boolean) and answers the saved value. `403`
"Only the admin can change sign-in settings.". Website: the checkbox under
the Import buttons.

---

## 12. Settings — Integrations (admin)

Every endpoint here is admin-only (`403` "Only the admin can manage
integrations."), except `POST /settings/integrations/sync`. Secrets (API keys,
tokens, webhook URLs of Discord/ntfy/generic webhook) are never returned —
only whether they're set.

### `GET /settings/integrations` — admin

Like the page, first re-syncs any library data older than 15 minutes, so it can
take a few seconds.

```json
{
  "plex": {
    "connected": true,
    "servers": [ { "name": "Basement", "lastSyncedAt": "2026-09-17T16:00:03.412Z" } ],
    "movieCount": 812, "tvCount": 143, "totalBytes": 9123456789012
  },
  "jellyfin": {
    "connected": false, "baseUrl": null, "hasApiKey": false,
    "servers": [], "movieCount": 0, "tvCount": 0, "totalBytes": 0
  },
  "sonarr": {
    "connected": true, "baseUrl": "http://192.168.1.10:8989", "hasApiKey": true,
    "rootFolderPath": "/tv", "qualityProfileId": 4, "fullyConfigured": true
  },
  "radarr": {
    "connected": false, "baseUrl": null, "hasApiKey": false,
    "rootFolderPath": null, "qualityProfileId": null, "fullyConfigured": false
  },
  "sonarr4k": {
    "connected": false, "baseUrl": null, "hasApiKey": false,
    "rootFolderPath": null, "qualityProfileId": null, "fullyConfigured": false
  },
  "radarr4k": {
    "connected": true, "baseUrl": "http://192.168.1.10:7879", "hasApiKey": true,
    "rootFolderPath": "/movies-4k", "qualityProfileId": 5, "fullyConfigured": true
  },
  "tmdb": { "connected": true, "savedInSettings": false, "configuredFromEnv": true },
  "trakt": { "connected": false },
  "tvdb": { "connected": true },
  "discord": { "connected": false },
  "ntfy": { "connected": false },
  "telegram": { "connected": true, "chatId": "-1001234567890" },
  "pushover": { "connected": false },
  "email": {
    "connected": true, "host": "smtp.gmail.com", "port": 587, "secure": false,
    "username": "me@gmail.com", "from": "me@gmail.com", "to": ["me@gmail.com", "partner@example.com"]
  },
  "genericWebhook": { "connected": false },
  "arrWebhooks": {
    "secret": "d8a989b4f0ad05fab2ab959bf0d5615adb0a25a9a3974674",
    "radarrUrl": "http://marquee.local:3000/api/webhooks/radarr/54caac33-…?secret=d8a989…",
    "sonarrUrl": "http://marquee.local:3000/api/webhooks/sonarr/54caac33-…?secret=d8a989…",
    "radarr4kUrl": "http://marquee.local:3000/api/webhooks/radarr4k/54caac33-…?secret=d8a989…",
    "sonarr4kUrl": "http://marquee.local:3000/api/webhooks/sonarr4k/54caac33-…?secret=d8a989…"
  }
}
```

`sonarr4k` / `radarr4k` (0.37+; an older server omits them): the optional 4K
Sonarr and Radarr — a second instance of each for 4K copies. Connected and
configured exactly like the main ones, at `/settings/integrations/sonarr4k`
and `/radarr4k` (PUT, DELETE, `…/options`, `…/defaults`, same bodies and
answers; error messages say "4K Sonarr" / "4K Radarr"). Once one is
`fullyConfigured`, members can request titles of that type in 4K, and
approving such a request adds it there. They aren't synced into the library:
"owned" everywhere still means the main library; a title's 4K status is read
live (`viewer.fourK` on the title). Their webhooks
(`arrWebhooks.radarr4kUrl` / `sonarr4kUrl`, the same secret) notify with
"(4K)" and tell 4K requesters their title is ready. Website: two cards after
Sonarr and Radarr, "4K Sonarr (optional)" and "4K Radarr (optional)", and
their webhook URLs under Notifications once connected.

Page sections: **Media Libraries** (Plex, Jellyfin), **Download Clients**
(Sonarr, Radarr), **Metadata Sources** (TMDb, Trakt, TheTVDB), **Notifications**
(Sonarr/Radarr webhooks, Discord, ntfy, Telegram, Pushover, email, generic
webhook).

`telegram`, `pushover`, `email` (0.36+; an older server omits them): each is
a household-wide relay like Discord and ntfy — every notification the admin
gets is also sent there. No token or password is ever returned; `telegram`
shows the chat it posts to and `email` everything but the SMTP password, so a
form can be prefilled.

- `tmdb.savedInSettings` = the page's "Connected" chip; `configuredFromEnv`
  without it = "Using environment variable"; `connected` = TMDb usable at all.
- `arrWebhooks` URLs are built from the request's `Host` and
  `X-Forwarded-Proto` — the address the Mac app used to reach the server. The
  website's instructions: paste into Radarr/Sonarr → Settings → Connect → Add →
  Webhook (method POST, trigger on Grab + Download).
- `fullyConfigured`: a root folder and quality profile are picked (required
  for adding titles).

### `POST /settings/integrations/sync` — user

"Sync now": re-syncs every integration the **caller** has connected (for a
member that's normally none — same as the web action). `{ "ok": true }`.
`502 upstream` "Some integrations failed to sync — check their connection."

### `POST /settings/integrations/webhook-secret` — admin

"Regenerate secret" — the old webhook URLs stop working immediately.

```json
{ "secret": "0f3c…", "radarrUrl": "http://…/api/webhooks/radarr/…?secret=0f3c…", "sonarrUrl": "http://…/api/webhooks/sonarr/…?secret=0f3c…", "radarr4kUrl": "http://…/api/webhooks/radarr4k/…?secret=0f3c…", "sonarr4kUrl": "http://…/api/webhooks/sonarr4k/…?secret=0f3c…" }
```

### Sonarr / Radarr

`{provider}` is `sonarr` or `radarr` (default ports 8989 / 7878).

#### `PUT /settings/integrations/{provider}` — admin

"Test & save". Body: `{ "baseUrl": "http://192.168.1.10:8989", "apiKey": "…" }`
(trailing slashes are trimmed). Saves the connection and resets the add
defaults to the first root folder and quality profile.

```json
{
  "ok": true,
  "baseUrl": "http://192.168.1.10:8989",
  "rootFolders": [ { "id": 1, "path": "/tv" } ],
  "qualityProfiles": [ { "id": 4, "name": "HD-1080p" } ],
  "selectedRootFolder": "/tv",
  "selectedQualityProfileId": 4
}
```

The website then shows "Defaults used when adding new titles:" (Root folder,
Quality profile, "Save defaults"). Errors: `400` "URL and API key are
required.", `502` "Couldn't connect. Check the URL and API key and try again.".

#### `GET /settings/integrations/{provider}/options` — admin

Root folders and quality profiles of the saved connection (to populate the
defaults pickers at any time).

```json
{ "rootFolders": [ { "id": 1, "path": "/tv" } ], "qualityProfiles": [ { "id": 4, "name": "HD-1080p" } ] }
```

Errors: `409` "Connect Sonarr in Settings first." / "Connect Radarr in Settings
first.", `502` "Couldn't reach Sonarr. Check its connection in Settings.".

#### `PUT /settings/integrations/{provider}/defaults` — admin

Body: `{ "rootFolderPath": "/tv", "qualityProfileId": 4 }`. `{ "ok": true }`.
Errors: `400` "Pick a root folder and a quality profile." / `"qualityProfileId" must be a number.`.

#### `DELETE /settings/integrations/{provider}` — admin

Disconnect: removes the connection and its cached tracked/monitored statuses.
`{ "ok": true }`. The website confirms first.

### Plex

#### `POST /settings/integrations/plex/pin` — admin

Starts Plex sign-in.

```json
{ "authUrl": "https://app.plex.tv/auth#?clientID=…&code=…&context%5Bdevice%5D%5Bproduct%5D=Marquee", "pinId": 123456789 }
```

Open `authUrl` in the browser, then poll the PIN. `502` "Couldn't start Plex sign-in. Try again."

#### `GET /settings/integrations/plex/pin/{pinId}` — admin

One poll. The website polls every 2.5 s and gives up after 2 minutes ("Timed
out waiting for Plex sign-in. Try again.").

```json
{ "connected": false, "movieCount": null, "tvCount": null }
```

The first `connected: true` response saves the token and runs a full first
library sync **before answering** (can take a while — use a long timeout):

```json
{ "connected": true, "movieCount": 812, "tvCount": 143 }
```

#### `DELETE /settings/integrations/plex` — admin

Disconnect Plex and delete its synced library. `{ "ok": true }`.

### Jellyfin

#### `PUT /settings/integrations/jellyfin` — admin

Body: `{ "baseUrl": "http://192.168.1.10:8096", "apiKey": "…" }`. `{ "ok": true }`.
Errors: `400` "URL and API key are required.", `502` "Couldn't connect. Check
the URL and API key and try again.".

#### `DELETE /settings/integrations/jellyfin` — admin

Disconnect and delete its synced library. `{ "ok": true }`.

### Instance-wide settings

Each is verified against the service before saving. `DELETE` removes the saved
value. All respond `{ "ok": true }`.

| Endpoint | PUT body | PUT errors (`400 invalid`) |
|---|---|---|
| `/settings/integrations/tmdb` | `{ "accessToken": "…" }` — v4 read access token or v3 API key | "Enter an access token.", "Couldn't verify this token with TMDb. Check it and try again." |
| `/settings/integrations/trakt` | `{ "clientId": "…" }` — from trakt.tv/oauth/applications | "Enter a Trakt client id.", "Couldn't verify this client id with Trakt. Check it and try again." |
| `/settings/integrations/tvdb` | `{ "apiKey": "…" }` | "Enter a TheTVDB API key.", "Couldn't verify this key with TheTVDB. Check it and try again." |
| `/settings/integrations/discord` | `{ "webhookUrl": "https://discord.com/api/webhooks/…" }` | "Enter a Discord webhook URL.", "That doesn't look like a Discord webhook URL.", "Couldn't post a test message to that webhook. Check it and try again." |
| `/settings/integrations/ntfy` | `{ "topicUrl": "https://ntfy.sh/my-topic" }` | "Enter your ntfy topic URL.", "Enter a full URL, e.g. https://ntfy.sh/your-topic-name.", "Couldn't post a test message to that topic. Check it and try again." |
| `/settings/integrations/webhook` | `{ "webhookUrl": "https://…" }` (generic JSON webhook) | "Enter a webhook URL.", "Enter a valid URL, starting with http:// or https://.", "Couldn't post a test request to that URL. Check it and try again." |
| `/settings/integrations/telegram` | `{ "botToken": "123456789:AA…", "chatId": "-1001234567890" }` — `botToken` may be left `""` to keep the saved one | "Enter your bot's token.", "That doesn't look like a bot token. …", "Enter the chat ID to send to.", "The chat ID is a number (groups and channels start with -100) or a channel's @name.", "Telegram didn't take the test message: chat not found" (Telegram's own reason) |
| `/settings/integrations/pushover` | `{ "appToken": "…", "userKey": "…" }` — both 30 characters; `appToken` may be `""` to keep the saved one | "The application token is the 30-character code …", "The user key is the 30-character code …", "Pushover didn't take the test message: user identifier is not a valid user, group, or subscribed user key" (Pushover's own reason) |
| `/settings/integrations/email` | `{ "host": "smtp.gmail.com", "port": 587, "secure": false, "username": "me@gmail.com", "password": "…", "from": "me@gmail.com", "to": ["me@gmail.com"] }` — `secure`: TLS from the start (usually 465), otherwise STARTTLS when offered; `username`/`password` both or neither; `password` may be `""` to keep the saved one when `host` and `username` are unchanged; `to` may also be one comma-separated string, at most 20 | "Enter the SMTP server's host name, like smtp.gmail.com.", "Enter the SMTP port, like 587.", "Enter both the SMTP username and password, or neither.", "Enter the address the emails come from.", "Enter at least one address to send to.", "\"bob\" isn't an email address.", "The test email didn't go through: 535 5.7.8 Username and Password not accepted…" (the server's own answer) |

Deleting the TMDb token falls back to `TMDB_ACCESS_TOKEN`/`TMDB_API_KEY` from
the server environment, if set.

#### `POST /settings/integrations/trakt/import` — admin

Imports a public Trakt list or watchlist as pending requests from the admin,
skipping titles already in the library or already requested.

Body: `{ "url": "https://trakt.tv/users/username/lists/best-of-2024" }` (or
`…/users/username/watchlist`).

```json
{ "ok": true, "importedCount": 12, "skippedCount": 3 }
```

Website text: "Imported 12 titles (3 skipped — already owned or requested)."
Errors: `400` "That doesn't look like a Trakt list or watchlist URL.", `409`
"Connect Trakt in Settings first.", `502` "Couldn't fetch that list from Trakt —
check the URL and that it's set to public.", `403` "Only the admin can import from Trakt.".

---

## 13. Settings — Jobs (admin)

### `GET /settings/jobs` — admin

```json
{
  "results": [
    { "id": "plex-sync", "name": "Plex Library Sync", "schedule": "Every hour", "description": "Pulls the latest library state from every connected Plex server." },
    { "id": "jellyfin-sync", "name": "Jellyfin Library Sync", "schedule": "Every hour", "description": "Pulls the latest library state from every connected Jellyfin server." },
    { "id": "arr-sync", "name": "Sonarr/Radarr Sync", "schedule": "Every hour", "description": "Refreshes tracked/monitored status from every connected Sonarr and Radarr instance." },
    { "id": "plex-watchlist", "name": "Plex Watchlist Requests", "schedule": "Every 10 minutes", "description": "Requests the new movies and shows on the Plex Watchlist of everyone who turned it on, like pressing Request for each." },
    { "id": "disk-space-snapshot", "name": "Disk Space Snapshot", "schedule": "Daily at 3:00 AM", "description": "Records free/used disk space for the storage forecast shown elsewhere in the app." },
    { "id": "cleanup", "name": "Database Cleanup", "schedule": "Daily at 3:30 AM", "description": "Clears out old notifications and activity, year-old disk snapshots, and expired app sign-ins so the database doesn't grow forever." }
  ]
}
```

`403` "Only the admin can run jobs." for members.

### `POST /settings/jobs/{id}/run` — admin

"Run now" — waits until the job finishes (use a long timeout); the schedule is
unaffected. `{ "ok": true }`. Errors: `404` "Unknown job.", `500 internal`
"Job failed — check the server logs.".

---

## 14. Settings — About & Changelog

### `GET /settings/about` — user

```json
{
  "version": "0.22.0",
  "movieCount": 812,
  "tvCount": 143,
  "trackedCount": 37,
  "totalRequests": 58,
  "timeZone": "America/New_York",
  "repoUrl": "https://github.com/TimmyAmant/marquee",
  "issuesUrl": "https://github.com/TimmyAmant/marquee/issues"
}
```

Website rows: Version (`v0.22.0`), Movies, TV Shows, Tracked (not yet owned),
Total Requests, Time Zone; "Getting Support": Changelog, Error reference,
GitHub, Report an issue. Counts are the household library (owned titles;
`trackedCount` = tracked but not owned).

### `GET /changelog` — user

The Releases page, newest first.

```json
{
  "results": [
    { "version": "0.22.0", "date": "2026-09-17", "changes": ["Added a versioned JSON API at /api/v1 …"] }
  ]
}
```

---

## 15. Help

### `GET /help/errors` — user

The Error reference page: every user-facing error message, what it means and
what to do, grouped by area.

```json
{
  "results": [
    {
      "title": "Adding titles to Sonarr / Radarr",
      "entries": [
        {
          "message": "Connect Sonarr in Settings first.",
          "meaning": "No Sonarr connection is saved, or it's missing a root folder / quality profile.",
          "whatToDo": "Go to Settings → Integrations and finish the Sonarr setup (URL, API key, then pick defaults)."
        }
      ]
    }
  ]
}
```

---

## Endpoint index

| Group | Method & path | Auth |
|---|---|---|
| Discovery & Auth | `GET /server-info` | public |
| | `POST /auth/login` | public |
| | `POST /auth/setup` | public |
| | `POST /auth/plex/start` | public |
| | `POST /auth/plex/poll` | public |
| | `POST /auth/jellyfin` | public |
| | `POST /auth/logout` | user |
| | `GET /me` | user |
| | `GET /badges` | user |
| Discover / Browse / Search | `GET /discover` | user |
| | `GET /movies` | user |
| | `GET /movies/extras` | user |
| | `GET /series` | user |
| | `GET /series/extras` | user |
| | `POST /surprise` | user |
| | `GET /search` | user |
| | `GET /search/suggest` | user |
| Title | `GET /titles/{type}/{tmdbId}` | user |
| | `GET /titles/tv/{tmdbId}/seasons/{season}` | user |
| Library status & Sonarr/Radarr | `GET /titles/{type}/{tmdbId}/status` | user |
| | `POST /titles/{type}/{tmdbId}/add` | user (admin enforced) |
| | `POST /titles/{type}/{tmdbId}/search` | admin |
| | `PUT /titles/{type}/{tmdbId}/monitored` | admin |
| | `POST /titles/{type}/{tmdbId}/relink` | admin |
| Person / Company | `GET /people/{tmdbId}` | user |
| | `GET /companies/{tmdbId}` | user |
| Favorites | `GET /favorites` | user |
| | `GET /favorites/{entityType}/{tmdbId}` | user |
| | `PUT /favorites/{entityType}/{tmdbId}` | user |
| | `DELETE /favorites/{entityType}/{tmdbId}` | user |
| | `POST /favorites/{entityType}/{tmdbId}/toggle` | user |
| Requests | `POST /titles/{type}/{tmdbId}/request` | user |
| | `GET /requests/mine` | user |
| | `GET /requests/pending` | admin |
| | `GET /requests/history` | admin |
| | `GET /requests/pending-count` | user |
| | `POST /requests/{id}/approve` | admin |
| | `POST /requests/{id}/manual-approve` | admin |
| | `POST /requests/{id}/reject` | admin |
| | `POST /requests/approve-all` | admin |
| Problem reports | `POST /titles/{type}/{tmdbId}/issues` | user |
| | `GET /issues` | user |
| | `POST /issues/{id}/resolve` | admin |
| | `POST /issues/{id}/search` | admin |
| | `DELETE /issues/{id}` | user (own, open) / admin |
| Notifications | `GET /notifications` | user |
| | `GET /notifications/unread-count` | user |
| | `POST /notifications/read-all` | user |
| | `POST /notifications/{id}/read` | user |
| | `GET /notifications/stream` | user |
| Calendar | `GET /calendar` | user |
| Activity | `GET /settings/activity` | admin |
| Settings: Account | `GET /users` | user |
| | `POST /users` | admin |
| | `PATCH /users/{id}` | user (self) / admin |
| | `DELETE /users/{id}` | admin |
| | `GET /users/{id}/avatar` · `PUT` · `DELETE` | user (self) / admin |
| | `POST /me/links/plex/start` | user |
| | `POST /me/links/plex/poll` | user |
| | `DELETE /me/links/plex` | user |
| | `POST /me/links/jellyfin` · `DELETE` | user |
| | `GET /users/import/{provider}` · `POST` | admin |
| | `GET /settings/sign-in` · `PUT` | admin |
| Settings: Integrations | `GET /settings/integrations` | admin |
| | `POST /settings/integrations/sync` | user |
| | `POST /settings/integrations/webhook-secret` | admin |
| | `PUT /settings/integrations/sonarr` · `DELETE` | admin |
| | `GET /settings/integrations/sonarr/options` | admin |
| | `PUT /settings/integrations/sonarr/defaults` | admin |
| | `PUT /settings/integrations/sonarr4k` · `DELETE`, `…/options`, `…/defaults` | admin |
| | `PUT /settings/integrations/radarr4k` · `DELETE`, `…/options`, `…/defaults` | admin |
| | `PUT /settings/integrations/radarr` · `DELETE` | admin |
| | `GET /settings/integrations/radarr/options` | admin |
| | `PUT /settings/integrations/radarr/defaults` | admin |
| | `POST /settings/integrations/plex/pin` | admin |
| | `GET /settings/integrations/plex/pin/{pinId}` | admin |
| | `DELETE /settings/integrations/plex` | admin |
| | `PUT /settings/integrations/jellyfin` · `DELETE` | admin |
| | `PUT /settings/integrations/tmdb` · `DELETE` | admin |
| | `PUT /settings/integrations/trakt` · `DELETE` | admin |
| | `POST /settings/integrations/trakt/import` | admin |
| | `PUT /settings/integrations/tvdb` · `DELETE` | admin |
| | `PUT /settings/integrations/discord` · `DELETE` | admin |
| | `PUT /settings/integrations/ntfy` · `DELETE` | admin |
| | `PUT /settings/integrations/webhook` · `DELETE` | admin |
| | `PUT /settings/integrations/telegram` · `DELETE` | admin |
| | `PUT /settings/integrations/pushover` · `DELETE` | admin |
| | `PUT /settings/integrations/email` · `DELETE` | admin |
| Settings: Jobs | `GET /settings/jobs` | admin |
| | `POST /settings/jobs/{id}/run` | admin |
| Settings: About & Changelog | `GET /settings/about` | user |
| | `GET /changelog` | user |
| Help | `GET /help/errors` | user |

## Not exposed (and why)

- **Theme (light/dark)** — a per-browser preference stored in `localStorage`; nothing server-side.
- **`/api/webhooks/{provider}/{userId}`** — inbound Sonarr/Radarr webhooks, not a client API (their URLs are in `GET /settings/integrations`).
- **Disk-space summary/forecast** — computed in `lib/integrations/disk-space.ts` but not shown on any page; only the daily snapshot job is exposed (`POST /settings/jobs/disk-space-snapshot/run`).
- **Device/token management** — the website has no UI for it; `POST /auth/logout` revokes the current token and a password change revokes all of an account's tokens.
