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
11. **Any number of Sonarr / Radarr servers (0.43+, additive).** New
    `/settings/arr-servers` endpoints manage them; `GET /settings/integrations`
    gains `arrServers`. The fixed `sonarr` / `radarr` / `sonarr4k` /
    `radarr4k` objects and endpoints keep working and now describe **the
    default server** of each kind (standard or 4K). `POST /requests/{id}/approve`
    and `POST /titles/{type}/{tmdbId}/add` take optional overrides (server,
    quality profile, root folder, tags, series type), and the new
    `GET /titles/{type}/{tmdbId}/add-options` lists what can be picked. A
    server older than this answers `404 not_found` on the new endpoints —
    hide the "Advanced" options and the server list there.
12. **Single sign-on and Jellyfin Quick Connect (0.44+, additive).**
    `GET /server-info`'s `signIn` gains `sso` (`{ name, signup }` or null)
    and `quickConnect`; `linked` (on `/me` and `HouseholdMember`) gains
    `sso`. New public `POST /auth/sso/start` + `POST /auth/sso/poll` and
    `POST /auth/jellyfin/quick-connect/start` + `…/poll` answer like the Plex
    PIN flow; new `/me/links/sso/*` and admin `/settings/sso`. A server
    older than this has neither field — treat missing as null/false and
    don't offer the buttons.
13. **"Request all N missing" for household members (additive).** The title
    detail's `franchise` gains `requestAllMissing`, and the new
    `POST /titles/{type}/{tmdbId}/request-all-missing` requests them all in
    one go. A server older than this leaves the field out — treat missing as
    an empty list and don't show the button.
14. **Personal notifications (0.45.0+, additive).** Every account can add its
    own channels (`/me/notification-channels`) and choose which events reach
    the bell, device push and each channel (`/me/notification-preferences`);
    the admin picks what the household channels post
    (`/settings/notification-events`). `NotificationItem` gains `alert`:
    false means the account turned device push off for that kind, so an app
    shows no banner (it's still in the bell). A server older than this
    answers `404 not_found` on the new endpoints and sends no `alert` —
    treat missing as true and hide the new screens.
15. **"Can't find" (0.46+, additive).** An approved, released request
    Sonarr/Radarr still has nothing for (no file, nothing downloading) a
    while after approval is flagged: `GET /requests/not-found` lists them
    for reviewers, with `POST /requests/{id}/not-found/search` ("Search
    again") and `…/not-found/dismiss` ("Mark as found"). `notFoundSince`
    appears on `/requests/history` rows and the title's `viewer` (reviewers
    only), `GET /badges` gains `notFoundRequests`, notifications gain the
    `request_not_found` event type, and the preferences gain the
    `request_not_found` and `request_still_looking` events. The wait is
    `GET`/`PUT /settings/not-found`. A server older than this sends none
    of these fields — treat missing as null/0 — and answers `404` on the
    new endpoints: hide the section.
16. **Request lifecycle and conversations (0.46+, additive).** A member can
    change (`PATCH /requests/{id}`) or cancel (`DELETE /requests/{id}`) their
    own request while it's pending; reviewers can change anyone's before
    approving (`GET /requests/{id}/edit-options` feeds the season picker).
    Requests and problem reports have a comment thread
    (`/requests/{id}/comments`, `/issues/{id}/comments`) between the
    requester or reporter and the reviewers, with the `request_comment` and
    `issue_comment` notification types. An approval Sonarr/Radarr couldn't
    be reached for now stays approved under "Couldn't add" (`addFailed` on
    `/requests/history`, `failedRequests` on `/badges`) with
    `POST /requests/{id}/retry`. New fields: `canEdit`, `canCancel`,
    `editedAt`, `commentCount` on request DTOs, `commentCount` on `Issue`,
    `requestId`/`issueId` on `NotificationItem`, `viewer.myRequests` on the
    title. A server older than this leaves them out — treat missing as
    false/0/null/empty — and answers `404` on the new endpoints: hide
    Edit, Cancel, Retry and the comments.

---

## Conventions (recap)

- Base: `{server}/api/v1`. JSON bodies, `Content-Type: application/json`, camelCase keys.
- Auth: `Authorization: Bearer mqt_<43 base64url chars>` on everything except
  `server-info`, `auth/login`, `auth/setup`, `auth/plex/start`,
  `auth/plex/poll`, `auth/jellyfin`, `auth/jellyfin/quick-connect/start`,
  `auth/jellyfin/quick-connect/poll`, `auth/sso/start` and `auth/sso/poll`.
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
| 410 | `expired` | Plex, SSO or Quick Connect sign-in/link poll with a handle that's used, unknown or older than 10 minutes — start again |
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
  "signIn": {
    "password": true,
    "plex": true,
    "jellyfin": true,
    "jellyfinName": "Jellyfin",
    "signup": true,
    "quickConnect": true,
    "sso": { "name": "Authentik", "signup": false }
  }
}
```

`signIn` says which sign-in buttons to show: `plex` / `jellyfin` are true
while the admin has that server connected in Settings → Integrations (Plex
also needs its first library sync done). Missing on older servers — show
password sign-in only.

`jellyfinName` (0.40+; treat missing as "Jellyfin"): what to call the
"jellyfin" server. Emby speaks the same API, so the Jellyfin integration
works with an Emby server as it is; once the first sync has seen it, this
is `"Emby"`. Label everything about that server with it — the sign-in
button ("Sign in with Emby"), its username/password fields, Linked accounts,
"Import from Emby", member tags. The server's own messages already use it
("Incorrect Emby username or password").

`signup` (0.42.2+; treat missing as false): the admin has "New accounts from
Plex/Jellyfin sign-in" on (`GET /settings/sign-in`) and at least one of
`plex` / `jellyfin` is true — signing in with it makes a member account for
anyone with access to the admin's server. Tell newcomers on the sign-in
screen, under the Plex/Jellyfin buttons, naming only the methods offered
(e.g. "New here? Use Sign in with Plex — your account is made for you.").
False: say nothing; someone without an account gets `403` "There's no
Marquee account for this Plex account yet. Ask the admin to add you.".

`quickConnect` (0.44+; treat missing as false): `jellyfin` is on and the
server is Jellyfin (Emby has no Quick Connect) — offer "Use Quick Connect"
on the Jellyfin sign-in (see `POST /auth/jellyfin/quick-connect/start`).
Whether Jellyfin has it switched on is only known when it's started (`409`).

`sso` (0.44+; treat missing as null): single sign-on is set up — show a
"Sign in with {name}" button (see "Sign in with single sign-on" below).
`sso.signup`: new accounts from SSO sign-in are on; mention it in the
newcomer line like `signup` (e.g. "New here? Use Sign in with Authentik —
your account is made for you.").

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
then it's `403` "There's no Marquee account for this Plex account yet. Ask the
admin to add you." (with "Jellyfin"/"Emby" for those). Accounts are matched only
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
- **`403 forbidden`** "This Plex account doesn't have access to this server." or "There's no Marquee account for this Plex account yet. Ask the admin to add you.".
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
forbidden` "There's no Marquee account for this Jellyfin account yet. Ask
the admin to add you.", `409 conflict` "Jellyfin
sign-in isn't set up on this server.", `502 upstream` "Couldn't reach
Jellyfin. Try again.", `429 rate_limited` — the same limits as `POST
/auth/login`, in buckets of their own.

```bash
curl -s -X POST "$SERVER/api/v1/auth/jellyfin" -H 'Content-Type: application/json' \
  -d '{"username":"anna","password":"…","deviceName":"Anna’s PC"}'
```

#### `POST /auth/jellyfin/quick-connect/start` — public (0.44+)

Jellyfin's Quick Connect (Jellyfin 10.8+; never Emby): sign in without
typing a password, by approving a code in a Jellyfin app you're already
signed in to. Offered when `signIn.quickConnect`. No body.

```json
{
  "handle": "Qc7Lm…43 chars…",
  "code": "482915",
  "expiresAt": "2026-09-25T17:40:00.000Z"
}
```

Show `code` large ("In a Jellyfin app you're signed in to, open your profile
→ Quick Connect and enter this code"), then poll with `handle` every 2 s
until `expiresAt`. The Quick Connect secret stays on the server. Errors:
`409 conflict` "Jellyfin sign-in isn't set up on this server." / "Emby
doesn't have Quick Connect." / "Quick Connect is turned off on this Jellyfin
server. The admin can turn it on in Jellyfin's Dashboard → General.", `502
upstream` "Couldn't reach Jellyfin. Try again.", `429 rate_limited` (same
limits as `POST /auth/plex/start`).

#### `POST /auth/jellyfin/quick-connect/poll` — public (0.44+)

`{ "handle": "…", "deviceName": "…" }` (`deviceName` optional). Exactly like
`POST /auth/plex/poll`: `202 { "status": "pending" }` until approved; then
`200` with the body of `POST /auth/login`, once; `410 expired` "That Quick
Connect code expired. Try again."; `403 forbidden` "There's no Marquee
account for this Jellyfin account yet. Ask the admin to add you." (new
accounts off) or "Jellyfin didn't accept that Quick Connect code. Try
again.". Who it signs in as is decided exactly like `POST /auth/jellyfin`
(the linked account, or a new member when allowed).

### Sign in with single sign-on — public (0.44+)

The admin's own OpenID Connect identity provider (Authentik, Authelia,
Pocket ID, Keycloak, Google…), set up in Settings → Integrations (`GET
/settings/sso`). Offered when `signIn.sso` isn't null; label the button
"Sign in with {sso.name}". The app never sees the provider's tokens or the
client secret: the browser does the provider's sign-in, the server checks
it, and the app polls for a Marquee token — like Plex.

Who may sign in, in order: nobody outside the admin's "required group" (when
one is set); the account linked to that identity (issuer + subject); with
"match by verified email" on, the one non-admin account whose username is
the identity's email, only when the provider marks it verified; a new member
account when "New accounts from single sign-on" is on; otherwise `403`.
Members in the admin's "trusted group" become `trusted` on sign-in; nobody is
ever made admin this way.

#### `POST /auth/sso/start` — public

`{ "deviceName": "…" }` (optional — shown on the page the browser opens).

```json
{
  "handle": "pX2vR…43 chars…",
  "authUrl": "https://marquee.example.com/login/sso/app?key=Hc9…43 chars…",
  "expiresAt": "2026-09-25T17:40:00.000Z"
}
```

Open `authUrl` in the default browser — only if it's `https`, or on the
server's own origin (it's always Marquee's own "Continue with {name}?" page,
at the address the admin set as Marquee's; it goes on to the identity
provider when the person continues). Then poll with `handle` every 2 s until
`expiresAt` (10 minutes); keep it to yourself. Errors: `409 conflict`
"Single sign-on isn't set up on this server.", `502 upstream` "Couldn't
reach {name}. Try again.", `429 rate_limited` (30 per client address per 10
minutes).

#### `POST /auth/sso/poll` — public

`{ "handle": "…", "deviceName": "…" }` (`deviceName` optional; defaults to
the one given to `start`).

- **`202`** `{ "status": "pending" }` — not finished in the browser yet.
- **`200`** — signed in; the body of `POST /auth/login`. The handle is used up.
- **`410 expired`** "That sign-in expired. Try again."
- **`403 forbidden`** "Your {name} account isn't allowed to use Marquee. Ask the admin to add you to the right group." / "There's no Marquee account for this {name} account yet. Ask the admin to add you." / "{name} sign-in was cancelled.".
- `502 upstream` "Couldn't finish signing in with {name}. Try again, or ask the admin to check the server log." (the provider refused the code or the ID token didn't check out), `429 rate_limited`.

The browser tab ends on a Marquee page saying "You're signed in — go back to
the Marquee app" (or why not).

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
  "linked": { "plex": true, "jellyfin": false, "sso": false },
  "hasPassword": true,
  "requestLimits": { "movie": null, "tv": null }
}
```

`requestLimits` (0.39+; an older server omits it): the account's request
limits, each null when that type isn't limited (always for the admin and
trusted members). Otherwise `{ "limit": 5, "days": 7, "used": 5,
"remaining": 0, "nextSlotAt": "2026-10-03T02:53:36.305Z" }` — `nextSlotAt`
(while none is left) is when the oldest counted request ages out. Every
request that wasn't declined counts, 4K and Watchlist ones included. The
website shows members a line above their requests: "Movies: 3 of 5
requests left (every 7 days)" or "Movies: none left — more in 3 days".

`linked` says which media-server accounts (and, 0.44+, single sign-on —
treat a missing `sso` as false) this account signs in with (see "Linked
accounts" in section 11). `hasPassword` is false for an account made
by Plex/Jellyfin sign-in or import that hasn't set a password yet — it can
set one with `PATCH /users/{id}` without `currentPassword`.

Use `role` to decide which admin UI to show (Integrations/Activity/Jobs
settings tabs, request review, Add buttons). The role is re-read on every
request, so a demotion takes effect immediately (`403`s).

`role` is `admin`, `member`, or (0.39+) `trusted`: a member who also works
the review queue — `/requests/pending`, `/pending-count`, `/history`,
approve / reject / approve-all (not manual-approve, which promises the admin
adds it by hand), and problem reports (`GET
/issues` shows them everything, resolve, search again, remove). Approving
adds the title with the admin's Sonarr/Radarr. Their own requests are
approved straight away and they have no request limits. Everything else
(settings, integrations, accounts, Add buttons) stays admin-only. Treat an
unknown role like `member`.

### `GET /badges` — user

The header counters in one call, suitable for polling (website: bell every
30 s, requests badge every 20 s).

```json
{ "unreadNotifications": 2, "pendingRequests": 1, "openIssues": 1, "notFoundRequests": 1, "failedRequests": 0 }
```

`pendingRequests` is always `0` for members (as on the website).
`openIssues` (0.38+; an older server omits it): open problem reports, also
`0` for members. `notFoundRequests` (0.46+; an older server omits it):
requests listed under "Can't find", `0` for members. `failedRequests`
(0.46+; an older server omits it): approved requests listed under "Couldn't
add", `0` for members. The website's Requests badge shows `pendingRequests +
openIssues + notFoundRequests + failedRequests`, since all of them wait on
that page.

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
  "popularMovies": [ /* TitleCard ×20 */ ],
  "movieGenres": [ { "id": 28, "name": "Action", "backdropPath": "/qeQJ.jpg" } ],
  "upcomingMovies": [ /* TitleCard, release date today or later */ ],
  "studios": [ { "tmdbId": 2, "name": "Walt Disney Pictures", "logoPath": "/wdrC.png", "favorited": null } ],
  "popularSeries": [ /* TitleCard ×20 */ ],
  "seriesGenres": [ { "id": 10759, "name": "Action & Adventure", "backdropPath": "/…jpg" } ],
  "upcomingSeries": [ /* TitleCard */ ],
  "networks": [ { "tmdbId": 213, "name": "Netflix", "logoPath": "/wwem.png" } ],
  "seeAll": {
    "recentlyAdded": { "type": "list", "list": "recently-added", "mediaType": null },
    "trending": { "type": "list", "list": "trending", "mediaType": null },
    "popularMovies": { "type": "browse", "list": null, "mediaType": "movie" },
    "movieGenres": { "type": "browse", "list": null, "mediaType": "movie" },
    "upcomingMovies": { "type": "list", "list": "upcoming-movies", "mediaType": null },
    "studios": { "type": "browse", "list": null, "mediaType": "movie" },
    "popularSeries": { "type": "browse", "list": null, "mediaType": "tv" },
    "seriesGenres": { "type": "browse", "list": null, "mediaType": "tv" },
    "upcomingSeries": { "type": "list", "list": "upcoming-series", "mediaType": null },
    "networks": { "type": "browse", "list": null, "mediaType": "tv" }
  }
}
```

`seeAll` (0.42.4+; an older server omits it, and then only Popular Movies/Series
and the genre shelves have a "See all", to the Movies/Series grid): where each
shelf's "See all" chevron goes, keyed like the shelves. Every shelf has one.
`type: "list"` → `GET /discover/lists/{list}` (the website's
`/discover/{list}`); `type: "browse"` → the unfiltered Movies (`mediaType:
"movie"`) or Series (`"tv"`) grid, `GET /movies` / `GET /series`. Treat an
unknown `type` or `list` as no "See all".

### `GET /discover/lists/{list}` — user

0.42.4+. A Discover shelf's full list, paged (the website's `/discover/{list}`,
infinite scroll). `list` is one of `recently-added`, `trending`,
`upcoming-movies`, `upcoming-series` (anything else: `404 not_found`).

| Query | Type | Default | |
|---|---|---|---|
| `page` | int ≥ 1 | 1 | at most 250 (25 for `recently-added`) |

`trending` and the two `upcoming-*` lists need TMDb (`502 upstream`
otherwise) and are 2 TMDb pages per page, de-duplicated; `upcoming-movies`
drops re-releases whose release date has passed, so its pages can run short.
`recently-added` is the library's newest Plex/Jellyfin titles, 40 per page;
its `totalPages` / `totalResults` only look one page ahead (it is empty
without a connected media server). Continue while `page < totalPages`, skip
titles already shown, as on the Movies grid. Cards carry `status`,
`favorited` and `canQuickAdd`; `trending` and `recently-added` mix movies and
series.

```json
{
  "list": "trending",
  "title": "Trending",
  "page": 1,
  "totalPages": 250,
  "totalResults": 1000,
  "results": [
    { "mediaType": "tv", "tmdbId": 299939, "name": "Monster: The Lizzie Borden Story", "posterPath": "/57XS.jpg", "year": "2026",
      "subtitle": null, "overview": null, "rating": null, "status": null, "favorited": false, "requested": null, "canQuickAdd": true, "canRequest": false }
  ]
}
```

Errors: `400 invalid` (bad `page`), `404 not_found` (unknown list).

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
    { "id": 603, "mediaType": "movie", "name": "The Matrix", "posterPath": "/aOIu.jpg", "subtitle": "1999", "status": "owned" },
    { "id": 6384, "mediaType": "person", "name": "Keanu Reeves", "posterPath": "/8RZL.jpg", "subtitle": "Acting" },
    { "id": 604, "mediaType": "movie", "name": "The Matrix Reloaded", "posterPath": "/9TGH.jpg", "subtitle": "2003", "status": "tracked_downloading" },
    { "id": 624860, "mediaType": "movie", "name": "The Matrix Resurrections", "posterPath": "/8c4a.jpg", "subtitle": "2021", "status": "untracked" }
  ]
}
```

`subtitle` is the year for titles and the known-for department for people.
Website labels: person → "Actor", movie → "Movie", tv → "TV".

`status` (movies and series only; absent for people) is the
viewer's library status — the same `LibraryStatus` values as elsewhere
(`owned`, `tracked_downloading`, `tracked_monitored`, `coming_soon`,
`untracked`), from the locally synced Sonarr/Radarr/Plex/Jellyfin state, never
a live Sonarr/Radarr call. Treat it as an open set, and a missing field (an
older server) as unknown. The website tints the Movie/TV pill with it: green
in the library, blue downloading, red missing, purple coming soon, grey
otherwise. Active requests aren't reflected here (search result cards don't
show them either).

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
    "openReports": 0,
    "blocked": null,
    "notFoundSince": null,
    "myRequests": []
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
    "addAllMissing": [ { "mediaType": "movie", "tmdbId": 604 } ],
    "requestAllMissing": []
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
  add each with `POST /titles/{type}/{id}/add`. `requestAllMissing` is a
  household member's "Request all N missing" set (plain and trusted members;
  always empty for the admin): the franchise titles that show a Request
  button — not tracked or owned, not already requested by you, not on the
  blocklist. Show "Request all N missing" when it isn't empty, confirm
  ("Request all N missing titles?"), then
  `POST /titles/{type}/{tmdbId}/request-all-missing` and reload the page.
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

### Share a title (0.45.1+)

"Share" on a title page: send it to someone else in the household, who gets
a `title_shared` notification (bell, Web Push, the apps' live stream) that
opens the title, or share a link outside Marquee. Every member can share
with every other one — not only the admin.

#### `POST /titles/{type}/{tmdbId}/share` — user

```json
{ "userIds": ["83c55a49-6153-4cb9-ae22-4a42d48f4cf3"], "note": "You'd love this one" }
```

`userIds`: one to 20 account ids from `GET /users/shareable` (repeats are
dropped). `note`: optional, plain text, up to 280 characters; tags
(`<b>`) and invisible characters are removed and line breaks become spaces,
so what arrives is one line (blank → no note). Answers
`{ "ok": true, "sharedWith": 1 }`.

Each recipient's notification reads `Susan shared “Ice Age” with you` (then
`: <note>` when there is one), with `sharedBy` and `note` set (see
Notifications). It isn't relayed to the household channels (Discord, ntfy,
Telegram, Pushover, email, the webhook): it's personal. It follows the
recipient's `title_shared` preference (`/me/notification-preferences`): in
the bell and pushed to devices unless they turned that off, and on their own
channels only if they turned it on.

Errors: `400 invalid` "Pick who to share it with." (missing, empty or not
account ids) / "You can't share with yourself." / "Share with at most 20
people at a time." / "Keep the note under 280 characters." / "The note has
to be text.", `404 not_found` "Someone you picked isn't in this household
any more." (an id that isn't an account), `429 rate_limited` "That's a lot
of sharing in a short time. Try again in a while." (30 an hour per person,
counting each recipient: a share to three people is three), `502 upstream`
(TMDb unreachable).

#### `GET /users/shareable` — user

Who a share can go to: every account but your own, by name (case-insensitive).
Any member may list these names for this; `GET /users` still shows a member
only their own account.

```json
{
  "results": [
    {
      "userId": "83c55a49-6153-4cb9-ae22-4a42d48f4cf3",
      "displayName": "Kid",
      "username": "member1",
      "label": "Kid",
      "avatarUrl": null
    }
  ],
  "publicUrl": "https://marquee.example.com"
}
```

A `RequestPerson` plus `avatarUrl` (as on `HouseholdMember`) — the same shape
as a notification's `sharedBy`. `publicUrl`: the address set as Marquee's
public one (Settings › Integrations › Single sign-on's "Public address"), with
no trailing slash; null when none is set — then build links on the address
the app is connected to.

**Sharing outside the household.** A Marquee link is
`{publicUrl}/title/{type}/{tmdbId}` (people need to sign in to open it); for
someone without an account offer the public pages instead,
`https://www.themoviedb.org/{type}/{tmdbId}` and, when the title has an
`imdbId`, `https://www.imdb.com/title/{imdbId}/`.

Website: a "Share" outline pill in the hero's action row (signed in) opens a
dialog "Share “Ice Age”": **Send to someone in the household** — each other
member with their photo and a checkbox, "Add a note (optional)" (280
characters, with a count once it's close), and "Send"; afterwards "Sent to
Kid." (or "Sent to 3 people."); "No one else has an account here yet." when
alone. **Share a link** — which link ("Marquee — they'll need to sign in",
"TMDb — anyone can open it", "IMDb" when there is one), then "Share…" where
the browser has Web Share (the phone's share sheet: Messages, Messenger,
WhatsApp, Mail…), or else "Copy link" with "Text message", "Email",
"WhatsApp" and, on touch devices, "Messenger". A person's page has the same
button with just the link part (Marquee or TMDb).

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
    "openReports": 0,
    "blocked": { "reason": "Already on Max.", "keyword": null },
    "notFoundSince": "2026-09-18T18:20:00.412Z"
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

0.43+: the body can also carry the same **add overrides** as approving a
request (`serverId`, `qualityProfileId`, `rootFolderPath`, `tags`,
`seriesType` — see `POST /requests/{id}/approve`); omitted fields use the
server's defaults. Without `serverId` the title goes to the default server
(the default 4K one with `is4k`). Errors name the server ("Couldn't add this
movie to Radarr 2.").

### `GET /titles/{type}/{tmdbId}/add-options` — admin or trusted member (0.43+)

What the "Advanced" section of Approve (and the admin's Add) offers: every
Sonarr (TV) or Radarr (movies) server that could take the title, default
first, each with its quality profiles, root folders and tags, and the values
it would use if nothing is changed. Query: `is4k=true` lists the 4K servers
instead (a 4K request can only go to a 4K server, a regular one only to a
regular one). `403` "Only an admin can approve requests." for members.

```json
{
  "mediaType": "tv",
  "tmdbId": 95396,
  "is4k": false,
  "isAnime": false,
  "servers": [
    {
      "id": "4f0c2a8e-1b7d-4c1e-9a55-3c2d8e6f7a10",
      "name": "Sonarr",
      "isDefault": true,
      "is4k": false,
      "reachable": true,
      "qualityProfiles": [ { "id": 4, "name": "HD-1080p" }, { "id": 7, "name": "Anime" } ],
      "rootFolders": [ { "id": 1, "path": "/tv" }, { "id": 2, "path": "/anime" } ],
      "tags": [ { "id": 1, "label": "kids" }, { "id": 3, "label": "anime" } ],
      "defaults": { "qualityProfileId": 4, "rootFolderPath": "/tv", "tags": [], "seriesType": "standard" }
    }
  ]
}
```

- `isAnime`: TMDb tags the title with the "anime" keyword, or it's Animation
  from Japan (genre Animation plus Japanese origin country or language) —
  the same test Seerr uses. For an anime show, `defaults` are the server's
  anime profile, folder and tags (where set) and `seriesType` `"anime"`.
- `defaults.seriesType` is `null` for movies; for TV one of `"standard"`,
  `"daily"`, `"anime"`.
- `reachable: false`: the server didn't answer within 2.5 seconds; its lists
  are empty but `defaults` still hold its saved choices. Approving without
  overrides still works if it comes back.
- `servers` is empty when none is set up for this type (then Add/Approve fail
  with "Connect Radarr in Settings first." as before).

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

Request limits (0.39+): a member over their limit for the type gets `429
rate_limited` "You've used your 5 movie requests for a week. You can ask
again in 3 days." ("within the hour" / "in 5 hours" / "tomorrow" / "in N
days" — relative, so no time zone gets in the way; `requestLimits.nextSlotAt`
on `/me` has the exact time). A Plex Watchlist sync stops at the limit and
its `lastError` says "You've reached your request limit, so the rest of your
watchlist waits until you have requests left.". A trusted member's
requests are approved straight away.

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

### `POST /titles/{type}/{tmdbId}/request-all-missing` — user

A franchise row's "Request all N missing" (household members; the admin gets
`403 forbidden` and uses "Add all"). No body. The server works out the set
itself from this title's collection or crossover group — the detail's
`franchise.requestAllMissing` — and requests each title exactly as
`POST …/request` would (whole series for TV), so request limits, the
blocklist, auto-approval and trusted members' instant approval all apply.
Reviewers get one alert for the batch ("Anna requested 3 titles from “Ice
Age Collection”: …") instead of one per title.

Some titles can be refused while the rest go through — still `200`. `total`
is how many were in the set, `requested` how many requests were filed,
`refused` the rest with the reason, and `message` the line to show:
"Requested all 4." / "Requested 2 of 4. You've used your 2 movie requests
for a week. You can ask again in 7 days." / "Couldn't request any of the 4.
…" / "Nothing left to request here." (the set was empty).

```json
{
  "ok": true,
  "total": 4,
  "requested": 2,
  "refused": [
    { "mediaType": "movie", "tmdbId": 57800, "title": "Ice Age: Continental Drift", "error": "You've used your 2 movie requests for a week. You can ask again in 7 days." },
    { "mediaType": "movie", "tmdbId": 278154, "title": "Ice Age: Collision Course", "error": "You've used your 2 movie requests for a week. You can ask again in 7 days." }
  ],
  "message": "Requested 2 of 4. You've used your 2 movie requests for a week. You can ask again in 7 days."
}
```

Errors: `403 forbidden` (the admin); `404 not_found` (no such title, or it
isn't part of a collection); `502 upstream` (TMDb).

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
      "reviewedAt": "2026-09-17T18:00:02.118Z",
      "canEdit": false,
      "canCancel": false,
      "editedAt": null,
      "commentCount": 2
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
      "status": "pending",
      "manuallyApproved": false,
      "rejectionReason": null,
      "libraryStatus": null,
      "statusLabel": "Pending review",
      "statusTone": "pending",
      "createdAt": "2026-09-17T17:10:02.001Z",
      "reviewedAt": null,
      "canEdit": true,
      "canCancel": true,
      "editedAt": "2026-09-17T17:20:40.310Z",
      "commentCount": 0
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

0.46+ (an older server omits these — treat as false/null/0): `canEdit` and
`canCancel` are true while it's pending — the website shows "Edit" and
"Cancel request" under the badge (see `PATCH` / `DELETE /requests/{id}`);
an approved one says "Need a change? Ask in its comments." `editedAt`: when
its seasons or 4K last changed. `commentCount`: comments in its
conversation — the website puts "Comments (2)" (or "Comment") under the
title, opening the thread in a row below.

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
      "createdAt": "2026-09-17T17:12:41.415Z",
      "editedAt": null,
      "commentCount": 1
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
      "createdAt": "2026-09-17T17:10:02.001Z",
      "editedAt": "2026-09-17T17:20:40.310Z",
      "commentCount": 0
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

0.46+: `editedAt` — when the requester (or a reviewer) last changed its
seasons or 4K, null if never (the website notes "Changed since asking");
`commentCount` as in `/requests/mine`. Each row also has "Edit" (a reviewer
may change seasons and 4K before approving, `PATCH /requests/{id}`) and
"Comments (N)".

### `GET /requests/history` — admin

"Past requests": the 50 most recently reviewed — after every request
under "Couldn't add" (0.46+), however old, which come first.

```json
{
  "results": [
    {
      "id": "c4d8e2a1-7b3f-4e6a-9d0c-5f1b2a8e7c90",
      "mediaType": "movie",
      "tmdbId": 78,
      "title": "Blade Runner",
      "posterPath": "/63N9uy8nd9j7Eog2axPQ8lbr3Wj.jpg",
      "seasons": null,
      "seasonsLabel": null,
      "is4k": false,
      "status": "approved",
      "manuallyApproved": false,
      "rejectionReason": null,
      "statusLabel": "Approved",
      "requestedBy": { "userId": "83c55a49-6153-4cb9-ae22-4a42d48f4cf3", "displayName": null, "username": "member1", "label": "member1" },
      "createdAt": "2026-09-17T16:40:00.000Z",
      "reviewedAt": "2026-09-17T16:45:10.000Z",
      "addedTo": null,
      "notFoundSince": null,
      "addFailed": { "error": "Couldn't add this movie to Radarr.", "since": "2026-09-17T19:02:00.000Z" },
      "commentCount": 0
    },
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
      "reviewedAt": "2026-09-17T17:12:41.468Z",
      "addedTo": null,
      "notFoundSince": null,
      "addFailed": null,
      "commentCount": 1
    },
    {
      "id": "9a7d2c11-5e3b-4f0a-8c6d-2b1e0f9a8d77",
      "mediaType": "movie",
      "tmdbId": 438631,
      "title": "Dune",
      "posterPath": "/d5NXSklXo0qyIYkgV94XAgMIckC.jpg",
      "seasons": null,
      "seasonsLabel": null,
      "is4k": false,
      "status": "approved",
      "manuallyApproved": false,
      "rejectionReason": null,
      "statusLabel": "Approved",
      "requestedBy": { "userId": "83c55a49-6153-4cb9-ae22-4a42d48f4cf3", "displayName": null, "username": "member1", "label": "member1" },
      "createdAt": "2026-09-17T17:02:11.100Z",
      "reviewedAt": "2026-09-17T17:05:40.020Z",
      "addedTo": {
        "serverId": "b3e1f7a2-9c4d-4e8b-a1f0-6d2c5e7b9a31",
        "serverName": "Radarr 2",
        "qualityProfileId": 6,
        "rootFolderPath": "/movies-kids",
        "tags": [2],
        "seriesType": null
      },
      "notFoundSince": "2026-09-18T18:20:00.412Z",
      "addFailed": null,
      "commentCount": 0
    }
  ]
}
```

`statusLabel`: "Approved", "Manually approved" or "Rejected". `rejectionReason`
as in `/requests/mine`: the website shows it under the "Rejected" badge.
`addedTo` (0.43+): where an approved request was added and with what —
`serverId` is null once that server has been removed (`serverName` keeps
the name it had). Null for rejected and
manually approved requests, and for anything approved before 0.43. The
website shows "Added to Radarr 2" under the badge. `notFoundSince` (0.46+;
an older server omits it): when Sonarr/Radarr's failure to find it put it
under "Can't find", null otherwise — the website shows a red "Can't find"
badge next to "Approved" that jumps to that list.

`addFailed` (0.46+; an older server omits it): approved, but Sonarr/Radarr
couldn't be reached or errored when adding it — `{ error, since }` (when it
was last tried), else null. The website lists these in a "Couldn't add"
section above "Can't find" instead of under "Past requests": title, "who ·
approved 9/17/2026 · last tried …", the error in red, the Advanced picks,
**Retry** (`POST /requests/{id}/retry`), for the admin "Added it by hand"
(`POST /requests/{id}/manual-approve`), and "Comments (N)". A reviewer may
also decline one (`POST /requests/{id}/reject`). `addedTo` is null while
it's there. `commentCount` as in `/requests/mine`.

### `GET /requests/not-found` — admin (0.46+)

"Can't find": approved requests whose title is released and monitored in
Sonarr/Radarr, with nothing on disk and nothing downloading, `afterHours`
or more after approval — usually no indexer has a copy. A show counts once
a season it asked for (every monitored season but specials, for the whole
series) has aired episodes and not one file. Unreleased titles are never
listed ("Coming soon" covers them), nor manually approved requests. The
hourly "Can't Find Check" job (`GET /settings/jobs`) adds them; a Grab or
Download from Sonarr/Radarr's webhook, or the next check finding a file or
a download, takes them off. Longest-missing first.

```json
{
  "afterHours": 24,
  "results": [
    {
      "id": "9a7d2c11-5e3b-4f0a-8c6d-2b1e0f9a8d77",
      "mediaType": "movie",
      "tmdbId": 425,
      "title": "Ice Age",
      "posterPath": "/gLhHHZUzeseRXShoDyC4VqLgsNv.jpg",
      "seasons": null,
      "seasonsLabel": null,
      "is4k": false,
      "requestedBy": { "userId": "83c55a49-6153-4cb9-ae22-4a42d48f4cf3", "displayName": "Susan", "username": "susan", "label": "Susan" },
      "createdAt": "2026-09-17T17:02:11.100Z",
      "reviewedAt": "2026-09-17T17:05:40.020Z",
      "notFoundSince": "2026-09-18T18:20:00.412Z",
      "server": { "id": "b3e1f7a2-9c4d-4e8b-a1f0-6d2c5e7b9a31", "name": "Radarr", "kind": "radarr" },
      "arrUrl": "http://192.168.1.10:7878/movie/425",
      "hint": "In Radarr, Interactive Search on the movie lists every release the indexers have, so you can pick one by hand."
    }
  ]
}
```

`server`: the Sonarr/Radarr approving it added the title to (the default
one for requests approved before 0.43); `id`/`name` null when unknown.
`arrUrl`: the title's page there, for "Open in Radarr"/"Open in Sonarr" —
null when the server or the page isn't known. `hint`: a tip to show under
the actions. The website lists these in a "Can't find" section on the
Requests page, between the review queue and the problem reports: title
(linking to the title page) with `seasonsLabel`/"In 4K", "who · can't find
for 3 days (since 9/18/2026) · server", the hint, and **Search again**,
**Open in Radarr** and **Mark as found**. Nothing listed → the section is
hidden. `403` for members.

### `POST /requests/{id}/not-found/search` — admin (0.46+)

"Search again": that request's Sonarr/Radarr searches for it now — the
requested seasons of a show one by one, or the whole of it; a movie as
Radarr's own search button does. It stays listed until something is
grabbed. `{ "ok": true }` → show "Radarr is searching again…". Errors:
`404` "That request isn't in Can't find any more.", `409` when the server
is gone or no longer has the title, `502` when it can't be reached.

### `POST /requests/{id}/not-found/dismiss` — admin (0.46+)

"Mark as found": off the list for good (it's never checked again), and its
alerts are marked read for everyone. The request stays approved.
`{ "ok": true }`, or `404` "That request isn't in Can't find any more."

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
approval) / "Sonarr doesn't list the requested seasons for this show." — the
request stays pending for all of these — and `502` "Couldn't add this movie
to Radarr. It's approved and waiting under “Couldn't add” — retry once it's
reachable." (or the series/Sonarr wording).

**Couldn't add (0.46+).** When Sonarr/Radarr can't be reached or errors
(the `502`), the request doesn't go back to the queue: it's approved, with
the error, listed under "Couldn't add" (`addFailed` in `/requests/history`,
`failedRequests` in `/badges`) until a reviewer's `POST /requests/{id}/retry`
goes through. The requester is only told it's approved once it has been
added. A request that was approved automatically (a trusted member's, or a
member set to auto-approve) and couldn't be added alerts the reviewers
(`request_created`, "Anna's request for "Dune" was approved, but couldn't be
added: … Retry it on the Requests page."). While approving, the request
can't be cancelled or changed.

**Add overrides (0.43+).** An optional JSON body picks where and how the title
is added — the website's "Advanced" section under Approve. Every field is
optional; an omitted one is the server's default (its anime defaults for an
anime show — see `GET /titles/{type}/{tmdbId}/add-options`). No body at all
is the plain Approve it always was. Admins and trusted members may send them.

| Body field | Type | |
|---|---|---|
| `serverId` | string | a server id from `add-options`: same type (Sonarr for TV, Radarr for movies) and same 4K-ness as the request |
| `qualityProfileId` | number | a quality profile of that server |
| `rootFolderPath` | string | a root folder of that server |
| `tags` | number[] | tag ids of that server (`[]` = no tags) |
| `seriesType` | string | TV only: `"standard"`, `"daily"` or `"anime"` (a movie ignores it, but a value sent must still be one of these) |

Only used when the title is new to that server; one it already has keeps its
own settings (Approve then just turns monitoring on, as before). What was
used is stored with the request (`addedTo` in `/requests/history`). Extra
errors: `400 invalid` "That server can't take this request.", `"tags" must be
a list of numbers.`, `"seriesType" must be standard, daily or anime.`, `"qualityProfileId" must be a number.`,
`"rootFolderPath" must be a string.`, `"serverId" must be a string.`.

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

Approves every pending request one at a time; failures stay pending, or
(Sonarr/Radarr unreachable, 0.46+) go under "Couldn't add".

```json
{ "ok": true, "approvedCount": 4, "failedCount": 1, "message": "1 request(s) couldn't be approved." }
```

`message` is null when nothing failed. If requests were pending and **none**
could be approved, the first failure is returned as the error response instead
(same codes as `approve`). No pending requests → `approvedCount: 0`.

### `PATCH /requests/{id}` — user (0.46+)

Changes a request that's still **pending**: your own, or (the admin and
trusted members) anyone's — a reviewer can fix the seasons or 4K before
approving. Body, every field optional:

| Body field | Type | |
|---|---|---|
| `seasons` | number[] or null | TV only: the seasons to ask for, or null for the whole series. Absent: unchanged. |
| `is4k` | boolean | Ask for the 4K copy instead (always the whole title — `seasons` then must be absent or null), or back to the regular one. Absent: unchanged. |

The same rules as asking afresh (`POST /titles/{type}/{tmdbId}/request`):
seasons TMDb lists, minus any Sonarr already monitors or has (dropped
quietly; `409` if none are left); 4K only once the admin has a 4K
Sonarr/Radarr, the 4K copy isn't already there, and you have no other 4K
request for it. It keeps its place in the queue and in your request limit.
Unread "new request" alerts for it are reworded to match. `{ "ok": true }`
(also when nothing changed). Errors: `404` "Request not found." (someone
else's, for a member), `409 conflict` "It's already been reviewed, so it
can't be changed. Ask in its comments instead." / "4K requests aren't set up
on this server." / "There's already a 4K request for this." / "There's
already a request for this." / "Those seasons are already in your library or
on their way." / "You already have this in your library.", `400 invalid`
"A movie has no seasons." / "A 4K request is always the whole show." /
`"is4k" must be true or false.` / the season errors of `…/request`.

Website: "Edit" under a pending request (the member's Requests page, the
title page, and each row of the review queue) opens the season picker — the
request's seasons ticked, "The whole series" / "Just these seasons", and
"In 4K" when 4K is set up — with "Save changes".

### `GET /requests/{id}/edit-options` — user (0.46+)

What "Edit" can offer, for the same people who may edit it (`404`
otherwise, `409` once it's reviewed):

```json
{
  "requestId": "5b0f1d8e-8a8c-4f5e-9d51-1f0c7a0e2b44",
  "mediaType": "tv",
  "title": "Severance",
  "seasons": [2],
  "is4k": false,
  "seasonRows": [
    { "seasonNumber": 2, "name": "Season 2", "episodeCount": 10, "state": "requestable" },
    { "seasonNumber": 1, "name": "Season 1", "episodeCount": 9, "state": "complete" }
  ],
  "fourKAvailable": true
}
```

`seasonRows`: the show's seasons newest first, as the season picker lists
them — `requestable` ones get a checkbox (this request's own included,
ticked), the rest say why not: `complete` "In library", `monitored`
"Monitored", `requested` "Requested" (another of the requester's
requests). Empty for a movie. `fourKAvailable`: "In 4K" can be offered. A
movie without it has nothing to change — don't offer Edit then.

### `DELETE /requests/{id}` — user (0.46+)

Cancels **your own** request while it's pending: it's deleted (with its
conversation), its slot in your request limit is free again, and the
reviewers' alerts about it are marked read. `{ "ok": true }`. Errors: `404`
"Request not found." (none, or someone else's), `403 forbidden` "Only
whoever asked can cancel it — decline it instead." (a reviewer, on someone
else's), `409 conflict` "It's already been reviewed, so it can't be
cancelled. Ask in its comments instead.", `429 rate_limited` (more than 30
in an hour). Website: "Cancel request" → "Cancel it? Yes, cancel / Keep it".

### `POST /requests/{id}/retry` — admin or trusted member (0.46+)

"Retry" on a request under "Couldn't add" (`addFailed`): adds it again with
the Advanced picks it was approved with — or, with a body, the ones given
(the same fields as `approve`). On success it's added, `addFailed` clears,
and the requester is told it's approved. `{ "ok": true }`. Errors: `404`
"That request isn't waiting to be added any more.", `409` "Someone's
already retrying it.", `502` (still unreachable — the new error is kept on
the request), and those of `approve`.

### Conversations (0.46+)

A request and a problem report each have a comment thread between whoever
asked (or reported) and the reviewers — the admin and trusted members.
Nobody else can read or write in it, or learn it exists: `404`. Plain text,
up to 2000 characters, trimmed (control characters dropped, at most one
blank line in a row). At most 12 comments per person in 10 minutes (`429`)
and 300 per thread (`409` "This conversation is full."). An author can
edit or delete their comment for 15 minutes; the admin can delete any.
Participants are notified (`request_comment` / `issue_comment`, see §8).

#### `GET /requests/{id}/comments` · `GET /issues/{id}/comments` — user

```json
{
  "canComment": true,
  "maxLength": 2000,
  "results": [
    {
      "id": "report:83bedf64-c5d8-4f43-98a0-bb615c4b9897",
      "kind": "report",
      "author": { "userId": "2d0b6e1a-8f3c-4a5d-9e7b-1c2d3e4f5a6b", "label": "Member", "avatarUrl": null, "role": "member" },
      "body": "Out of sync after 20 minutes",
      "createdAt": "2026-09-26T02:40:11.000Z",
      "editedAt": null,
      "isMine": true,
      "canEdit": false,
      "canDelete": false,
      "editableUntil": null
    },
    {
      "id": "7e9d1c3b-5a2f-4e6d-8b0a-9c1d2e3f4a5b",
      "kind": "comment",
      "author": { "userId": "11111111-2222-4333-8444-555555555555", "label": "Tess", "avatarUrl": "/api/v1/users/11111111-2222-4333-8444-555555555555/avatar?v=1758220800000", "role": "reviewer" },
      "body": "Which episode?\nI'll swap the file tonight.",
      "createdAt": "2026-09-26T03:02:40.000Z",
      "editedAt": "2026-09-26T03:04:02.000Z",
      "isMine": false,
      "canEdit": false,
      "canDelete": false,
      "editableUntil": null
    }
  ]
}
```

Oldest first. A thread starts with what was already said: a report's own
note (`kind` "report", by the reporter), the note it was marked fixed with
("resolution"), and why a request was declined ("declined", by whoever
declined it) — each where it falls in time, with an id like
`report:<issue id>`, and never editable. Real comments are `kind`
"comment". `author.role`: "admin", "reviewer" (a trusted member) or
"member"; null with `label` "Someone" once the account is gone. `canEdit`
(yours, within 15 minutes; `editableUntil` says until when) and
`canDelete` (that, or the admin). Website: "Comments (2)" under each
request and report on the Requests page (and each of your own requests on
the title page) opens it: photo, name, "Admin"/"Reviewer", "Reported" /
"Marked fixed" / "Declined" for the notes, time, "edited"; the text with
its line breaks; "Edit" / "Delete" while allowed; and a "Write a comment"
box with "Send".

#### `POST /requests/{id}/comments` · `POST /issues/{id}/comments` — user

Body `{ "body": "Could it be the 4K one?" }` → `{ "ok": true, "commentId":
"…" }`. Errors: `400 invalid` "Write something first." / "Keep it under
2000 characters.", `404`, `409`, `429` (above).

#### `PATCH /requests/{id}/comments/{commentId}` · `PATCH /issues/{id}/comments/{commentId}` — user

Body `{ "body": "…" }`: your own comment, within 15 minutes of posting.
`{ "ok": true }`. Errors: `403 forbidden` "You can only edit your own
comments." / "Comments can only be changed for 15 minutes after
posting.", `404` "Comment not found.", `400` as for posting.

#### `DELETE /requests/{id}/comments/{commentId}` · `DELETE /issues/{id}/comments/{commentId}` — user

Your own within 15 minutes, or (the admin) any. `{ "ok": true }`. Errors:
`403`, `404` as above.

### Your requests on the title page (0.46+)

The title's `viewer.myRequests` lists the viewer's own requests for it,
regular and 4K, newest first (at most five; empty when there are none):

`{ "id": "5b0f…", "status": "pending", "seasons": [2], "seasonsLabel":
"Season 2", "is4k": false, "canEdit": true, "canCancel": true,
"commentCount": 0, "createdAt": "…" }`

The website shows each under the hero's buttons: "Your request (Season 2)
is waiting for review" (or "approved" / "declined"), "Edit" and "Cancel
request" while `canEdit` / `canCancel`, and "Comments (N)".

### Request blocklist (0.41+)

What nobody may request: single titles (blocked from their page) and TMDb
keywords or genres ("anime", "reality", "animation" — matched against the
title's TMDb keywords and genres, case-insensitively). A request for one —
regular, seasons, 4K, or from a Plex Watchlist (then skipped for good) — is
refused with `403 forbidden` "The admin isn't taking requests for this
title." plus the admin's reason, if any. The admin can still add a blocked
title themselves. Requests made before a title was blocked stay in the
queue. Genre names differ between movies and TV on TMDb ("Science Fiction"
vs "Sci-Fi & Fantasy"), so block both to cover both. Blocking something
already on the list just updates its reason. A keyword block needs the
title's TMDb record; if TMDb can't be reached for a title Marquee hasn't
seen before, the keyword can't be checked and the request goes through.

The title's `viewer.blocked` is `{ "reason": "Already on Max.", "keyword":
null }` when it's blocked (`keyword` set when a keyword did it), else null;
`canRequest`, `canRequestSeasons` and `fourK.canRequest` are then false.
Website: members see a pill "Requests are closed for this title — Already on
Max." instead of Request; the admin gets "Block requests" (opening a reason
field and "Block") / "Unblock requests", or "Requests blocked by “anime”"
when a keyword did it.

- **`POST /titles/{type}/{tmdbId}/block`** — admin. Body (optional) `{
  "reason": "…" }` (≤ 200 characters). `{ "ok": true }`.
- **`DELETE /titles/{type}/{tmdbId}/block`** — admin. `{ "ok": true }`.
- **`GET /settings/blocklist`** — admin. `{ "results": [ { "id": "…",
  "kind": "title", "mediaType": "movie", "tmdbId": 438631, "title": "Dune",
  "keyword": null, "reason": "Already on Max.", "createdAt": "…" }, { "id":
  "…", "kind": "keyword", "mediaType": null, "tmdbId": null, "title": null,
  "keyword": "anime", "reason": null, "createdAt": "…" } ] }` (keywords
  first, then titles).
- **`POST /settings/blocklist`** — admin. `{ "keyword": "anime", "reason":
  "…" }`. `400` "Enter a keyword or genre, like anime.".
- **`DELETE /settings/blocklist/{id}`** — admin. `404` "Not on the
  blocklist.".

Website: Settings → Account (admin), "Request blocklist": the list (titles
link to their page, keywords read "Keyword: anime", each with Remove) and a
form "Block a keyword or genre" with an optional reason.

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
open per person) / "That's a lot of reports in a short time. Try again in a
while." (10 an hour per person), `502 upstream` (TMDb unreachable).

The title's `viewer.canReport` is true once the title (or its 4K copy) is
owned or downloading, and `viewer.openReports` counts the viewer's own open
reports for it. Website: a "Report a problem" outline pill in the hero's
action row (shown while `canReport`), opening a dialog with the six kinds as
radio buttons, for TV a "Season (optional)" picker ("Whole show", "Specials",
"Season N") and an "Episode" number, a note ("Anything else? (optional)", or
"What's wrong?" for `other`), and "Send report"; afterwards (or while
`openReports > 0`) a "Problem reported" pill before the button, which then
reads "Report another".

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
      "resolvedAt": null,
      "commentCount": 1
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
"Fixed: <note>" once fixed, "Comments (N)" (`commentCount`, 0.46+) opening
its conversation; open ones have "Search again", "Mark fixed"
(which opens a note field and its own "Mark fixed") and "Remove" for the
admin, "Withdraw" for the member's own. Fixed ones sit behind "Show fixed (N)".

- **`POST /issues/{id}/resolve`** — admin. Body (optional) `{ "note": "…" }`
  (up to 500 characters). `404` "That report isn't open any more.".
- **`POST /issues/{id}/search`** — admin. Asks Radarr/Sonarr to search for the
  title again (the 4K instance when only it has the title). `409` "Not
  tracked in Radarr/Sonarr.".
- **`DELETE /issues/{id}`** — your own while it's open, or (admin) any. `404`
  "Report not found.".

---

## 8. Notifications

`eventType`: `grabbed` (⬇️ started downloading), `downloaded` (✅ finished),
`request_approved` (👍), `request_rejected` (👎), and from 0.38
`issue_reported` (⚠️, to the admin) and `issue_resolved` (🛠️, to the
reporter), and from 0.40 `request_created` (🙋, "Anna requested “Dune”
(Season 2) in 4K"): a request waiting for review, to the admin and trusted
members (not the requester, and not when it was auto-approved). Open the
Requests screen for it. A Plex Watchlist sync sends one for its whole batch
instead ("Anna's Plex Watchlist requested 3 titles: “Dune”, “Severance” and
1 more"). Once the request is reviewed, by anyone, its alerts are marked
read for every reviewer. On the website's push notification it carries
"Approve" and "Decline" buttons where the browser supports them (Android,
desktop Chrome/Edge). From 0.45.1 `title_shared` (📨, "Shared with you"):
someone in the household shared the title with you ("Susan shared “Ice Age”
with you: You'd love this one"); `sharedBy` is who (a `RequestPerson` plus
`avatarUrl`, null once that account is removed) and `note` their note, both
null on every other kind (and missing on older servers — treat as null).
Show the sender's photo (else initials) beside it. Never relayed to Discord
and the rest. From 0.46 `request_not_found` (🔍): an approved request
Sonarr/Radarr hasn't found — "Couldn't find Ice Age (2002) — requested by
Susan" to the admin and trusted members (a reminder "Still can't find …" at
most once more, a week later), and "We're still looking for Ice Age (2002)"
to the requester if they chose to hear it (in the bell only, by default).
Once it's found or dismissed its alerts are marked read. From 0.46
`request_comment` and `issue_comment` (💬, "New comment"): someone wrote in
the conversation on a request (`requestId`) or problem report (`issueId`)
you're part of — "Tess commented on "Severance" (Season 2): It's on the
way…". The requester or reporter hears every comment but their own;
reviewers hear them once they've taken part (commented, reviewed the request
or fixed the report) — or, before any reviewer has, all of them hear the
requester's. Both follow the "Comments on requests and problem reports"
(`request_comment`) preference: in the bell, pushed and sent to personal
channels by default, never to the household channels. Open the Requests
screen for them. `requestId` (0.46+) is also set on `request_created`;
null otherwise, and missing on older servers. Tapping one opens
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
      "alert": true,
      "createdAt": "2026-09-17T17:12:41.470Z",
      "sharedBy": null,
      "note": null,
      "requestId": null,
      "issueId": null
    },
    {
      "id": "0f3a5c77-1d2e-4b8a-9c6f-3e2d1a0b9c88",
      "mediaType": "tv",
      "tmdbId": 95396,
      "title": "Severance",
      "eventType": "request_comment",
      "message": "Tess commented on \"Severance\" (Season 2): It's on the way, the indexer was slow",
      "read": false,
      "alert": true,
      "createdAt": "2026-09-17T17:02:00.000Z",
      "sharedBy": null,
      "note": null,
      "requestId": "5b0f1d8e-8a8c-4f5e-9d51-1f0c7a0e2b44",
      "issueId": null
    },
    {
      "id": "5d1e0c37-2a4b-4f9e-9a51-7c3f0b6e8d21",
      "mediaType": "movie",
      "tmdbId": 425,
      "title": "Ice Age",
      "eventType": "title_shared",
      "message": "Susan shared “Ice Age” with you: You'd love this one",
      "read": true,
      "alert": true,
      "createdAt": "2026-09-16T20:03:12.118Z",
      "sharedBy": {
        "userId": "83c55a49-6153-4cb9-ae22-4a42d48f4cf3",
        "displayName": "Susan",
        "username": "susan",
        "label": "Susan",
        "avatarUrl": "/api/v1/users/83c55a49-6153-4cb9-ae22-4a42d48f4cf3/avatar?v=1758220800000"
      },
      "note": "You'd love this one",
      "requestId": null,
      "issueId": null
    }
  ]
}
```

Newest first, and only what the account keeps in the bell (see
`/me/notification-preferences`; the unread count follows the same rule).
`alert` (0.45+): false when the account turned device push off for this
kind — list it, but don't show a system banner for it. Missing on older
servers: treat as true. Empty → "No notifications yet." A `title_shared` row on the
website leads with the sender's round photo (initials when there's none) and
shows the note in quotes under the message. The website shows relative
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
data: {"id":"a23f7682-41ae-4e8a-8b17-14d903ab017a","mediaType":"movie","tmdbId":27205,"title":"Inception","eventType":"request_rejected","message":"\"Inception\" was declined: Already available on a streaming service we have","read":false,"alert":true,"createdAt":"2026-09-25T11:25:16.885Z"}

event: signed-out
data: {}
```

- `ready` arrives first. After it, a `notification` event (one
  `NotificationItem`, exactly as `GET /notifications` lists it) arrives the
  moment the server creates one for this account — unless the account keeps
  that kind out of both the bell and device push. With `"alert": false`,
  update the bell but show no banner. One the account keeps out of the bell
  but wants pushed still arrives (show the banner; it won't be in the list).
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

### `GET /me/notification-channels` — user (0.45+)

The signed-in account's own channels: Settings › Account › Notifications ›
"Your channels". Nobody else's are ever listed, and every endpoint below
answers `404 not_found` "There's no channel with that id." for an id that
isn't yours, exactly as for one that doesn't exist.

```json
{
  "available": {
    "telegram": { "available": true, "botUsername": "MarqueeHomeBot" },
    "pushover": { "available": false },
    "email": { "available": true },
    "discord": { "available": true },
    "ntfy": { "available": true, "householdServer": "https://ntfy.sh" },
    "webhook": { "available": true, "homeNetwork": false }
  },
  "channels": [
    {
      "id": "0b7d5f6e-3c1a-4f3e-9d61-6f0c2e1a9b44",
      "kind": "telegram",
      "name": "My phone",
      "target": "Chat ••••6789",
      "enabled": true,
      "verified": true,
      "lastSuccessAt": "2026-09-25T18:40:05.000Z",
      "lastError": null,
      "lastErrorAt": null,
      "createdAt": "2026-09-20T09:12:00.000Z"
    },
    {
      "id": "5a0f4b1e-8d2c-4b6a-a1f7-2e9c3d4b5a61",
      "kind": "email",
      "name": null,
      "target": "anna@example.com",
      "enabled": true,
      "verified": false,
      "lastSuccessAt": null,
      "lastError": null,
      "lastErrorAt": null,
      "createdAt": "2026-09-25T18:41:00.000Z"
    }
  ]
}
```

`available`: which kinds this server can offer. Telegram, Pushover and
email ride on the household's own bot, app and mail server (Settings ›
Integrations), so they're only available once the admin set those up.
`botUsername`: the household bot, for "message @… /start" and the one-tap
Telegram link below (null if Telegram can't be reached). `householdServer`:
the household ntfy server, where a member can pick just a topic (null: only
full topic URLs). `homeNetwork`: whether this account's webhook and ntfy URLs
may point at the home network (the admin's may; members' only when the
server sets `MARQUEE_ALLOW_PRIVATE_WEBHOOKS=true`).

Each channel: `kind` is `telegram`, `pushover`, `email`, `discord`, `ntfy`
or `webhook` (treat any other as unknown and show it read-only). `target`:
where it goes, **masked** — webhook URLs, ntfy topics and Pushover keys are
secrets and the API never returns them (email addresses are shown whole).
`enabled`: off, it gets nothing. `verified`: false for an email address,
or a Telegram chat ID typed in by hand, until the 6-digit code sent there
is entered; it gets nothing else until then (the chat could otherwise be
anyone who ever pressed Start on the household bot). `lastError` /
`lastErrorAt`: why the last delivery failed (the service's own words, e.g.
"Forbidden: bot was blocked by the user", or "Some notifications were
skipped: more than 30 in 10 minutes."), cleared by the next one that
arrives. Each channel takes at most 30 notifications in 10 minutes; past
that they're dropped (the bell still has them). Up to 10 channels per
account.

- **`POST /me/notification-channels`** — `{ "kind": "…", "name"?: "My
  phone", "enabled"?: true, "config": {…} }`. `config` by kind:
  `telegram` `{ "chatId": "123456789" }` (your own chat with the household
  bot: message it /start first); `pushover` `{ "userKey": "…30 chars…" }`;
  `email` `{ "address": "you@example.com" }`; `discord` `{ "webhookUrl":
  "https://discord.com/api/webhooks/…" }`; `ntfy` `{ "topic": "…" }` on the
  household server or `{ "url": "https://ntfy.sh/…" }`; `webhook` `{ "url":
  "https://…" }`. A test message is sent first and the channel is saved only
  if it arrives: `201` with the channel, or `400 invalid` with the reason
  ("The test message didn't arrive: HTTP 404"). Email and Telegram instead
  get a 6-digit code (`201`, `verified: false`; the bot sends Telegram's). Webhook and ntfy URLs must be on the
  internet, not the home network (unless `homeNetwork`): `400` "Marquee only
  sends to addresses on the internet, not the home network." — checked
  again on every connection, and redirects aren't followed. `409 conflict`
  for a kind the household hasn't set up, or past 10 channels; `429` after
  10 adds in 10 minutes.
- **`PATCH /me/notification-channels/{id}`** — `{ "name"?, "enabled"?,
  "config"? }`. New details are tested the same way before they're kept; a
  secret left out or blank keeps the saved one. A new email address goes
  (or Telegram chat) goes back to `verified: false` with a new code. `200`
  channel.
- **`DELETE /me/notification-channels/{id}`** — `{ "ok": true }`.
- **`POST /me/notification-channels/{id}/test`** — "Send a test". `200`
  channel (with `lastSuccessAt` updated), or `400` with the reason (also
  kept as `lastError`). `409` for a channel not yet confirmed; `429` after
  5 a minute.
- **`POST /me/notification-channels/{id}/verify`** — `{ "code": "123456" }`.
  `200` channel, now `verified`. `400` wrong code, `410 expired` after 30
  minutes, `429` after 5 wrong tries — send a new one.
- **`POST /me/notification-channels/{id}/resend-code`** — sends a new code.
  `200` channel; `429` after 3 in 10 minutes.
- **`POST /me/notification-channels/telegram-link`** — no body. One-tap
  Telegram: `{ "code": "…", "url": "https://t.me/MarqueeHomeBot?start=…",
  "expiresAt": "…" }`. Open `url`; Telegram offers Start, which sends the
  bot `/start <code>`.
- **`POST /me/notification-channels/telegram-link/poll`** — `{ "code": "…",
  "name"?: "…" }`. `202 { "status": "pending" }` until the bot has seen it,
  then `201` with the new channel (after its test message; no code needed,
  since pressing Start proved the chat is yours). Poll every few
  seconds. `410 expired` after 10 minutes; `409` when the household bot
  hands its messages to a webhook of its own, so they can't be read — enter
  the chat ID instead.

### `GET /me/notification-preferences` — user (0.45+)

"What you hear about": each event this account can get, and whether it
goes to the bell (`inApp`), to devices (`push`: Web Push, and banners in the
Mac and Windows apps) and to each of the account's channels (by id).

```json
{
  "events": [
    {
      "event": "request_approved",
      "label": "A request is approved",
      "reviewerOnly": false,
      "inApp": true,
      "push": true,
      "channels": { "0b7d5f6e-3c1a-4f3e-9d61-6f0c2e1a9b44": true, "5a0f4b1e-8d2c-4b6a-a1f7-2e9c3d4b5a61": true }
    },
    {
      "event": "request_downloading",
      "label": "Started downloading",
      "reviewerOnly": false,
      "inApp": true,
      "push": false,
      "channels": { "0b7d5f6e-3c1a-4f3e-9d61-6f0c2e1a9b44": false, "5a0f4b1e-8d2c-4b6a-a1f7-2e9c3d4b5a61": false }
    },
    {
      "event": "request_pending",
      "label": "New request waiting for review",
      "reviewerOnly": true,
      "inApp": true,
      "push": true,
      "channels": { "0b7d5f6e-3c1a-4f3e-9d61-6f0c2e1a9b44": true, "5a0f4b1e-8d2c-4b6a-a1f7-2e9c3d4b5a61": true }
    }
  ]
}
```

`event`, in the order to show them: `request_approved`, `request_declined`,
`request_available` ("Ready to watch"), `request_downloading`,
`request_still_looking` (0.46+, "Still looking for something I asked
for"), `issue_updated` ("A problem I reported is fixed"), from 0.45.1
`title_shared` ("Someone shares a title with me"); for the admin and
trusted members also `request_pending`, `request_not_found` (0.46+,
"Sonarr/Radarr can't find a request") and `watchlist_requests` (a Plex
Watchlist batch); for the admin `issue_reported`. `request_comment` is
reserved for comments on requests and not sent yet. Clients show `label`
as it comes and keep any `event` they don't know, so a new one needs no
app update. `reviewerOnly`: group these under "For reviewers".

Defaults, until the account changes something: `inApp` and `push` on for
everything (what every account got before 0.45) except `push` for
`request_still_looking`; a new channel gets every event except
`request_downloading`, `request_still_looking` and `title_shared`. The
household channels are separate — see below; `title_shared` and
`request_still_looking` are only ever the recipient's, so they never go to
them.

**`PUT /me/notification-preferences`** — `{ "events": [ { "event":
"request_downloading", "push": false, "channels": { "<id>": true } } ] }`:
only what's sent changes. Answers the whole list, as `GET`. `400` for an
event this account can't get, or a channel id that isn't one of its own.

### `GET /settings/notification-events` — admin (0.45+)

What the household channels (Discord, ntfy, Telegram, Pushover, email and
the webhook under Settings › Integrations › Household channels) post. Each
notification is posted there once, from the admin's copy (a new request,
say, not once per reviewer).

```json
{
  "events": [
    { "event": "request_approved", "label": "A request is approved", "enabled": true },
    { "event": "issue_updated", "label": "A reported problem is fixed", "enabled": false }
  ]
}
```

The defaults are what those channels posted before 0.45: everything except
`issue_updated` (and `request_not_found` is on unless the admin already
saved a choice before 0.46). `title_shared` is never listed here: a shared
title is only ever sent to the person it was shared with; nor is
`request_still_looking`: the household hears the reviewers' "Couldn't find"
instead. **`PUT`** — `{ "events": { "issue_updated": true } }`: only
what's sent changes; answers as `GET`. `403` for anyone but the admin.

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
  "linked": { "plex": false, "jellyfin": true, "sso": false },
  "hasPassword": false,
  "lastActiveAt": "2026-09-25T18:42:10.000Z",
  "movieQuotaLimit": 5,
  "movieQuotaDays": 7,
  "tvQuotaLimit": null,
  "tvQuotaDays": 7
}
```

`linked` / `hasPassword`: as on `/me`. Website: a small "Plex" / "Jellyfin"
/ "SSO" tag on linked rows.

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
| `role` | string | 0.39+, admin only, another member's account: `"member"` or `"trusted"`. Website: a "Role" select ("Member", "Trusted — can approve requests and handle problem reports"). Errors: "Role is member or trusted.", "You can't change your own role.", "The admin's role can't be changed." |
| `movieQuotaLimit`, `tvQuotaLimit` | number \| null | 0.39+, admin only: at most this many requests of that type in any `…QuotaDays` days (1–1000); `null` or `""` removes the limit; omitted = unchanged. Website: "Request limits" rows "Movies [ ] every [7] days" |
| `movieQuotaDays`, `tvQuotaDays` | number | 0.39+, admin only: 1–365 (default 7) |

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
Plex, Jellyfin or single sign-on set up (or the account is still linked to
one). Each of these answers the updated **`Me`** (as `GET /me`).

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
- **`POST /me/links/sso/start`** (0.44+) — no body. Same answer as `POST
  /auth/sso/start`; the page it opens asks to link {name} to this account,
  and the handle works only for this account's link.
- **`POST /me/links/sso/poll`** (0.44+) — `{ "handle": "…" }`. `202` until
  finished in the browser, then `200` `Me`. `410 expired`, `403` "Your
  {name} account isn't allowed to use Marquee…" (required group), `409`
  "This {name} account is already linked to another Marquee account.".
  Linking replaces an earlier SSO link of this account.
- **`DELETE /me/links/plex`**, **`DELETE /me/links/jellyfin`**, **`DELETE
  /me/links/sso`** (0.44+) — `200` `Me` (also when it wasn't linked). `409`
  "Set a password first — without Plex, there'd be no way to sign in to this
  account." (or "without Jellyfin" / "without single sign-on") when the
  account has no password and no other link.

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

### `GET /settings/sso` · `PUT` · `DELETE` — admin (0.44+)

Single sign-on with any OpenID Connect provider. Website: the "Single
sign-on" card under Settings → Integrations → Sign-in.

```json
{
  "configured": true,
  "name": "Authentik",
  "issuer": "https://auth.example.com/application/o/marquee/",
  "clientId": "marquee",
  "hasClientSecret": true,
  "scopes": "openid profile email",
  "publicUrl": "https://marquee.example.com",
  "callbackUrl": "https://marquee.example.com/api/auth/sso/callback",
  "allowSignup": false,
  "matchEmail": false,
  "requiredGroup": "marquee-users",
  "trustedGroup": null,
  "groupsClaim": "groups"
}
```

- `configured: false` — not set up; the other fields are the defaults, with
  `publicUrl` / `callbackUrl` from the address this request came in on.
- `publicUrl`: Marquee's address as people reach it; `callbackUrl` (derived)
  is the redirect URI to register with the provider **exactly**. The web
  button and the apps' pages always use this address.
- The client secret is never returned; `hasClientSecret` says whether one is
  saved (none = a public client, PKCE only).
- `allowSignup` (default off): new member accounts from SSO sign-in.
  `matchEmail` (default off): link an existing account whose username is
  the person's email on their first sign-in — only when the provider says
  `email_verified: true`, never the admin account, never an account already
  linked to another identity.
- `requiredGroup`: only identities with this group (in the `groupsClaim`
  claim of the ID token or userinfo; a dotted path like
  `realm_access.roles` works) may sign in or link. `trustedGroup`: members
  with it become `trusted` when they sign in (never admin; never demoted).

`PUT` takes the same fields (`configured`, `hasClientSecret` and
`callbackUrl` ignored) plus `clientSecret` (write-only; missing or blank
keeps the saved one — only while `issuer` stays the same provider) and
`clearClientSecret: true` (remove it). It fetches the provider's discovery
document first and stores the issuer exactly as that states it; answers the
saved settings. Errors: `400 invalid` ("Give the sign-in button a name, like
Authentik.", "Enter the provider's issuer URL (starting with https://).",
"Enter the client ID from your identity provider.", "Enter Marquee's
address, like https://marquee.example.com.", "Enter the client secret again
— the saved one belongs to the previous provider."), `502 upstream` with the
reason discovery failed. `DELETE` turns SSO off (answers the defaults);
accounts keep their links for if the same provider is set up again. `403`
"Only the admin can change sign-in settings." for members.

#### `POST /settings/sso/test` — admin (0.44+)

`{ "issuer": "https://auth.example.com/application/o/marquee/" }` (the issuer
or its `…/.well-known/openid-configuration` URL). Checks the discovery
document without saving anything.

```json
{
  "issuer": "https://auth.example.com/application/o/marquee/",
  "authorizationEndpoint": "https://auth.example.com/application/o/authorize/",
  "tokenEndpoint": "https://auth.example.com/application/o/token/",
  "userinfoEndpoint": "https://auth.example.com/application/o/userinfo/",
  "warnings": []
}
```

`warnings`: things that work but deserve a look ("The provider isn't using
https — sign-ins and the client secret travel unencrypted."). Errors: `400
invalid`, `502 upstream` with the reason ("… answered 404.", "The provider
calls itself "…", not "…". Use its issuer URL exactly.").

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
    "connected": false, "name": "Jellyfin", "baseUrl": null, "hasApiKey": false,
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
  },
  "arrServers": [
    {
      "id": "4f0c2a8e-1b7d-4c1e-9a55-3c2d8e6f7a10",
      "kind": "sonarr",
      "name": "Sonarr",
      "baseUrl": "http://192.168.1.10:8989",
      "hasApiKey": true,
      "is4k": false,
      "isDefault": true,
      "qualityProfileId": 4,
      "rootFolderPath": "/tv",
      "tags": [],
      "seriesType": "standard",
      "seasonFolders": true,
      "animeQualityProfileId": 7,
      "animeRootFolderPath": "/anime",
      "animeTags": [3],
      "fullyConfigured": true,
      "webhookUrl": "http://marquee.local:3000/api/webhooks/servers/4f0c2a8e-1b7d-4c1e-9a55-3c2d8e6f7a10?secret=9b1e…"
    },
    {
      "id": "7d2a9e40-3c1b-4f6e-8a2d-5b9c0e1f4a73",
      "kind": "radarr",
      "name": "4K Radarr",
      "baseUrl": "http://192.168.1.10:7879",
      "hasApiKey": true,
      "is4k": true,
      "isDefault": true,
      "qualityProfileId": 5,
      "rootFolderPath": "/movies-4k",
      "tags": [],
      "seriesType": null,
      "seasonFolders": null,
      "animeQualityProfileId": null,
      "animeRootFolderPath": null,
      "animeTags": [],
      "fullyConfigured": true,
      "webhookUrl": "http://marquee.local:3000/api/webhooks/servers/7d2a9e40-3c1b-4f6e-8a2d-5b9c0e1f4a73?secret=51c0…"
    }
  ]
}
```

`arrServers` (0.43+; an older server omits it): every Sonarr and Radarr
server, the `ArrServer` shape of `GET /settings/arr-servers` — the website's
"Download Clients" list. When it's present, show that list instead of the
four fixed cards. `sonarr`, `radarr`, `sonarr4k` and `radarr4k` are still
filled in for older clients, from the **default** server of each (the default
standard Sonarr, the default 4K Radarr…).

`jellyfin.name` (0.40+): "Jellyfin" or "Emby" — the same card connects
either (website: "Jellyfin or Emby"). `sonarr4k` / `radarr4k` (0.37+; an older server omits them): the optional 4K
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

### Sonarr / Radarr servers (0.43+)

Any number of each, managed here (the fixed per-provider endpoints below are
the older way to do the same for one default server of each kind). Every
server has its own settings, used when a title is added to it:

#### `ArrServer`

| Field | Type | |
|---|---|---|
| `id` | string | |
| `kind` | string | `"sonarr"` or `"radarr"` |
| `name` | string | shown everywhere a server is named ("Radarr 2") |
| `baseUrl` | string | |
| `hasApiKey` | bool | always true; the key itself is never returned |
| `is4k` | bool | a 4K server: 4K requests and "Add in 4K" go here, and it isn't part of the library (see the 4K notes above) |
| `isDefault` | bool | where titles go when nobody picks a server: there's always exactly one default standard and (once any exists) one default 4K server of each kind |
| `qualityProfileId`, `rootFolderPath` | number / string, nullable | used when adding; both needed (`fullyConfigured`) |
| `tags` | number[] | tag ids added with every title |
| `seriesType` | string, nullable | Sonarr: `"standard"`, `"daily"` or `"anime"` — for non-anime shows. Radarr: null |
| `seasonFolders` | bool, nullable | Sonarr: sort episodes into season folders. Radarr: null |
| `animeQualityProfileId`, `animeRootFolderPath` | nullable | Sonarr: used instead for anime shows (null = the regular one) |
| `animeTags` | number[] | Sonarr: tags for anime shows (used instead of `tags` when not empty) |
| `fullyConfigured` | bool | |
| `webhookUrl` | string | this server's own webhook URL, with its own secret (built from the request's `Host` / `X-Forwarded-Proto`) |

Anime shows (TMDb "anime" keyword, or Animation from Japan) always get
series type `"anime"` unless the reviewer picks another under Advanced.

#### `GET /settings/arr-servers` — admin

```json
{ "results": [ { "id": "4f0c2a8e-1b7d-4c1e-9a55-3c2d8e6f7a10", "kind": "sonarr", "name": "Sonarr", "baseUrl": "http://192.168.1.10:8989", "hasApiKey": true, "is4k": false, "isDefault": true, "qualityProfileId": 4, "rootFolderPath": "/tv", "tags": [], "seriesType": "standard", "seasonFolders": true, "animeQualityProfileId": null, "animeRootFolderPath": null, "animeTags": [], "fullyConfigured": true, "webhookUrl": "http://marquee.local:3000/api/webhooks/servers/4f0c2a8e-1b7d-4c1e-9a55-3c2d8e6f7a10?secret=9b1e…" } ] }
```

Sonarr first, then Radarr; within each the standard servers before the 4K
ones, the default first, then oldest first.

#### `POST /settings/arr-servers/test` — admin

"Test": checks a connection without saving it and returns what the pickers
need. Body: `{ "kind": "radarr", "baseUrl": "http://192.168.1.10:7878", "apiKey": "…" }`.
Editing a saved server, send `serverId` instead of `apiKey` to test with its
saved key — only allowed while `baseUrl` is its saved one (or omitted):
a changed URL needs the key typed again, so a saved key is never sent
anywhere new.

```json
{
  "ok": true,
  "version": "5.26.2.10099",
  "qualityProfiles": [ { "id": 4, "name": "HD-1080p" }, { "id": 6, "name": "HD - 720p/1080p" } ],
  "rootFolders": [ { "id": 1, "path": "/movies" }, { "id": 3, "path": "/movies-kids" } ],
  "tags": [ { "id": 2, "label": "kids" } ]
}
```

Errors: `400` "URL and API key are required." / "Enter the API key again to
change the URL." / `"kind" must be sonarr or radarr.`, `404` "Server not
found." (unknown `serverId`), `502` "Couldn't connect. Check the URL and API
key and try again.".

#### `POST /settings/arr-servers` — admin

"Add server". Tests the connection, then saves it. `201 Created` with
`{ "ok": true, "server": ArrServer }`.

| Body field | Type | |
|---|---|---|
| `kind` | string | **required**: `"sonarr"` or `"radarr"` |
| `baseUrl`, `apiKey` | string | **required** (trailing slashes trimmed) |
| `name` | string | optional, ≤ 60 chars; blank = "Sonarr" / "Radarr" / "4K Sonarr" / "4K Radarr" (numbered when taken: "Radarr 2") |
| `is4k` | bool | optional, default false |
| `isDefault` | bool | optional; the first server of its kind and 4K-ness is always the default. `true` takes the default from the current one |
| `qualityProfileId`, `rootFolderPath` | | optional; omitted = the server's first |
| `tags` | number[] | optional, default `[]` |
| `seriesType` | string | Sonarr, optional, default `"standard"` |
| `seasonFolders` | bool | Sonarr, optional, default true |
| `animeQualityProfileId`, `animeRootFolderPath` | | Sonarr, optional, default null |
| `animeTags` | number[] | Sonarr, optional, default `[]` |

Errors: as for `test`, plus `400` with the field's message
(`"tags" must be a list of numbers.`, "Name can be at most 60 characters.", …).

#### `PATCH /settings/arr-servers/{id}` — admin

"Save" on an edited server. Any of the `POST` fields except `kind`; omitted =
unchanged, and `apiKey` omitted or blank keeps the saved key. Changing
`baseUrl` or `apiKey` tests the connection again first (and a new `baseUrl`
needs `apiKey` — "Enter the API key again to change the URL."). Sonarr-only
fields are ignored for Radarr. Nullable fields take `null` to clear them.
`{ "ok": true, "server": ArrServer }`.

`isDefault: true` makes it the default of its kind and 4K-ness. The default
can't be switched off directly: `isDefault: false` on it is `409` "Make
another server the default instead." (removing it, or moving it between
standard and 4K, hands the default to the oldest remaining server there).

#### `GET /settings/arr-servers/{id}/options` — admin

The saved server's pickers: `{ "qualityProfiles": […], "rootFolders": […], "tags": […] }`
(the same lists as `test`). `404` "Server not found.", `502` "Couldn't reach
Radarr 2. Check its connection in Settings.".

#### `POST /settings/arr-servers/{id}/webhook-secret` — admin

"Regenerate" this server's webhook secret; its old URL stops working at once.
`{ "ok": true, "webhookUrl": "http://…/api/webhooks/servers/…?secret=…" }`.

#### `DELETE /settings/arr-servers/{id}` — admin

"Remove". Titles on that server stop counting as in the library (unless
another server has them) once the library re-syncs, which starts right away.
`{ "ok": true }`. The website confirms first. `404` "Server not found.".

The webhook: in Sonarr/Radarr → Settings → Connect → Add → Webhook, paste the
server's `webhookUrl` (method POST, on Grab and on Import/Download). Webhook
URLs from before 0.43 (`arrWebhooks`) keep working.

### Sonarr / Radarr (one default server each)

`{provider}` is `sonarr` or `radarr` (default ports 8989 / 7878). Since 0.43
these act on the **default** server of that kind (`sonarr4k` / `radarr4k`:
the default 4K one): `PUT` updates it, or adds it as a new default server
when there's none; `DELETE` removes it.

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
    { "id": "not-found-check", "name": "Can't Find Check", "schedule": "Every hour", "description": "Looks for approved requests that Sonarr/Radarr still hasn't found a copy of, and tells the admin and trusted members." },
    { "id": "disk-space-snapshot", "name": "Disk Space Snapshot", "schedule": "Daily at 3:00 AM", "description": "Records free/used disk space for the storage forecast shown elsewhere in the app." },
    { "id": "cleanup", "name": "Database Cleanup", "schedule": "Daily at 3:30 AM", "description": "Clears out old notifications and activity, year-old disk snapshots, and expired app sign-ins so the database doesn't grow forever." }
  ]
}
```

`403` "Only the admin can run jobs." for members.

### `GET /settings/not-found` · `PUT` — admin (0.46+)

The Can't Find Check's wait: how many hours after approval a request
Sonarr/Radarr hasn't found is listed and alerted (default 24). The website
shows it under that job on Settings › Jobs: "Flag a request after [24]
hours without a find".

```json
{ "afterHours": 24 }
```

**`PUT`** — `{ "afterHours": 48 }`, a whole number from 1 to 720; answers
as `GET`. `400` otherwise, `403` for anyone but the admin.

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
| | `GET /discover/lists/{list}` | user |
| | `GET /movies` | user |
| | `GET /movies/extras` | user |
| | `GET /series` | user |
| | `GET /series/extras` | user |
| | `POST /surprise` | user |
| | `GET /search` | user |
| | `GET /search/suggest` | user |
| Title | `GET /titles/{type}/{tmdbId}` | user |
| | `GET /titles/tv/{tmdbId}/seasons/{season}` | user |
| | `POST /titles/{type}/{tmdbId}/share` | user |
| | `GET /users/shareable` | user |
| Library status & Sonarr/Radarr | `GET /titles/{type}/{tmdbId}/status` | user |
| | `POST /titles/{type}/{tmdbId}/add` | user (admin enforced) |
| | `GET /titles/{type}/{tmdbId}/add-options` | admin or trusted |
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
| | `POST /titles/{type}/{tmdbId}/request-all-missing` | user |
| | `GET /requests/mine` | user |
| | `GET /requests/pending` | admin |
| | `GET /requests/history` | admin |
| | `GET /requests/pending-count` | user |
| | `POST /requests/{id}/approve` | admin |
| | `POST /requests/{id}/manual-approve` | admin |
| | `POST /requests/{id}/reject` | admin |
| | `POST /requests/approve-all` | admin |
| | `GET /requests/not-found` | admin |
| | `POST /requests/{id}/not-found/search` | admin |
| | `POST /requests/{id}/not-found/dismiss` | admin |
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
| | `GET /settings/arr-servers` · `POST` | admin |
| | `POST /settings/arr-servers/test` | admin |
| | `PATCH /settings/arr-servers/{id}` · `DELETE` | admin |
| | `GET /settings/arr-servers/{id}/options` | admin |
| | `POST /settings/arr-servers/{id}/webhook-secret` | admin |
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
| | `GET /settings/not-found` · `PUT` | admin |
| Settings: About & Changelog | `GET /settings/about` | user |
| | `GET /changelog` | user |
| Help | `GET /help/errors` | user |

## Not exposed (and why)

- **Theme (light/dark)** — a per-browser preference stored in `localStorage`; nothing server-side.
- **`/api/webhooks/{provider}/{userId}`** and **`/api/webhooks/servers/{serverId}`** — inbound Sonarr/Radarr webhooks, not a client API (their URLs are in `GET /settings/integrations` and each `ArrServer`).
- **Disk-space summary/forecast** — computed in `lib/integrations/disk-space.ts` but not shown on any page; only the daily snapshot job is exposed (`POST /settings/jobs/disk-space-snapshot/run`).
- **Device/token management** — the website has no UI for it; `POST /auth/logout` revokes the current token and a password change revokes all of an account's tokens.
