// Response DTOs for /api/v1 — the stable, documented shapes native clients
// decode (see docs/api-v1.md). Conventions: camelCase keys, ISO-8601 UTC
// timestamps with milliseconds, "YYYY-MM-DD" calendar dates, and nullable
// fields always present as null (never omitted).

export type MediaType = "movie" | "tv";
export type UserRole = "admin" | "member";
export type RequestStatus = "pending" | "approved" | "rejected";
export type LibraryStatus = "owned" | "tracked_downloading" | "tracked_monitored" | "coming_soon" | "untracked";
export type LibraryProvider = "plex" | "jellyfin" | "sonarr" | "radarr";
export type FavoriteEntityType = "person" | "company" | "movie" | "tv" | "collection";
export type NotificationEventType = "grabbed" | "downloaded" | "request_approved" | "request_rejected";
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
};

export type User = {
  id: string;
  username: string;
  displayName: string | null;
  role: UserRole;
  libraryOwnerId: string;
};

export type Me = User & {
  autoApproveMovies: boolean;
  autoApproveTv: boolean;
  createdAt: string;
};

export type AuthResponse = { token: string; expiresAt: string; user: User };

export type Badges = { unreadNotifications: number; pendingRequests: number };

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
};

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
  canRelink: boolean;
  arrTracking: ArrTracking | null;
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
  status: RequestStatus;
  manuallyApproved: boolean;
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
  requestedBy: RequestPerson;
  createdAt: string;
};

export type PendingRequestsResponse = ListResponse<PendingRequest> & { sonarrUrl: string | null };

export type ReviewedRequest = {
  id: string;
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  status: RequestStatus;
  manuallyApproved: boolean;
  statusLabel: string;
  requestedBy: RequestPerson;
  createdAt: string;
  reviewedAt: string | null;
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
};

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
};

export type UpdateUserResponse = { ok: true; user: HouseholdMember; tokensRevoked: boolean };

export type SyncedServer = { name: string | null; lastSyncedAt: string | null };

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
    baseUrl: string | null;
    hasApiKey: boolean;
    servers: SyncedServer[];
    movieCount: number;
    tvCount: number;
    totalBytes: number;
  };
  sonarr: ArrSettings;
  radarr: ArrSettings;
  tmdb: { connected: boolean; savedInSettings: boolean; configuredFromEnv: boolean };
  trakt: { connected: boolean };
  tvdb: { connected: boolean };
  discord: { connected: boolean };
  ntfy: { connected: boolean };
  genericWebhook: { connected: boolean };
  arrWebhooks: { secret: string; radarrUrl: string; sonarrUrl: string };
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
