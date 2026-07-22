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
