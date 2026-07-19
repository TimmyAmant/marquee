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
