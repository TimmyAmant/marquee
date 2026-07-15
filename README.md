# Marquee

Self-hosted media metadata and library dashboard. Browse TMDb, see what you
already own via Plex, and add/monitor titles in Sonarr and Radarr — all in
one place. Designed to run on your home network (Unraid, Synology, a spare
box, whatever) alongside the Plex/Sonarr/Radarr you already have, not as a
public-facing hosted service.

## Running it (Docker / Unraid)

1. Copy `.env.local.example` to `.env` (Docker Compose reads `.env` by
   default) and fill in:
   - `AUTH_SECRET` — any long random string (`openssl rand -base64 32`).
   - `MASTER_ENCRYPTION_KEY` — a base64-encoded 32-byte key (`openssl rand
     -base64 32`), used to encrypt your saved Sonarr/Radarr/Plex credentials
     at rest. **Back this up** — if it's lost or changed, previously saved
     integration credentials become undecryptable and will need to be
     re-entered.
   - `TMDB_ACCESS_TOKEN` (or `TMDB_API_KEY`) — from
     [themoviedb.org](https://www.themoviedb.org/settings/api).
   - `TVDB_API_KEY` / `TVDB_PIN` — from [thetvdb.com](https://thetvdb.com/api-information)
     (used to cross-reference Sonarr's TVDB ids to TMDb).
   - `POSTGRES_PASSWORD` — pick your own; there's no default, so Compose will
     refuse to start until it's set. `POSTGRES_USER`/`POSTGRES_DB`/`POSTGRES_PORT`
     are optional.

2. Build and start everything:

   ```bash
   docker compose up -d --build
   ```

   This starts Postgres, runs pending database migrations automatically on
   every start, and starts the app on port 3000 (override with `APP_PORT`).

3. Visit `http://<your-server-ip>:3000` — since no account exists yet,
   you'll land on a one-time setup page to create the first (admin) account.
   There's no public signup after that; add accounts for other household
   members from **Settings → Add a household member** once you're signed in.

4. In **Settings → Integrations**, connect Plex (OAuth) and/or Sonarr/Radarr
   (base URL + API key, both reachable from wherever the `app` container
   runs — same LAN or same Docker network). A background sync keeps your
   library status current automatically.

On Unraid specifically: install the **Compose Manager** plugin (Community
Applications), point it at this repo's `docker-compose.yml`, and set
`POSTGRES_PORT`/`APP_PORT` if they'd collide with something else you're
already running.

## Local development

```bash
npm install
docker compose up -d postgres   # just the database
cp .env.local.example .env.local
npm run dev
```

Drizzle migrations: `npx drizzle-kit generate` after schema changes, `npx
drizzle-kit migrate` to apply them.

## Support

Found a bug or have a question? Open an issue:
https://github.com/TimmyAmant/marquee/issues
