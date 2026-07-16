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

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  displayName: text("display_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const integrationProviderValues = ["sonarr", "radarr", "plex"] as const;
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
    check("integration_credentials_provider_check", sql`${table.provider} in ('sonarr','radarr','plex')`),
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
  },
  (table) => [
    unique().on(table.plexServerId, table.ratingKey),
    index("plex_items_tmdb_idx").on(table.tmdbId),
    index("plex_items_tvdb_idx").on(table.tvdbId),
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
    checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique().on(table.userId, table.provider, table.externalId)],
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
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
