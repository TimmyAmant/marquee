# Getting started

Everything you need to install, update and run Marquee. The short version is in
the [README](../README.md#getting-started), and what Marquee can do once it's
running is in [every feature, explained](features.md).

## Download

| | |
|---|---|
| **Server** (required) | `docker pull timmyamant/marquee:latest`, or the Unraid template. See [Quick start](#quick-start-docker) |
| **Mac app** | **Marquee-&lt;version&gt;.dmg** from the [latest release](https://github.com/TimmyAmant/marquee/releases/latest) |
| **Windows app** | **Marquee-Setup-&lt;version&gt;.exe** from the [latest release](https://github.com/TimmyAmant/marquee/releases/latest) |

The apps are optional: the website does everything they do, in any browser.

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
| `TRUSTED_PROXY_HOPS` | optional, only behind a reverse proxy or tunnel: see [Remote access](remote-access.md#behind-a-proxy-trusted_proxy_hops) |

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
defaults. The template is [`unraid-templates/marquee.xml`](../unraid-templates/marquee.xml).
Prefer Compose? Point the **Compose Manager** plugin at `docker-compose.yml`.

## Mac and Windows apps

Native apps that talk to your server and update themselves from each
[release](https://github.com/TimmyAmant/marquee/releases/latest). The Mac app
finds your server on the network by itself; on Windows, type its address.
They need a server running 0.22.0 or later.

- **Mac** (macOS 15+): open the `.dmg` and drag Marquee into Applications. The
  app isn't notarized yet, so the first launch needs **System Settings ›
  Privacy & Security › Open Anyway**. Details: [`mac/README.md`](../mac/README.md).
- **Windows** (10 1809+ or 11, preview): run the installer; no admin rights
  needed. It isn't code-signed yet, so SmartScreen may need **More info › Run
  anyway**. Details: [`windows/README.md`](../windows/README.md).

| | |
|---|---|
| ![Finding your server](screenshots/mac-connect.jpg) | ![Discover in the Mac app](screenshots/mac-discover-rail.jpg) |

## Remote access

Marquee speaks plain HTTP on your LAN. To reach it from anywhere, the
recommended way is a free **Cloudflare Tunnel** with your own domain: no open
ports, and HTTPS included. The [remote access guide](remote-access.md)
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
The JSON API the apps use is documented in [`docs/api-v1.md`](api-v1.md).
Dashboards (Homepage, Homarr), scripts and other tools can use it with an
admin-issued API key: see [`docs/integrations.md`](integrations.md).

## Locked out?

Reset the admin password from inside the container (`marquee-app-1` with
Compose, `Marquee` on Unraid):

```bash
docker exec -it <container-name> npm run reset-admin-password -- <new-password>
```
