# Marquee

A self-hosted dashboard that ties your media metadata together with what you
actually own. Look up any actor, studio or franchise, see at once whether it's
already in your Plex or Jellyfin library or downloading, and send anything
missing straight to Sonarr or Radarr, from one page.

It runs on your home network (Unraid, Synology, a spare box) next to the
Plex/Jellyfin/Sonarr/Radarr you already have. Your data, your server.

> **Beta.** Tested daily against a real setup, but expect rough edges. Back up
> your database before updating, and [open an issue](https://github.com/TimmyAmant/marquee/issues)
> if something breaks.

**Website:** [timmyamant.github.io/marquee](https://timmyamant.github.io/marquee/)

![Marquee's Discover page](docs/screenshots/web-discover-rail.jpg)

<details>
<summary><b>More screenshots</b>: a title page, and the light theme</summary>

![A title page, showing library status and file details](docs/screenshots/web-title-rail.jpg)

| Website | Mac app |
|---|---|
| ![The website in its light theme](docs/screenshots/web-light-title-rail.jpg) | ![The Mac app in its light theme](docs/screenshots/mac-light-title-rail.jpg) |
| ![Discover in the website's light theme](docs/screenshots/web-light-discover-rail.jpg) | ![Discover in the Mac app's light theme](docs/screenshots/mac-light-discover-rail.jpg) |

</details>

## Download

| | |
|---|---|
| **Server** (required) | `docker pull timmyamant/marquee:latest`, or the Unraid template. See [Quick start](#quick-start-docker) |
| **Mac app** | **Marquee-&lt;version&gt;.dmg** from the [latest release](https://github.com/TimmyAmant/marquee/releases/latest) |
| **Windows app** | **Marquee-Setup-&lt;version&gt;.exe** from the [latest release](https://github.com/TimmyAmant/marquee/releases/latest) |

The apps are optional: the website does everything they do, in any browser.

## Features

- **Discover**: trending and coming-soon rows, filters by type, genre, year and
  sort, a "hide what I already have" toggle, quick-add on every poster, and
  **Surprise me**.
- **Search** titles, people and studios with live suggestions, plus genre
  ("horror") and theme ("natural disaster") searches.
- **Title pages** show whether you own it, it's downloading, monitored or
  coming soon, checked live against Plex, Jellyfin, Sonarr and Radarr. They also
  have cast, studios, franchises, recommendations, per-episode status for TV,
  file details (resolution, codec, HDR, audio), and a **Fix ID** for titles
  synced under the wrong match.
- **People and studios**: full filmographies and catalogs, cross-referenced
  with your library, and favorites.
- **Calendar** of upcoming releases and air dates from Sonarr and Radarr.
- **Requests**: members request whole titles or single seasons, in 4K too if
  you run a 4K Sonarr/Radarr. The admin (or a **trusted member**) approves or
  declines with a reason, from the **Requests** page or right from the push
  notification. Per-member auto-approve and request limits (for example 5
  movies a week), and a **blocklist** of titles or keywords nobody can request.
- **Report a problem** with a file (bad video, wrong audio, missing
  subtitles…); the admin can have Sonarr/Radarr search again and mark it fixed.
- **Sign in with Plex, Jellyfin or Emby** (Jellyfin's Quick Connect too), link
  those accounts, import household members from them, and optionally let
  people with access to your server sign themselves up.
- **Single sign-on** with your own identity provider — Authentik, Authelia,
  Pocket ID, Keycloak, Google or any other OpenID Connect provider — on the
  website and the Mac and Windows apps, with optional sign-up, group-based
  access and a "trusted" group.
- **Plex Watchlist** auto-requests, and **Trakt import** of public lists and
  watchlists.
- **Notifications** when something starts or finishes downloading, a request
  is approved or declined, or a new request needs review: in the app, and
  pushed to your devices by your own server (Web Push, and live in the Mac and
  Windows apps). Also Discord, ntfy, webhooks, Telegram, Pushover and email.
- **Settings** for integrations (TMDb, TheTVDB, Plex, Jellyfin/Emby, Sonarr,
  Radarr and their 4K copies), household members with last-active times, an
  activity feed and background jobs. Credentials are encrypted at rest.
- One **Docker image** with Postgres inside and migrations on every start.
  It works on a phone too.

## Quick start (Docker)

You'll need Docker with Compose, and free API keys from
[TMDb](https://www.themoviedb.org/settings/api) and
[TheTVDB](https://thetvdb.com/api-information).

```bash
git clone https://github.com/TimmyAmant/marquee.git
cd marquee
cp .env.local.example .env
```

Fill in `.env`:

| Variable | What to put |
|---|---|
| `POSTGRES_PASSWORD` | anything; it's only for the database inside the container |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `MASTER_ENCRYPTION_KEY` | `openssl rand -base64 32`. **Back it up**: without it, saved integration credentials can't be read |
| `TMDB_API_KEY` | your TMDb key (or set it later in Settings › Integrations) |
| `TVDB_API_KEY` / `TVDB_PIN` | your TheTVDB key |
| `TRUSTED_PROXY_HOPS` | optional, only behind a reverse proxy or tunnel: see [Remote access](docs/remote-access.md#behind-a-proxy-trusted_proxy_hops) |

```bash
docker compose up -d
```

Open `http://<your-server-ip>:3000`. The first visit creates the admin
account; then connect your services in **Settings › Integrations**.

The image is on [Docker Hub](https://hub.docker.com/r/timmyamant/marquee) and
[GitHub Packages](https://github.com/TimmyAmant/marquee/pkgs/container/marquee)
(amd64 and arm64). To run your own build: `docker compose up -d --build`.

## Unraid

Search **marquee** in the **Apps** tab (Community Applications) and install it.
Fill in `POSTGRES_PASSWORD` and the other fields; the rest has sensible
defaults. The template is [`unraid-templates/marquee.xml`](unraid-templates/marquee.xml).
Prefer Compose? Point the **Compose Manager** plugin at `docker-compose.yml`.

## Mac and Windows apps

Native apps that talk to your server and update themselves from each
[release](https://github.com/TimmyAmant/marquee/releases/latest). The Mac app
finds your server on the network by itself; on Windows, type its address.
They need a server running 0.22.0 or later.

- **Mac** (macOS 15+): open the `.dmg` and drag Marquee into Applications. The
  app isn't notarized yet, so the first launch needs **System Settings ›
  Privacy & Security › Open Anyway**. Details: [`mac/README.md`](mac/README.md).
- **Windows** (10 1809+ or 11, preview): run the installer; no admin rights
  needed. It isn't code-signed yet, so SmartScreen may need **More info › Run
  anyway**. Details: [`windows/README.md`](windows/README.md).

| | |
|---|---|
| ![Finding your server](docs/screenshots/mac-connect.jpg) | ![Discover in the Mac app](docs/screenshots/mac-discover-rail.jpg) |

## Remote access

Marquee speaks plain HTTP on your LAN. To reach it from anywhere, the
recommended way is a free **Cloudflare Tunnel** with your own domain: no open
ports, and HTTPS included. The [remote access guide](docs/remote-access.md)
walks through the tunnel, port forwarding, putting Authelia or Cloudflare
Access in front, and the `TRUSTED_PROXY_HOPS` setting.

## Development

```bash
npm install
docker run -d --name marquee-dev-db -p 5432:5432 -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=marquee postgres:16-alpine
cp .env.local.example .env.local   # DATABASE_URL=postgres://postgres:devpass@localhost:5432/marquee
npm run dev
```

Schema changes: `npx drizzle-kit generate`, then `npx drizzle-kit migrate`.
The JSON API the apps use is documented in [`docs/api-v1.md`](docs/api-v1.md).

## Locked out?

Reset the admin password from inside the container (`marquee-app-1` with
Compose, `Marquee` on Unraid):

```bash
docker exec -it <container-name> npm run reset-admin-password -- <new-password>
```

## Support

Found a bug or have a question? [Open an issue](https://github.com/TimmyAmant/marquee/issues).
