// Response DTOs for /api/v1 — the stable, documented shapes native clients
// decode (see docs/api-v1.md). Conventions: camelCase keys, ISO-8601 UTC
// timestamps with milliseconds, "YYYY-MM-DD" calendar dates, and nullable
// fields always present as null (never omitted).

import type { DiscoverList, DiscoverShelfKey, SeeAllTarget } from "@/lib/discover/lists";

export type { DiscoverList, SeeAllTarget };

export type MediaType = "movie" | "tv";
/** trusted (0.39+): may review requests and problem reports. */
export type UserRole = "admin" | "member" | "trusted";
export type RequestStatus = "pending" | "approved" | "rejected";
export type LibraryStatus = "owned" | "tracked_downloading" | "tracked_monitored" | "coming_soon" | "untracked";
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
  /** 0.45+: a household member shared a title with you (`sharedBy`, `note`). */
  | "title_shared";
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

export type User = {
  id: string;
  username: string;
  displayName: string | null;
  role: UserRole;
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
};

/** GET /discover/lists/{list}: a Discover shelf's full list, paged. */
export type DiscoverListResults = Paginated<TitleCard> & { list: DiscoverList; title: string };

export type BrowseExtras = {
  genres: Genre[];
  network: NetworkCard | null;
  becauseYouWatched: { title: string; items: TitleCard[] } | null;
};

export type SurprisePick = { mediaType: MediaType; tmdbId: number };

export type SearchResults = {
  query: string;
  people: PersonCard[];
  studios: CompanyCard[];
  titles: TitleCard[];
  theme: { label: string; items: TitleCard[] } | null;
};

export type SearchSuggestion = {
  id: number;
  mediaType: "person" | "movie" | "tv";
  name: string;
  posterPath: string | null;
  subtitle: string | null;
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
  };
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

// ── People & companies ──────────────────────────────────────────────────────

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
  credits: TitleCard[];
};

export type CompanyDetail = {
  tmdbId: number;
  name: string;
  description: string | null;
  logoPath: string | null;
  titleCount: number;
  favorited: boolean;
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
  createdAt: string;
  /** 0.45+: title_shared — who shared it; null for every other kind (and
   * once that account is removed). Missing on older servers. */
  sharedBy: ShareableUser | null;
  /** 0.45+: title_shared — the sharer's note, plain text; else null. */
  note: string | null;
};

/** 0.45+: a household member as the share picker shows them
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

export type Job = { id: string; name: string; schedule: string; description: string };

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
  kind: "title" | "keyword";
  /** A title: which one, and its name when blocked. */
  mediaType: MediaType | null;
  tmdbId: number | null;
  title: string | null;
  /** A TMDb keyword or genre, lower-case. */
  keyword: string | null;
  reason: string | null;
  createdAt: string;
};
