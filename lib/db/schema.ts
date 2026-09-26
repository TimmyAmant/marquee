import {
  foreignKey,
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  bigint,
  date,
  jsonb,
  boolean,
  primaryKey,
  unique,
  index,
  uniqueIndex,
  check,
  customType,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const userRoleValues = ["admin", "member"] as const;
export type UserRole = (typeof userRoleValues)[number];

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // The constraint keeps the name it had when this column was `email`
    // (migration 0012 renamed the column, not the constraint), so the
    // schema matches every existing database.
    username: text("username").notNull().unique("users_email_unique"),
    passwordHash: text("password_hash"),
    displayName: text("display_name"),
    // Shared secret embedded in this user's Sonarr/Radarr webhook URLs
    // (Settings > Integrations) — lazily generated the same way
    // integrationCredentials.plexClientId is, on first need.
    notificationWebhookSecret: text("notification_webhook_secret"),
    // Admins can approve/reject requests from other household members;
    // members can only request. The very first account created via /setup
    // is promoted to admin directly in the setup action.
    role: text("role").notNull().default("member").$type<UserRole>(),
    // Admin-set per member: skip the manual review queue and add straight to
    // Radarr/Sonarr on request, scoped separately per media type so e.g.
    // movies can be trusted while TV still gets reviewed.
    autoApproveMovies: boolean("auto_approve_movies").default(false).notNull(),
    autoApproveTv: boolean("auto_approve_tv").default(false).notNull(),
    // Browser sessions signed in before this moment are no longer valid —
    // see the jwt callback in auth.ts. Null until the password first changes.
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }),
    // When the profile photo (userAvatars) last changed, null when there's
    // none. Kept on the user row so every place that shows an account can
    // build a cache-busting photo URL without touching the image bytes.
    avatarUpdatedAt: timestamp("avatar_updated_at", { withTimezone: true }),
    /** Last time this account used Marquee — the website or an app — kept
     * to within a few minutes (lib/users/last-active.ts). Null: never, or
     * not since this was added. */
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
    // The Plex account (plex.tv numeric account id) and Jellyfin user (the
    // admin's Jellyfin server's user id) this account signs in with, if any
    // — see lib/auth/media-signin.ts. Set only by an explicit link, an admin
    // import, or a first media-server sign-in; never guessed from a
    // matching username or email.
    plexUserId: text("plex_user_id").unique("users_plex_user_id_unique"),
    jellyfinUserId: text("jellyfin_user_id").unique("users_jellyfin_user_id_unique"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [check("users_role_check", sql`${table.role} in ('admin','member')`)],
);

// Profile photos, kept in the database itself (so they live in the same
// volume as everything else and go wherever a backup goes) rather than
// uploaded anywhere. Only ever the server's own re-encoded copy: a square
// JPEG, a few tens of kilobytes, with the original's metadata stripped (see
// lib/users/avatar.ts). A table of its own so selecting users never drags
// the bytes along.
export const userAvatars = pgTable("user_avatars", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  image: bytea("image").notNull(),
  contentType: text("content_type").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

// sonarr4k / radarr4k: the optional second Sonarr and Radarr for 4K copies
// (lib/arr/fourk.ts) — requested "in 4K", kept apart from the main library.
export const integrationProviderValues = ["sonarr", "radarr", "plex", "jellyfin", "sonarr4k", "radarr4k"] as const;
export type IntegrationProvider = (typeof integrationProviderValues)[number];

export const integrationCredentials = pgTable(
  "integration_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().$type<IntegrationProvider>(),
    baseUrl: text("base_url"),
    apiKeyEnc: bytea("api_key_enc"),
    apiKeyIv: bytea("api_key_iv"),
    apiKeyTag: bytea("api_key_tag"),
    plexAuthTokenEnc: bytea("plex_auth_token_enc"),
    plexAuthTokenIv: bytea("plex_auth_token_iv"),
    plexAuthTokenTag: bytea("plex_auth_token_tag"),
    plexClientId: text("plex_client_id"),
    qualityProfileId: integer("quality_profile_id"),
    rootFolderPath: text("root_folder_path"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique().on(table.userId, table.provider),
    check(
      "integration_credentials_provider_check",
      sql`${table.provider} in ('sonarr','radarr','plex','jellyfin','sonarr4k','radarr4k')`,
    ),
  ],
);

export const mediaTypeValues = ["movie", "tv"] as const;
export type MediaType = (typeof mediaTypeValues)[number];

export const titles = pgTable(
  "titles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mediaType: text("media_type").notNull().$type<MediaType>(),
    tmdbId: integer("tmdb_id").notNull(),
    tvdbId: integer("tvdb_id"),
    imdbId: text("imdb_id"),
    name: text("name").notNull(),
    overview: text("overview"),
    posterPath: text("poster_path"),
    backdropPath: text("backdrop_path"),
    releaseDate: date("release_date"),
    firstAirDate: date("first_air_date"),
    status: text("status"),
    rawTmdb: jsonb("raw_tmdb"),
    rawTvdb: jsonb("raw_tvdb"),
    refreshedAt: timestamp("refreshed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique().on(table.mediaType, table.tmdbId),
    index("titles_tvdb_id_idx").on(table.tvdbId),
  ],
);

export const people = pgTable("people", {
  id: uuid("id").primaryKey().defaultRandom(),
  tmdbId: integer("tmdb_id").notNull().unique(),
  name: text("name").notNull(),
  alsoKnownAs: text("also_known_as").array(),
  biography: text("biography"),
  birthday: date("birthday"),
  deathday: date("deathday"),
  placeOfBirth: text("place_of_birth"),
  profilePath: text("profile_path"),
  rawTmdb: jsonb("raw_tmdb"),
  refreshedAt: timestamp("refreshed_at", { withTimezone: true }).defaultNow().notNull(),
});

export const companies = pgTable("companies", {
  id: uuid("id").primaryKey().defaultRandom(),
  tmdbId: integer("tmdb_id").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  logoPath: text("logo_path"),
  originCountry: text("origin_country"),
  parentCompanyTmdbId: integer("parent_company_tmdb_id"),
  rawTmdb: jsonb("raw_tmdb"),
  refreshedAt: timestamp("refreshed_at", { withTimezone: true }).defaultNow().notNull(),
});

export const credits = pgTable(
  "credits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    titleId: uuid("title_id")
      .notNull()
      .references(() => titles.id, { onDelete: "cascade" }),
    department: text("department").notNull(),
    characterName: text("character_name"),
    episodeCount: integer("episode_count"),
    order: integer("order"),
  },
  (table) => [
    unique().on(table.personId, table.titleId, table.department, table.characterName),
  ],
);

export const companyTitles = pgTable(
  "company_titles",
  {
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    titleId: uuid("title_id")
      .notNull()
      .references(() => titles.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.companyId, table.titleId] })],
);

export const plexServers = pgTable(
  "plex_servers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    machineIdentifier: text("machine_identifier").notNull(),
    name: text("name"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  },
  (table) => [unique().on(table.userId, table.machineIdentifier)],
);

export const plexLibraryItems = pgTable(
  "plex_library_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plexServerId: uuid("plex_server_id")
      .notNull()
      .references(() => plexServers.id, { onDelete: "cascade" }),
    ratingKey: text("rating_key").notNull(),
    mediaType: text("media_type").notNull().$type<MediaType>(),
    guid: text("guid"),
    tmdbId: integer("tmdb_id"),
    tvdbId: integer("tvdb_id"),
    imdbId: text("imdb_id"),
    title: text("title"),
    addedAt: timestamp("added_at", { withTimezone: true }),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    filePath: text("file_path"),
    // What Plex reports about the file itself, captured at sync time so the
    // File details card has something to show for a Plex-owned title that
    // Radarr/Sonarr isn't also tracking. Normalized by lib/media-info.ts into
    // Radarr's spelling (resolution "4K"/"1080p", videoCodec "HEVC",
    // dynamicRange "DV"/"HDR10"/"SDR") so lib/quality.ts's badge helpers work
    // on these the same way. All nullable: a listing entry can be missing any
    // of it, and dynamicRange in particular is only known when the sync got
    // the item's streams (see getMediaDetailsByRatingKeys).
    resolution: text("resolution"),
    videoCodec: text("video_codec"),
    dynamicRange: text("dynamic_range"),
    audioCodec: text("audio_codec"),
    audioChannels: integer("audio_channels"),
    container: text("container"),
    bitrateKbps: integer("bitrate_kbps"),
    viewCount: integer("view_count"),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
  },
  (table) => [
    unique().on(table.plexServerId, table.ratingKey),
    index("plex_items_tmdb_idx").on(table.tmdbId),
    index("plex_items_tvdb_idx").on(table.tvdbId),
  ],
);

// Jellyfin's equivalent of plexServers/plexLibraryItems — a second,
// independent media-server integration a household can connect alongside
// or instead of Plex. Unlike Plex (OAuth token, no admin-level API key
// concept), Jellyfin auths via a plain server URL + API key, stored in the
// generic integrationCredentials columns with provider: "jellyfin" — no
// Jellyfin-specific credential columns needed.
export const jellyfinServers = pgTable(
  "jellyfin_servers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    serverId: text("server_id").notNull(),
    name: text("name"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  },
  (table) => [unique().on(table.userId, table.serverId)],
);

export const jellyfinLibraryItems = pgTable(
  "jellyfin_library_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // The foreign key is declared below, to keep the short name the
    // migration that created it gave it.
    jellyfinServerId: uuid("jellyfin_server_id").notNull(),
    itemId: text("item_id").notNull(),
    mediaType: text("media_type").notNull().$type<MediaType>(),
    tmdbId: integer("tmdb_id"),
    tvdbId: integer("tvdb_id"),
    imdbId: text("imdb_id"),
    title: text("title"),
    addedAt: timestamp("added_at", { withTimezone: true }),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    filePath: text("file_path"),
    // Jellyfin's equivalent of the same columns on plexLibraryItems above —
    // read off MediaSources[0] and its MediaStreams, which the library sync
    // already asks for, so no extra request. Movie-only in practice: a Series
    // item carries no MediaSources at all.
    resolution: text("resolution"),
    videoCodec: text("video_codec"),
    dynamicRange: text("dynamic_range"),
    audioCodec: text("audio_codec"),
    audioChannels: integer("audio_channels"),
    container: text("container"),
    bitrateKbps: integer("bitrate_kbps"),
  },
  (table) => [
    unique().on(table.jellyfinServerId, table.itemId),
    foreignKey({
      name: "jellyfin_library_items_server_id_fk",
      columns: [table.jellyfinServerId],
      foreignColumns: [jellyfinServers.id],
    }).onDelete("cascade"),
    index("jellyfin_items_tmdb_idx").on(table.tmdbId),
    index("jellyfin_items_tvdb_idx").on(table.tvdbId),
  ],
);

export const favoriteEntityTypeValues = ["person", "company", "movie", "tv", "collection"] as const;
export type FavoriteEntityType = (typeof favoriteEntityTypeValues)[number];

export const favorites = pgTable(
  "favorites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull().$type<FavoriteEntityType>(),
    tmdbId: integer("tmdb_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique().on(table.userId, table.entityType, table.tmdbId),
    check(
      "favorites_entity_type_check",
      sql`${table.entityType} in ('person','company','movie','tv','collection')`,
    ),
  ],
);

export const arrProviderValues = ["sonarr", "radarr"] as const;
export type ArrProvider = (typeof arrProviderValues)[number];

/** A Sonarr or Radarr connection: the main one, or its 4K counterpart. */
export const arrInstanceValues = ["sonarr", "radarr", "sonarr4k", "radarr4k"] as const;
export type ArrInstance = (typeof arrInstanceValues)[number];

export const arrStatusCache = pgTable(
  "arr_status_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().$type<ArrProvider>(),
    externalId: integer("external_id").notNull(),
    arrId: integer("arr_id"),
    status: text("status"),
    monitored: boolean("monitored"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    filePath: text("file_path"),
    // Radarr-only for now — Sonarr's per-episode cutoff needs episode-file
    // expansion, a bigger lift scoped out of this pass.
    qualityCutoffNotMet: boolean("quality_cutoff_not_met"),
    // Radarr's quality profile name for the file on disk (e.g.
    // "Bluray-1080p", "WEBDL-2160p") — resolution is derived from this
    // string on read rather than stored separately. Radarr-only for now,
    // same reasoning as qualityCutoffNotMet above: Sonarr has no per-series
    // file quality without a per-episode expansion.
    qualityName: text("quality_name"),
    // Radarr-only, same gap as qualityName above — both ride along on the
    // same /movie response already fetched, no extra Radarr calls needed.
    dynamicRange: text("dynamic_range"),
    audioCodec: text("audio_codec"),
    checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique().on(table.userId, table.provider, table.externalId)],
);

export const notificationEventTypeValues = [
  "grabbed",
  "downloaded",
  "request_approved",
  "request_rejected",
  // Problem reports (lib/issues): to the admin when one comes in, and to
  // whoever reported it once it's fixed.
  "issue_reported",
  "issue_resolved",
] as const;
export type NotificationEventType = (typeof notificationEventTypeValues)[number];

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mediaType: text("media_type").notNull().$type<MediaType>(),
    tmdbId: integer("tmdb_id").notNull(),
    title: text("title").notNull(),
    eventType: text("event_type").notNull().$type<NotificationEventType>(),
    message: text("message").notNull(),
    read: boolean("read").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("notifications_user_read_created_idx").on(table.userId, table.read, table.createdAt),
    check(
      "notifications_event_type_check",
      sql`${table.eventType} in ('grabbed','downloaded','request_approved','request_rejected','issue_reported','issue_resolved')`,
    ),
  ],
);

export const requestStatusValues = ["pending", "approved", "rejected"] as const;
export type RequestStatus = (typeof requestStatusValues)[number];

export const requests = pgTable(
  "requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mediaType: text("media_type").notNull().$type<MediaType>(),
    tmdbId: integer("tmdb_id").notNull(),
    title: text("title").notNull(),
    posterPath: text("poster_path"),
    status: text("status").notNull().default("pending").$type<RequestStatus>(),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    // True when the admin approved this without Sonarr/Radarr actually
    // adding it (e.g. Sonarr couldn't resolve a TVDB id) — the admin is
    // handling the download outside Marquee entirely. Still status=
    // "approved" so it behaves like any other approved request everywhere
    // else; this only changes the label shown to the requester and admin.
    manuallyApproved: boolean("manually_approved").notNull().default(false),
    // Why the admin declined it: one of the presets in
    // lib/requests/rejection-reasons.ts or their own words, shown to the
    // requester on their Requests page and in the notification. Null for
    // requests declined before this existed, or through an older API client
    // that sends no reason.
    rejectionReason: text("rejection_reason"),
    // The TV seasons asked for, sorted and without repeats (see
    // lib/requests/seasons.ts). Null means the whole series: every movie,
    // every request made before per-season requests existed, and any from
    // a client that doesn't send seasons.
    seasons: integer("seasons").array(),
    // Asked for in 4K: approving adds it to the 4K Sonarr/Radarr instead of
    // the main one. A 4K request and a regular one for the same title are
    // separate requests.
    is4k: boolean("is_4k").notNull().default(false),
  },
  (table) => [
    index("requests_status_idx").on(table.status, table.createdAt),
    index("requests_requested_by_idx").on(table.requestedByUserId),
    check(
      "requests_status_check",
      sql`${table.status} in ('pending','approved','rejected')`,
    ),
    // Blocks a double-click/dual-tab submit from inserting two pending
    // requests for the same title — createRequestAction's pre-insert check
    // can't fully guard against this on its own since it's read-then-write.
    uniqueIndex("requests_pending_unique_idx")
      .on(table.requestedByUserId, table.mediaType, table.tmdbId, table.is4k)
      .where(sql`${table.status} = 'pending'`),
  ],
);

export const activityEventTypeValues = [
  "request_created",
  "request_approved",
  "request_rejected",
  "request_manually_approved",
] as const;
export type ActivityEventType = (typeof activityEventTypeValues)[number];

// A household-wide "who did what" feed, distinct from `notifications` (which
// is per-recipient bell content, e.g. the requester being told their request
// was approved). This instead records the *actor* — who requested, who
// reviewed — so an admin can see the household's request activity at a
// glance without reconstructing it from the requests table's reviewedAt/
// reviewedByUserId columns.
export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull().$type<ActivityEventType>(),
    mediaType: text("media_type").notNull().$type<MediaType>(),
    tmdbId: integer("tmdb_id").notNull(),
    title: text("title").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("activity_events_created_idx").on(table.createdAt),
    check(
      "activity_events_event_type_check",
      sql`${table.eventType} in ('request_created','request_approved','request_rejected','request_manually_approved')`,
    ),
  ],
);

// Every Plex/Jellyfin/Sonarr/Radarr sync re-derives a title's tmdbId fresh
// from that source's own external-id data on every run and overwrites it
// unconditionally — so a one-time "Fix ID" correction (see relinkTitleAction)
// would otherwise get silently reverted by the very next sync, since the
// source (e.g. Plex's own mismatched guid) never actually changes. Every
// sync consults this table right after resolving a tmdbId from its own
// source, substituting the corrected id when an override exists, so the fix
// survives every future sync instead of just the current page load.
export const tmdbIdOverrides = pgTable(
  "tmdb_id_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mediaType: text("media_type").notNull().$type<MediaType>(),
    wrongTmdbId: integer("wrong_tmdb_id").notNull(),
    correctTmdbId: integer("correct_tmdb_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique().on(table.userId, table.mediaType, table.wrongTmdbId)],
);

// Daily free-space snapshots per Radarr/Sonarr root folder, so a storage
// forecast ("full in ~40 days") has history to extrapolate from — the live
// getDiskSpaceSummary() call only ever has the current instant, nothing to
// trend against.
export const diskSpaceSnapshots = pgTable(
  "disk_space_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    freeBytes: bigint("free_bytes", { mode: "number" }).notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("disk_space_snapshots_user_captured_idx").on(table.userId, table.capturedAt)],
);

// Instance-wide settings (not per-user) — TMDb metadata is shared across
// everyone on this Marquee instance via the titles/people/companies cache,
// so unlike Sonarr/Radarr/Plex there's exactly one TMDb credential, not one
// per account. Always exactly zero or one row.
export const appSettings = pgTable("app_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  tmdbAccessTokenEnc: bytea("tmdb_access_token_enc"),
  tmdbAccessTokenIv: bytea("tmdb_access_token_iv"),
  tmdbAccessTokenTag: bytea("tmdb_access_token_tag"),
  // Trakt's API client id — not a secret in the way an OAuth token is (it's
  // a public per-app identifier, safe to log/see in network requests), but
  // stored encrypted anyway for consistency with the TMDb token above and
  // because it still shouldn't leak to non-admins.
  traktClientIdEnc: bytea("trakt_client_id_enc"),
  traktClientIdIv: bytea("trakt_client_id_iv"),
  traktClientIdTag: bytea("trakt_client_id_tag"),
  // TheTVDB's v4 API key — used as a poster/overview/genre fallback for TV
  // shows when TMDb's own data is thin, since Sonarr's own metadata is
  // sourced from TVDB and users comparing the two notice the gap.
  tvdbApiKeyEnc: bytea("tvdb_api_key_enc"),
  tvdbApiKeyIv: bytea("tvdb_api_key_iv"),
  tvdbApiKeyTag: bytea("tvdb_api_key_tag"),
  // A Discord incoming-webhook URL is a bearer credential in itself (anyone
  // with it can post to the channel) — encrypted at rest like everything
  // else here, even though it's pushed to, not pulled from.
  discordWebhookUrlEnc: bytea("discord_webhook_url_enc"),
  discordWebhookUrlIv: bytea("discord_webhook_url_iv"),
  discordWebhookUrlTag: bytea("discord_webhook_url_tag"),
  // A generic outgoing webhook — same event stream as Discord/ntfy, posted
  // as plain JSON to whatever URL the admin points it at (their own
  // automation, a self-hosted notification gateway, etc.).
  genericWebhookUrlEnc: bytea("generic_webhook_url_enc"),
  genericWebhookUrlIv: bytea("generic_webhook_url_iv"),
  genericWebhookUrlTag: bytea("generic_webhook_url_tag"),
  // A full ntfy topic URL (e.g. https://ntfy.sh/my-topic, or a self-hosted
  // server's own URL) — treated as a bearer credential like the Discord
  // webhook above, since ntfy topics are unauthenticated by default and
  // whoever has the URL can publish to it.
  ntfyUrlEnc: bytea("ntfy_url_enc"),
  ntfyUrlIv: bytea("ntfy_url_iv"),
  ntfyUrlTag: bytea("ntfy_url_tag"),
  // "New accounts from Plex/Jellyfin sign-in": whether someone who may use
  // the admin's Plex/Jellyfin server but has no Marquee account yet gets a
  // member account on their first sign-in, or is told to ask the admin.
  mediaServerSignup: boolean("media_server_signup").default(false).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// The server's own VAPID key pair for Web Push (lib/push/web-push.ts):
// generated on first use and never shared with anyone. Browsers receive the
// public half when they subscribe; the private half signs every push, and
// is encrypted at rest like the credentials above. Exactly zero or one row.
export const pushKeys = pgTable(
  "push_keys",
  {
    id: integer("id").primaryKey().default(1),
    publicKey: text("public_key").notNull(),
    privateKeyEnc: bytea("private_key_enc").notNull(),
    privateKeyIv: bytea("private_key_iv").notNull(),
    privateKeyTag: bytea("private_key_tag").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [check("push_keys_singleton", sql`${table.id} = 1`)],
);

// One row per browser that turned on notifications (the website's service
// worker). The endpoint is the browser vendor's push address for that
// browser; p256dh and auth are the browser's keys, which encrypt every
// payload end to end, so the vendor's relay can't read it. Unique by
// endpoint: a browser someone else signs in on moves to their account.
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    /** "Chrome on macOS" and the like, for Settings' device list. */
    label: text("label"),
    /** The site's own address when the browser subscribed: the VAPID contact
     * ("sub") the push services ask for. */
    origin: text("origin"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  },
  (table) => [index("push_subscriptions_user_idx").on(table.userId)],
);

// Bearer tokens for native clients (the macOS app) calling /api/v1 — the web
// UI keeps using Auth.js JWT cookies. Only a SHA-256 hash of each token is
// stored, never the token itself. `expires_at` slides forward on use (at most
// once an hour, see lib/api/tokens.ts) so a device in regular use stays
// signed in, while an abandoned one expires 90 days after it was last used.
// Cascades with the user; changing or resetting a password deletes every
// token that user holds (see revokeAllApiTokensForUser).
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("api_tokens_user_id_idx").on(table.userId)],
);

/** A member's opt-in to "request what's on my Plex Watchlist". Plex only
 * lets an account read its own watchlist, so this holds that member's own
 * plex.tv token (encrypted like the integration tokens) — given for this and
 * nothing else, and deleted when they turn it off or unlink Plex. A null
 * token means it was switched off by Plex rejecting the token; lastError
 * then says so. */
export const plexWatchlists = pgTable("plex_watchlists", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** The plex.tv account the token belongs to — the account linked when it
   * was turned on. */
  plexUserId: text("plex_user_id").notNull(),
  authTokenEnc: bytea("auth_token_enc"),
  authTokenIv: bytea("auth_token_iv"),
  authTokenTag: bytea("auth_token_tag"),
  clientId: text("client_id").notNull(),
  syncMovies: boolean("sync_movies").default(true).notNull(),
  syncTv: boolean("sync_tv").default(true).notNull(),
  /** plex.tv's ETag for the last watchlist fully handled: an unchanged list
   * answers 304 and costs nothing. */
  etag: text("etag"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const plexWatchlistOutcomeValues = ["requested", "skipped"] as const;
export type PlexWatchlistOutcome = (typeof plexWatchlistOutcomeValues)[number];

/** Every watchlist title already handled for a member, so each is tried
 * once: a request the admin declined isn't filed again every sync, and a
 * title that was owned or already requested isn't re-checked forever. Kept
 * when the watchlist is turned off, so turning it back on doesn't bring
 * declined titles back. */
export const plexWatchlistItems = pgTable(
  "plex_watchlist_items",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mediaType: text("media_type").notNull().$type<MediaType>(),
    tmdbId: integer("tmdb_id").notNull(),
    outcome: text("outcome").notNull().$type<PlexWatchlistOutcome>(),
    requestId: uuid("request_id").references(() => requests.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.mediaType, table.tmdbId] }),
    check("plex_watchlist_items_outcome_check", sql`${table.outcome} in ('requested','skipped')`),
  ],
);

export const notificationChannelKindValues = ["telegram", "pushover", "email"] as const;
export type NotificationChannelKind = (typeof notificationChannelKindValues)[number];

/** Telegram, Pushover and email: household-wide relays like Discord and
 * ntfy (every notification the admin gets goes to each one that's set up).
 * Each keeps its settings as one encrypted JSON document, since each has
 * several fields and most of them are secrets (a bot token, an app token,
 * an SMTP password) — lib/notifications/channels.ts. */
export const notificationChannels = pgTable(
  "notification_channels",
  {
    kind: text("kind").primaryKey().$type<NotificationChannelKind>(),
    configEnc: bytea("config_enc").notNull(),
    configIv: bytea("config_iv").notNull(),
    configTag: bytea("config_tag").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [check("notification_channels_kind_check", sql`${table.kind} in ('telegram','pushover','email')`)],
);

export const issueKindValues = ["video", "audio", "subtitles", "wont_play", "wrong_title", "other"] as const;
export type IssueKind = (typeof issueKindValues)[number];

export const issueStatusValues = ["open", "resolved"] as const;
export type IssueStatus = (typeof issueStatusValues)[number];

/** "Report a problem" on a title someone has: bad video or audio, missing
 * subtitles, won't play, the wrong movie… The admin sees them on the
 * Requests page, can search again in Sonarr/Radarr, and marks them fixed
 * (lib/issues). */
export const issues = pgTable(
  "issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportedByUserId: uuid("reported_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mediaType: text("media_type").notNull().$type<MediaType>(),
    tmdbId: integer("tmdb_id").notNull(),
    title: text("title").notNull(),
    posterPath: text("poster_path"),
    /** TV: which season and episode, when it's about one. */
    seasonNumber: integer("season_number"),
    episodeNumber: integer("episode_number"),
    kind: text("kind").notNull().$type<IssueKind>(),
    message: text("message"),
    status: text("status").notNull().default("open").$type<IssueStatus>(),
    /** What the admin said when marking it fixed, shown to the reporter. */
    resolution: text("resolution"),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("issues_status_created_idx").on(table.status, table.createdAt),
    index("issues_reported_by_idx").on(table.reportedByUserId),
    check("issues_status_check", sql`${table.status} in ('open','resolved')`),
    check(
      "issues_kind_check",
      sql`${table.kind} in ('video','audio','subtitles','wont_play','wrong_title','other')`,
    ),
  ],
);
