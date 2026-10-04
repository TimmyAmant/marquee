// Every /api/v1 operation, once — the source the OpenAPI description
// (GET /api/v1/openapi.json) and the /api-docs page are built from.
// lib/api/openapi/registry.test.ts fails CI when this and the route files
// under app/api/v1 disagree in either direction, so a new endpoint can't
// ship undocumented here. docs/api-v1.md stays the full reference (shapes,
// examples, website strings); this is the machine-readable index of it.
//
// Paths use the route folders' own parameter names ([id] → {id}).

import type { Permission } from "@/lib/users/permissions";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Who may call it: no credential; any account; the admin only; or the
 * admin and any account with that permission (lib/users/permissions.ts). */
export type ApiAuthLevel = "public" | "user" | "admin" | Permission;

export type ApiOperation = {
  method: HttpMethod;
  path: string;
  auth: ApiAuthLevel;
  tag: string;
  summary: string;
  /** A named schema in spec.ts for the 200/201 body, when there's one. */
  response?: string;
  /** A named schema in spec.ts for the JSON body. */
  requestBody?: string;
  /** Answers 201 Created rather than 200. */
  created?: boolean;
};

type Row = [HttpMethod, string, ApiAuthLevel, string, Partial<Omit<ApiOperation, "method" | "path" | "auth" | "tag" | "summary">>?];

function group(tag: string, rows: Row[]): ApiOperation[] {
  return rows.map(([method, path, auth, summary, extra]) => ({ method, path, auth, tag, summary, ...extra }));
}

const ARR_PROVIDERS = [
  ["sonarr", "Sonarr"],
  ["radarr", "Radarr"],
  ["sonarr4k", "4K Sonarr"],
  ["radarr4k", "4K Radarr"],
] as const;

const SETTING_PROVIDERS = [
  ["tmdb", "TMDb"],
  ["trakt", "Trakt"],
  ["tvdb", "TheTVDB"],
  ["omdb", "OMDb"],
  ["discord", "Discord"],
  ["ntfy", "ntfy"],
  ["webhook", "custom webhook"],
  ["telegram", "Telegram"],
  ["pushover", "Pushover"],
  ["email", "email"],
  ["gotify", "Gotify"],
  ["slack", "Slack"],
  ["pushbullet", "Pushbullet"],
] as const;

export const API_OPERATIONS: ApiOperation[] = [
  ...group("Discovery & auth", [
    ["GET", "/server-info", "public", "What this server is: name, version, API version and the sign-in options it offers."],
    ["GET", "/openapi.json", "public", "This description of the API, as OpenAPI 3.1."],
    ["POST", "/auth/login", "public", "Sign in with a username and password; returns a device token."],
    ["POST", "/auth/setup", "public", "Create the first (admin) account on a new server."],
    ["POST", "/auth/logout", "user", "Revoke the calling device token."],
    ["POST", "/auth/plex/start", "public", "Start signing in with Plex (returns a plex.tv link and a handle)."],
    ["POST", "/auth/plex/poll", "public", "Poll a Plex sign-in until it completes."],
    ["POST", "/auth/jellyfin", "public", "Sign in with a Jellyfin username and password."],
    ["POST", "/auth/jellyfin/quick-connect/start", "public", "Start a Jellyfin Quick Connect sign-in (returns a code)."],
    ["POST", "/auth/jellyfin/quick-connect/poll", "public", "Poll a Quick Connect sign-in until it's approved."],
    ["POST", "/auth/sso/start", "public", "Start a single sign-on sign-in (returns a browser link)."],
    ["POST", "/auth/sso/poll", "public", "Poll a single sign-on sign-in until it completes."],
    ["GET", "/me", "user", "The signed-in account."],
    ["PATCH", "/me", "user", "Change your own preferences: the language Marquee is shown in."],
    ["GET", "/badges", "user", "The nav counters: unread notifications and, for reviewers, requests and problem reports waiting."],
  ]),
  ...group("Dashboard widgets", [
    ["GET", "/stats/summary", "user", "Counts for dashboard widgets (Homepage, Homarr): pending requests, open issues, can't-find, library size, downloading.", { response: "StatsSummary" }],
  ]),
  ...group("Discover, browse & search", [
    ["GET", "/discover", "user", "The Discover page's rows, in the admin's order."],
    ["GET", "/discover/lists/{list}", "user", "One Discover row in full (paginated): a built-in list or a custom row's id."],
    ["GET", "/settings/discover", "admin", "Every Discover row in order, hidden ones included."],
    ["PUT", "/settings/discover", "admin", "Reorder the Discover rows and choose which show."],
    ["POST", "/settings/discover/shelves", "admin", "Add a Discover row: a TMDb keyword, genre, studio, network or list, a Trakt list, or recently added.", { created: true }],
    ["PATCH", "/settings/discover/shelves/{id}", "admin", "Rename, change, show or hide a Discover row."],
    ["DELETE", "/settings/discover/shelves/{id}", "admin", "Remove a Discover row you added."],
    ["POST", "/settings/discover/reset", "admin", "Put the built-in Discover rows back as they were."],
    ["GET", "/settings/discover/lookup", "admin", "Find a keyword, studio, network or genre to build a Discover row from."],
    ["GET", "/settings/discover/locale", "admin", "The streaming region and the Discover region / language."],
    ["PUT", "/settings/discover/locale", "admin", "Change the streaming region or the Discover region / language."],
    ["GET", "/movies", "user", "Browse movies with filters and sorting (paginated)."],
    ["GET", "/movies/extras", "user", "The genres, studios and other filter choices for browsing movies."],
    ["GET", "/series", "user", "Browse series with filters and sorting (paginated)."],
    ["GET", "/series/extras", "user", "The genres, networks and other filter choices for browsing series."],
    ["POST", "/surprise", "user", "Pick a random title (\"Surprise me\")."],
    ["GET", "/search", "user", "Search movies, series, people, studios and networks, in sections (?q=)."],
    ["GET", "/search/suggest", "user", "Quick search suggestions while typing, grouped (?q=, ?include=company,network)."],
    ["GET", "/search/{section}", "user", "One search section's See all: movies, series, people or studios (?q=, ?page=)."],
  ]),
  ...group("Titles", [
    ["GET", "/titles/{type}/{id}", "user", "A movie or series page: details, cast, library status, requests."],
    ["GET", "/titles/{type}/{id}/seasons/{season}", "user", "One season's episodes and their library status."],
    ["GET", "/titles/{type}/{id}/status", "user", "A title's library status on its own (cheap to poll)."],
    ["POST", "/titles/{type}/{id}/share", "user", "Share a title with household members."],
    ["GET", "/users/shareable", "user", "Who a title can be shared with."],
    ["POST", "/titles/{type}/{id}/add", "admin", "Add a title straight to Sonarr/Radarr."],
    ["GET", "/titles/{type}/{id}/add-options", "advancedRequests", "The servers, quality profiles and folders a title can be added with."],
    ["POST", "/titles/{type}/{id}/search", "admin", "Ask Sonarr/Radarr to search for a title now."],
    ["PUT", "/titles/{type}/{id}/monitored", "admin", "Turn monitoring on or off in Sonarr/Radarr."],
    ["POST", "/titles/{type}/{id}/remove-from-arr", "admin", "Remove the title from Sonarr/Radarr (or the 4K ones), optionally with its files; its approved requests are marked removed. Not callable with an API key."],
    ["POST", "/titles/{type}/{id}/relink", "admin", "Point a title at a different Sonarr/Radarr entry."],
    ["POST", "/titles/{type}/{id}/block", "manageBlocklist", "Block requests for a title."],
    ["DELETE", "/titles/{type}/{id}/block", "manageBlocklist", "Unblock requests for a title."],
  ]),
  ...group("People & companies", [
    ["GET", "/people/{id}", "user", "A person's page: biography, the title they're best known for, official links and credits.", { response: "PersonDetail" }],
    ["GET", "/companies/{id}", "user", "A studio's or network's page: its best-known title, website and titles.", { response: "CompanyDetail" }],
  ]),
  ...group("Library", [
    ["GET", "/library", "user", "The Library page: everything in Plex, Jellyfin, Sonarr and Radarr, with filters, sort and paging (?type, ?status, ?source, ?resolution, ?hdr, ?codec, ?genre, ?year, ?q, ?sort, ?page).", { response: "LibraryPage" }],
    ["GET", "/library/collections-missing", "user", "Franchises the library has part of, with the missing parts to add or request.", { response: "LibraryCollectionList" }],
    ["GET", "/library/duplicates", "admin", "Titles on more than one server or in more than one file.", { response: "LibraryDuplicateList" }],
    ["GET", "/library/storage", "user", "Free space per root folder and the \"full in N days\" forecast.", { response: "LibraryStorage" }],
  ]),
  ...group("Favorites", [
    ["GET", "/favorites", "user", "The signed-in account's favorites."],
    ["GET", "/favorites/{entityType}/{tmdbId}", "user", "Whether one title, person or company is a favorite."],
    ["PUT", "/favorites/{entityType}/{tmdbId}", "user", "Add a favorite."],
    ["DELETE", "/favorites/{entityType}/{tmdbId}", "user", "Remove a favorite."],
    ["POST", "/favorites/{entityType}/{tmdbId}/toggle", "user", "Toggle a favorite."],
  ]),
  ...group("Requests", [
    ["POST", "/titles/{type}/{id}/request", "user", "Request a title (or some seasons of a series)."],
    ["POST", "/titles/{type}/{id}/request-all-missing", "user", "Request every missing season of a series."],
    ["GET", "/titles/{type}/{id}/collection-rest", "user", "The rest of a movie's collection the viewer can still add or request (offered after adding or requesting it)."],
    ["POST", "/titles/{type}/{id}/collection-rest", "user", "Add (the admin) or request (a member) the rest of a movie's collection."],
    ["GET", "/requests/mine", "user", "The signed-in account's own requests."],
    ["GET", "/requests/pending", "viewRequests", "Requests waiting for review."],
    ["GET", "/requests/history", "viewRequests", "Reviewed requests (paginated)."],
    ["GET", "/requests/pending-count", "user", "How many requests are waiting (0 unless you may review requests)."],
    ["GET", "/requests/not-found", "reviewRequests", "Approved requests Sonarr/Radarr can't find."],
    ["POST", "/requests/{id}/not-found/search", "reviewRequests", "Search again for a request Sonarr/Radarr couldn't find."],
    ["POST", "/requests/{id}/not-found/dismiss", "reviewRequests", "Dismiss a can't-find alert."],
    ["POST", "/requests/{id}/approve", "reviewRequests", "Approve a request (optionally with server/profile overrides)."],
    ["POST", "/requests/{id}/manual-approve", "admin", "Approve a request without adding it to Sonarr/Radarr."],
    ["POST", "/requests/{id}/reject", "reviewRequests", "Decline a request, with an optional reason."],
    ["POST", "/requests/approve-all", "reviewRequests", "Approve every pending request."],
    ["PATCH", "/requests/{id}", "user", "Change a request's seasons or 4K while it's pending."],
    ["DELETE", "/requests/{id}", "user", "Cancel a request."],
    ["GET", "/requests/{id}/edit-options", "user", "What a pending request can be changed to."],
    ["POST", "/requests/{id}/retry", "reviewRequests", "Retry adding a request Sonarr/Radarr couldn't take."],
    ["GET", "/requests/{id}/comments", "user", "A request's conversation."],
    ["POST", "/requests/{id}/comments", "user", "Comment on a request."],
    ["PATCH", "/requests/{id}/comments/{commentId}", "user", "Edit your comment on a request."],
    ["DELETE", "/requests/{id}/comments/{commentId}", "user", "Delete a comment on a request."],
  ]),
  ...group("Problem reports", [
    ["POST", "/titles/{type}/{id}/issues", "user", "Report a problem with a title (reportIssues)."],
    ["GET", "/issues", "user", "Problem reports (all with manageIssues, otherwise your own)."],
    ["DELETE", "/issues/{id}", "user", "Withdraw your open report, or delete any with manageIssues."],
    ["POST", "/issues/{id}/resolve", "manageIssues", "Resolve a problem report."],
    ["POST", "/issues/{id}/search", "manageIssues", "Ask Sonarr/Radarr to search again for a reported title."],
    ["GET", "/issues/{id}/comments", "user", "A problem report's conversation."],
    ["POST", "/issues/{id}/comments", "user", "Comment on a problem report."],
    ["PATCH", "/issues/{id}/comments/{commentId}", "user", "Edit your comment on a problem report."],
    ["DELETE", "/issues/{id}/comments/{commentId}", "user", "Delete a comment on a problem report."],
  ]),
  ...group("Notifications", [
    ["GET", "/notifications", "user", "Recent notifications."],
    ["GET", "/notifications/unread-count", "user", "How many notifications are unread."],
    ["POST", "/notifications/read-all", "user", "Mark every notification read."],
    ["POST", "/notifications/{id}/read", "user", "Mark one notification read."],
    ["GET", "/notifications/stream", "user", "Live notifications as Server-Sent Events."],
    ["GET", "/me/notification-channels", "user", "Your own notification channels (Telegram, Pushover, email, …)."],
    ["POST", "/me/notification-channels", "user", "Add a notification channel of your own."],
    ["PATCH", "/me/notification-channels/{id}", "user", "Change one of your notification channels."],
    ["DELETE", "/me/notification-channels/{id}", "user", "Remove one of your notification channels."],
    ["POST", "/me/notification-channels/{id}/test", "user", "Send a test notification to a channel."],
    ["POST", "/me/notification-channels/{id}/verify", "user", "Confirm a channel with the code it was sent."],
    ["POST", "/me/notification-channels/{id}/resend-code", "user", "Send a channel's confirmation code again."],
    ["POST", "/me/notification-channels/telegram-link", "user", "Start linking your Telegram account."],
    ["POST", "/me/notification-channels/telegram-link/poll", "user", "Poll a Telegram link until it completes."],
    ["GET", "/me/notification-preferences", "user", "Which events notify you."],
    ["PUT", "/me/notification-preferences", "user", "Choose which events notify you."],
    ["GET", "/settings/notification-events", "admin", "Which events the household channels post."],
    ["PUT", "/settings/notification-events", "admin", "Choose which events the household channels post."],
  ]),
  ...group("Calendar & activity", [
    ["GET", "/calendar", "user", "Upcoming releases for the library and requests."],
    ["GET", "/settings/activity", "admin", "Recent household activity."],
  ]),
  ...group("Account & household", [
    ["GET", "/users", "user", "Household members (just yourself for a member)."],
    ["POST", "/users", "admin", "Add a household member.", { created: true }],
    ["PATCH", "/users/{id}", "user", "Change an account (yourself, or anyone as the admin)."],
    ["DELETE", "/users/{id}", "admin", "Remove a household member."],
    ["GET", "/users/{id}/profile", "user", "A member's profile: request counts, limits and Plex Watchlist (yours, or anyone's as the admin)."],
    ["GET", "/users/{id}/avatar", "user", "A profile photo."],
    ["PUT", "/users/{id}/avatar", "user", "Set a profile photo (yours, or anyone's as the admin)."],
    ["DELETE", "/users/{id}/avatar", "user", "Remove a profile photo."],
    ["POST", "/me/links/plex/start", "user", "Start linking your Plex account."],
    ["POST", "/me/links/plex/poll", "user", "Poll a Plex link until it completes."],
    ["DELETE", "/me/links/plex", "user", "Unlink your Plex account."],
    ["POST", "/me/links/jellyfin", "user", "Link your Jellyfin account."],
    ["DELETE", "/me/links/jellyfin", "user", "Unlink your Jellyfin account."],
    ["POST", "/me/links/sso/start", "user", "Start linking your single sign-on account."],
    ["POST", "/me/links/sso/poll", "user", "Poll a single sign-on link until it completes."],
    ["DELETE", "/me/links/sso", "user", "Unlink your single sign-on account."],
    ["GET", "/me/plex-watchlist", "user", "Your Plex Watchlist requests setting."],
    ["PATCH", "/me/plex-watchlist", "user", "Change what your Plex Watchlist requests."],
    ["DELETE", "/me/plex-watchlist", "user", "Stop requesting from your Plex Watchlist."],
    ["POST", "/me/plex-watchlist/start", "user", "Start connecting your Plex Watchlist."],
    ["POST", "/me/plex-watchlist/poll", "user", "Poll a Plex Watchlist connection until it completes."],
    ["POST", "/me/plex-watchlist/sync", "user", "Check your Plex Watchlist now."],
    ["GET", "/trakt-syncs", "user", "Your Trakt lists kept in sync (everyone's for the admin, with ?all=true)."],
    ["POST", "/trakt-syncs", "user", "Keep a public Trakt watchlist or list in sync: new titles on it are requested.", { created: true }],
    ["PATCH", "/trakt-syncs/{id}", "user", "Change what a Trakt sync requests."],
    ["DELETE", "/trakt-syncs/{id}", "user", "Stop keeping a Trakt list in sync."],
    ["POST", "/trakt-syncs/{id}/sync", "user", "Check a Trakt list now."],
    ["GET", "/users/import/{provider}", "admin", "Plex or Jellyfin users that can be imported."],
    ["POST", "/users/import/{provider}", "admin", "Import Plex or Jellyfin users as household members."],
    ["GET", "/settings/sign-in", "admin", "Which sign-in methods the website offers."],
    ["PUT", "/settings/sign-in", "admin", "Choose which sign-in methods the website offers."],
    ["GET", "/settings/sso", "admin", "Single sign-on settings."],
    ["PUT", "/settings/sso", "admin", "Save single sign-on settings."],
    ["DELETE", "/settings/sso", "admin", "Turn single sign-on off."],
    ["POST", "/settings/sso/test", "admin", "Test single sign-on settings."],
    ["GET", "/settings/blocklist", "manageBlocklist", "The request blocklist."],
    ["POST", "/settings/blocklist", "manageBlocklist", "Block automatically: a keyword or genre, a rating in a country, or adult titles."],
    ["POST", "/settings/blocklist/preview", "manageBlocklist", "What a blocklist rule would block, before adding it."],
    ["DELETE", "/settings/blocklist/{id}", "manageBlocklist", "Remove a blocklist entry."],
  ]),
  ...group("API keys", [
    ["GET", "/settings/api-keys", "admin", "Every API key (never the secret). Not callable with an API key.", { response: "ApiKeyList" }],
    ["POST", "/settings/api-keys", "admin", "Create an API key; the secret is in this response only. Not callable with an API key.", { requestBody: "ApiKeyCreate", response: "ApiKeyCreated", created: true }],
    ["DELETE", "/settings/api-keys/{id}", "admin", "Revoke an API key. Not callable with an API key.", { response: "Ok" }],
  ]),
  ...group("Integrations", [
    ["GET", "/settings/integrations", "admin", "Every integration's state (never a saved credential)."],
    ["POST", "/settings/integrations/sync", "user", "Sync the library from Plex, Jellyfin, Sonarr and Radarr now."],
    ["POST", "/settings/integrations/webhook-secret", "admin", "Regenerate the shared Sonarr/Radarr webhook secret."],
    ["GET", "/settings/arr-servers", "admin", "Sonarr/Radarr servers."],
    ["POST", "/settings/arr-servers", "admin", "Add a Sonarr/Radarr server."],
    ["POST", "/settings/arr-servers/test", "admin", "Test a Sonarr/Radarr connection."],
    ["PATCH", "/settings/arr-servers/{id}", "admin", "Change a Sonarr/Radarr server."],
    ["DELETE", "/settings/arr-servers/{id}", "admin", "Remove a Sonarr/Radarr server."],
    ["GET", "/settings/arr-servers/{id}/options", "admin", "A server's quality profiles, folders and tags."],
    ["POST", "/settings/arr-servers/{id}/webhook-secret", "admin", "Regenerate a server's webhook secret."],
    ["GET", "/settings/override-rules", "admin", "Override rules: which requests go to which server, profile, folder and tags. Not callable with an API key."],
    ["POST", "/settings/override-rules", "admin", "Add an override rule. Not callable with an API key.", { created: true }],
    ["PUT", "/settings/override-rules/{id}", "admin", "Replace an override rule. Not callable with an API key."],
    ["DELETE", "/settings/override-rules/{id}", "admin", "Remove an override rule. Not callable with an API key."],
    ...ARR_PROVIDERS.flatMap(([provider, label]): Row[] => [
      ["PUT", `/settings/integrations/${provider}`, "admin", `Connect ${label} (the default server of its kind).`],
      ["DELETE", `/settings/integrations/${provider}`, "admin", `Disconnect ${label}.`],
      ["GET", `/settings/integrations/${provider}/options`, "admin", `${label}'s quality profiles and folders.`],
      ["PUT", `/settings/integrations/${provider}/defaults`, "admin", `Choose ${label}'s default quality profile and folder.`],
    ]),
    ["POST", "/settings/integrations/plex/pin", "admin", "Start connecting Plex (returns a plex.tv PIN)."],
    ["GET", "/settings/integrations/plex/pin/{pinId}", "admin", "Poll a Plex PIN until it's approved."],
    ["DELETE", "/settings/integrations/plex", "admin", "Disconnect Plex."],
    ["PUT", "/settings/integrations/jellyfin", "admin", "Connect Jellyfin."],
    ["DELETE", "/settings/integrations/jellyfin", "admin", "Disconnect Jellyfin."],
    ...SETTING_PROVIDERS.flatMap(([provider, label]): Row[] => [
      ["PUT", `/settings/integrations/${provider}`, "admin", `Save the ${label} settings.`],
      ["DELETE", `/settings/integrations/${provider}`, "admin", `Remove the ${label} settings.`],
    ]),
    ["POST", "/settings/integrations/trakt/import", "admin", "Import a Trakt list as requests."],
  ]),
  ...group("Import from Seerr", [
    ["POST", "/settings/import/seerr/test", "admin", "Check a Seerr, Overseerr or Jellyseerr address and admin API key. Not callable with an API key."],
    ["POST", "/settings/import/seerr/preview", "admin", "What importing from that Seerr would do: accounts matched and new, requests, problem reports, blocklist. Not callable with an API key."],
    ["POST", "/settings/import/seerr/run", "admin", "Start the import in the background; answers 202 with the job to poll. Not callable with an API key."],
    ["GET", "/settings/import/seerr/jobs/{id}", "admin", "An import's progress, then its report. Not callable with an API key."],
  ]),
  ...group("Jobs", [
    ["GET", "/settings/jobs", "admin", "Background jobs and when they last ran."],
    ["POST", "/settings/jobs/{id}/run", "admin", "Run a background job now."],
    ["PUT", "/settings/jobs/{id}", "admin", "Change how often a background job runs. Not callable with an API key."],
    ["GET", "/settings/logs", "admin", "The server's recent log lines, secrets masked; filter by level and text. Not callable with an API key."],
    ["GET", "/settings/not-found", "admin", "How long before an approved request counts as can't-find."],
    ["PUT", "/settings/not-found", "admin", "Change how long before an approved request counts as can't-find."],
  ]),
  ...group("About & help", [
    ["GET", "/settings/about", "user", "Server version and environment."],
    ["GET", "/changelog", "user", "What's new, newest first."],
    ["GET", "/help/errors", "user", "The error reference."],
  ]),
];
