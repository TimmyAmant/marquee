// What Seerr (and Overseerr / Jellyseerr before it) answers on the parts of
// its API the import reads — only the fields used here. Field names follow
// seerr-api.yml and the entities in server/entity of the seerr-team/seerr
// repository; every value is treated as untrusted input (mapping.ts).

/** server/constants/user.ts UserType. */
export const SEERR_USER_TYPE = { plex: 1, local: 2, jellyfin: 3, emby: 4 } as const;

export type SeerrUser = {
  id: number;
  /** Hidden from non-admins; present for the admin key this uses. */
  email?: string | null;
  username?: string | null;
  plexUsername?: string | null;
  jellyfinUsername?: string | null;
  /** The name Seerr shows: username, else the media-server name, else email. */
  displayName?: string | null;
  userType?: number;
  plexId?: number | null;
  jellyfinUserId?: string | null;
  /** The bitmask of server/lib/permissions.ts. */
  permissions?: number;
  avatar?: string | null;
  createdAt?: string;
  movieQuotaLimit?: number | null;
  movieQuotaDays?: number | null;
  tvQuotaLimit?: number | null;
  tvQuotaDays?: number | null;
};

/** GET /user/{id}/quota: the limits in force, the user's own or the
 * global defaults. `limit` 0 or missing: none. */
export type SeerrQuota = {
  movie?: { days?: number; limit?: number } | null;
  tv?: { days?: number; limit?: number } | null;
};

/** server/constants/media.ts MediaRequestStatus. */
export const SEERR_REQUEST_STATUS = { pending: 1, approved: 2, declined: 3, failed: 4, completed: 5 } as const;

export type SeerrMedia = {
  id: number;
  mediaType?: "movie" | "tv" | string;
  tmdbId?: number;
  tvdbId?: number | null;
  status?: number;
  status4k?: number;
};

export type SeerrRequest = {
  id: number;
  status: number;
  type?: "movie" | "tv" | string;
  media?: SeerrMedia | null;
  requestedBy?: SeerrUser | null;
  modifiedBy?: SeerrUser | null;
  createdAt?: string;
  updatedAt?: string;
  is4k?: boolean;
  serverId?: number | null;
  profileId?: number | null;
  rootFolder?: string | null;
  tags?: number[] | null;
  seasons?: { seasonNumber: number; status?: number }[] | null;
};

/** server/constants/issue.ts. */
export const SEERR_ISSUE_TYPE = { video: 1, audio: 2, subtitles: 3, other: 4 } as const;
export const SEERR_ISSUE_STATUS = { open: 1, resolved: 2 } as const;

export type SeerrIssueComment = {
  id: number;
  user?: SeerrUser | null;
  message?: string | null;
  createdAt?: string;
};

export type SeerrIssue = {
  id: number;
  issueType?: number;
  status?: number;
  problemSeason?: number | null;
  problemEpisode?: number | null;
  media?: SeerrMedia | null;
  createdBy?: SeerrUser | null;
  modifiedBy?: SeerrUser | null;
  comments?: SeerrIssueComment[] | null;
  createdAt?: string;
  updatedAt?: string;
};

export type SeerrBlocklistItem = {
  id: number;
  mediaType?: "movie" | "tv" | string;
  tmdbId?: number;
  title?: string | null;
  createdAt?: string;
  user?: SeerrUser | null;
};

/** GET /settings/radarr and /settings/sonarr: how Seerr reaches each
 * server, so its requests' `serverId` can be matched to a Marquee server
 * at the same address. The API key is ignored. */
export type SeerrArrServer = {
  id: number;
  name?: string;
  hostname?: string;
  port?: number;
  useSsl?: boolean;
  baseUrl?: string | null;
  is4k?: boolean;
  isDefault?: boolean;
  activeProfileId?: number;
  activeDirectory?: string;
};

export type SeerrPage<T> = {
  pageInfo?: { pages?: number; pageSize?: number; results?: number; page?: number };
  results?: T[];
};
