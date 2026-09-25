# Marquee for Windows

A native Windows client for [Marquee](../README.md), the self-hosted media dashboard, living in this repo alongside the server it talks to and the [Mac app](../mac/README.md) it mirrors. It uses the server's `/api/v1` HTTP API, so it shows the same data the website does, in a real Windows app.

> **Early preview.** The first cut covers browsing, searching, title, person and studio pages, requests, favorites, notifications and the calendar. See [Status](#status) for what isn't built yet.

The app holds no library of its own. There's no database, no syncing, no webhook listener and no job scheduler on this side: your server already does all of that, and the Windows app reads and writes through the API.

## Requirements

- Windows 10 version 1809 (build 17763) or later, or Windows 11
- A Marquee server running **0.22.0 or later**, reachable from this PC. Decline reasons on requests need **0.28.0 or later**.
- The [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- To build and run the app itself: Visual Studio 2022 with the Windows App SDK workload, or the standalone [Windows App SDK](https://learn.microsoft.com/windows/apps/windows-app-sdk/). The shared library and its tests need neither.

## Building

The solution has three projects. `Marquee.Core` (the API client, its models and the sign-in session) is platform neutral and builds on Windows, macOS and Linux, which is how CI runs its tests on every push:

```bash
cd windows
dotnet build Marquee.Core/Marquee.Core.csproj
dotnet test Marquee.Core.Tests/Marquee.Core.Tests.csproj
```

The app itself is WinUI 3 and needs Windows with Visual Studio 2022 (its Windows App SDK / WinUI component). Open `Marquee.sln` and press F5, or from a Developer PowerShell:

```powershell
cd windows
msbuild Marquee.Windows/Marquee.Windows.csproj -restore -p:Configuration=Release -p:Platform=x64
```

Use Visual Studio's `msbuild` rather than `dotnet build` for the app: the Windows App SDK's resource step loads a packaging task that ships with Visual Studio, not with the .NET SDK.

Build the two project files rather than the solution on macOS or Linux: the solution includes the app, and the Windows targeting pack isn't available there.

Building needs no code-signing certificate or Store account. Warnings are errors across all three projects (`Directory.Build.props`), for the same reason the Mac build fails on a single compiler warning: a warning that survives one release is invisible by the next.

## First run

1. **Find your server.** Launch Marquee and type the host, e.g. `192.168.1.35:3000` or `marquee.local`. Plain HTTP without a port means the Docker default of 3000; an `https://` address behind a reverse proxy works too. The app checks that a Marquee server of a version it can talk to answers there before it lets you continue.
2. **Sign in** with your Marquee username and password. The first account on a brand-new server is created here instead, as the admin.
3. **Notifications.** Right after signing in, the app asks "Get notifications on this PC?". **Turn on** shows new notifications as Windows notifications; **Not now** doesn't, and the question comes back at your next sign-in. Settings → Notifications changes it any time.
4. That's it. Everything else, TMDb, Plex, Jellyfin, Sonarr, Radarr, Trakt and the rest, is configured on the server. Until the Integrations screen exists in the Windows app, edit it on the website.

Your session token is kept in the Windows credential store, one entry per server, so the app stays signed in across launches. **Sign out** (in Settings: click your avatar at the top of the navigation rail) revokes just this PC's token.

## What the app does

| Screen | Server endpoint |
|---|---|
| Discover | `GET /discover` |
| Movies / Series grids | `GET /movies`, `/series` (+ `/extras`), `POST /surprise` |
| Search (results and the header type-ahead) | `GET /search`, `/search/suggest` |
| Title page | `GET /titles/{type}/{id}` (+ `/status`, `/seasons/{n}`) |
| Add, request, search now, monitor, relink | `POST …/add`, `…/request`, `…/search`, `PUT …/monitored`, `POST …/relink` |
| Requests (member's own, admin queue, history) | `GET /requests/mine`, `/pending`, `/history`; `POST …/approve`, `…/manual-approve`, `…/reject`, `/approve-all` |
| Favorites and every star | `GET /favorites`, `PUT`/`DELETE /favorites/{type}/{id}` |
| Person / Studio pages | `GET /people/{id}`, `/companies/{id}` |
| Calendar | `GET /calendar?month=` |
| Notifications bell | `GET /badges`, `/notifications` |
| Windows notifications | `GET /notifications/stream` (Server-Sent Events), `GET /notifications` to catch up |
| Settings → Account, server and About | `GET /me`, `PATCH /users/{id}`, `GET /settings/about` |
| Settings → Household members (list, add, edit, remove) | `GET /users`, `POST /users`, `PATCH /users/{id}`, `DELETE /users/{id}` |
| Profile photos (the rail, the menu, the member list, the edit dialog) | `GET`, `PUT`, `DELETE /users/{id}/avatar` |

Declining a request can carry a reason, which the requester then sees next to the declined request on their own Requests tab. Declining without a reason sends no body at all, which every server version accepts; a reason needs a server running 0.28.0 or later.

### Notifications on this PC

Your Marquee server tells the app about new notifications itself, over one long-lived connection (`GET /notifications/stream`); nothing goes through Microsoft's or anyone else's push service. While Marquee is open, each one (something started downloading, is ready to watch, a request was approved or declined) shows as a Windows notification, and clicking it opens the title. The connection comes back by itself after the server restarts or the PC sleeps, and on every reconnect the app catches up with `GET /notifications`, showing only what is newer than the last one it showed: it remembers that per server and account, so a relaunch shows what arrived while it was closed rather than the whole history. Nothing arrives while the app is closed. The choice is per server and account, on this PC only, and stored with the app's other settings in `%LocalAppData%\Marquee\settings.json`. They need a server released after 0.29.0, which is when the stream arrived; on an older one Settings says so.

### Profile photos

Each account's photo shows in the navigation rail and menu and next to each household member, with initials on the accent gradient when there's none. Edit on a member's row has **Add photo** / **Change photo** and **Remove**, saved as soon as you pick one: Windows decodes the photo, turns it upright and scales it down to 1600 pixels on its longest side, and it goes up as a JPEG. A file Windows can't decode (HEIC without the HEIF Image Extensions, say) goes up as it is, and the server says whether it can read it. You can change your own photo; the admin can change anyone's. Photos need a server running 0.29.0 or later.

## Status

This is the first cut, and it deliberately stops at the screens above. Not built yet:

- **Settings → Integrations.** Connecting or reconfiguring TMDb, Plex, Jellyfin, Sonarr, Radarr and the rest is done on the website for now. Settings covers your own account (name, password), household members, the server and About.
- **Deep links.** No `marquee://` handler yet, so a link from another app doesn't open the title in the Windows app. (A click on one of the app's own Windows notifications does.)
- **Notifications while the app is closed.** Windows notifications come over the app's own connection to the server, so they stop when Marquee is closed; the next launch shows what arrived meanwhile. The bell and the Requests badge also poll `GET /badges` every minute.
- **Discovery scan.** The Mac app's **Search my network** isn't ported yet; type the server's address instead.
- **Cached lists don't learn about your own actions yet.** Adding or requesting a title on its page updates that page; a grid you came from re-fetches on its next visit rather than redrawing the card in place (the Mac's `TitleStateStore`).

The rest of the Mac app's table, Settings → Activity / Jobs and Help → Error Reference / Releases, follows (Integrations is covered above). The endpoints for all of it are already in `Marquee.Core`, so the remaining work is screens, not plumbing.

## Project layout

```
windows/
├── Marquee.sln                 Core, Core.Tests and the app
├── Directory.Build.props       shared build settings: nullable, warnings as errors, version
├── Marquee.Core/               platform neutral, no WinUI or Windows references
│   ├── Connection/             ServerAddress, ServerProbe, ServerSession, the token and settings stores
│   ├── Api/                    ApiClient (transport), ApiException, the typed /api/v1 facade, ServerEvents
│   └── Models/                 DTOs, one file per API area, plus the JSON options and open enums
├── Marquee.Core.Tests/         xunit: request shapes, fixture decoding, address parsing, session logic
└── Marquee.Windows/            the WinUI 3 app (Windows App SDK), Windows only
```

`Marquee.Core` is the part that mirrors `mac/Marquee/API` and `mac/Marquee/Connection` one to one: the same facade, the same DTOs, the same error kinds and messages. When the two disagree, the Swift model plus the example in [`docs/api-v1.md`](../docs/api-v1.md) is the source of truth. `Marquee.Windows` is the only project that knows it's on Windows: the credential store, the settings container and every screen live there.

## Tests

```bash
cd windows
dotnet test Marquee.Core.Tests/Marquee.Core.Tests.csproj
```

The fixtures are the Mac project's, linked in from `mac/MarqueeTests/Fixtures/api/` rather than copied, so a doc change breaks both test suites at once instead of silently drifting one of them. There is no live contract suite on this side yet; the Mac app's `LiveContractTests` exercises every endpoint against a real server and covers the contract both clients share.

## License

MIT.
