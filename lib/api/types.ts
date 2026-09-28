// Response DTOs for /api/v1 — the stable, documented shapes native clients
// decode (see docs/api-v1.md). Conventions: camelCase keys, ISO-8601 UTC
// timestamps with milliseconds, "YYYY-MM-DD" calendar dates, and nullable
// fields always present as null (never omitted).

import type { DiscoverList, DiscoverShelfKey, SeeAllTarget } from "@/lib/discover/lists";
import type { PermissionMap } from "@/lib/users/permissions";

export type { DiscoverList, SeeAllTarget };

export type MediaType = "movie" | "tv";
/** trusted (0.39+): may review requests and problem reports. */
export type UserRole = "admin" | "member" | "trusted";
export type RequestStatus = "pending" | "approved" | "rejected";
/** An open set: newer servers may add values (tracked_unmonitored came in
 * later), so clients read anything unknown as neutral. */
export type LibraryStatus =
  | "owned"
  | "tracked_downloading"
  | "tracked_monitored"
  | "tracked_unmonitored"
  | "coming_soon"
  | "untracked";
export type LibraryProvider = "plex" | "jellyfin" | "sonarr" | "radarr";
export type FavoriteEntityType = "person" | "company" | "movie" | "tv" | "collection";
/** issue_reported / issue_resolved: 0.38+ (problem reports). */
export type NotificationEventType =
  | "grabbed"
  | "downloaded"
  | "request_approved"
  | "request_rejected"
  | "issue_reported"
  | "issue_resolved"
  /** 0.40+: a new request waiting for review (admin and trusted members). */
  | "request_created"
  /** 0.46+: an approved request Sonarr/Radarr hasn't found a release for —
   * to reviewers ("Couldn't find …") and, if they chose it, the requester
   * ("We're still looking for …"). */
  | "request_not_found"
  /** 0.45.1+: a household member shared a title with you (`sharedBy`, `note`). */
  | "title_shared"
  /** 0.46+: a new comment on a request (`requestId`) or problem report
   * (`issueId`) you're part of. */
  | "request_comment"
  | "issue_comment"
  /** 0.68+: your approved request's title was removed from Sonarr/Radarr
   * again; the message carries the admin's reason when they gave one. */
  | "request_removed";
export type ActivityEventType =
  | "request_created"
  | "request_approved"
  | "request_rejected"
  | "request_manually_approved";

export type ApiErrorBody = { error: string; code: string };
export type Ok = { ok: true };
export type ListResponse<T> = { results: T[] };
export type Paginated<T> = { page: number; totalPages: number; totalResults: number; results: T[] };

// ── Discovery & auth ────────────────────────────────────────────────────────

export type ServerInfo = {
  app: "marquee";
  apiVersion: 1;
  version: string;
  setupComplete: boolean | null;
  status: "ok" | "degraded";
  /** Which sign-in methods to offer. Plex/Jellyfin are true only while the
   * admin has that server connected. Missing on older servers. */
  signIn: SignInMethods;
};

export type SignInMethods = {
  password: true;
  plex: boolean;
  jellyfin: boolean;
  /** 0.40+: "Jellyfin", or "Emby" when the connected server is Emby (it
   * speaks the same API, so everything "jellyfin" works with it). Label
   * the Jellyfin sign-in, linking and import with this. */
  jellyfinName: string;
  /** 0.42.2+: the admin has "New accounts from Plex/Jellyfin sign-in" on and
   * Plex or Jellyfin sign-in is offered — say on the sign-in screen that
   * newcomers get an account by signing in with it. Treat missing as false. */
  signup: boolean;
  /** 0.44+: offer "Use Quick Connect" on the Jellyfin sign-in (true only
   * for Jellyfin, never Emby). Whether the Jellyfin server has it switched
   * on shows when it's started (`409`). Treat missing as false. */
  quickConnect: boolean;
  /** 0.44+: single sign-on is set up — show "Sign in with {name}". `signup`:
   * new accounts from SSO sign-in are on. Null (or missing) when it isn't. */
  sso: { name: string; signup: boolean } | null;
};

/** Which sign-ins an account has linked. `sso` is 0.44+ (missing = false). */
export type LinkedAccounts = { plex: boolean; jellyfin: boolean; sso: boolean };

/** POST /auth/sso/start and POST /me/links/sso/start: open `authUrl` in the
 * browser, then poll with `handle`. */
export type SsoStart = { handle: string; authUrl: string; expiresAt: string };

/** POST /auth/jellyfin/quick-connect/start: show `code`, poll with `handle`. */
export type QuickConnectStart = { handle: string; code: string; expiresAt: string };

/** GET/PUT /settings/sso (admin). The client secret is never returned. */
export type SsoSettings = {
  configured: boolean;
  name: string;
  issuer: string;
  clientId: string;
  hasClientSecret: boolean;
  scopes: string;
  publicUrl: string;
  callbackUrl: string;
  allowSignup: boolean;
  matchEmail: boolean;
  requiredGroup: string | null;
  trustedGroup: string | null;
  groupsClaim: string;
};

/** POST /settings/sso/test (admin). */
export type SsoTestResult = {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint: string | null;
  warnings: string[];
};

/** POST /auth/plex/start and POST /me/links/plex/start. */
export type PlexSignInStart = { handle: string; authUrl: string; expiresAt: string };

/** The 202 answer of a Plex poll that's still waiting for plex.tv. */
export type PlexPollPending = { status: "pending" };

/** GET/PATCH/DELETE /me/plex-watchlist, and the answer of its poll and sync. */
export type PlexWatchlist = {
  /** Plex is linked to this account, so the watchlist can be turned on. */
  available: boolean;
  enabled: boolean;
  movies: boolean;
  tv: boolean;
  lastSyncedAt: string | null;
  /** Why the last read failed, or why it was switched off; null when fine. */
  lastError: string | null;
  requestedCount: number;
};

export type ImportCandidate = {
  id: string;
  username: string;
  displayName: string | null;
  thumb: string | null;
  alreadyMember: boolean;
};

export type SignInSettings = { mediaServerSignup: boolean };

/** 0.46+: GET/PUT /settings/not-found. */
export type NotFoundSettings = { afterHours: number };

/** What an account may do (0.48+) — every switch, on or off; always all on
 * for the admin. See lib/users/permissions.ts for what each one covers. */
export type Permissions = PermissionMap;

export type User = {
  id: string;
  username: string;
  displayName: string | null;
  /** "admin", or the preset nearest their permissions: "trusted" exactly
   * when they're the Trusted preset, "member" otherwise. Use `permissions`
   * to decide what to show. */
  role: UserRole;
  /** What this account may do (0.48+). */
  permissions: Permissions;
  libraryOwnerId: string;
  /** Server-relative path of the profile photo (GET, bearer token), or null
   * for none. Changes whenever the photo does. */
  avatarUrl: string | null;
};

export type Me = User & {
  autoApproveMovies: boolean;
  autoApproveTv: boolean;
  createdAt: string;
  linked: LinkedAccounts;
  /** False for an account made by Plex/Jellyfin sign-in that hasn't set a
   * password; it sets one without a current password. */
  hasPassword: boolean;
  /** This account's request limits and how much is left (0.39+); each null
   * when that type isn't limited. */
  requestLimits: { movie: RequestQuota | null; tv: RequestQuota | null };
  /** The language this account reads Marquee in — "en", "es", "fr", "de"
   * or "pt-BR" — or null to follow the browser / the app's system language
   * (0.50+). Set with PATCH /me. */
  language: string | null;
};

export type RequestQuota = {
  limit: number;
  days: number;
  used: number;
  remaining: number;
  /** When the next request frees up, while none is left. */
  nextSlotAt: string | null;
};

export type AuthResponse = { token: string; expiresAt: string; user: User };

export type Badges = {
  unreadNotifications: number;
  pendingRequests: number;
  /** Open problem reports, for the admin's Requests badge (0.38+; 0 for
   * members; an older server omits it). */
  openIssues: number;
  /** 0.46+: approved requests Sonarr/Radarr can't find ("Can't find" on the
   * Requests page); 0 for members, and an older server omits it. */
  notFoundRequests: number;
  /** 0.46+: approved requests Sonarr/Radarr couldn't be reached to add
   * ("Couldn't add" on the Requests page); 0 for members, and an older
   * server omits it. */
  failedRequests: number;
};

/** A problem report (GET /issues). */
export type Issue = {
  id: string;
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  /** "S2 E5", "Season 2", "Specials", or null. */
  episodeLabel: string | null;
  kind: "video" | "audio" | "subtitles" | "wont_play" | "wrong_title" | "other";
  /** The kind in words, e.g. "Audio problem". */
  kindLabel: string;
  message: string | null;
  status: "open" | "resolved";
  /** The admin's note when marking it fixed. */
  resolution: string | null;
  reportedBy: RequestPerson;
  /** Reported by the viewer (who may withdraw it while it's open). */
  isMine: boolean;
  createdAt: string;
  resolvedAt: string | null;
  /** 0.46+: comments in its conversation (the report's own note and the
   * resolution note aren't counted). */
  commentCount: number;
};

/** 0.46+: who wrote a comment. `role` "reviewer" is a trusted member;
 * null once the account is gone (`label` is then "Someone"). */
export type CommentAuthor = {
  userId: string | null;
  label: string;
  avatarUrl: string | null;
  role: "admin" | "reviewer" | "member" | null;
};

/** 0.46+: one message in a request's or problem report's thread. Besides
 * real comments (`kind` "comment"), a thread starts with what was already
 * said: the report's own note ("report"), the note it was marked fixed with
 * ("resolution"), and why a request was declined ("declined") — those have
 * ids like "report:<issue id>" and can't be edited or deleted. */
export type Comment = {
  id: string;
  kind: "comment" | "report" | "resolution" | "declined";
  author: CommentAuthor;
  body: string;
  createdAt: string;
  editedAt: string | null;
  isMine: boolean;
  /** The author, for 15 minutes after posting. */
  canEdit: boolean;
  /** As canEdit, or the admin at any time. */
  canDelete: boolean;
  /** When canEdit runs out; null for the notes. */
  editableUntil: string | null;
};

export type CommentThread = ListResponse<Comment> & {
  /** The viewer may add to it (the requester or reporter, and reviewers). */
  canComment: boolean;
  maxLength: number;
};

export type IssuesResponse = ListResponse<Issue> & {
  /** The kinds the Report form offers, in order. */
  kinds: { id: Issue["kind"]; label: string }[];
};

// ── Cards ───────────────────────────────────────────────────────────────────

/** A poster card. Fields a given list doesn't compute on the website are
 * null (`favorited`, `requested`) or false (`canQuickAdd`, `canRequest`) —
 * each endpoint documents which it fills in. */
export type TitleCard = {
  mediaType: MediaType;
  tmdbId: number;
  name: string;
  posterPath: string | null;
  year: string | null;
  /** A role/character (filmography), a genre name (Movies/Series grid), else null. */
  subtitle: string | null;
  overview: string | null;
  /** TMDb vote average, 0–10. */
  rating: number | null;
  /** null = not in the library at all (no badge). */
  status: LibraryStatus | null;
  favorited: boolean | null;
  /** The viewer already has an active (pending or approved) request for it. */
  requested: boolean | null;
  canQuickAdd: boolean;
  canRequest: boolean;
  /** Series in the library only: episodes on disk against episodes
   * aired, specials left out — the poster's "96/96". Null for a movie, a
   * show the library doesn't have, or when no source counts it. Older
   * servers leave the field out. */
  episodes: EpisodeCounts | null;
};

export type EpisodeCounts = {
  /** Aired episodes with a file on disk. */
  have: number;
  /** Aired episodes. */
  total: number;
};

export type PersonCard = {
  tmdbId: number;
  name: string;
  profilePath: string | null;
  knownForDepartment: string | null;
  favorited: boolean | null;
};

export type CompanyCard = {
  tmdbId: number;
  name: string;
  logoPath: string | null;
  favorited: boolean | null;
};

export type NetworkCard = { tmdbId: number; name: string; logoPath: string | null };

export type Genre = { id: number; name: string };

export type GenreTile = Genre & { backdropPath: string | null };

// ── Discover / browse / search ──────────────────────────────────────────────

export type DiscoverShelves = {
  recentlyAdded: TitleCard[];
  /** 0.53+ (an older server omits it): the viewer's own Plex Watchlist,
   * newest first, for a viewer with "Request from my Plex Watchlist" on;
   * empty otherwise. */
  watchlist?: TitleCard[];
  trending: TitleCard[];
  popularMovies: TitleCard[];
  movieGenres: GenreTile[];
  upcomingMovies: TitleCard[];
  studios: CompanyCard[];
  popularSeries: TitleCard[];
  seriesGenres: GenreTile[];
  upcomingSeries: TitleCard[];
  networks: NetworkCard[];
  /** 0.42.4+ (an older server omits it): where each shelf's "See all" goes.
   * Every shelf has one. */
  seeAll: Record<DiscoverShelfKey, SeeAllTarget>;
  /** 0.49+ (an older server omits it): the rows to show, in the admin's
   * order (Settings → Discover), hidden ones left out, the admin's own rows
   * included. The fixed keys above stay for older apps (a hidden built-in
   * row is an empty array there). */
  shelves: DiscoverShelf[];
};

/** One Discover row. `kind` is the built-in row's key ("trending",
 * "movieGenres", …) or a custom row's kind ("keyword", "genre", "company",
 * "network", "tmdbList", "traktList", "library"). Exactly one of `results`
 * (poster rows — every custom row), `genres` (movieGenres, seriesGenres)
 * and `logos` (studios, networks) is non-null. An app that doesn't know a
 * `kind` shows `results` as a poster row, and skips the row when that's
 * null. */
export type DiscoverShelf = {
  id: string;
  kind: string;
  title: string;
  custom: boolean;
  results: TitleCard[] | null;
  genres: GenreTile[] | null;
  logos: NetworkCard[] | null;
  /** Where "See all" goes; a custom row's is `{ type: "list", list: <its id> }`. */
  seeAll: SeeAllTarget | null;
};

/** What a custom Discover row is built from (lib/discover/shelves.ts). */
export type DiscoverShelfSource = {
  mediaType: "movie" | "tv" | "all" | null;
  tmdbId: number | null;
  name: string | null;
  url: string | null;
};

/** A row as Settings → Discover lists it. */
export type DiscoverShelfSetting = {
  id: string;
  kind: string;
  title: string;
  custom: boolean;
  hidden: boolean;
  /** Null for a built-in row. */
  source: DiscoverShelfSource | null;
};

/** GET /settings/discover (and the answer of every change to it). */
export type DiscoverSettings = {
  shelves: DiscoverShelfSetting[];
  /** Trakt rows need Trakt connected (Settings → General). */
  traktConfigured: boolean;
  maxCustomShelves: number;
};

/** GET /settings/discover/lookup: keywords, studios, networks or genres to
 * build a row from. */
export type DiscoverLookupResult = {
  tmdbId: number;
  name: string;
  logoPath: string | null;
  /** A hint to tell same-named ones apart, e.g. the company's country. */
  detail: string | null;
};

/** GET /discover/lists/{list}: a Discover shelf's full list, paged. `list`
 * is a built-in list's name or a custom row's id. */
export type DiscoverListResults = Paginated<TitleCard> & { list: DiscoverList | string; title: string };

/** A member's "Keep in sync" of a public Trakt watchlist or list
 * (GET /trakt-syncs, lib/trakt/sync.ts). */
export type TraktSync = {
  id: string;
  kind: "watchlist" | "list";
  /** The list's link on trakt.tv. */
  url: string;
  /** "someone's watchlist" or the list's name from its link. */
  name: string;
  movies: boolean;
  tv: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
  requestedCount: number;
  createdAt: string;
  /** Whose it is. */
  owner: { id: string; username: string; displayName: string | null };
};

/** GET /trakt-syncs. */
export type TraktSyncs = {
  results: TraktSync[];
  /** Trakt is connected (Settings → General), so syncs can be added. */
  available: boolean;
  /** The most one account may have. */
  maxPerMember: number;
};

export type BrowseExtras = {
  genres: Genre[];
  network: NetworkCard | null;
  becauseYouWatched: { title: string; items: TitleCard[] } | null;
};

export type SurprisePick = { mediaType: MediaType; tmdbId: number };

/** One section of the search page (0.55+): the first page of results, best
 * match first, and how many TMDb has in all — more than `results` means the
 * section's "See all" (GET /search/{section}) has more. */
export type SearchSection<T> = { totalResults: number; totalPages: number; results: T[] };

/** A studio or network in search's "Studios & Networks" (0.55+). A studio
 * opens its company page; a network opens Series filtered to it. Networks
 * can't be favorited (`favorited` null). */
export type SearchCompanyCard = CompanyCard & { kind: "studio" | "network" };

/** A person on the search page: PersonCard plus, 0.55+, up to three titles
 * they're known for. */
export type SearchPersonCard = PersonCard & { knownFor?: string[] };

export type SearchResults = {
  query: string;
  /** The same people as `sections.people` (kept for older apps). */
  people: SearchPersonCard[];
  /** Studios only (kept for older apps); `sections.studiosAndNetworks` adds networks. */
  studios: CompanyCard[];
  /** Movies then series (kept for older apps). */
  titles: TitleCard[];
  /** `placement` (0.55+): "first" when the query names the genre/keyword
   * itself ("horror"), so it leads the page; "last" otherwise. */
  theme: { label: string; items: TitleCard[]; placement?: "first" | "last" } | null;
  /** 0.55+: the page's sections, shown in this order — movies, series,
   * people, studios & networks. An empty section is hidden. */
  sections?: {
    movies: SearchSection<TitleCard>;
    series: SearchSection<TitleCard>;
    people: SearchSection<SearchPersonCard>;
    studiosAndNetworks: SearchSection<SearchCompanyCard>;
  };
  /** 0.55+: the non-empty blocks in the order to show them, e.g.
   * ["movies", "series", "people", "studiosAndNetworks", "theme"]. People
   * comes first when the query names a person ("tom hanks"). Treat it as an
   * open set: skip keys you don't know. */
  order?: string[];
};

/** GET /search/{section} (0.55+): one page of a search section's "See all". */
export type SearchSectionPage = Paginated<TitleCard> | Paginated<SearchPersonCard> | Paginated<SearchCompanyCard>;

export type SearchSuggestion = {
  id: number;
  /** "company" and "network" (0.55+) only when asked for with
   * `?include=company,network`, so older apps never see them. */
  mediaType: "person" | "movie" | "tv" | "company" | "network";
  name: string;
  /** A poster for titles, a photo for people, a logo for studios/networks. */
  posterPath: string | null;
  subtitle: string | null;
  /** Movies/series only (absent for people): the viewer's library status,
   * from the same local lookup poster cards use. */
  status?: LibraryStatus;
};

// ── Title ───────────────────────────────────────────────────────────────────

export type FileDetails = {
  path: string | null;
  sizeBytes: number;
  quality: string | null;
  /** "4K" | "1080p" | "720p" derived from `quality`, falling back to
   * `resolution` for a title owned via Plex/Jellyfin (no quality profile),
   * as the website shows it. */
  resolutionTier: "4K" | "1080p" | "720p" | null;
  /** Radarr's raw "3840x1600", or a media server's tier ("4K", "1080p") — a
   * raw "WxH" only when the file's dimensions don't land on a tier. */
  resolution: string | null;
  videoCodec: string | null;
  dynamicRange: string | null;
  audioCodec: string | null;
  audioChannels: number | null;
  /** Uppercase container name ("MKV", "MP4"). Plex/Jellyfin only — neither
   * *arr reports it. */
  container: string | null;
  /** Overall bitrate of the file in kbps. Plex/Jellyfin only. */
  bitrateKbps: number | null;
  dateAdded: string | null;
  releaseGroup: string | null;
  edition: string | null;
};

export type TitleLibraryInfo = {
  status: LibraryStatus;
  provider: LibraryProvider | null;
  /** The library owner's Sonarr/Radarr (for this media type) has a root folder and quality profile. */
  configured: boolean;
  file: FileDetails | null;
};

export type ArrTracking = { arrId: number; monitored: boolean };

export type TitleViewerState = {
  isAdmin: boolean;
  favorited: boolean;
  requestStatus: RequestStatus | null;
  alreadyRequested: boolean;
  otherRequesters: string[];
  canAdd: boolean;
  needsArrSetup: boolean;
  canRequest: boolean;
  /** A member can request specific seasons of this show: nothing of theirs
   * is pending for it and at least one season is `requestable`. Unlike
   * `canRequest`, true for a show that's already tracked or owned. */
  canRequestSeasons: boolean;
  /** The seasons of the viewer's pending request for this title; null when
   * nothing is pending or it's for the whole series. */
  requestedSeasons: number[] | null;
  canRelink: boolean;
  arrTracking: ArrTracking | null;
  /** The 4K copy, when the admin has a 4K Sonarr/Radarr for this type
   * (0.37+; null otherwise, and omitted by an older server). */
  fourK: FourKViewerState | null;
  /** "Report a problem" applies: the title (or its 4K copy) is in the
   * library or on its way (0.38+; an older server omits it). */
  canReport: boolean;
  /** The viewer's own open problem reports for this title. */
  openReports: number;
  /** 0.41+: the admin's blocklist covers this title — no Request (nor 4K,
   * nor seasons) for members; `reason` is the admin's note. The admin sees
   * it too, with an Unblock button (`DELETE …/block`). Null when it isn't
   * blocked. */
  blocked: { reason: string | null; keyword: string | null } | null;
  /** 0.46+: for the admin and trusted members, when an approved request for
   * this title became "Can't find" (Sonarr/Radarr has found nothing); null
   * otherwise, and omitted by an older server. */
  notFoundSince: string | null;
  /** 0.46+: the viewer's own requests for this title (regular and 4K, the
   * newest five), for Cancel / Edit and the conversation. Empty when there
   * are none; an older server omits it. */
  myRequests: TitleRequestSummary[];
  /** 0.53+: the viewer's requests of this type are approved at once (the
   * admin, or autoApproveMovies / autoApproveTv) — the request dialog says
   * "This request will be approved automatically". An older server omits
   * it. */
  autoApprove?: boolean;
  /** 0.63+: "Open in Radarr" / "Open in Sonarr" — the title's page on each
   * server that has it (standard and 4K), in Settings order, at the
   * server's "Public URL (for links)" when set. Only for the admin and
   * whoever may review requests; empty for everyone else, and omitted by an
   * older server. Label each "Open in Radarr" / "Open in Radarr 4K", or
   * "Open in {serverName}" when several of that kind and 4K-ness have it. */
  arrLinks?: ArrLink[];
};

/** 0.63+: one of TitleViewerState.arrLinks. */
export type ArrLink = {
  kind: "radarr" | "sonarr";
  serverName: string;
  is4k: boolean;
  url: string;
};

/** 0.46+: GET /requests/{id}/edit-options — what "Edit" on a pending
 * request can offer. */
export type RequestEditOptions = {
  requestId: string;
  mediaType: MediaType;
  title: string;
  /** As it is now: null seasons is the whole series (and every movie). */
  seasons: number[] | null;
  is4k: boolean;
  /** TV: the show's seasons, newest first, as the season picker lists them
   * — "requestable" ones can be ticked (this request's own included). Empty
   * for a movie. */
  seasonRows: {
    seasonNumber: number;
    name: string;
    episodeCount: number;
    state: "requestable" | "complete" | "monitored" | "requested" | "unavailable";
  }[];
  /** It can be switched to (or stay) 4K: the 4K Sonarr/Radarr is set up. */
  fourKAvailable: boolean;
};

/** 0.46+: one of the viewer's own requests, on the title page. */
export type TitleRequestSummary = {
  id: string;
  status: RequestStatus;
  seasons: number[] | null;
  seasonsLabel: string | null;
  is4k: boolean;
  /** Still pending: its requester may change its seasons / 4K or cancel it. */
  canEdit: boolean;
  canCancel: boolean;
  commentCount: number;
  createdAt: string;
  /** 0.68+: approved, then the admin removed the title from Sonarr/Radarr;
   * null otherwise. */
  removedAt?: string | null;
  /** 0.68+: why it was removed, when the admin said; null otherwise. */
  removedReason?: string | null;
};

export type FourKViewerState = {
  /** How the 4K instance has it; "untracked" when it doesn't. */
  status: LibraryStatus;
  /** The viewer's own 4K request, if any isn't declined. */
  requestStatus: RequestStatus | null;
  /** A member may press "Request in 4K". */
  canRequest: boolean;
  /** The admin may press "Add to 4K Radarr/Sonarr". */
  canAdd: boolean;
};

export type TitleStatus = { mediaType: MediaType; tmdbId: number; library: TitleLibraryInfo; viewer: TitleViewerState };

export type CastMember = {
  tmdbId: number;
  name: string;
  character: string | null;
  profilePath: string | null;
  order: number;
  favorited: boolean;
};

export type SeasonSummary = {
  seasonNumber: number;
  name: string;
  episodeCount: number;
  airDate: string | null;
  posterPath: string | null;
  /** Sonarr episode-file counts; null when Sonarr doesn't track the show. */
  have: number | null;
  total: number | null;
  /** Sonarr will fetch this season (it and the series are monitored); null
   * when Sonarr isn't connected or doesn't track the show. */
  monitored: boolean | null;
  /** In one of the viewer's pending or approved requests for this title. */
  requested: boolean;
  /** The viewer (a member) could ask for this season: not complete, not
   * monitored, not already requested by them. Always false for the admin. */
  requestable: boolean;
};

export type TitleRatingsDto = {
  /** 0–10, one decimal. */
  imdbRating: number | null;
  imdbVotes: number | null;
  /** The Tomatometer, 0–100. */
  rottenTomatoesCritics: number | null;
  /** The Metascore, 0–100. */
  metacritic: number | null;
  /** The title's IMDb page, when it has an IMDb id. */
  imdbUrl: string | null;
};

export type PlayLinkDto = {
  server: "plex" | "jellyfin" | "emby";
  serverName: string | null;
  /** "Play on Plex", in the reader's language. */
  label: string;
  url: string;
  appUrl: string | null;
};

export type TitleDetail = {
  mediaType: MediaType;
  tmdbId: number;
  tvdbId: number | null;
  imdbId: string | null;
  name: string;
  overview: string | null;
  tagline: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  year: string | null;
  releaseDate: string | null;
  tmdbStatus: string | null;
  facts: {
    runtimeMinutes: number | null;
    runtimeLabel: string | null;
    ratingPercent: number | null;
    genres: string[];
    yearRange: string | null;
    statusLabel: string | null;
    network: string | null;
    releaseDateLabel: string | null;
    nextAirDate: string | null;
    nextAirDateLabel: string | null;
    originalLanguage: string | null;
    originalLanguageLabel: string | null;
    productionCountry: { code: string; name: string; flag: string } | null;
    watchProviders: { name: string; logoPath: string | null }[];
    /** 0.53+ (an older server omits these). The country `watchProviders`
     * and the release dates are for (Settings › Discover › Region &
     * language), and TMDb's "where to watch" page there. */
    streamingRegion?: string;
    streamingLink?: string | null;
    /** Only when it differs from `name`. */
    originalTitle?: string | null;
    /** A movie's release dates in `streamingRegion` (ISO days), and the
     * same as labels in the reader's language. */
    theatricalRelease?: string | null;
    theatricalReleaseLabel?: string | null;
    digitalRelease?: string | null;
    digitalReleaseLabel?: string | null;
    /** US dollars, and the same formatted; null when TMDb doesn't know. */
    budget?: number | null;
    budgetLabel?: string | null;
    revenue?: number | null;
    revenueLabel?: string | null;
    /** A movie's first studio (a show's network is `network`). */
    studio?: string | null;
    /** IMDb / Rotten Tomatoes / Metacritic from OMDb (Settings ›
     * General › OMDb); null without a key or when nothing is known. */
    ratings?: TitleRatingsDto | null;
  };
  /** 0.53+: where the title can be played now — one entry per household
   * media server that has it (Plex first). Empty when it's in none, or
   * no media server is connected. `url` opens in a browser; `appUrl` is
   * the server's own scheme (Plex's `plex://`) for devices with its app. */
  play?: PlayLinkDto[];
  credits: { role: string; name: string }[];
  keywords: string[];
  links: {
    trailerYoutubeKey: string | null;
    imdbId: string | null;
    tvdbId: number | null;
    facebookId: string | null;
    instagramId: string | null;
    twitterId: string | null;
    external: { label: string; url: string }[];
  };
  library: TitleLibraryInfo;
  viewer: TitleViewerState;
  seasons: SeasonSummary[];
  cast: CastMember[];
  franchise: {
    title: string;
    collectionId: number | null;
    collectionFavorited: boolean | null;
    items: TitleCard[];
    addAllMissing: { mediaType: MediaType; tmdbId: number }[];
    /** A household member's "Request all N missing" set; empty for the admin. */
    requestAllMissing: { mediaType: MediaType; tmdbId: number }[];
  } | null;
  studios: CompanyCard[];
  similar: TitleCard[];
};

export type Episode = {
  id: number;
  episodeNumber: number;
  name: string;
  overview: string | null;
  airDate: string | null;
  stillPath: string | null;
  hasFile: boolean | null;
};

export type SeasonEpisodes = { tmdbId: number; seasonNumber: number; episodes: Episode[] };

export type RelinkResult = { ok: true; newTmdbId: number };

/** POST /titles/{type}/{tmdbId}/request-all-missing. */
export type RequestAllMissingResult = {
  ok: true;
  total: number;
  requested: number;
  refused: { mediaType: MediaType; tmdbId: number; title: string; error: string }[];
  message: string;
};

// ── People & companies ──────────────────────────────────────────────────────

/** The title a person or studio is best known for — its backdrop sits
 * behind the page's header, with a "From {name}" link to its page. */
export type KnownForTitleDto = {
  mediaType: MediaType;
  tmdbId: number;
  name: string;
  backdropPath: string;
};

/** One official link on a person's or studio's page, in display
 * order. `kind` picks the label: the brand name, or "Website" for
 * `homepage`. */
export type ExternalLinkDto = {
  kind: "imdb" | "instagram" | "twitter" | "facebook" | "tiktok" | "youtube" | "homepage";
  url: string;
};

export type PersonDetail = {
  tmdbId: number;
  name: string;
  alsoKnownAs: string[];
  biography: string | null;
  birthday: string | null;
  deathday: string | null;
  placeOfBirth: string | null;
  profilePath: string | null;
  favorited: boolean;
  /** Null when nothing they're known for has artwork. */
  knownForTitle: KnownForTitleDto | null;
  externalLinks: ExternalLinkDto[];
  credits: TitleCard[];
};

export type CompanyDetail = {
  tmdbId: number;
  name: string;
  description: string | null;
  logoPath: string | null;
  titleCount: number;
  favorited: boolean;
  /** Its most-voted title with artwork; null when none. */
  knownForTitle: KnownForTitleDto | null;
  /** Only ever its own website (`homepage`), when TMDb lists one. */
  externalLinks: ExternalLinkDto[];
  titles: TitleCard[];
};

// ── Favorites ───────────────────────────────────────────────────────────────

export type FavoriteCollection = {
  collectionId: number;
  name: string;
  posterPath: string | null;
  firstMovieTmdbId: number | null;
};

export type FavoritesResponse = {
  movies: TitleCard[];
  tv: TitleCard[];
  collections: FavoriteCollection[];
  people: PersonCard[];
  studios: CompanyCard[];
};

export type FavoriteState = { entityType: FavoriteEntityType; tmdbId: number; favorited: boolean };

// ── Requests ────────────────────────────────────────────────────────────────

export type RequestPerson = { userId: string | null; displayName: string | null; username: string; label: string };

export type MyRequest = {
  id: string;
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  /** The TV seasons asked for, ascending; null for the whole series (every
   * movie, and requests made before per-season requests existed). */
  seasons: number[] | null;
  /** `seasons` in words, e.g. "Seasons 1–3, 5"; null when `seasons` is. */
  seasonsLabel: string | null;
  /** Asked for in 4K (0.37+; an older server omits it, meaning false). */
  is4k: boolean;
  status: RequestStatus;
  manuallyApproved: boolean;
  /** Why the admin declined it; null unless `status` is "rejected" and a
   * reason was given. */
  rejectionReason: string | null;
  libraryStatus: LibraryStatus | null;
  statusLabel: string;
  statusTone: "pending" | "declined" | "owned" | "downloading" | "coming_soon" | "approved";
  createdAt: string;
  reviewedAt: string | null;
  /** 0.46+: you may still change it (seasons, 4K) or cancel it — while it's
   * pending. An older server omits these, meaning false. */
  canEdit: boolean;
  canCancel: boolean;
  /** 0.46+: when its seasons or 4K were last changed; null if never. */
  editedAt: string | null;
  /** 0.46+: comments in its conversation (the notes aren't counted). */
  commentCount: number;
  /** 0.53+: the title's backdrop, for a card behind the request. */
  backdropPath?: string | null;
  /** 0.53+: who approved or declined it, when someone did by hand. */
  reviewedBy?: RequestPerson | null;
  /** 0.53+: the Sonarr/Radarr server approving it added it to, if known. */
  addedToServer?: string | null;
  /** 0.68+: approved, then the admin removed the title from Sonarr/Radarr
   * ("Removed", `statusTone` "declined"); null otherwise. */
  removedAt?: string | null;
  /** 0.68+: why it was removed, when the admin said; null otherwise. */
  removedReason?: string | null;
};

export type PendingRequest = {
  id: string;
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  /** The TV seasons asked for, ascending; null for the whole series (every
   * movie, and requests made before per-season requests existed). */
  seasons: number[] | null;
  /** `seasons` in words, e.g. "Seasons 1–3, 5"; null when `seasons` is. */
  seasonsLabel: string | null;
  /** Asked for in 4K (0.37+; an older server omits it, meaning false). */
  is4k: boolean;
  requestedBy: RequestPerson;
  createdAt: string;
  /** 0.46+: when its seasons or 4K were last changed; null if never. */
  editedAt: string | null;
  /** 0.46+: comments in its conversation. */
  commentCount: number;
  /** 0.53+: the title's backdrop, for a card behind the request. */
  backdropPath?: string | null;
};

export type PendingRequestsResponse = ListResponse<PendingRequest> & {
  sonarrUrl: string | null;
  /** The preset reasons the website's Reject chooser offers, in order. */
  rejectionReasons: string[];
};

export type ReviewedRequest = {
  id: string;
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  /** The TV seasons asked for, ascending; null for the whole series (every
   * movie, and requests made before per-season requests existed). */
  seasons: number[] | null;
  /** `seasons` in words, e.g. "Seasons 1–3, 5"; null when `seasons` is. */
  seasonsLabel: string | null;
  /** Asked for in 4K (0.37+; an older server omits it, meaning false). */
  is4k: boolean;
  status: RequestStatus;
  manuallyApproved: boolean;
  rejectionReason: string | null;
  statusLabel: string;
  requestedBy: RequestPerson;
  createdAt: string;
  reviewedAt: string | null;
  /** 0.43+: where approving it added the title; null for rejected, manually
   * approved and older requests. */
  addedTo: RequestAddedTo | null;
  /** 0.46+: listed under "Can't find" since then; null when it isn't (an
   * older server omits it). */
  notFoundSince: string | null;
  /** 0.46+: approved, but Sonarr/Radarr couldn't be reached (or errored) to
   * add it — "Couldn't add", with a Retry. Null otherwise. */
  addFailed: { error: string; since: string } | null;
  /** 0.46+: comments in its conversation. */
  commentCount: number;
  /** 0.53+: the title's backdrop, for a card behind the request. */
  backdropPath?: string | null;
  /** 0.53+: who approved or declined it; null when nobody did by hand
   * (auto-approved) or the account is gone. */
  reviewedBy?: RequestPerson | null;
  /** 0.53+: when its seasons or 4K were last changed; null if never. */
  editedAt?: string | null;
  /** 0.68+: approved, then the admin removed the title from Sonarr/Radarr
   * (`statusLabel` "Removed"); null otherwise. */
  removedAt?: string | null;
  /** 0.68+: why it was removed, when the admin said; null otherwise. */
  removedReason?: string | null;
};

/** 0.46+: an approved request Sonarr/Radarr hasn't found (GET /requests/not-found). */
export type NotFoundRequest = {
  id: string;
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  seasons: number[] | null;
  seasonsLabel: string | null;
  is4k: boolean;
  requestedBy: RequestPerson;
  createdAt: string;
  reviewedAt: string | null;
  notFoundSince: string;
  /** The Sonarr/Radarr it went to. `id`/`name` null when unknown. */
  server: { id: string | null; name: string | null; kind: "sonarr" | "radarr" };
  /** The title's page in that Sonarr/Radarr ("Open in Radarr"); null when unknown. */
  arrUrl: string | null;
  /** A tip for finding it by hand, shown under the actions. */
  hint: string;
};

export type NotFoundRequestsResponse = ListResponse<NotFoundRequest> & {
  /** How many hours after approval an unfound request is listed. */
  afterHours: number;
};

export type RequestAddedTo = {
  /** Null once that server has been removed. */
  serverId: string | null;
  serverName: string;
  /** What a title new to the server was added with; null when the server
   * already had it (it keeps its own). */
  qualityProfileId: number | null;
  rootFolderPath: string | null;
  tags: number[] | null;
  seriesType: "standard" | "daily" | "anime" | null;
};

export type ApproveAllResponse = {
  ok: true;
  approvedCount: number;
  failedCount: number;
  /** The web's summary line when some failed, else null. */
  message: string | null;
};

// ── Notifications, calendar, activity ───────────────────────────────────────

export type NotificationItem = {
  id: string;
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  eventType: NotificationEventType;
  message: string;
  read: boolean;
  /** 0.45+: false when this account turned off device push for this kind
   * of notification — it's in the bell, but no banner. Absent: true. */
  alert: boolean;
  createdAt: string;
  /** 0.45.1+: title_shared — who shared it; null for every other kind (and
   * once that account is removed). Missing on older servers. */
  sharedBy: ShareableUser | null;
  /** 0.45.1+: title_shared — the sharer's note, plain text; else null. */
  note: string | null;
  /** 0.46+: the request a request_created or request_comment notification is
   * about, and the problem report an issue_comment one is about; else null
   * (and null once it's gone). Missing on older servers. */
  requestId: string | null;
  issueId: string | null;
};

/** GET /me/notification-channels (0.45+). */
export type PersonalNotificationChannel = {
  id: string;
  /** slack, gotify and pushbullet since 0.57. */
  kind: "telegram" | "pushover" | "email" | "discord" | "ntfy" | "webhook" | "slack" | "gotify" | "pushbullet";
  name: string | null;
  /** Masked: enough to tell channels apart, never the secret itself. */
  target: string;
  enabled: boolean;
  /** Email: false until the code sent to the address is entered. */
  verified: boolean;
  lastSuccessAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  createdAt: string;
};

export type PersonalNotificationChannels = {
  available: {
    telegram: { available: boolean; botUsername: string | null };
    pushover: { available: boolean };
    email: { available: boolean };
    discord: { available: boolean };
    ntfy: { available: boolean; householdServer: string | null };
    webhook: { available: boolean; homeNetwork: boolean };
    /** 0.57+. */
    slack: { available: boolean };
    gotify: { available: boolean };
    pushbullet: { available: boolean };
  };
  channels: PersonalNotificationChannel[];
};

export type NotificationPreferenceRow = {
  event: string;
  label: string;
  reviewerOnly: boolean;
  inApp: boolean;
  push: boolean;
  channels: Record<string, boolean>;
};

/** GET/PUT /me/notification-preferences (0.45+). */
export type NotificationPreferences = { events: NotificationPreferenceRow[] };

/** GET/PUT /settings/notification-events (0.45+, admin). */
export type HouseholdNotificationEvents = { events: { event: string; label: string; enabled: boolean }[] };

/** 0.45.1+: a household member as the share picker shows them
 * (GET /users/shareable) and as the sender of a shared title. */
export type ShareableUser = RequestPerson & { userId: string; avatarUrl: string | null };

/** GET /users/shareable. `publicUrl`: the address set as Marquee's public
 * one, for links that leave the house (null when none is set — use the
 * address the app is connected to). */
export type ShareableUsersResponse = { results: ShareableUser[]; publicUrl: string | null };

/** POST /titles/{type}/{tmdbId}/share. */
export type ShareTitleResponse = { ok: true; sharedWith: number };

export type CalendarEntry = {
  date: string;
  mediaType: MediaType;
  tmdbId: number;
  name: string;
  posterPath: string | null;
  subtitle: string;
};

export type CalendarResponse = {
  configured: boolean;
  month: string;
  gridStart: string;
  gridEnd: string;
  today: string;
  prevMonth: string;
  nextMonth: string;
  timeZone: string;
  entries: CalendarEntry[];
};

export type ActivityItem = {
  id: string;
  eventType: ActivityEventType;
  verb: string;
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  actor: RequestPerson;
  createdAt: string;
};

// ── Settings ────────────────────────────────────────────────────────────────

export type HouseholdMember = {
  id: string;
  username: string;
  displayName: string | null;
  role: UserRole;
  autoApproveMovies: boolean;
  autoApproveTv: boolean;
  /** What this account may do (0.48+); all on for the admin. The admin
   * changes them with PATCH /users/{id} `permissions`. */
  permissions: Permissions;
  createdAt: string;
  isCurrentUser: boolean;
  /** Same as User.avatarUrl. */
  avatarUrl: string | null;
  linked: LinkedAccounts;
  hasPassword: boolean;
  /** Last time the account used the website or an app (to within a few
   * minutes); null when it never has. */
  lastActiveAt: string | null;
  /** Request limits (0.39+): at most `limit` of that type in any `days`
   * days; a null limit is none. Admins and trusted members aren't limited. */
  movieQuotaLimit: number | null;
  movieQuotaDays: number;
  tvQuotaLimit: number | null;
  tvQuotaDays: number;
};

export type ImportResult = { created: HouseholdMember[]; skipped: number };

export type UpdateUserResponse = { ok: true; user: HouseholdMember; tokensRevoked: boolean };

/** GET /users/{id}/profile (0.53+): a member's profile page — yours, or
 * anyone's for the admin. */
export type MemberProfile = {
  user: HouseholdMember;
  /** Requests made, declined ones left out. */
  requests: { total: number; movie: number; tv: number };
  /** Each null when that type isn't limited. */
  requestLimits: { movie: RequestQuota | null; tv: RequestQuota | null };
  /** Their Plex Watchlist, newest first (up to 20); null when they don't
   * sync one. */
  watchlist: TitleCard[] | null;
};

export type AvatarResponse = { ok: true; avatarUrl: string | null };

export type SyncedServer = { name: string | null; lastSyncedAt: string | null };

export type { ArrServerDto } from "@/lib/arr/servers";
import type { ArrServerDto } from "@/lib/arr/servers";

export type ArrSettings = {
  connected: boolean;
  baseUrl: string | null;
  hasApiKey: boolean;
  rootFolderPath: string | null;
  qualityProfileId: number | null;
  fullyConfigured: boolean;
};

export type IntegrationsSettings = {
  plex: { connected: boolean; servers: SyncedServer[]; movieCount: number; tvCount: number; totalBytes: number };
  jellyfin: {
    connected: boolean;
    /** 0.40+: "Jellyfin", or "Emby" when the connected server is Emby. */
    name: string;
    baseUrl: string | null;
    /** 0.53+: the address "Play on Jellyfin" opens, when set (else `baseUrl`). */
    publicUrl?: string | null;
    hasApiKey: boolean;
    servers: SyncedServer[];
    movieCount: number;
    tvCount: number;
    totalBytes: number;
  };
  sonarr: ArrSettings;
  radarr: ArrSettings;
  /** The optional 4K instances (0.37+). */
  sonarr4k: ArrSettings;
  radarr4k: ArrSettings;
  tmdb: { connected: boolean; savedInSettings: boolean; configuredFromEnv: boolean };
  trakt: { connected: boolean };
  tvdb: { connected: boolean };
  /** 0.53+: OMDb, for IMDb / Rotten Tomatoes / Metacritic ratings. */
  omdb?: { connected: boolean };
  discord: { connected: boolean };
  ntfy: { connected: boolean };
  /** No token is ever returned; chatId shows where messages go. */
  telegram: { connected: boolean; chatId: string | null };
  pushover: { connected: boolean };
  /** Everything but the SMTP password. */
  email: {
    connected: boolean;
    host: string | null;
    port: number | null;
    secure: boolean;
    username: string | null;
    from: string | null;
    to: string[];
  };
  /** 0.58+: Gotify (its server and priority, never the token), Slack and
   * Pushbullet (its channel tag, never the token). */
  gotify?: { connected: boolean; url: string | null; priority: number | null };
  slack?: { connected: boolean };
  pushbullet?: { connected: boolean; channelTag: string | null };
  genericWebhook: { connected: boolean };
  arrWebhooks: { secret: string; radarrUrl: string; sonarrUrl: string; radarr4kUrl: string; sonarr4kUrl: string };
  /** 0.43+: every Sonarr and Radarr server (the four above are the defaults). */
  arrServers: ArrServerDto[];
};

export type ArrOptions = {
  rootFolders: { id: number; path: string }[];
  qualityProfiles: { id: number; name: string }[];
};

export type ArrConnectionResult = ArrOptions & {
  ok: true;
  baseUrl: string;
  selectedRootFolder: string | null;
  selectedQualityProfileId: number | null;
};

export type PlexPinStart = { authUrl: string; pinId: number };

export type PlexPinStatus = { connected: boolean; movieCount: number | null; tvCount: number | null };

export type TraktImportResult = { ok: true; importedCount: number; skippedCount: number };

// Import from Seerr / Overseerr / Jellyseerr (0.51+): lib/import/seerr.
export type {
  SeerrImportChoices,
  SeerrImportJob,
  SeerrImportPreview,
  SeerrImportReport,
  SeerrImportWarning,
  SeerrServerInfo,
  SeerrUserPreview,
} from "@/lib/import/seerr/import";
export type SeerrTestResult = { ok: true; server: import("@/lib/import/seerr/import").SeerrServerInfo };

export type Job = import("@/lib/jobs/registry").JobDefinition;

export type AboutInfo = {
  version: string;
  movieCount: number;
  tvCount: number;
  trackedCount: number;
  totalRequests: number;
  timeZone: string;
  repoUrl: string;
  issuesUrl: string;
};

export type ChangelogEntry = { version: string; date: string; changes: string[] };

export type ErrorReferenceCategory = {
  title: string;
  entries: { message: string; meaning: string; whatToDo: string }[];
};

/** GET /settings/blocklist (0.41+). */
export type BlocklistEntry = {
  id: string;
  /** keyword: a TMDb keyword or genre; certification: a rating in a
   * country; adult: whatever TMDb marks adult (0.57+ for the last two). */
  kind: "title" | "keyword" | "certification" | "adult";
  /** A title: which one, and its name when blocked. */
  mediaType: MediaType | null;
  tmdbId: number | null;
  title: string | null;
  /** A TMDb keyword or genre, lower-case; for a certification, the rating
   * ("NC-17"). */
  keyword: string | null;
  /** A certification's country (ISO 3166-1, "US"). */
  region: string | null;
  reason: string | null;
  createdAt: string;
};

// ── API keys & widgets (0.47+) ──────────────────────────────────────────────

/** GET /settings/api-keys: one admin-issued key. The secret itself is never
 * returned after creation — only `hint`, its first few characters. */
export type ApiKey = {
  id: string;
  name: string;
  /** "read": reading only; "full": anything the account it acts as may do. */
  scope: "read" | "full";
  /** The member the key acts as, or null for the admin who created it. */
  actAs: RequestPerson | null;
  hint: string;
  createdAt: string;
  lastUsedAt: string | null;
  /** null: never expires. */
  expiresAt: string | null;
  expired: boolean;
};

/** POST /settings/api-keys: the new key's secret, shown this once. */
export type ApiKeyCreated = { key: string; apiKey: ApiKey };

/** GET /stats/summary: counts for dashboard widgets (Homepage, Homarr). */
export type StatsSummary = {
  /** Requests waiting for review (0 unless the account reviews requests). */
  pendingRequests: number;
  /** Open problem reports (0 unless the account reviews requests). */
  openIssues: number;
  /** Approved requests Sonarr/Radarr can't find (0 unless the account reviews requests). */
  cantFind: number;
  /** Movies and series in the household library. */
  movies: number;
  series: number;
  /** Titles Sonarr/Radarr are downloading right now. */
  downloading: number;
};

// ── Library page (0.51+) ─────────────────────────────────────────────────────

export type LibraryResolution = "4K" | "1080p" | "720p" | "SD";
export type LibrarySort = "recent" | "title" | "year" | "size" | "rating";

/** One title in the household library: a TitleCard plus what's known about
 * its file. `status` is never null here. */
export type LibraryEntry = TitleCard & {
  /** TheTVDB id (series), for clients that show it. */
  tvdbId: number | null;
  /** Where the row came from; a media server wins over Sonarr/Radarr for a
   * title both have (unless it's downloading). */
  source: LibraryProvider;
  sizeBytes: number | null;
  /** When the media server added it; null for a Sonarr/Radarr-only title. */
  addedAt: string | null;
  genres: string[];
  /** The file's tier; "SD" below 720p; null when nothing describes a file. */
  resolution: LibraryResolution | null;
  /** "HDR10", "HDR10+", "Dolby Vision"…; null for SDR or unknown. */
  hdr: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
  /** Radarr's quality profile name for the file ("Bluray-1080p"). */
  quality: string | null;
  filePath: string | null;
  /** Series: episode files on disk; null when unknown. */
  episodeCount: number | null;
  /** Radarr: the file is below the quality cutoff. */
  upgradeAvailable: boolean;
  /** Sonarr/Radarr and the media server report different paths. */
  possibleDuplicate: boolean;
  /** For the admin: Radarr/Sonarr has it (Search now, Stop/Start monitoring). Null otherwise. */
  arrTracking: ArrTracking | null;
};

export type LibrarySummary = {
  movies: number;
  series: number;
  /** Episode files on disk (Sonarr and Plex report them; Jellyfin doesn't). */
  episodes: number;
  totalBytes: number;
  /** Titles that aren't on disk yet: downloading, missing, coming soon. */
  tracked: number;
};

/** What the filter pickers offer: only values present in this library. */
export type LibraryFilters = {
  sources: LibraryProvider[];
  genres: string[];
  codecs: string[];
  years: number[];
  resolutions: LibraryResolution[];
  hasHdr: boolean;
};

export type LibraryPage = Paginated<LibraryEntry> & {
  pageSize: number;
  summary: LibrarySummary;
  filters: LibraryFilters;
  /** Plex, Jellyfin, Sonarr or Radarr is connected. False: the website's
   * "Connect an integration" empty state. */
  connected: boolean;
};

/** A franchise the library has part of. */
export type LibraryCollection = {
  key: string;
  title: string;
  /** The TMDb collection (movies); null for a hand-curated TV group. */
  collectionId: number | null;
  collectionFavorited: boolean | null;
  /** Every part, in release order, with the library status of each. */
  items: TitleCard[];
  missingCount: number;
  /** The admin's "Add all N missing" set; empty for members. */
  addAllMissing: { mediaType: MediaType; tmdbId: number }[];
  /** A member's "Request all N missing" set; empty for the admin. */
  requestAllMissing: { mediaType: MediaType; tmdbId: number }[];
  /** An owned part, for POST /titles/{type}/{id}/request-all-missing. */
  requestAllTarget: { mediaType: MediaType; tmdbId: number };
};

export type LibraryCopy = {
  source: LibraryProvider;
  /** The server's name in Settings. */
  server: string;
  filePath: string | null;
  sizeBytes: number | null;
  /** A media server's resolution or the arr's quality profile. */
  quality: string | null;
};

export type LibraryDuplicate = {
  mediaType: MediaType;
  tmdbId: number;
  name: string;
  posterPath: string | null;
  year: string | null;
  /** "paths": two or more different files; "servers": on more than one media server. */
  reason: "paths" | "servers";
  copies: LibraryCopy[];
};

export type LibraryStorageFolder = {
  path: string;
  freeBytes: number;
  /** The Sonarr/Radarr servers with this root folder. */
  servers: string[];
};

export type LibraryStorage = {
  folders: LibraryStorageFolder[];
  totalFreeBytes: number;
  /** When the figures were read; null when there's nothing. */
  measuredAt: string | null;
  /** True: read from the servers just now; false: the newest daily snapshot. */
  live: boolean;
  /** Null until two days of snapshots show free space shrinking. */
  forecast: { daysRemaining: number; bytesPerDay: number; fullOn: string } | null;
};
