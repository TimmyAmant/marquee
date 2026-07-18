import {
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
    username: text("username").notNull().unique(),
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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [check("users_role_check", sql`${table.role} in ('admin','member')`)],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const integrationProviderValues = ["sonarr", "radarr", "plex", "jellyfin"] as const;
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
      sql`${table.provider} in ('sonarr','radarr','plex','jellyfin')`,
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
    jellyfinServerId: uuid("jellyfin_server_id")
      .notNull()
      .references(() => jellyfinServers.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull(),
    mediaType: text("media_type").notNull().$type<MediaType>(),
    tmdbId: integer("tmdb_id"),
    tvdbId: integer("tvdb_id"),
    imdbId: text("imdb_id"),
    title: text("title"),
    addedAt: timestamp("added_at", { withTimezone: true }),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    filePath: text("file_path"),
  },
  (table) => [
    unique().on(table.jellyfinServerId, table.itemId),
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
    checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique().on(table.userId, table.provider, table.externalId)],
);

export const notificationEventTypeValues = [
  "grabbed",
  "downloaded",
  "request_approved",
  "request_rejected",
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
      sql`${table.eventType} in ('grabbed','downloaded','request_approved','request_rejected')`,
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
  },
  (table) => [
    index("requests_status_idx").on(table.status, table.createdAt),
    check(
      "requests_status_check",
      sql`${table.status} in ('pending','approved','rejected')`,
    ),
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
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
