# Migrating from Seerr, Overseerr or Jellyseerr

Marquee can import a running Seerr (or Overseerr / Jellyseerr) through its
HTTP API — no database files, nothing installed on the Seerr side. Available
from server version 0.51, under **Settings › Integrations › Coming from
Seerr? › Import from Seerr** (admin only). The Mac and Windows apps show the
same card and open this page in your browser.

Tested against Seerr 3.4.1; Overseerr and Jellyseerr answer the same
endpoints (Overseerr has no blocklist, so that part is simply empty).

## Before you start

1. Keep Seerr running until the import is done — it's read live.
2. In Marquee, connect **TMDb** (Settings › Integrations) — requests and
   problem reports need it for their titles and posters — and, if you want
   requests tied to your download servers, add the same **Sonarr/Radarr**
   servers Seerr uses, at the same addresses.
3. Copy Seerr's API key: **Settings › General › API key** in Seerr.

The key is sent to your Marquee server for each step of the import and is
held in memory only while the import runs. It is never stored or logged.

## The steps

1. **Connect** — Seerr's address (e.g. `http://192.168.1.20:5055`) and the
   API key. *Test connection* checks it answers like Seerr and that the key
   is an admin's.
2. **Preview** — reads everything and shows what would happen: each account
   and what it becomes, request/report/blocklist counts, how Seerr's servers
   map to yours, and anything to know. Nothing changes.
3. **Import** — choose what to bring over (accounts, requests, problem
   reports, blocklist), run it, watch the progress, and download the report
   (JSON) at the end.

Running it again is safe: what's been imported is remembered (keyed by the
Seerr's host and port), so a second run only picks up what's new in Seerr
since. Something you deleted in Marquee in the meantime comes back on a
re-run (the report says how many).

Nothing is sent to Sonarr or Radarr by the import, nobody is notified, and
pending requests stay pending for you to review in Marquee.

## What maps to what

### Accounts

Each Seerr account is matched to an existing Marquee account, in this order:

| Seerr | Marquee |
|---|---|
| Plex account (`plexId`) | the account linked to that Plex account |
| Jellyfin/Emby user (`jellyfinUserId`) | the account linked to that Jellyfin user |
| email | an account whose username is that email |
| username / Plex name / Jellyfin name | an account with that username (case-insensitive) |

Never by display name. **Seerr's admin (the `ADMIN` permission) becomes
you**, the Marquee admin — unless their Plex/Jellyfin account is already
linked to another Marquee account, in which case that account is used and
gets the *Trusted* preset. Marquee has one admin; an import never creates a
second one.

Unmatched accounts are created as **members**: Plex and Jellyfin/Emby
accounts are linked (they sign in with Plex / Jellyfin, provided you've
connected the same server in Marquee); local accounts are created **without a
password** — set one for each under Settings › Account, or link Plex/Jellyfin
for them. No password hashes are copied. Usernames are made to fit Marquee's
rules (`letters, digits, . _ -`) and made unique (`anna`, `anna2`).

Matched accounts keep their own permissions and limits unless you tick *Also
set matched accounts' permissions and request limits from Seerr*; your own
admin account is never changed.

### Permissions

Seerr's bitmask → Marquee's switches (lib/users/permissions.ts):

| Seerr | Marquee |
|---|---|
| `ADMIN` | the *Trusted* preset (everything a non-admin can have) |
| `REQUEST` | Request movies + Request series |
| `REQUEST_MOVIE` / `REQUEST_TV` | Request movies / Request series |
| `REQUEST_4K` | Request 4K movies + Request 4K series |
| `REQUEST_4K_MOVIE` / `REQUEST_4K_TV` | Request 4K movies / Request 4K series |
| `AUTO_APPROVE` | Auto-approve movies + series |
| `AUTO_APPROVE_MOVIE` / `AUTO_APPROVE_TV` | Auto-approve movies / series |
| `AUTO_APPROVE_4K` | Auto-approve 4K movies + 4K series |
| `AUTO_APPROVE_4K_MOVIE` / `AUTO_APPROVE_4K_TV` | Auto-approve 4K movies / 4K series |
| `REQUEST_ADVANCED` | Advanced request options |
| `REQUEST_VIEW` | View other people's requests |
| `MANAGE_REQUESTS` | Review requests (which includes viewing them) |
| `MANAGE_ISSUES` | Manage problem reports |
| `CREATE_ISSUES` | Report problems |
| `MANAGE_BLOCKLIST` | Manage the blocklist |

Dropped, with no equivalent (the preview lists them per account):
`MANAGE_SETTINGS` and `MANAGE_USERS` (the admin's alone in Marquee), `VOTE`,
`VIEW_ISSUES`, `VIEW_BLOCKLIST`, `AUTO_REQUEST*`, `RECENT_VIEW`,
`WATCHLIST_VIEW` (Marquee shows those to everyone, or doesn't have them).

### Request limits

The limits in force for each account (their own, else Seerr's global
defaults, as `GET /user/{id}/quota` reports them) become Marquee's request
limits: *N movies per D days* and *N series per D days*. A Seerr limit of 0
means no limit.

### Requests

| Seerr | Marquee |
|---|---|
| status `PENDING` | pending (stays pending, no reviewer alert) |
| `APPROVED`, `FAILED`, `COMPLETED` | approved (a reviewer said yes; availability comes from your library) |
| `DECLINED` | declined (Seerr keeps no reason, so none is shown) |
| `seasons` | the seasons asked for; none listed = the whole series |
| `is4k` | 4K |
| `requestedBy` / `modifiedBy` | requester / reviewer (you when the reviewer isn't here) |
| `createdAt` / `updatedAt` | requested at / reviewed at |
| `serverId`, `profileId`, `rootFolder`, `tags` | the Marquee Sonarr/Radarr **at the same address** (scheme, host, port, base path) as Seerr's server, plus the profile/folder/tags; a server with no Marquee match keeps its name only |

A request whose requester isn't in Marquee (accounts not imported, or no
match) is skipped and counted in the report. A request identical to one
already in Marquee (same person, title, 4K, status and seasons) is
recognised and not repeated. A title TMDb no longer knows is imported with a
placeholder name (counted as `titlesWithoutTmdb`).

### Problem reports

| Seerr | Marquee |
|---|---|
| `issueType` VIDEO / AUDIO / SUBTITLES / OTHER | video / audio / subtitles / other |
| `problemSeason`, `problemEpisode` (0 = all) | season / episode |
| status OPEN / RESOLVED | open / fixed (`modifiedBy`, `updatedAt` as who and when) |
| the reporter's first comment | the report's own message |
| the other comments | comments, with their authors and times (a comment by someone not in Marquee is left out) |

### Blocklist

Every blocklisted title becomes a blocked title in Marquee's request
blocklist (Settings › Account › Blocklist). Seerr's tag-based blocklisting
has no equivalent.

### Not imported

- **Personal notification settings** (Discord ids, Telegram chats, Pushover
  keys, email) — they depend on bots and apps set up in Marquee; each person
  adds theirs under Settings › Account › Notifications.
- Seerr's own settings: Sonarr/Radarr connections, Plex/Jellyfin, notification
  agents, Discover sliders. Set those up in Marquee's Settings.
- Watchlists, avatars, per-user locale and region.

## From a script

The same steps are on the API (admin device token only — API keys are
refused, since a Seerr key travels through them):
`POST /api/v1/settings/import/seerr/test`, `…/preview`, `…/run` (answers
202 with a job) and `GET …/jobs/{id}`. See [`api-v1.md`](api-v1.md).
