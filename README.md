# Marquee

> **🚧 Beta.** Actively developed and tested daily against a real Plex/Sonarr/Radarr
> setup, but still early — expect rough edges, schema changes between updates,
> and the occasional bug. Back up your database before updating. Found something
> broken? [Open an issue](https://github.com/TimmyAmant/marquee/issues).

A self-hosted dashboard that ties your media metadata together with what you
actually own. Look up any actor, studio, or franchise, see instantly whether
it's already in your Plex library or being downloaded, and send anything
missing straight to Sonarr or Radarr — all from one page, without digging
through three different apps.

Runs on your home network (Unraid, Synology, a spare box, whatever) next to
the Plex/Sonarr/Radarr you already have. Not a hosted service — your data,
your server.

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

### Search
- Title, person, and studio search with live autocomplete suggestions.
- **Genre search** — type "action", "horror", "comedy" (or a TV genre like
  "Sci-Fi & Fantasy") and get every matching movie/TV show.
- **Theme/keyword search** — for queries that aren't a genre (e.g. "natural
  disaster"), falls back to TMDb's keyword tagging to find matches.

### Title pages
- Full details: overview, year, trailer, and links to IMDb/Instagram/X
  (Twitter)/Facebook.
- Live ownership status: **Owned / Downloading / Monitored / Not owned**,
  checked directly against Plex/Sonarr/Radarr.
- One-click **Add to Radarr/Sonarr** using your saved quality
  profile/root folder — re-enables monitoring automatically if the title
  was already added and then unmonitored.
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

### People & studios
- Full filmography for any actor/person — every movie and TV credit with
  character name, cross-referenced against your library.
- Full catalog for any studio, with the same conglomerate-merging as title
  pages.
- **Favorite** button on people and studios to build a personal watchlist.

### My Library
- One aggregated view of everything already in Plex, Sonarr, and Radarr.
- Header stats: movie count, TV show count, total size on disk, plus a
  count of anything monitored/downloading but not yet owned.
- Filter by type (Movie/TV) and status (Owned/Downloading/Monitored/Not
  owned), sort by Newest/Oldest/A–Z/Recently added, search within your
  library, and switch between grid and table views.
- **Stop monitoring** a title directly from the library.

### Favorites
- One page listing every person and studio you've starred.

### Accounts & settings
- One-time first-run setup creates the admin account — no public signup
  page after that.
- Add accounts for other household members from **Settings → Account**.
- **Settings → Integrations**:
  - **TMDb** — one shared API key/access token for the whole instance,
    editable in-app (test-and-save) or via environment variable.
  - **Plex** — OAuth connect, shows your library's movie/TV counts, syncs
    automatically in the background.
  - **Sonarr / Radarr** — server URL + API key (test-and-save), with
    default quality profile and root folder for new adds.
- "Keep me signed in for 30 days" login option, rate-limited sign-in
  attempts, and all saved integration credentials encrypted at rest.

### Self-hosting
- Single self-contained Docker image — Postgres runs inside the same
  container as the app, so there's nothing else to install or wire up.
  Database migrations apply automatically on every start.
- Works out of the box on Unraid, either via Docker Compose or a native
  Community Applications template.

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
| `MASTER_ENCRYPTION_KEY` | `openssl rand -base64 32` — **back this up**, losing it makes saved Sonarr/Radarr/Plex credentials undecryptable |
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
(one-time setup, no public signup after); connect Plex/Sonarr/Radarr from
**Settings → Integrations** once you're in.

## Unraid

Two ways to run it on Unraid, pick one:

**Option A — Compose Manager**
Install the **Compose Manager** plugin from Community Applications, point it
at this repo's `docker-compose.yml`. Change `APP_PORT` in `.env` first if it
collides with something else you're running.

**Option B — native Community Applications template (recommended)**
1. In the **Apps** tab, go to **Settings → Template Repositories** and add:
   `https://github.com/TimmyAmant/marquee`
2. Search **Apps** for "marquee" and install it. It's a single container —
   just fill in `POSTGRES_PASSWORD` and the other fields the template asks
   for (same variables as the `.env` table above); everything else,
   including where the database is stored, is pre-filled with sane
   defaults.

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
