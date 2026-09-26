export type ChangelogEntry = {
  version: string;
  date: string;
  changes: string[];
};

/** Hand-maintained, newest first — bumped in package.json and appended to
 * here on every push to GitHub, so the version number in the footer always
 * has something concrete to link to. Entries from 0.1.0 through 0.6.0 were
 * backfilled from git history when versioning was introduced; every entry
 * from 0.7.0 onward is written at push time. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.36.0",
    date: "2026-09-26",
    changes: [
      "Telegram, Pushover and email notifications: next to Discord and ntfy in Settings › Integrations › Notifications (website, Mac and Windows). Everything that reaches the admin — grabbed, downloaded, requests approved or declined — also goes to each one you set up.",
      "Telegram: your own bot (@BotFather) and a chat, group or channel. Pushover: an application token and your user or group key. Email: your own mail server (SMTP) to one or more addresses; with a login it always uses an encrypted connection.",
      "Each one sends a test message before it's saved, and says what the service answered if it didn't go through. Saved tokens and passwords are never shown again; leave them blank to keep them.",
    ],
  },
  {
    version: "0.35.0",
    date: "2026-09-25",
    changes: [
      "Household members now show when each person last used Marquee — \"Active 3 hours ago\", \"Active 6 days ago\", \"Never signed in\" — so you can see who's still using it. Admin only, on the website and in the Mac and Windows apps.",
      "It counts the website and the apps alike, and starts from when each person's app sign-in was last used.",
    ],
  },
  {
    version: "0.34.1",
    date: "2026-09-25",
    changes: [
      "A show that's still downloading now shows its File details too (folder, size on disk so far, quality profile) on the website and in the Mac and Windows apps. Before, the card only appeared once every episode was there.",
    ],
  },
  {
    version: "0.34.0",
    date: "2026-09-25",
    changes: [
      "Request from your Plex Watchlist: with Plex linked, turn it on in Settings › Account (website, Mac and Windows). New movies and shows you add to your Watchlist on Plex are requested for you every 10 minutes, the same as pressing Request: the usual checks, your auto-approve setting, and the admin's approval queue.",
      "Choose Movies and/or TV shows, press Check now, or turn it off. Titles you already have or already asked for are skipped, and each title is tried once, so something the admin declined isn't requested again.",
      "Turning it on asks Plex once, and Marquee keeps that Plex sign-in (encrypted) only to read your watchlist; it's deleted when you turn it off or unlink Plex. If Plex stops accepting it, it switches itself off and says why.",
      "Settings › Jobs lists the new Plex Watchlist Requests job, with Run now.",
      "Fixed: the Windows app crashed when its window was dragged narrower than one poster; it now has a minimum size.",
      "After Stop monitoring on a show or movie with nothing downloaded yet, the page offered both Add to Sonarr/Radarr and Start monitoring, which do the same thing. It now shows just Start monitoring (website, Mac and Windows).",
      "Windows: the Calendar is a month grid again, like the website and the Mac (it had become a plain list), and the Calendar and Requests pages sit centered instead of pushed to the left.",
    ],
  },
  {
    version: "0.33.0",
    date: "2026-09-25",
    changes: [
      "Sign in with Plex or Jellyfin: once the admin has connected Plex or Jellyfin, the sign-in page (and the Mac and Windows apps) offers \"Sign in with Plex\" and a Jellyfin username and password. Anyone who can use your server can get in with the account they already have.",
      "Import from Plex / Jellyfin in Settings (\"Import from your media server\"): pick the people who share your server and they each get a member account that signs in with Plex or Jellyfin. A new setting lets anyone with access get an account the first time they sign in; it's off by default, so only people you import (or who link their account) get in.",
      "Linked accounts in Settings › Account: link your own Plex or Jellyfin account to your Marquee account to sign in with it, and unlink it again.",
      "The Plex server owner signing in with Plex is recognised as the admin. Plex sign-ins are checked against plex.tv on every sign-in, and Marquee never stores a member's Plex token.",
      "Fixed: newer Jellyfin versions could reject Marquee's requests; it now sends its token the way they expect.",
      "Fixed: reconnecting Plex to a different account while a sync was running could keep the old account's servers.",
    ],
  },
  {
    version: "0.32.0",
    date: "2026-09-25",
    changes: [
      "Request single seasons: on a TV show, Request opens a season picker. Each season shows whether it's in the library, being fetched (monitored), or already requested, and the rest can be ticked; \"Select all\" picks every one left. Works on the website and in the Mac and Windows apps.",
      "Request more seasons of a show you already have part of: the button appears on shows that are in the library or on their way whenever there are seasons left to ask for.",
      "When the admin approves a season request, Sonarr is told to fetch just those seasons (and searches for them right away), whether the show is new to Sonarr or already there with other seasons. A whole-show request still adds every season.",
      "Requests, the admin's queue, the history and the notifications name the seasons (\"Severance (Season 2) was approved\").",
    ],
  },
  {
    version: "0.31.2",
    date: "2026-09-25",
    changes: [
      "Settings › About in the Mac and Windows apps now says whether your server is up to date. If a newer Marquee is out, it names the version and how to update the server (pull the new Docker image; on Unraid, the Docker tab's Check for Updates).",
      "The README is much shorter, with new screenshots of the current layout; the remote access guide has its own page.",
      "Under the hood: the database migration history is back in step with the schema, so future database changes generate cleanly. Nothing in your database changes.",
    ],
  },
  {
    version: "0.31.1",
    date: "2026-09-25",
    changes: [
      "Fixed: the calendar put evening TV episodes on the next day (it used the UTC date). They're on the day they air where the server is.",
      "Fixed: a season pack arriving from Sonarr could send the same \"ready to watch\" or \"finished downloading\" notification several times, to the app and to Discord, ntfy and push. Each now goes out once.",
      "Fixed: a request the admin declined could flip back to approved if two pages were loading at the same moment.",
      "Fixed: disconnecting Plex, Jellyfin, Sonarr or Radarr while a sync was running could bring the library back, and titles stayed \"In library\" forever.",
      "Faster: Discover and the library no longer load every title's full TMDb record, and Settings › Integrations no longer waits for a whole library sync before it opens. Big libraries get longer to answer a full sync instead of timing out every hour.",
      "Security: logins can't be used to lock the admin out any more (failed attempts slow down instead of blocking the right password), don't reveal which usernames exist, and refuse oversized requests. Sonarr/Radarr webhooks can't be silenced by someone spamming bad attempts. The server now runs as an unprivileged user inside the container, and its database requires a password. If Marquee sits behind a reverse proxy, set TRUSTED_PROXY_HOPS (see the README) so rate limits see real addresses.",
      "Mac and Windows apps: an update caught in the few minutes before its downloads are attached is checked again in 15 minutes instead of the next day. On Windows, an update is offered on the sign-in screen too, and a check finishing mid-download no longer interrupts it.",
      "Mac: Settings opened from a page (\"Connect Radarr…\" on a title) has a Back button to that page; the page behind the search pop-up no longer takes keyboard focus; a notification from the previous account is cleared on sign-out.",
      "Windows: only one copy of the app runs at a time (a second launch brings the open one forward), the bell no longer shows the previous account's notifications, and a few rare crashes (copying a file path while another app holds the clipboard, two dialogs at once) are fixed.",
      "Website: the notification bell polls once instead of twice, Escape closes the search suggestions before the search box, and old Mac download links work again.",
    ],
  },
  {
    version: "0.31.0",
    date: "2026-09-25",
    changes: [
      "Search and notifications moved onto the rail, on the website and in the Mac and Windows apps. The bell sits right under your photo, with a dot when something's unread, and its list opens beside the rail.",
      "Search opens as a pop-up over the page: click Search on the rail (or press ⌘F on the Mac, Ctrl+F on Windows), type, and pick a suggestion or press Return for all results. Escape or a click outside closes it.",
      "The top bar no longer carries a search box or the bell. On a phone, the website keeps its bell at the top, and search is in the menu.",
    ],
  },
  {
    version: "0.30.4",
    date: "2026-09-25",
    changes: [
      "Fixed: signing in to the Mac app could fail with \"Couldn't reach your Marquee server\" even though the server was listed right there, if the server had restarted (a Docker update, say) while the sign-in screen was open. You had to scan for the server again first. Now the app checks the server again and retries by itself, and if the server really is gone it says what it found.",
    ],
  },
  {
    version: "0.30.3",
    date: "2026-09-25",
    changes: [
      "The Mac app's sign-in screen after an update no longer explains why you're signing in again; it's just the sign-in form.",
    ],
  },
  {
    version: "0.30.2",
    date: "2026-09-25",
    changes: [
      "Settings in the Mac and Windows apps sits in a centered column instead of against the left edge, and the Mac's Account cards use the column's full width like the other tabs.",
    ],
  },
  {
    version: "0.30.1",
    date: "2026-09-25",
    changes: [
      "App downloads carry their version in the name: Marquee-0.30.1.dmg for the Mac and Marquee-Setup-0.30.1.exe for Windows, so a Downloads folder with several of them shows which is newest. The download buttons on the website go straight to the latest one.",
      "The Mac disk image has a proper install window: Marquee and your Applications folder with an arrow between them, how to get past macOS's first-launch warning, and a Read Me covering installing, connecting to your server and updates. Its window title shows the version.",
      "If the Mac app can't replace itself and leaves the new version in Downloads, it's named for its version too (Marquee 0.30.1.app).",
      "Settings in the Mac app is now a page of the main window instead of a separate window, with Account, Integrations, Activity, Jobs and About as tabs across the top. Your photo on the rail, ⌘, and the \"Connect…\" links open it. (The Windows app already worked this way.)",
    ],
  },
  {
    version: "0.30.0",
    date: "2026-09-25",
    changes: [
      "Marquee for Windows updates itself: it checks for a new release when it opens and once a day, and when there is one, an update button appears at the foot of the rail. It takes you to Settings › About, where Update downloads the new installer, checks it against the release, then closes Marquee, updates it and reopens it. Settings › About also has Check for updates and What's new. Install 0.30.0 once from the download link; later versions arrive through the button.",
      "The Mac app shows the same update button on its rail when a new release is out, alongside Marquee › Check for Updates… and Settings › About.",
      "Removed: the ☰ button at the bottom of the rail and the full menu it opened, on the website and in the Mac and Windows apps. Every section is already one click away on the rail. On a phone, where there's no rail, the menu button at the top still opens the menu.",
      "Marquee for Windows shows its real version in Settings › About (it said 0.1.0).",
    ],
  },
  {
    version: "0.29.0",
    date: "2026-09-25",
    changes: [
      "A new navigation menu, after the Plex app on Apple TV: a small frosted bar floats at the left edge with your photo and an icon for every section, and one click goes straight there. Rest on an icon to see its name; the ☰ button opens the full labeled menu. On a phone, the menu button at the top opens it. Pages get the room the old sidebar took up, and a title's backdrop now runs to the edge of the window. The Mac and Windows apps have the same menu.",
      "Profile photos: add one from Settings › Account › Edit. It's kept on your Marquee server, never uploaded anywhere else, and shows in the menu and next to each household member. Photos are cropped to a square, turned the right way up, and stripped of their location and camera details.",
      "API: /me, the login response and household members include avatarUrl, and GET/PUT/DELETE /users/{id}/avatar read, replace and remove a photo.",
      "Notifications on your devices, sent by your own Marquee server: after you sign in, Marquee asks whether this device should get them (a request approved or declined, a title ready to watch). On the website they're Web Push, encrypted so only your device can read them, with no account at any push service; they need Marquee opened over https, and on iPhone the site added to the Home Screen. Settings › Account › Notifications turns them on or off, lists your devices and sends a test.",
      "API: GET /notifications/stream, a live stream of new notifications for the Mac and Windows apps to show as system notifications without any outside push service.",
      "The Mac and Windows apps can be downloaded from each release: Marquee.dmg (open it and drag Marquee into Applications) and Marquee-Setup.exe (installs for your account, no admin needed). Links are in the README and on the website.",
      "Marquee for Mac updates itself: when a new release is out it shows an Update button, then downloads it, checks it, and quits and reopens on the new version. It no longer runs in the App Sandbox, which is what lets it replace itself; your settings come along. After an update you sign in once more.",
      "Marquee for Mac and Windows: profile photos, and notifications that come straight from your server over a live connection (each app asks after you sign in). Windows gets real Windows notifications, its own icon, and Settings › Household members.",
    ],
  },
  {
    version: "0.28.0",
    date: "2026-09-25",
    changes: [
      "Declining a request now asks why: pick a reason from a short list (already on a streaming service you have, not released yet, no space right now, and so on) or write your own. The member sees the reason under Declined on their Requests page and in the notification.",
      "API: POST /requests/{id}/reject takes an optional reason, GET /requests/pending lists the preset reasons, and /requests/mine and /requests/history include rejectionReason.",
      "Marquee for Mac: declining a request offers the same list of reasons, and a declined request shows why.",
      "Hardening from a security review: the sign-in gate no longer lets look-alike paths through (a page's server actions were reachable without signing in), the login limit can't be beaten with a burst of parallel guesses, the admin password reset script now signs browsers out too, Plex sync ignores servers other accounts shared with you, and a Discord relay can no longer @everyone.",
      "A title requested from the website is recorded under its real TMDb name and poster, not whatever the browser sent.",
      "The Docker container now starts with a Postgres password containing /, quotes or $, and an upgrade no longer fails when two identical pending requests were left over from a double click.",
      "A movie and a TV show that happen to share a TMDb id no longer show each other's Plex or Jellyfin file details.",
      "Updated Next.js and the sign-in library to versions with the latest security fixes.",
      "Changing your own password now asks for your current one first, on the website and in the Mac and Windows apps, so a browser left signed in can't be used to lock you out. The admin resetting a member's password still doesn't need theirs.",
      "Posters, backdrops and episode stills show a soft loading shimmer and fade in, instead of sitting as empty boxes until the artwork arrives.",
      "Marquee for Windows has started: an early native Windows app lives in windows/ of the repo, with sign-in, Discover, browsing, title pages, requests (including decline reasons), favorites, calendar and notifications. It isn't packaged for download yet.",
    ],
  },
  {
    version: "0.27.1",
    date: "2026-09-18",
    changes: [
      "Marquee has a website: timmyamant.github.io/marquee — what it does, how it fits in front of Plex, Jellyfin, Sonarr and Radarr, the Mac app, and how to install it. Every film, person and streaming service in its screenshots is made up.",
    ],
  },
  {
    version: "0.27.0",
    date: "2026-09-18",
    changes: [
      "Titles you delete from Plex or Jellyfin now drop out of your library on the next sync, instead of showing \"In library\" forever.",
      "One Sonarr show that TMDb doesn't know no longer stops Marquee from noticing series you've removed from Sonarr.",
      "Opening a person or studio page no longer wipes the backdrops of the titles on it, and popular titles get their details refreshed again.",
      "Household members now get a notification when a title they requested finishes downloading — once per request, not once per episode.",
      "Big Sonarr imports no longer trip the webhook rate limit: only wrong secrets count against it, and a burst of events runs one library sync instead of one each. Webhooks can also send their secret in an X-Marquee-Secret header to keep it out of proxy logs.",
      "ntfy notifications for titles with accents, non-Latin scripts or emoji now arrive instead of silently failing.",
      "Removing a household member, or changing someone's password, now signs them out of the website right away (changing your own password signs you out too).",
      "Hardening: the login rate limit can no longer be dodged with a fake X-Forwarded-For header, first-run setup can't create two admins, and every page sends basic security headers.",
      "Pages now show a loading skeleton while they fetch, a friendly error with a Try again button when TMDb or a server doesn't answer, and a proper Not Found page.",
      "A new daily Database Cleanup job (Settings → Jobs) trims old notifications, activity and disk snapshots, and expired app sign-ins.",
      "Syncs can no longer run on top of each other, and Plex show scanning is gentler on big libraries.",
      "The Docker container now shuts its database down cleanly on docker stop.",
      "Marquee for Mac: right-click any poster or person for Open, Add/Request, Favorite, Copy Link and Open in Browser; title pages have Copy Link and Open in Browser too; posters work with VoiceOver.",
      "Marquee for Mac: clicking a notification while the app is closed now opens that title, the app reconnects on its own when the network returns or the Mac wakes, and a banner shows when the server can't be reached.",
      "Marquee for Mac: a failed page on Movies/Series shows a Retry row instead of ending the list, saving unrelated settings no longer jumps the list back to the top, ⌘F focuses search, and big backdrops use much less memory.",
    ],
  },
  {
    version: "0.26.0",
    date: "2026-09-17",
    changes: [
      "File details now fills in for titles you own through Plex or Jellyfin, not just ones Radarr and Sonarr track: resolution, video codec, dynamic range, audio codec and channels, container and bitrate all come straight from your media server.",
      "Where Radarr or Sonarr also tracks a title, its own quality profile, release group and edition still win — your media server fills in the rest.",
      "Plex shows get the same detail, averaged across their episodes, since Plex only reports a file per episode rather than per series.",
      "Resolution badges light up for media-server-owned titles too, and a plain SDR file no longer gets a badge of its own.",
          "Marquee for Mac shows the same detail, including the new Container and Bitrate rows.",
],
  },
  {
    version: "0.25.0",
    date: "2026-09-17",
    changes: [
      "Studio chips are all the same height now, whether or not the studio has a logo, and they're capsules like the rest of the app.",
      "Marquee for Mac: adding a title from a grid or shelf no longer leaves the card offering \"Add to Radarr\" — the card updates in place, without reloading the page under you.",
      "Added light-theme screenshots to the README.",
    ],
  },
  {
    version: "0.24.3",
    date: "2026-09-17",
    changes: [
      "Documented how to reach Marquee from outside your home network: a Cloudflare Tunnel on your own domain, port forwarding, and putting Authelia or Cloudflare Access in front — including what to exempt so the Mac app and *arr webhooks keep working.",
    ],
  },
  {
    version: "0.24.2",
    date: "2026-09-17",
    changes: [
      "The Docker image is now published to GitHub Packages as well as Docker Hub — pull whichever you prefer.",
    ],
  },
  {
    version: "0.24.1",
    date: "2026-09-17",
    changes: [
      "Marquee for Mac: the notifications popover is wider and grows with the list, so you see every recent notification instead of two.",
    ],
  },
  {
    version: "0.24.0",
    date: "2026-09-17",
    changes: [
      "Marquee for Mac, the native macOS client, now lives in this repository under mac/ — see the README for what it does and how to build it.",
      "Tidied the project: screenshots and the API reference moved under docs/, and the Docker image no longer carries documentation or the Mac app.",
    ],
  },
  {
    version: "0.23.1",
    date: "2026-09-17",
    changes: [
      "The sidebar now shows which Marquee server you're on under your name, matching the Mac app; your role moved to Settings › Account.",
    ],
  },
  {
    version: "0.23.0",
    date: "2026-09-17",
    changes: [
      "Rebuilt the title page and every shelf page to the shared design mockup Marquee for Mac is built from, so the website and the Mac app now lay out identically: a 230px sidebar, left-aligned content with fixed gutters (48px on a title page, 28px on shelf pages) instead of a centered max-width column, and shelves that bleed off the right edge.",
      "The top bar no longer sits on a solid strip of its own — it floats over the page as a 52px blurred scrim that fades out, so a title page's backdrop now fills the window from the very top and runs up behind the search field.",
      "Title pages now use the mockup's three-column geometry — a 224x336 poster, a 546px main column starting level with the title, and a 288px right rail — with the cast carousel beside the rail instead of below it.",
      "The facts card now shows a serif TMDb score with a \"TMDb user score\" label, even 38px fact rows and 36px streaming-service tiles; the file details card became a two-column grid (Size/Runtime, Added/Resolution, Quality profile/Video, Dynamic range/Audio) with a one-line location field and an inline Copy button.",
      "The library badge, Search now, Stop monitoring and Fix ID now sit together on one row of 32px capsules under the title, keywords stay on a single row that fades out rather than wrapping, and credits lead with the person's name over their role.",
      "Shelves got the mockup's head (20px serif title, 20px see-all circle, 28px arrows that dim at either end) and its cards: 156x234 art, 9px type badge, 17px status pill, 3px status strip, and a hover overview with an accent Add button.",
      "The cast row is a real carousel of 112x124 portraits rather than a row of poster-shaped cards, and genre tiles carry the mockup's 34px serif label.",
    ],
  },
  {
    version: "0.22.0",
    date: "2026-09-17",
    changes: [
      "Added a versioned JSON API at /api/v1 so native apps (starting with Marquee for Mac) can use this server as their only backend — everything the website shows and does is reachable through it, including admin settings. See docs/api-v1.md.",
      "Native apps sign in with a per-device token instead of a browser cookie. Tokens expire after 90 days without use, signing out revokes that device's token, and changing or resetting an account's password (in Settings or with the reset-admin-password script) signs every native app out of that account.",
      "Sign-in attempts from native apps count against the same rate limits as the website's sign-in page.",
    ],
  },
  {
    version: "0.21.10",
    date: "2026-07-27",
    changes: [
      "Fixed the mobile menu staying open after tapping a search result — the search dropdown itself closed, but the slide-down hamburger panel around it didn't, since it had its own separate open/close state.",
    ],
  },
  {
    version: "0.21.9",
    date: "2026-07-27",
    changes: [
      "Fixed the header search dropdown staying open after clicking a result or pressing Enter — a suggestion request still in flight from an earlier keystroke could resolve after navigation and silently reopen it.",
    ],
  },
  {
    version: "0.21.8",
    date: "2026-07-23",
    changes: [
      "Increased the left margin on title pages further, and fixed the overview/metadata column overlapping the poster that the wider margin exposed.",
    ],
  },
  {
    version: "0.21.7",
    date: "2026-07-23",
    changes: [
      "Closed the remaining gap between the movie/show title and everything below it (runtime line, library status, overview, sidebar cards) — the poster's height was pushing all of that further down than the title itself needed.",
      "Added a bit more breathing room between the poster artwork and the left edge of the page on title pages.",
    ],
  },
  {
    version: "0.21.6",
    date: "2026-07-23",
    changes: [
      "Moved the rating/status and File details sidebar cards up to align with the title's metadata line instead of starting much lower, next to the overview text.",
    ],
  },
  {
    version: "0.21.5",
    date: "2026-07-23",
    changes: [
      "Moved File details from a full-width section into the title page's sidebar, right below the rating/status card.",
      "Tightened up the gap between the backdrop and the movie/show title on title pages — it now sits right where the backdrop fades out instead of floating further down the page.",
    ],
  },
  {
    version: "0.21.4",
    date: "2026-07-22",
    changes: [
      "Fixed: clicking Marvel Studios, Lucasfilm, Pixar, or 20th Century Studios on Discover's Studios row landed on a page branded \"The Walt Disney Company\" instead of that studio's own page — each now shows its own name, logo, and catalog.",
    ],
  },
  {
    version: "0.21.3",
    date: "2026-07-22",
    changes: [
      "Fixed: unfavoriting a title on the Favorites page, or adding a title to Radarr/Sonarr from its detail page, could leave the page showing stale state until a reload.",
      "Fixed: a double-click or two open tabs could submit the same request twice; the second is now rejected instead of creating a duplicate.",
      "Fixed: a slow/unreachable TMDb or Trakt response had no timeout and could hang a page load indefinitely.",
      "Hardened the Sonarr/Radarr webhook receiver with a timing-safe secret check and rate limiting.",
      "Fixed: a single failed Jellyfin library fetch could abort an entire sync instead of retrying on the next pass.",
    ],
  },
  {
    version: "0.21.2",
    date: "2026-07-22",
    changes: [
      "Fixed: Movies/Series could show the same title twice back to back while scrolling — TMDb's popularity ranking can shift slightly between the initial load and each further page, letting one title land in both. Duplicates are now filtered out as they load.",
    ],
  },
  {
    version: "0.21.1",
    date: "2026-07-22",
    changes: [
      "Fixed: poster grids (Favorites, Search, a person/company's filmography, Movies/Series) left dead space on the right on mobile, since fixed-size cards didn't divide evenly into narrower screens — posters now stretch to fill each row completely.",
    ],
  },
  {
    version: "0.21.0",
    date: "2026-07-22",
    changes: [
      "Added a Settings → About page — version, movies/TV shows tracked, total requests, time zone, and support links.",
      "Added a Settings → Jobs page (admin) — lists the background sync jobs (Plex, Jellyfin, Sonarr/Radarr, disk space) with a manual \"Run Now\" for each.",
      "Added two more notification channels alongside Discord: a generic outgoing webhook and ntfy.sh, both configurable in Settings → Integrations.",
    ],
  },
  {
    version: "0.20.0",
    date: "2026-07-22",
    changes: [
      "Redesigned the movie/show detail page into a two-column layout — tagline, overview, Director/Screenplay (or Creator/Executive Producer) credits, and keyword tags on the left, with a new sidebar showing rating, status, release/air dates, original language, production country, network, and (when available) which streaming services currently carry it.",
      "Recommendations on a title page now show a MOVIE/SERIES badge on each poster, matching Discover.",
      "Fixed: a TV show's season list opened its newest season automatically — every season now starts collapsed until you click it.",
    ],
  },
  {
    version: "0.19.1",
    date: "2026-07-22",
    changes: [
      "Redesigned the Changelog page into a collapsed list of releases (relative date, version, a Latest badge on the newest) — click \"View Changelog\" on any release to see its full change list in a popup instead of everything being expanded on the page at once.",
    ],
  },
  {
    version: "0.19.0",
    date: "2026-07-22",
    changes: [
      "Movies and Series now load endlessly as you scroll instead of paging through with a Next button.",
      "Fixed: clicking \"Add to Sonarr/Radarr\" could leave a green \"Added\" label showing indefinitely on a poster even after it was no longer accurate, only clearing on a full page reload.",
    ],
  },
  {
    version: "0.18.6",
    date: "2026-07-21",
    changes: [
      "Fixed: Discover's Studios and Networks logos (e.g. Warner Bros. Pictures) could render as a near-blank shape — the flatten-to-white-silhouette effect crushed some logos' fine detail. Logos now show in their own original colors on a white backdrop instead.",
    ],
  },
  {
    version: "0.18.5",
    date: "2026-07-21",
    changes: [
      "Fixed: Movies/Series could fall short of the full 5 rows (e.g. only 3) when \"Hide titles you already track\" filtered out most of a page's results for an account with a large library — fetches a much bigger batch specifically when that filter is on.",
    ],
  },
  {
    version: "0.18.4",
    date: "2026-07-21",
    changes: [
      "Movies and Series now always show 5 full rows of posters, with no ragged partial row at the bottom — the grid measures how many posters actually fit per row at your screen's width and trims to whole rows automatically.",
    ],
  },
  {
    version: "0.18.3",
    date: "2026-07-21",
    changes: [
      "Movies and Series: poster art is now the same size as Discover's rows, instead of stretching wider to fill each column.",
      "Fixed: the \"Because you watched\" row could go missing from the Movies or Series page on days the rotation happened to land on a title of the other type — it now only rotates through recently-watched titles matching that page's own type.",
    ],
  },
  {
    version: "0.18.2",
    date: "2026-07-21",
    changes: [
      "Fixed: the Search page showed a second search box under the nav bar's own search field, duplicating it — the page's own copy is now removed.",
    ],
  },
  {
    version: "0.18.1",
    date: "2026-07-21",
    changes: [
      "Fixed: a title page's runtime/genres/year/status line, the Coming soon badge, and the Favorite button were laid over the backdrop artwork — they now sit below it, on the plain background, so the artwork only carries the title.",
    ],
  },
  {
    version: "0.18.0",
    date: "2026-07-21",
    changes: [
      "Removed the My Library page and its \"stop monitoring\" action — the app no longer has a dedicated page for browsing what you already own.",
      "Removed the homepage — the site now goes straight to Discover instead.",
      "Added Movies and Series pages, each working like Discover's old browse grid but scoped to just movies or just TV.",
      "Redesigned Discover into a page of browsable rows — Recently Added, Trending, Popular Movies, Movie Genres, Upcoming Movies, Studios, Popular Series, Series Genres, Upcoming Series, and Networks — instead of a single filterable grid (that grid now lives at Movies/Series).",
      "Movies/Series: the type, sort, and genre filters are now dropdown menus instead of button rows.",
      "Discover, Movies, and Series now use the full page width instead of a centered column with empty space on the sides.",
      "The left sidebar's nav text is now larger and easier to click.",
    ],
  },
  {
    version: "0.17.2",
    date: "2026-07-21",
    changes: [
      "Fixed: TV shows owned via Plex never showed a file location in File details, since Plex only reports a path per-episode, not for the show itself — a location (the folder every episode shares) is now derived automatically at sync time.",
      "Fixed: a Sonarr-tracked TV show that was only partway through downloading could show a file location/size as if it were already complete — location now only shows once a series is fully owned, matching how movies already worked.",
    ],
  },
  {
    version: "0.17.1",
    date: "2026-07-21",
    changes: [
      "My Library's grid view now shows a title's on-disk file location as a hover tooltip on the poster — useful for spotting a wrong Plex/Jellyfin/Sonarr/Radarr match (wrong artwork/info for what's actually the file on disk) without switching to table view.",
    ],
  },
  {
    version: "0.17.0",
    date: "2026-07-21",
    changes: [
      "Added a light/dark theme toggle (sidebar footer on desktop, nav drawer on mobile) — the app was dark-only before, with a full light palette added alongside it.",
      "Fixed: pages with wide content (e.g. Discover's filter/genre chip rows) could stretch the whole layout wider than the screen on mobile, pushing the header's menu button and notification bell off-screen.",
    ],
  },
  {
    version: "0.16.1",
    date: "2026-07-21",
    changes: [
      "Fixed: the site was missing a viewport meta tag, so mobile browsers rendered the whole page at desktop width and zoomed out instead of using the site's actual responsive layout — pages now render properly on phones.",
      "Settings: the tab nav (Account/Integrations/Activity) now highlights the active section and the page title updates per tab, instead of always saying \"Account.\"",
      "Settings → Integrations: the 9 connection cards are now grouped into labeled sections (Media Libraries, Download Clients, Metadata Sources, Notifications) instead of one long undifferentiated list.",
    ],
  },
  {
    version: "0.16.0",
    date: "2026-07-21",
    changes: [
      "Added a persistent left sidebar nav on desktop, replacing the horizontal top bar's nav links — mobile is unaffected, still using the existing hamburger drawer.",
      "Added stat tiles to the homepage: library counts (movies/TV/disk space) and pending request counts, for signed-in users.",
      "Added a Recent Downloads feed to the homepage, pulled from existing Radarr/Sonarr download notifications.",
      "Reworked the Requests page from stacked cards into a proper table (title, requester, date, status/actions) for both the admin queue and members' own request history.",
    ],
  },
  {
    version: "0.15.2",
    date: "2026-07-21",
    changes: [
      "Fixed: the nav search box's suggestions dropdown stayed open on top of the destination page after pressing Enter or clicking a result — a suggestion fetch still in flight at that moment could resolve after navigation and reopen it, since the search bar lives in the shared nav and never unmounts between pages.",
    ],
  },
  {
    version: "0.15.1",
    date: "2026-07-21",
    changes: [
      "Fixed: the Add-to-Radarr/Sonarr, Request, and Stop-monitoring buttons on poster cards (filmography, franchise rows, Discover, My Library) only appeared on mouse hover, making them invisible and unusable on phones/tablets — now visible by default and hover-hidden only on devices that actually have a mouse.",
    ],
  },
  {
    version: "0.15.0",
    date: "2026-07-19",
    changes: [
      "Added per-member auto-approval for requests (Settings → household member edit) — the admin can now let a trusted member's movie and/or TV requests skip the manual approval queue and go straight to Radarr/Sonarr.",
      "Added a recovery command for a locked-out admin account with no other way in: `docker exec -it <container> npm run reset-admin-password -- <new-password>` (documented in the README).",
      "Fixed: a title already requested still showed a \"Request\" button again (instead of \"Requested\") in the Collection and \"More like this\" rows on its own title page.",
      "Fixed: favoriting a person or company directly from a Cast/Studio row (without visiting their own page first) saved the favorite but silently left it missing from the Favorites page.",
    ],
  },
  {
    version: "0.14.0",
    date: "2026-07-19",
    changes: [
      "Added \"Search now\" and a monitoring on/off toggle (admin-only) to title pages tracked in Radarr/Sonarr — trigger an immediate search or pause/resume monitoring without leaving Marquee for the *arr app itself.",
    ],
  },
  {
    version: "0.13.0",
    date: "2026-07-18",
    changes: [
      "Added Discord webhook notifications (Settings → Integrations) — post a message to a channel whenever something is grabbed, downloaded, or a request is approved/rejected, mirroring the existing in-app notifications.",
    ],
  },
  {
    version: "0.12.0",
    date: "2026-07-18",
    changes: [
      "Added duplicate-file detection to My Library — when an arr app and a media server both report a different file path for the same title, it's flagged as a possible duplicate with a filter toggle to find them all.",
      "Added HDR (HDR10/HDR10+/Dolby Vision) and audio codec (including Atmos) badges next to the existing resolution badge, for Radarr-owned movies.",
    ],
  },
  {
    version: "0.11.0",
    date: "2026-07-18",
    changes: [
      "Added an automated test suite (Vitest, 83 tests) covering ownership status derivation, the title cache's staleness/completeness policy, ID parsing (Plex/Jellyfin/Trakt guids), and the year-range/status-label logic — the exact areas that produced real bugs earlier this session. No user-facing change, but the sync-status and cache logic is now regression-tested going forward.",
    ],
  },
  {
    version: "0.10.3",
    date: "2026-07-18",
    changes: [
      "Fixed: \"Wrong match? Fix ID\" corrections were silently reverted by the next Plex/Jellyfin/Sonarr/Radarr sync (as soon as 15 minutes later), since sync always re-derives a title's match fresh from the source and had no way to know it had been manually corrected. Corrections now persist across every future sync.",
      "Fixed: a title permanently missing its backdrop, poster, or overview on TMDb (common for older or niche titles) was re-fetched and re-written to the database on every single page view, forever, instead of settling back into the normal 14-day cache after a few days of retrying.",
      "Fixed: a TV show with an end date but no start date on TMDb could render \"null–2020\" as its year range.",
      "The relink action's database updates are now atomic (all-or-nothing) instead of able to partially apply on failure.",
    ],
  },
  {
    version: "0.10.2",
    date: "2026-07-18",
    changes: [
      "Fixed: a title with a poster and overview but no backdrop image yet (common for very new releases) never retried fetching it, leaving the hero background blank forever — backdrop is now included in the same \"keep re-checking until TMDb has it\" logic as poster/overview.",
      "Removed the small file-info line below the Add/Owned badge on title pages — it duplicated the fuller File details section below.",
    ],
  },
  {
    version: "0.10.1",
    date: "2026-07-18",
    changes: [
      "Added a \"Wrong match? Fix ID\" option (admin-only) on owned titles' pages — enter the correct TMDb, IMDb, or TVDB id and Marquee repoints everything synced under the wrong id to the right title, without needing to fix the match in Plex/Jellyfin/Sonarr itself first.",
    ],
  },
  {
    version: "0.10.0",
    date: "2026-07-18",
    changes: [
      "Added TheTVDB as a metadata source: new Settings → Integrations card (free API key) that fills in a TV show's poster and overview when TMDb doesn't have them yet, plus a \"TheTVDB\" link on title pages.",
      "Title pages now show runtime, rating, genres, year range, status (Continuing/Ended/etc.), and network alongside the existing overview and trailer/social links.",
    ],
  },
  {
    version: "0.9.2",
    date: "2026-07-18",
    changes: [
      "Fixed a permanent-poisoning bug in TV show ID resolution: once a Plex/Jellyfin show's TVDB id had ever been resolved to the wrong TMDb id (e.g. because of a wrongly-named library folder), it kept returning that same wrong match forever, even after the source metadata was corrected. TVDB-to-TMDb resolution now always re-checks with TMDb directly instead of trusting a previously-cached mapping.",
    ],
  },
  {
    version: "0.9.1",
    date: "2026-07-18",
    changes: [
      "Fixed: some titles kept showing no poster or overview for up to 14 days even after TMDb had filled them in. Titles are cached before TMDb finishes uploading artwork for very new or niche releases — the cache now treats a missing poster/overview as stale regardless of age, so it keeps re-checking until TMDb actually has the data instead of locking in the incomplete version.",
    ],
  },
  {
    version: "0.9.0",
    date: "2026-07-18",
    changes: [
      "Added a thin Sonarr-style colored status bar across the bottom of every poster: green for owned, blue for downloading, red for missing/monitored, purple for coming soon, yellow for untracked — readable at a glance across a whole grid without reading each badge.",
    ],
  },
  {
    version: "0.8.1",
    date: "2026-07-18",
    changes: [
      "Removed the duplicate search bar on My Library — the one in the nav header already covers it.",
      "Tightened the extra vertical gap left behind on My Library after the last header cleanup.",
    ],
  },
  {
    version: "0.8.0",
    date: "2026-07-18",
    changes: [
      "Removed the redundant page title/description under Requests, Favorites, My Library, and Discover — the nav already shows which page you're on.",
      "Sped up title-page loads: several Radarr/Sonarr/Plex/Jellyfin lookups that used to run one after another now run in parallel, cutting out a full extra network round-trip on TV shows owned via Plex or Jellyfin.",
      "Added a database index on requests.requested_by_user_id, used by every member's Requests tab and duplicate-request check.",
    ],
  },
  {
    version: "0.7.3",
    date: "2026-07-18",
    changes: [
      "Fixed: tapping into a search box or form field on mobile made the whole app appear zoomed in until manually pinching back out. iOS Safari auto-zooms the page when a focused input's text is under 16px, and several inputs used a smaller compact size — every text input is now at least 16px on phone-sized screens.",
    ],
  },
  {
    version: "0.7.2",
    date: "2026-07-18",
    changes: [
      "Fixed: household members saw the admin's \"Add to Radarr/Sonarr\" quick-add button (and got an \"Only the admin can add titles\" error on click) in the Missing from collections tab and the franchise/\"More like this\" sections on title pages — they now get a Request button instead, same as everywhere else in the app.",
    ],
  },
  {
    version: "0.7.1",
    date: "2026-07-18",
    changes: [
      "Fixed: pages could hang for up to a minute if Plex, Jellyfin, Sonarr, or Radarr was slow or unreachable — every request to those services now times out after 8 seconds instead of waiting indefinitely.",
    ],
  },
  {
    version: "0.7.0",
    date: "2026-07-18",
    changes: [
      "File details for TV shows owned via Plex/Jellyfin now falls back to Sonarr's series folder path and quality profile name when Sonarr also tracks the same show, instead of showing only size and added date.",
      "Backfilled the changelog with the project's full history from v0.1.0 onward.",
    ],
  },
  {
    version: "0.6.0",
    date: "2026-07-18",
    changes: [
      "Added a File details section above Cast on title pages: location (with copy-to-clipboard), size, runtime, and — for Radarr-owned movies — resolution, video codec, HDR/dynamic range, audio, quality profile, edition, and release group.",
      "Fixed: file details now also show for titles owned via Plex or Jellyfin, not just Radarr/Sonarr.",
      "Added a version number to the footer, linking to this changelog.",
    ],
  },
  {
    version: "0.5.0",
    date: "2026-07-18",
    changes: [
      "Added an \"Approve all\" button to the Requests page.",
      "Added a plain-language error reference page (/help/errors), linked from the footer.",
      "Added \"Manually approve\" for TV requests Sonarr can't resolve automatically, with a direct link to add the show in Sonarr.",
      "Added a \"Missing from collections\" tab to My Library — franchises you own part of but not all of.",
      "Added 4K/1080p/720p resolution badges on owned Radarr movies.",
      "Added a household Activity feed (Settings → Activity).",
      "Added Trakt list/watchlist import as pending requests.",
      "Added storage forecasting (\"free space runs out in ~N days\") to My Library.",
    ],
  },
  {
    version: "0.4.0",
    date: "2026-07-17",
    changes: [
      "Centralized library-owner resolution and admin authorization checks across the app.",
      "Replaced email-based login with username-based login.",
      "Added full Jellyfin support as a second, independent media-server integration alongside Plex.",
      "Added a Disconnect option for every integration (Plex, Jellyfin, Sonarr, Radarr), plus sync-count display on the Jellyfin card.",
      "Added a \"Surprise me\" button to Discover.",
      "Fixed the homepage \"Coming soon\" row showing titles that had already been released.",
    ],
  },
  {
    version: "0.3.0",
    date: "2026-07-16",
    changes: [
      "Added the household request/approval flow: members request titles, the admin approves or declines from the Requests page.",
      "Added Favorites for movies, TV shows, and collections, with favorite and quick-add buttons throughout the app.",
      "Added a release Calendar — a full month-grid of upcoming releases and air dates.",
      "Added a Sonarr-style expandable season/episode accordion with have/missing status per episode.",
      "Added Sonarr/Radarr webhook-driven notifications.",
      "Added real download-queue status (\"Downloading\") instead of just \"Monitored.\"",
      "Added on-disk file location and remaining disk space to My Library.",
      "Added an \"Add all missing\" bulk button to franchise/collection rows.",
      "Added a manual \"Sync now\" button to Settings → Integrations.",
      "Added mobile navigation and fixed various responsive/overflow issues.",
      "Fixed several correctness/security issues found in review: an admin-role downgrade bug, an IDOR gap, a request-approval race condition, and stale library status after unmonitoring.",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-07-15",
    changes: [
      "Added Favorites for people and studios.",
      "Switched to a single self-hosted Docker image with Postgres bundled inside (previously two containers).",
      "Added a locked-down first-run setup flow — no public signup page.",
      "Added movie/TV franchise and collection sections to title pages.",
      "Added a TMDb settings UI (test-and-save API key/token) in Settings → Integrations.",
      "Added a native Unraid Community Applications template.",
      "Fixed TMDb token verification rejecting valid v3 API keys, Discover's row layout, and polished Person/Company pages.",
    ],
  },
  {
    version: "0.1.0",
    date: "2026-07-14",
    changes: [
      "Initial release: TMDb-powered discovery, search, and title pages with live Plex/Sonarr/Radarr ownership status.",
    ],
  },
];
