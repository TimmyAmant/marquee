# Marquee

> **🚧 Beta.** Actively developed and tested daily against a real Plex/Sonarr/Radarr
> setup, but still early — expect rough edges, schema changes between updates,
> and the occasional bug. Back up your database before updating. Found something
> broken? [Open an issue](https://github.com/TimmyAmant/marquee/issues).

A self-hosted dashboard that ties your media metadata together with what you
actually own. Look up any actor, studio, or franchise, see instantly whether
it's already in your Plex or Jellyfin library or being downloaded, and send
anything missing straight to Sonarr or Radarr — all from one page, without
digging through three different apps.

Runs on your home network (Unraid, Synology, a spare box, whatever) next to
the Plex/Jellyfin/Sonarr/Radarr you already have. Not a hosted service — your
data, your server.

## Features

### Home & Discover
- Trending-this-week and coming-soon rails on the homepage (public, no
  account needed to browse).
- Discover page: filter by **Movies / TV / Both**, sort by **Popular / Top
  rated / Newest**, filter by **year** and by any of the 16+ TMDb genres.
- **Hide titles you already track** toggle, so Discover only shows what you
  don't have yet.
- Quick-add button right on the poster — add to Sonarr/Radarr without
  opening the title page.
- **Surprise me** button — picks a random title matching your current
  filters, for when you just want something to watch tonight.

### Search
- Title, person, and studio search with live autocomplete suggestions.
- **Genre search** — type "action", "horror", "comedy" (or a TV genre like
  "Sci-Fi & Fantasy") and get every matching movie/TV show.
- **Theme/keyword search** — for queries that aren't a genre (e.g. "natural
  disaster"), falls back to TMDb's keyword tagging to find matches.

### Title pages
- Full details: overview, runtime, rating, genres, year(s), status
  (Continuing/Ended/etc.), network, trailer, and links to IMDb/TheTVDB/
  Instagram/X (Twitter)/Facebook.
- Live ownership status: **Owned / Downloading / Monitored / Coming soon /
  Not owned**, checked directly against Plex, Jellyfin, and Sonarr/Radarr —
  an unreleased title that's already being tracked shows as "Coming soon"
  instead of looking like something's actually missing.
- One-click **Add to Radarr/Sonarr** (admin) using your saved quality
  profile/root folder — re-enables monitoring automatically if the title
  was already added and then unmonitored. Household members see a
  **Request** button instead — see [Household accounts &
  requests](#household-accounts--requests) below.
- Full cast list with character names, linking to each person's page.
- **Studio/production company** section, with conglomerates (Disney,
  Marvel, Lucasfilm, etc.) merged into one entry instead of listed
  separately.
- **Franchise & crossover** section: movie collections (Harry Potter,
  James Bond, etc.) pulled directly from TMDb; a curated list for TV
  crossovers (Arrowverse, 9-1-1 Universe, One Chicago, NCIS Franchise).
- "More like this" recommendations.
- TV shows: season selector with per-season completeness, full episode
  list with per-episode have-it/missing status.
- **File details** section: location (with copy-to-clipboard), size,
  runtime, and — for Radarr-owned movies — resolution, video codec, HDR,
  audio, quality profile, edition, and release group.
- **"Wrong match? Fix ID"** (admin-only) — a title occasionally gets synced
  under the wrong TMDb/TVDB match (e.g. a mislabeled Plex library folder).
  Enter the correct TMDb, IMDb, or TVDB id and Marquee repoints every
  synced row currently linked to the wrong one over to the right title, no
  need to fix the match in Plex/Jellyfin/Sonarr first.

### People & studios
- Full filmography for any actor/person — every movie and TV credit with
  character name, cross-referenced against your library.
- Full catalog for any studio, with the same conglomerate-merging as title
  pages.
- **Favorite** button on people and studios to build a personal watchlist.

### My Library
- One aggregated view of everything already in Plex, Jellyfin, Sonarr, and
  Radarr — shared with every household member, not just the admin who
  connected the integrations.
- Header stats: movie count, TV show count, total size on disk, plus a
  count of anything monitored/downloading but not yet owned.
- Filter by type (Movie/TV) and status (Owned/Downloading/Monitored/Coming
  soon), sort by Newest/Oldest/A–Z/Recently added, search within your
  library, and switch between grid and table views.
- **Stop monitoring** a title directly from the library (admin-only).
- **Missing from collections** tab — franchises you own at least one part of
  but not all of (e.g. Iron Man 1 without 2 or 3), so you can spot and fill
  the gaps in a series without hunting for it one title at a time.
- **Resolution badges** (4K/1080p/720p) on owned Radarr movies, in both the
  grid and table views and on title pages.
- **Storage forecast** — once there's a few days of history, a "free space
  runs out in ~N days" estimate based on how fast your root folders are
  actually filling up.

### Calendar
- Month grid of upcoming releases and air dates, pulled straight from
  Radarr's/Sonarr's own calendar data — accurate release/digital/physical
  dates for movies, per-episode air dates for TV.
- Shared with every household member, same as My Library.

### Notifications
- Bell icon in the nav polls for new activity: a title started downloading,
  finished downloading, or (for household members) one of your requests
  was approved or declined.
- Powered by Radarr/Sonarr webhooks — the URL and a per-account secret are
  generated for you under **Settings → Integrations**.

### Favorites
- One page listing every person and studio you've starred.

### Trakt import
- Paste a public Trakt list or watchlist URL and every matching title not
  already owned or requested gets added to the Requests queue — Trakt
  connects with a free API app's client id, no OAuth/sign-in required (the
  list just needs to be public on Trakt's side).

### Household accounts & requests
- One-time first-run setup creates the **admin** account — no public
  signup page after that.
- The admin adds accounts for other household members from **Settings →
  Account**, and can remove them later. Members only ever see their own
  account there, not the rest of the household.
- Members get the full app — Discover, Search, My Library, Favorites,
  Calendar — but instead of adding titles directly to Sonarr/Radarr, they
  hit **Request**. The admin reviews everything waiting for approval on
  the **Requests** page and approves or declines with one click, or hits
  **Approve all** to clear the whole queue at once when there's more than
  one pending. The requester gets notified either way. Members have their
  own **Requests** tab too, showing the status of everything they've asked
  for — pending, declined, or (once approved) downloading/already in the
  library.
- **Manually approve** — for a TV request Sonarr can't resolve on its own
  (no TVDB id on TMDb's record), the admin gets an "Add manually in Sonarr"
  link straight to Sonarr's own search, and can mark the request approved
  by hand once it's added outside the app. The requester sees "Manually
  approved" so they know it was handled, not stuck.
- Only the admin can connect or reconfigure Plex/Jellyfin/Sonarr/Radarr
  (**Settings → Integrations**) — members can browse and request, not
  wire up new download sources.
- **Settings → Integrations** (admin-only):
  - **TMDb** — one shared API key/access token for the whole instance,
    editable in-app (test-and-save) or via environment variable.
  - **TheTVDB** — optional; fills in a TV show's poster and overview when
    TMDb doesn't have them yet (common for very new or niche releases), the
    same way Sonarr's own metadata does. Free API key from
    thetvdb.com/dashboard/account/apikey.
  - **Plex** — OAuth connect, shows your library's movie/TV counts, syncs
    automatically in the background.
  - **Jellyfin** — server URL + API key (test-and-save; generate the key
    from Jellyfin's own dashboard under Administration → API Keys). Can be
    connected alongside Plex, instead of it, or not at all.
  - **Sonarr / Radarr** — server URL + API key (test-and-save), with
    default quality profile and root folder for new adds.
  - **Disconnect** any of the above with one click — removes the saved
    credential and whatever that integration had synced, so nothing stale
    lingers behind.
- **Settings → Activity** (admin-only): a reverse-chronological feed of who
  requested what and who reviewed it — separate from the per-recipient
  notification bell.
- "Keep me signed in for 30 days" login option, rate-limited sign-in
  attempts, and all saved integration credentials encrypted at rest.

### Error reference
- A plain-language error reference page (`/help/errors`, linked from the
  footer of every page) explaining every user-facing error message in the
  app — what it means and what to do about it — so a stuck admin or
  household member isn't left guessing.

### Version & changelog
- A version number in the footer of every page links to `/changelog`, a
  running list of what changed, was fixed, or was added in each release.

### Self-hosting
- Single self-contained Docker image — Postgres runs inside the same
  container as the app, so there's nothing else to install or wire up.
  Database migrations apply automatically on every start.
- Works out of the box on Unraid, either via Docker Compose or a native
  Community Applications template.
- Mobile-friendly — a hamburger nav and touch-scrollable rows/tables mean
  it's fully usable from a phone, not just desktop.
- Want to reach it from outside your home network? A free [Cloudflare
  Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
  works well and needs no port forwarding — point it at
  `http://<your-server-ip>:3000`.

## Quick start (Docker)

**Requirements:** Docker + Docker Compose, and free API keys from
[TMDb](https://www.themoviedb.org/settings/api) and
[TheTVDB](https://thetvdb.com/api-information) (both free, a couple minutes
to sign up).

```bash
git clone https://github.com/TimmyAmant/marquee.git
cd marquee
cp .env.local.example .env
```

Edit `.env` and fill in:

| Variable | Where to get it |
|---|---|
| `POSTGRES_PASSWORD` | pick anything — this is only for the database bundled inside the container, it's never exposed outside it |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `MASTER_ENCRYPTION_KEY` | `openssl rand -base64 32` — **back this up**, losing it makes saved Sonarr/Radarr/Plex/Jellyfin credentials undecryptable |
| `TMDB_API_KEY` (or `TMDB_ACCESS_TOKEN`) | [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api) — can also be set later from Settings → Integrations instead |
| `TVDB_API_KEY` / `TVDB_PIN` | [thetvdb.com/api-information](https://thetvdb.com/api-information) |

Then:

```bash
docker compose up -d
```

This pulls the prebuilt image from
[Docker Hub](https://hub.docker.com/r/timmyamant/marquee) (amd64 and arm64)
instead of building locally, so it's up in seconds. If you've changed the
source and want to run your own build instead, use
`docker compose up -d --build`.

Visit `http://<your-server-ip>:3000`. First visit creates the admin account
(one-time setup, no public signup after); connect Plex/Jellyfin/Sonarr/Radarr from
**Settings → Integrations** once you're in.

## Unraid

Two ways to run it on Unraid, pick one:

**Option A — Compose Manager**
Install the **Compose Manager** plugin from Community Applications, point it
at this repo's `docker-compose.yml`. Change `APP_PORT` in `.env` first if it
collides with something else you're running.

**Option B — native Community Applications template (recommended)**
Marquee is listed directly in Community Applications — open the **Apps**
tab, search "marquee", and install it. It's a single container — just fill
in `POSTGRES_PASSWORD` and the other fields the template asks for (same
variables as the `.env` table above); everything else, including where the
database is stored, is pre-filled with sane defaults.

The template lives at
[`unraid-templates/marquee.xml`](unraid-templates/marquee.xml) in this repo.

## Local development

The app container bundles Postgres for production/self-hosting, but for
local development it's easiest to run a plain throwaway Postgres alongside
`npm run dev`:

```bash
npm install
docker run -d --name marquee-dev-db -p 5432:5432 -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=marquee postgres:16-alpine
cp .env.local.example .env.local   # set DATABASE_URL=postgres://postgres:devpass@localhost:5432/marquee
npm run dev
```

Schema changes: `npx drizzle-kit generate` then `npx drizzle-kit migrate`.

## Support

Found a bug or have a question? [Open an issue](https://github.com/TimmyAmant/marquee/issues).
