<p align="center">
<img src="./public/icon-512.png" alt="Marquee" width="120">
</p>
<h1 align="center">Marquee</h1>
<p align="center">
<a href="https://github.com/TimmyAmant/marquee/actions/workflows/ci.yml"><img src="https://github.com/TimmyAmant/marquee/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
<a href="https://github.com/TimmyAmant/marquee/releases/latest"><img src="https://img.shields.io/github/v/release/TimmyAmant/marquee?include_prereleases&label=release" alt="Latest release"></a>
<a href="https://hub.docker.com/r/timmyamant/marquee"><img src="https://img.shields.io/docker/pulls/timmyamant/marquee" alt="Docker pulls"></a>
<a href="https://github.com/TimmyAmant/marquee/blob/main/LICENSE"><img src="https://img.shields.io/github/license/TimmyAmant/marquee" alt="MIT license"></a>
<img src="https://img.shields.io/badge/apps-web%20%7C%20macOS%20%7C%20Windows-e0a63e" alt="Web, macOS and Windows">
<img src="https://img.shields.io/badge/languages-EN%20%7C%20ES%20%7C%20FR%20%7C%20DE%20%7C%20PT--BR-4caf7d" alt="Languages">
</p>

**Marquee** is a free and open source, self-hosted app for requesting movies and
shows **and** knowing exactly what you already have. It works with
[Plex](https://plex.tv), [Jellyfin](https://jellyfin.org) and
[Emby](https://emby.media) even two at once and with
**[Sonarr](https://sonarr.tv)** and **[Radarr](https://radarr.video)**, as many
servers as you run, 4K included. Use it in any browser, on your phone, or in the
native **Mac** and **Windows** apps.

<p align="center">
<img src="docs/screenshots/web-discover-rail.jpg" alt="Marquee's Discover page" />
</p>

## Features

- **Requests with approvals**: whole titles, single seasons or 4K, with per-member limits, permissions, a trusted role and a blocklist; approve straight from the notification.
- **Your library, not just a search box**: live status on every poster, file quality (4K, HDR, codec, audio) on every title, one Library view across Plex, Jellyfin/Emby, Sonarr and Radarr, duplicates and a disk-space forecast.
- **Everyone signs in their way**: local accounts, Plex, Jellyfin/Emby (with Quick Connect) and single sign-on (Authentik, Authelia, Pocket ID, Keycloak, Google…).
- **Notifications that matter**: bell, Web Push and app alerts, plus Discord, ntfy, Telegram, Pushover, email, Gotify, Slack, Pushbullet and webhooks, for the household and for each person.
- **Any number of Sonarr and Radarr servers**, 4K included, with override rules, a release calendar and "Can't find" alerts.
- **Website, Mac, Windows and iPhone apps**, in five languages.

**See every feature → [docs/features.md](docs/features.md)**

## Why Marquee

| | Marquee | Typical request apps |
|---|:---:|:---:|
| Plex **and** Jellyfin/Emby at the same time | ✅ | one server |
| File quality (4K, HDR, codec, audio) on every title | ✅ | ❌ |
| One library view across all your servers, with duplicates and a disk-space forecast | ✅ | ❌ |
| Release calendar | ✅ | ❌ |
| Fix a wrong match, Search now, monitoring toggle | ✅ | ❌ |
| Approve or decline from the notification | ✅ | ❌ |
| "Can't find" alerts after approval | ✅ | ❌ |
| Native Mac and Windows apps | ✅ | ❌ |

## Getting Started

```bash
docker pull timmyamant/marquee:latest
```

Or search **marquee** in Unraid's Apps tab. The
**[Getting started guide](docs/getting-started.md)** covers Docker Compose,
Unraid, the Mac and Windows apps, remote access and development.

## Preview

| Title page | Light theme |
|---|---|
| ![A title page with library status and file details](docs/screenshots/web-title-rail.jpg) | ![The website in its light theme](docs/screenshots/web-light-title-rail.jpg) |
| ![The Mac app](docs/screenshots/mac-discover-rail.jpg) | ![Discover in the Mac app's light theme](docs/screenshots/mac-light-discover-rail.jpg) |

## Coming from Overseerr, Jellyseerr or Seerr?

Marquee runs happily next to them, so you can try it without switching anything
off: point it at the same Plex/Jellyfin/Emby and Sonarr/Radarr, import your
household from Plex or Jellyfin, and let people sign in with the accounts they
already have.

When you're ready to switch, **Settings › General › Coming from Seerr?**
brings everything over from the running Seerr's API with its admin key:
accounts (matched to existing ones by Plex/Jellyfin id, email or username),
permissions and request limits, every request with its seasons and 4K flag,
problem reports with their comments, and the blocklist. Preview first, run
with progress, download a report; run it again later and it only picks up
what's new. See [`docs/migrating-from-seerr.md`](docs/migrating-from-seerr.md).

## API Documentation

Every install serves its API description at `http://<your-server>:3000/api-docs`
(and `/api/v1/openapi.json`). The full reference is
[`docs/api-v1.md`](docs/api-v1.md); dashboards and scripts use
[admin-issued API keys](docs/integrations.md).

## Support

- Read the [Getting started guide](docs/getting-started.md) and the in-app Help first.
- Wondering whether Marquee can do something? [Every feature, explained](docs/features.md).
- Bug reports and feature requests: [GitHub Issues](https://github.com/TimmyAmant/marquee/issues).
- Locked out? See [resetting the admin password](docs/getting-started.md#locked-out).

## Contributing

Pull requests are welcome. Want Marquee in your language? See
[`docs/translating.md`](docs/translating.md).

> **Beta.** Marquee is young and moves fast. Back up your database before
> updating, and [open an issue](https://github.com/TimmyAmant/marquee/issues) if
> something breaks.

## License

[MIT](LICENSE)
