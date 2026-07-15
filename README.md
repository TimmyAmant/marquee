# Marquee

A self-hosted dashboard that ties your media metadata together with what you
actually own. Look up any actor, studio, or franchise, see instantly whether
it's already in your Plex library or being downloaded, and send anything
missing straight to Sonarr or Radarr — all from one page, without digging
through three different apps.

Runs on your home network (Unraid, Synology, a spare box, whatever) next to
the Plex/Sonarr/Radarr you already have. Not a hosted service — your data,
your server.

## What it does

- **Browse & search** — full TMDb catalog, with genre/theme search (e.g.
  "action" or "natural disaster") on top of the usual title/person/studio
  search.
- **Full filmographies & studio catalogs** — click an actor or a studio and
  see everything they've ever made, cross-referenced against your library.
- **Know what you own** — connect Plex once; every title shows Owned,
  Downloading, Monitored, or Not Owned automatically.
- **One-click add** — missing something? Send it straight to Sonarr or
  Radarr without leaving the page.
- **Franchises & crossovers** — movie collections (Harry Potter, Bond, etc.)
  pulled straight from TMDb, plus a curated list for TV crossovers
  (Arrowverse, 9-1-1, One Chicago, NCIS).
- **Favorites** — star actors and studios to build a personal watchlist.
- **Household accounts** — one admin setup, then add accounts for other
  household members from Settings. No public signup.

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
| `POSTGRES_PASSWORD` | pick anything — Compose won't start without it |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `MASTER_ENCRYPTION_KEY` | `openssl rand -base64 32` — **back this up**, losing it makes saved Sonarr/Radarr/Plex credentials undecryptable |
| `TMDB_API_KEY` (or `TMDB_ACCESS_TOKEN`) | [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api) — can also be set later from Settings → Integrations instead |
| `TVDB_API_KEY` / `TVDB_PIN` | [thetvdb.com/api-information](https://thetvdb.com/api-information) |

Then:

```bash
docker compose up -d --build
```

Visit `http://<your-server-ip>:3000`. First visit creates the admin account
(one-time setup, no public signup after); connect Plex/Sonarr/Radarr from
**Settings → Integrations** once you're in.

**On Unraid:** install the **Compose Manager** plugin from Community
Applications, point it at this repo's `docker-compose.yml`. Change
`APP_PORT`/`POSTGRES_PORT` in `.env` first if they collide with something
else you're running.

## Local development

```bash
npm install
docker compose up -d postgres   # just the database
cp .env.local.example .env.local
npm run dev
```

Schema changes: `npx drizzle-kit generate` then `npx drizzle-kit migrate`.

## Support

Found a bug or have a question? [Open an issue](https://github.com/TimmyAmant/marquee/issues).
