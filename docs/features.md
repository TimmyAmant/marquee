# Everything Marquee can do

Marquee is a self-hosted app for asking for movies and shows **and** seeing
exactly what you already have. It sits in front of Plex, Jellyfin or Emby and
Sonarr and Radarr, and everyone in your household uses it from a browser, a
phone or the Mac, Windows and iPhone apps.

This page walks through every feature. Each one says who can use it:

- **Everyone**: anyone with a Marquee account.
- **Trusted**: members the admin has made Trusted, who can review requests.
- **Admin**: the person who runs the server.

The admin can also hand single abilities to anyone (see
[Permissions](#permissions)), so "Admin" below often really means "the admin,
or anyone they've allowed to".

New here? Start with the [Getting started guide](getting-started.md).

## Contents

- [Discover and browsing](#discover-and-browsing)
- [Search](#search)
- [Title pages](#title-pages)
- [Requests and approvals](#requests-and-approvals)
- [Your library and file details](#your-library-and-file-details)
- [Calendar](#calendar)
- [Favorites and watchlists](#favorites-and-watchlists)
- [Notifications](#notifications)
- [Members, sign-in and permissions](#members-sign-in-and-permissions)
- [Sonarr, Radarr and 4K](#sonarr-radarr-and-4k)
- [Admin tools](#admin-tools)
- [Sharing](#sharing)
- [Problem reports and comments](#problem-reports-and-comments)
- [Look and feel](#look-and-feel)
- [Languages](#languages)
- [Apps](#apps)

---

## Discover and browsing

### Discover page
The first page you see is a set of rows to browse: Recently Added, Trending,
Popular and Upcoming movies and series, genres, studios, networks and your
watchlist. Every row has a **See all** that opens its full list, which keeps
loading as you scroll. The admin can reorder, hide or add rows, either in
**Settings › Discover** or straight on the page with the pencil button.
*Everyone browses; the admin edits.*

### Your own Discover rows
Besides the built-in rows, the admin can add rows of their own: a keyword
(like "anime"), a genre, a studio (A24), a network (Netflix), a TMDb list, a
public Trakt list, or what was recently added to Plex or Jellyfin. Each new
row gets a See all page too. The admin also sets the region and language
Discover uses for things like release dates and what's streaming. Find it in
**Settings › Discover**. *Admin.*

### Movies and Series
The **Movies** and **Series** pages are big poster grids you can filter by
genre and year, sort, and set to hide what you already have. They load
endlessly as you scroll. At the top, **Because you watched…** suggests titles
like something you recently watched on your media server. **Surprise me**
picks a random title that matches your filters. *Everyone.*

### Status colors on posters
Every poster shows where that title stands with a small label and a colored
strip along the bottom, in the same colors Sonarr and Radarr use: green in
your library, purple downloading, red missing, orange not monitored, blue
coming soon. Titles you don't have get no strip. A **Color key** button on
the grids explains the colors, and so does the "What the colors mean" help
page (footer, and Settings › About). *Everyone.*

### Quick add from a poster
Hover over a poster (or look under it on a touch screen) to act without
opening the title. Members get **Request**, which follows their permissions,
limits and the blocklist, and see **Requested** once they've asked. The admin
gets **Add to Radarr / Sonarr** instead. *Everyone.*

### People, studios and networks
Clicking an actor, director, studio or network opens their own page with
everything they've made, each poster showing its status. You can favorite
people and studios to find them again later. Person pages list each title
once, even when the character name changed. *Everyone.*

## Search

### Search with suggestions
Press Search on the menu (or ⌘F on the Mac, Ctrl+F on Windows) and start
typing: suggestions appear as you go, grouped into movies, shows, people and
studios & networks, with each title's status color. The arrow keys move
through them, and Return shows every result. On a computer the website also
has a search bar across the top of the page. *Everyone.*

### Search results
Results come in sections: Movies, TV Shows, People, then Studios & Networks,
each with a count and **See all**. Popular exact matches come first, adding a
year ("dune 1984") picks that version, and searching a person's name puts
People first. You can search networks too ("hbo", "disney plus"). *Everyone.*

## Title pages

### The title page
Every movie and show has a page with its artwork across the top (and the
title's own logo where TMDb has one), the poster, overview, cast and crew,
keywords, trailer and links. A facts panel shows the rating, dates, runtime,
studio, budget, and where it's currently streaming in your region. Below are
rows like the collection it belongs to and **More like this**. *Everyone.*

### Ratings from IMDb, Rotten Tomatoes and Metacritic
Next to the TMDb score, title pages can show IMDb, Rotten Tomatoes and
Metacritic ratings. The admin turns this on by adding a free OMDb key in
**Settings › General**. Without the key, pages simply show the TMDb score.
*Everyone sees them; the admin sets them up.*

### Play on your media server
When a title is in your library, a **Play** button opens it in Plex,
Jellyfin or Emby (the server's own app when you have it, its web app
otherwise). It's the quickest way to go from "is it here?" to watching it.
*Everyone.*

### Seasons and episodes
Shows list every season, and each season opens to its episodes with whether
you have them, and when they air. When you request a show, a season picker
shows every season's episode count and status, so you can ask for just the
ones you want. If you already have some seasons, the button becomes
**Request more**. *Everyone.*

### Admin buttons on a title
The admin gets a few extra buttons on a title page, mostly in the **…** menu:
**Search now** (have Sonarr/Radarr look for it right away), **Start / Stop
monitoring**, **Block requests**, **Fix ID** and **Remove from Radarr /
Sonarr**. These save a trip to Sonarr or Radarr. *Admin.*

### Fix a wrong match
If Plex, Jellyfin, Sonarr or Radarr matched a file to the wrong movie or
show, **Fix ID** lets you type the right TMDb, IMDb or TVDB id. Marquee moves
everything to the correct title, and the fix sticks through every future
sync. You don't need to fix it in the other apps first. *Admin.*

## Requests and approvals

### Requesting a title
Press **Request** on any movie or show you don't have. For shows you pick
the seasons; if the admin has 4K servers, there's also **Request in 4K**.
Members see their requests, with their status, on the **Requests** page, and
can edit or cancel them while they're still waiting. Cancelling gives back
that request from their limit. *Everyone, if allowed to request.*

### Reviewing requests
New requests wait on the **Requests** page, where reviewers can approve,
decline (with a reason from a short list, or their own) or **Approve all**.
They can edit a request before approving it, and the member is told what
changed. Reviewers get an alert for each new request, and on supported
browsers the alert itself has Approve and Decline buttons. *Admin and
Trusted.*

### Advanced request options
When approving a request or adding a title, **Advanced** lets you choose
which Sonarr or Radarr server it goes to, the quality profile, the folder,
the tags, and for shows the series type (standard or anime). Past requests
remember where each title went. The admin can give this option to others
too. *Admin, or anyone given "Advanced request options".*

### Request all missing
On a collection you only partly have (say three of the five films in a
franchise), **Request all missing** asks for every title you don't have in
one go. The usual rules still apply to each one: limits, blocklist and
auto-approve. It tells you how many went through and why any didn't. The
admin sees **Add all** in the same place. *Everyone.*

### Can't find
Sometimes Sonarr or Radarr accepts a title but never finds a download. If an
approved, released title still has nothing after a day, reviewers get a
"Couldn't find…" alert and it shows under **Can't find** on the Requests
page, with **Search again**, **Open in Sonarr/Radarr** and **Mark as found**.
It clears itself once a download starts, and there's one reminder after
seven days. The wait is set in **Settings › Jobs**. *Admin and Trusted.*

### Couldn't add
If Sonarr or Radarr can't be reached when a request is approved, the request
isn't lost: it goes into a **Couldn't add** section with **Retry**,
**Decline** and **Added it by hand**. The member sees "Approved — waiting to
be added" and only hears it's approved once it really is. *Admin and
Trusted.*

### Request limits and auto-approve
The admin can cap how much each person asks for, for example five movies
every seven days, separately for movies and TV. People see how many they
have left on their Requests page, and are told how long until they can ask
again. Requests can also be approved automatically per person, separately
for movies, TV and 4K. Set both when editing a member in **Settings ›
Members**. *Admin.*

### Blocklist
Some titles shouldn't be requested. The admin can block a single title from
its page (with an optional reason), or a whole TMDb keyword or genre in
**Settings › Blocklist**. People then see "Requests are closed for this
title", and the admin can still add it themselves. *Admin, or anyone given
"Manage the blocklist".*

### Automatic blocklist
In the same tab, **Block automatically** blocks titles above an age rating
in your country, or that TMDb marks as adult. Before saving you see a
preview of what it would block and which waiting requests it affects. It's
handy for households with kids. *Admin, or anyone given "Manage the
blocklist".*

## Your library and file details

### The Library page
**Library** shows everything in Plex, Jellyfin/Emby, Sonarr and Radarr in
one place, as a poster grid or a table. Filter by type, status, server,
resolution (4K, 1080p, 720p), HDR, codec, genre and year; sort by date
added, title, year, size or rating; or search. The admin can Search now and
change monitoring from each row. *Everyone; row actions are admin.*

### Missing from collections
The **Collections** tab of the Library lists franchises you only partly
own, like two of the three films in a trilogy. From there the admin can
**Add all** and members can **Request all missing**. It's an easy way to
fill the gaps. *Everyone.*

### Duplicates
The **Duplicates** tab finds titles you have more than once: two different
files, or the same title on two Plex or two Jellyfin servers. It's smart
enough not to count one file seen through different Docker folder mappings.
Each entry shows the server, location, size and quality so you can decide
what to delete. *Admin.*

### Storage and disk forecast
The **Storage** tab shows free space on each of Sonarr's and Radarr's
folders, and a forecast of when each disk fills up at the current rate
("full in about 40 days"). It helps you see trouble coming before downloads
start failing. *Everyone.*

### File details
Every title you have shows a **File details** card: resolution, video codec,
HDR, audio (including Atmos), container, bitrate, size and where the file
lives, with a Copy button for the path. Details come from Radarr/Sonarr and
from Plex or Jellyfin. A show that's still downloading shows its details so
far. *Everyone.*

### Live status everywhere
Marquee keeps in step with your servers on its own: it syncs Plex, Jellyfin,
Sonarr and Radarr regularly and listens for Sonarr and Radarr's webhooks, so
"Downloading" and "In your library" appear within moments. Titles you delete
from your media server drop out on the next sync. *Everyone sees it; the
admin connects the servers.*

## Calendar

### Release calendar
**Calendar** is a month view of what's coming: movie releases from Radarr
and episode air dates from Sonarr, across every server you've connected.
Episodes land on the day they air where your server is. Click anything to
open its page. The iPhone app adds Day and Week views. *Everyone.*

## Favorites and watchlists

### Favorites
Heart any movie, show, collection, person or studio to keep it on your
**Favorites** page. Each person has their own favorites. It's a simple way
to keep a "look at this later" list without requesting anything yet.
*Everyone.*

### Plex Watchlist requests
Link your Plex account and turn on **Request from my Plex Watchlist** in
**Settings › Account**. Anything you add to your Plex Watchlist is requested
for you every ten minutes, with the usual checks and approvals. Titles you
already have or asked for are skipped, and a declined title isn't asked for
again. Your watchlist also appears as a row on Discover.
*Everyone, with a linked Plex account.*

### Trakt lists
In **Settings › Account** anyone can add a Trakt watchlist or public Trakt
list. New titles on it are requested for them every three hours, following
their permissions, limits and the blocklist. Reviewers get one alert per
list rather than one per title. *Everyone.*

## Notifications

### The bell
The bell on the menu shows a dot when something new happens: your request
was approved or declined, something you asked for is ready, someone shared a
title or replied to a comment. Click a notification to open the title.
*Everyone.*

### Notifications on your devices
After you sign in, Marquee asks whether this device should get
notifications. In a browser these are Web Push notifications sent by your
own server (they need Marquee opened over https, and on iPhone the site
added to the Home Screen). The Mac and Windows apps show real system
notifications over a live connection to your server. No outside push
service or account is involved. *Everyone.*

### Ready to watch
When a title you requested is completely in (the movie's file, or every
aired episode of the seasons you asked for) you get one "ready to watch"
notification. You won't get one for every episode as it arrives. The admin
doesn't get flooded with "finished downloading" alerts either. *Everyone.*

### Your own notification channels
Everyone can add their own Discord, ntfy, Telegram, Pushover, email,
Gotify, Slack, Pushbullet or webhook in **Settings › Notifications**, with a
**Send a test** button. Email and typed-in Telegram chats are confirmed with
a code first. A grid lets you choose which events go to the bell, your
devices and each channel. *Everyone.*

### Household channels
The admin can also set up shared channels for the whole household (for
example a family Discord channel), each in its own tab under **Settings ›
Notifications**. Each has its own list of events and a test button. Saved
tokens and passwords are never shown again. *Admin.*

## Members, sign-in and permissions

### Household members
**Settings › Members** lists everyone, with when each person last used
Marquee ("Active 3 hours ago"). The admin can add accounts by hand, edit
them, reset passwords and remove people (which signs them out right away).
Each member has a profile page with their photo, requests made, requests
left and Plex Watchlist. *Admin; everyone can see their own profile.*

### Sign in with Plex, Jellyfin or Emby
Once the admin has connected Plex or Jellyfin/Emby, people can sign in with
the account they already use there, including Jellyfin **Quick Connect**.
The admin can import everyone who shares the server in one go, or let anyone
with access get an account the first time they sign in (off by default).
Anyone can link or unlink these accounts in **Settings › Account › Linked
accounts**. *Everyone; the admin turns it on.*

### Single sign-on
Marquee works with Authentik, Authelia, Pocket ID, Keycloak, Google and any
other OpenID Connect provider, on the website and in the apps. The admin
sets it up in **Settings › Members**, can require a group to get in, and can
put people in a trusted group to make them Trusted. Nobody is ever made
admin this way. *Everyone; the admin sets it up.*

### Trusted members
Trusted is a role between member and admin. Trusted members can approve and
decline other people's requests and handle problem reports, their own
requests go straight through, and they have no request limits. Settings and
integrations stay the admin's. *Admin assigns it.*

### Permissions
When editing a member, the admin gets switches for exactly what that person
can do: request movies, TV, 4K movies, 4K TV; auto-approve each; Advanced
request options; see everyone's requests; review requests; handle problem
reports; report problems; manage the blocklist; no request limits.
**Member** and **Trusted** are presets that fill the switches in. Settings,
integrations, accounts and API keys can never be handed out. *Admin.*

### Your account and profile photo
In **Settings › Account** everyone can see their details, change their
password (it asks for the current one first), add a profile photo and sign
out. Photos are kept on your own server, cropped square, and stripped of
location and camera details. *Everyone.*

## Sonarr, Radarr and 4K

### As many servers as you run
Connect any number of Sonarr and Radarr servers in **Settings › Services**,
each with its own quality profile, folder, tags and webhook link. One of
each is the default. Sonarr servers can have separate anime settings, and
anime is added as the Anime series type. A title on any of them counts as
in your library. *Admin.*

### 4K servers
Mark a Sonarr or Radarr as a 4K server and members get **Request in 4K**,
even on titles you already have in HD. Approving it adds the title to the 4K
server and the member is told when it's ready. Title pages and requests show
"In 4K" or "4K downloading". *Everyone requests; the admin sets it up.*

### Override rules
Override rules send requests to a particular server, quality profile, folder
and tags based on genre, original language, keyword or who asked, for
example "anime goes to the anime folder" or "the kids' requests go to the
Kids library". The **Advanced** panel shows which rule picked the settings,
and choices made by hand still win. Find them in **Settings › Services**.
*Admin.*

### Remove from Radarr / Sonarr
In a title's **…** menu, **Remove from Radarr / Sonarr** takes it off the
server, optionally deleting its files too. The title can then be requested
again. It's handy for clearing out things nobody watches. *Admin.*

## Admin tools

### Jobs and schedules
**Settings › Jobs** lists everything Marquee does in the background: media
server and Sonarr/Radarr syncs, disk space checks, Plex Watchlist and Trakt
requests, Can't find checks and database cleanup. You can run any job now,
change how often it runs or set it to run once a day at a set time, and see
when it runs next. *Admin.*

### Logs
**Settings › Logs** shows the server's log with filters for level and text,
auto-refresh, and Copy and Download buttons. Keys and tokens are masked, so
it's safe to paste into a bug report. *Admin.*

### Activity
**Settings › Activity** is a running history of who requested what and who
approved or declined it, newest first. It's a quick way to see what's been
happening in the household. *Admin.*

### API keys and OpenAPI
Create named API keys in **Settings › General** for dashboards, scripts and
other tools: read-only or full, optionally acting as one member, with an
optional expiry. A key is shown once and can be revoked any time. The API is
described at `/api-docs` on your server, and there's a ready-made summary
for Homepage and Homarr widgets (see [integrations.md](integrations.md)).
*Admin.*

### Import from Seerr
Coming from Overseerr, Jellyseerr or Seerr? **Settings › General › Coming
from Seerr?** brings over users (matched to existing accounts), their
permissions and limits, requests with their seasons and 4K, problem reports
with comments, and the blocklist. You see a preview first, nothing is sent
to Sonarr/Radarr, and running it again only picks up what's new. See
[migrating-from-seerr.md](migrating-from-seerr.md). *Admin.*

### Update checks and What's new
**Settings › About** shows your version and whether a newer Marquee is out.
After an update, everyone sees a short "What's new" note once, and the
**Releases** page lists every version's changes. The About page also links
to the colors guide, the error reference and this page. *Everyone.*

## Sharing

### Share a title
The **Share** button on a movie or show sends it to someone in your
household with a short note; they get "Susan shared Ice Age with you" in the
bell and on their devices. You can also share outside Marquee through your
phone's share sheet or Copy link, with a Marquee, TMDb or IMDb link for
people who can't sign in. The Mac and Windows apps use their own share
menus. *Everyone.*

## Problem reports and comments

### Report a problem
On a title you have, anyone can report bad video, an audio problem, missing
subtitles, a file that won't play or the wrong movie or episode, down to the
season and episode, with a note. Reviewers see open reports on the Requests
page, where **Search again** has Sonarr/Radarr find another copy and **Mark
fixed** tells the person who reported it. Members can see and withdraw their
own reports. *Everyone reports; Admin and Trusted handle them.*

### Comments
Requests and problem reports have a comment thread between the person who
asked and the reviewers. Everyone in the conversation is notified of new
comments on the bell, their devices and their own channels. It's the place
to say "could you get the director's cut?". *Everyone involved.*

## Look and feel

### Menu where you want it
The menu bar can sit on the left, right, top or bottom of the screen, and
**Show menu labels** adds names next to the icons. Both are in **Settings ›
Account › Appearance** and remembered per device. On phones the website
uses a tab bar along the bottom instead (see [Apps](#apps)). *Everyone.*

### Light and dark
Marquee follows your device's light or dark setting, and on phones you can
switch it from the More tab. Posters and artwork fade in smoothly as they
load. *Everyone.*

### Help pages
The footer and **Settings › About** link to **What the colors mean**, an
**Error reference** that explains every error message in plain words and
what to do about it, and the **Releases** page. The Mac app has them in its
Help menu. *Everyone.*

## Languages

### Five languages
Marquee speaks English, Spanish, French, German and Portuguese (Brazil), on
the website and in the apps. Pick yours in **Settings › Account ›
Appearance**; otherwise it follows your browser or computer. Notifications
arrive in each person's language, and household channels use the admin's.
Movie and show titles and descriptions still come from TMDb in English for
now. Want to help translate? See [translating.md](translating.md).
*Everyone.*

## Apps

The Mac, Windows and iPhone apps are the same Marquee as the website, with
the same pages and features, talking to your own server. Everything above
works in all of them; only the bits below are app-specific.

- **Mac app** (macOS 15+): finds your server on the network by itself,
  updates itself from each release, shows real Mac notifications, and has
  keyboard shortcuts and right-click menus. Download the `.dmg` from the
  [latest release](https://github.com/TimmyAmant/marquee/releases/latest).
- **Windows app** (Windows 10 1809+ or 11, preview): installs without admin
  rights, updates itself, and shows Windows notifications. Download the
  installer from the
  [latest release](https://github.com/TimmyAmant/marquee/releases/latest).
- **iPhone and iPad app** (early): Discover, Search, Requests, Calendar and
  More tabs, sign-in with your server, Plex, Jellyfin or single sign-on. For
  now it's installed from Xcode, not the App Store or TestFlight, and alerts
  arrive while the app is open.
- **Website on phones**: add Marquee to your Home Screen and it works like
  an app, with a tab bar along the bottom (Discover, Search, Requests,
  Calendar, More) and a back button. On Android the icon's long-press menu
  offers Requests and Search.

Install details are in the [Getting started guide](getting-started.md#mac-and-windows-apps).
