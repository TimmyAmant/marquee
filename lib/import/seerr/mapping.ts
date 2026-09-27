import type { IssueKind, MediaType, RequestStatus } from "@/lib/db/schema";
import { normalizePermissions, TRUSTED_PRESET, type Permission } from "@/lib/users/permissions";
import { sanitizeUsername } from "@/lib/auth/media-accounts";
import {
  SEERR_ISSUE_STATUS,
  SEERR_ISSUE_TYPE,
  SEERR_REQUEST_STATUS,
  SEERR_USER_TYPE,
  type SeerrArrServer,
  type SeerrIssue,
  type SeerrQuota,
  type SeerrRequest,
  type SeerrUser,
} from "@/lib/import/seerr/types";

// How Seerr's data becomes Marquee's — pure, so every rule here is unit
// tested (mapping.test.ts) and documented in docs/migrating-from-seerr.md.
// Nothing here touches the database or the network.

// ── Addresses ───────────────────────────────────────────────────────────

/** What someone typed for their Seerr, made canonical: no trailing slash,
 * and without a pasted "/api/v1". Empty when it isn't an http(s) URL. */
export function normalizeSeerrUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "").replace(/\/api\/v1$/i, "").replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(trimmed)) return "";
  return trimmed;
}

/** The key that tells one Seerr from another in import_links: its host
 * and port, lower-case ("seerr.local:5055"). */
export function seerrInstanceKey(baseUrl: string): string {
  const url = new URL(baseUrl);
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  return `${url.hostname.toLowerCase()}:${port}`;
}

// ── Permissions ─────────────────────────────────────────────────────────

/** server/lib/permissions.ts in the seerr-team/seerr repository. */
export const SEERR_PERMISSION = {
  ADMIN: 2,
  MANAGE_SETTINGS: 4,
  MANAGE_USERS: 8,
  MANAGE_REQUESTS: 16,
  REQUEST: 32,
  VOTE: 64,
  AUTO_APPROVE: 128,
  AUTO_APPROVE_MOVIE: 256,
  AUTO_APPROVE_TV: 512,
  REQUEST_4K: 1024,
  REQUEST_4K_MOVIE: 2048,
  REQUEST_4K_TV: 4096,
  REQUEST_ADVANCED: 8192,
  REQUEST_VIEW: 16384,
  AUTO_APPROVE_4K: 32768,
  AUTO_APPROVE_4K_MOVIE: 65536,
  AUTO_APPROVE_4K_TV: 131072,
  REQUEST_MOVIE: 262144,
  REQUEST_TV: 524288,
  MANAGE_ISSUES: 1048576,
  VIEW_ISSUES: 2097152,
  CREATE_ISSUES: 4194304,
  AUTO_REQUEST: 8388608,
  AUTO_REQUEST_MOVIE: 16777216,
  AUTO_REQUEST_TV: 33554432,
  RECENT_VIEW: 67108864,
  WATCHLIST_VIEW: 134217728,
  MANAGE_BLOCKLIST: 268435456,
  VIEW_BLOCKLIST: 1073741824,
} as const;

type SeerrPermissionName = keyof typeof SEERR_PERMISSION;

/** Each Seerr bit and the Marquee switches it turns on. A bit missing here
 * has no Marquee equivalent (listed in SEERR_PERMISSIONS_WITHOUT_EQUIVALENT
 * so the report can say so). */
const PERMISSION_MAP: Partial<Record<SeerrPermissionName, readonly Permission[]>> = {
  REQUEST: ["requestMovies", "requestTv"],
  REQUEST_MOVIE: ["requestMovies"],
  REQUEST_TV: ["requestTv"],
  REQUEST_4K: ["request4kMovies", "request4kTv"],
  REQUEST_4K_MOVIE: ["request4kMovies"],
  REQUEST_4K_TV: ["request4kTv"],
  AUTO_APPROVE: ["autoApproveMovies", "autoApproveTv"],
  AUTO_APPROVE_MOVIE: ["autoApproveMovies"],
  AUTO_APPROVE_TV: ["autoApproveTv"],
  AUTO_APPROVE_4K: ["autoApprove4kMovies", "autoApprove4kTv"],
  AUTO_APPROVE_4K_MOVIE: ["autoApprove4kMovies"],
  AUTO_APPROVE_4K_TV: ["autoApprove4kTv"],
  REQUEST_ADVANCED: ["advancedRequests"],
  REQUEST_VIEW: ["viewRequests"],
  MANAGE_REQUESTS: ["reviewRequests", "viewRequests"],
  MANAGE_ISSUES: ["manageIssues"],
  CREATE_ISSUES: ["reportIssues"],
  MANAGE_BLOCKLIST: ["manageBlocklist"],
};

/** Seerr permissions nothing in Marquee corresponds to. MANAGE_SETTINGS and
 * MANAGE_USERS are the admin's alone in Marquee; the rest are about things
 * Marquee shows everyone (recently added, the watchlist, the blocklist and
 * issue lists) or doesn't have (voting, auto-requesting the watchlist). */
export const SEERR_PERMISSIONS_WITHOUT_EQUIVALENT: readonly SeerrPermissionName[] = [
  "MANAGE_SETTINGS",
  "MANAGE_USERS",
  "VOTE",
  "VIEW_ISSUES",
  "VIEW_BLOCKLIST",
  "AUTO_REQUEST",
  "AUTO_REQUEST_MOVIE",
  "AUTO_REQUEST_TV",
  "RECENT_VIEW",
  "WATCHLIST_VIEW",
];

export function hasSeerrPermission(mask: number, bit: number): boolean {
  return (mask & bit) !== 0;
}

export function isSeerrAdmin(user: Pick<SeerrUser, "permissions">): boolean {
  return hasSeerrPermission(user.permissions ?? 0, SEERR_PERMISSION.ADMIN);
}

/**
 * Seerr's bitmask → Marquee's switches. ADMIN in Seerr means everything, so
 * it becomes the Trusted preset — the most a non-admin can have; Marquee
 * never gets a second admin from an import (the caller maps Seerr's owner
 * to the Marquee admin instead). `dropped`: the Seerr permissions the
 * account had that have no equivalent, for the report.
 */
export function mapSeerrPermissions(mask: number): { permissions: Permission[]; dropped: SeerrPermissionName[] } {
  if (hasSeerrPermission(mask, SEERR_PERMISSION.ADMIN)) return { permissions: [...TRUSTED_PRESET], dropped: [] };
  const granted = new Set<Permission>();
  for (const [name, bit] of Object.entries(SEERR_PERMISSION) as [SeerrPermissionName, number][]) {
    if (!hasSeerrPermission(mask, bit)) continue;
    for (const permission of PERMISSION_MAP[name] ?? []) granted.add(permission);
  }
  const dropped = SEERR_PERMISSIONS_WITHOUT_EQUIVALENT.filter((name) => hasSeerrPermission(mask, SEERR_PERMISSION[name]));
  return { permissions: normalizePermissions(granted), dropped };
}

// ── Request limits ──────────────────────────────────────────────────────

export type QuotaFields = {
  movieQuotaLimit: number | null;
  movieQuotaDays: number;
  tvQuotaLimit: number | null;
  tvQuotaDays: number;
};

const DEFAULT_QUOTA_DAYS = 7;

function positiveInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * The limits in force for a Seerr account (GET /user/{id}/quota: the
 * user's own, else the global defaults), as Marquee's columns. A Seerr
 * limit of 0 or none is "no limit"; days default to 7 when a limit has
 * none. Without the quota endpoint's answer, the user's own fields alone.
 */
export function mapSeerrQuota(quota: SeerrQuota | null, user: SeerrUser): QuotaFields {
  const movieLimit = positiveInt(quota?.movie?.limit) ?? (quota ? null : positiveInt(user.movieQuotaLimit));
  const tvLimit = positiveInt(quota?.tv?.limit) ?? (quota ? null : positiveInt(user.tvQuotaLimit));
  return {
    movieQuotaLimit: movieLimit,
    movieQuotaDays: movieLimit ? (positiveInt(quota?.movie?.days) ?? positiveInt(user.movieQuotaDays) ?? DEFAULT_QUOTA_DAYS) : DEFAULT_QUOTA_DAYS,
    tvQuotaLimit: tvLimit,
    tvQuotaDays: tvLimit ? (positiveInt(quota?.tv?.days) ?? positiveInt(user.tvQuotaDays) ?? DEFAULT_QUOTA_DAYS) : DEFAULT_QUOTA_DAYS,
  };
}

// ── Accounts ────────────────────────────────────────────────────────────

export type SeerrAccountKind = "plex" | "jellyfin" | "local";

/** Plex, Jellyfin/Emby (both speak Jellyfin's API and link the same way),
 * or a local account. */
export function seerrAccountKind(user: Pick<SeerrUser, "userType" | "plexId" | "jellyfinUserId">): SeerrAccountKind {
  if (user.userType === SEERR_USER_TYPE.plex || (user.userType === undefined && user.plexId)) return "plex";
  if (user.userType === SEERR_USER_TYPE.jellyfin || user.userType === SEERR_USER_TYPE.emby) return "jellyfin";
  return "local";
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** The name a Seerr account is shown as: Seerr's own displayName, else its
 * username, media-server name or email. */
export function seerrDisplayName(user: SeerrUser): string {
  return text(user.displayName) || text(user.username) || text(user.plexUsername) || text(user.jellyfinUsername) || text(user.email) || `Seerr user ${user.id}`;
}

/** A Marquee username for a new account: their Seerr username, else their
 * Plex/Jellyfin name, else the email's local part — made to fit Marquee's
 * rules (the caller makes it unique). */
export function seerrUsernameFor(user: SeerrUser): string {
  const email = text(user.email);
  const local = email.includes("@") ? email.slice(0, email.indexOf("@")) : email;
  return sanitizeUsername(text(user.username) || text(user.plexUsername) || text(user.jellyfinUsername) || local || "user");
}

/** The columns an existing Marquee account is matched on. */
export type MatchableUser = {
  id: string;
  username: string;
  role: string;
  plexUserId: string | null;
  jellyfinUserId: string | null;
};

export type UserMatch = { user: MatchableUser; by: "plex" | "jellyfin" | "email" | "username" };

/**
 * The Marquee account a Seerr account is: the one linked to the same Plex
 * account or Jellyfin user, else the one whose username is the Seerr
 * account's email or username (each compared case-insensitively). Never
 * guessed from a display name. Pure.
 */
export function matchSeerrUser(user: SeerrUser, candidates: readonly MatchableUser[]): UserMatch | null {
  const plexId = user.plexId != null ? String(user.plexId) : null;
  const jellyfinId = text(user.jellyfinUserId) || null;
  if (plexId) {
    const hit = candidates.find((c) => c.plexUserId === plexId);
    if (hit) return { user: hit, by: "plex" };
  }
  if (jellyfinId) {
    const hit = candidates.find((c) => c.jellyfinUserId && c.jellyfinUserId.toLowerCase() === jellyfinId.toLowerCase());
    if (hit) return { user: hit, by: "jellyfin" };
  }
  const email = text(user.email).toLowerCase();
  if (email) {
    const hit = candidates.find((c) => c.username.toLowerCase() === email);
    if (hit) return { user: hit, by: "email" };
  }
  const names = [user.username, user.plexUsername, user.jellyfinUsername].map((n) => text(n).toLowerCase()).filter(Boolean);
  for (const name of names) {
    const hit = candidates.find((c) => c.username.toLowerCase() === name);
    if (hit) return { user: hit, by: "username" };
  }
  return null;
}

// ── Requests ────────────────────────────────────────────────────────────

/** Seerr's request status → Marquee's. Failed and completed ones were
 * approved (a reviewer said yes); null for a value Seerr doesn't define. */
export function mapSeerrRequestStatus(status: number): RequestStatus | null {
  switch (status) {
    case SEERR_REQUEST_STATUS.pending:
      return "pending";
    case SEERR_REQUEST_STATUS.approved:
    case SEERR_REQUEST_STATUS.failed:
    case SEERR_REQUEST_STATUS.completed:
      return "approved";
    case SEERR_REQUEST_STATUS.declined:
      return "rejected";
    default:
      return null;
  }
}

export function mapSeerrMediaType(value: unknown): MediaType | null {
  return value === "movie" || value === "tv" ? value : null;
}

/** The seasons a Seerr TV request asked for, sorted and without repeats;
 * null for a movie or a request with none listed (the whole series). */
export function mapSeerrSeasons(request: Pick<SeerrRequest, "type" | "media" | "seasons">): number[] | null {
  const mediaType = mapSeerrMediaType(request.type ?? request.media?.mediaType);
  if (mediaType !== "tv") return null;
  const numbers = (request.seasons ?? [])
    .map((s) => s?.seasonNumber)
    .filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0);
  if (numbers.length === 0) return null;
  return [...new Set(numbers)].sort((a, b) => a - b);
}

export function parseSeerrDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export type MappedRequest = {
  mediaType: MediaType;
  tmdbId: number;
  status: RequestStatus;
  is4k: boolean;
  seasons: number[] | null;
  createdAt: Date;
  /** For an approved or declined one: when Seerr last touched it. */
  reviewedAt: Date | null;
  serverId: number | null;
  profileId: number | null;
  rootFolder: string | null;
  tags: number[] | null;
};

/** A Seerr request as Marquee's columns, or why it can't be one. */
export function mapSeerrRequest(request: SeerrRequest, now = new Date()): { ok: true; request: MappedRequest } | { ok: false; reason: "no_media" | "unknown_status" } {
  const mediaType = mapSeerrMediaType(request.type ?? request.media?.mediaType);
  const tmdbId = request.media?.tmdbId;
  if (!mediaType || typeof tmdbId !== "number" || !Number.isInteger(tmdbId) || tmdbId <= 0) return { ok: false, reason: "no_media" };
  const status = mapSeerrRequestStatus(request.status);
  if (!status) return { ok: false, reason: "unknown_status" };
  const createdAt = parseSeerrDate(request.createdAt) ?? now;
  const tags = Array.isArray(request.tags) ? request.tags.filter((t): t is number => Number.isInteger(t)) : null;
  return {
    ok: true,
    request: {
      mediaType,
      tmdbId,
      status,
      is4k: request.is4k === true,
      seasons: mapSeerrSeasons(request),
      createdAt,
      reviewedAt: status === "pending" ? null : (parseSeerrDate(request.updatedAt) ?? createdAt),
      serverId: typeof request.serverId === "number" ? request.serverId : null,
      profileId: typeof request.profileId === "number" ? request.profileId : null,
      rootFolder: text(request.rootFolder) || null,
      tags,
    },
  };
}

// ── Sonarr / Radarr servers ─────────────────────────────────────────────

/** How Seerr reaches a server, as one URL: scheme, host, port and base
 * path (lower-case, no trailing slash). */
export function seerrArrServerUrl(server: SeerrArrServer): string | null {
  const host = text(server.hostname);
  if (!host) return null;
  const scheme = server.useSsl ? "https" : "http";
  const port = typeof server.port === "number" && server.port > 0 ? server.port : server.useSsl ? 443 : 80;
  const base = text(server.baseUrl).replace(/\/+$/, "");
  const path = base ? (base.startsWith("/") ? base : `/${base}`) : "";
  return normalizeArrUrl(`${scheme}://${host}:${port}${path}`);
}

/** Two spellings of the same server address compare equal: lower-case,
 * default ports spelled out, no trailing slash. */
export function normalizeArrUrl(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const port = url.port || (url.protocol === "https:" ? "443" : "80");
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.protocol}//${url.hostname.toLowerCase()}:${port}${path}`;
  } catch {
    return null;
  }
}

export type MatchableArrServer = { id: string; name: string; baseUrl: string; kind: "sonarr" | "radarr"; is4k: boolean };

/** The Marquee server at the same address as a Seerr one, of the same
 * kind; null when there's none. */
export function matchArrServer(
  seerr: SeerrArrServer,
  kind: "sonarr" | "radarr",
  candidates: readonly MatchableArrServer[],
): MatchableArrServer | null {
  const wanted = seerrArrServerUrl(seerr);
  if (!wanted) return null;
  return candidates.find((c) => c.kind === kind && normalizeArrUrl(c.baseUrl) === wanted) ?? null;
}

// ── Problem reports ─────────────────────────────────────────────────────

export function mapSeerrIssueKind(type: unknown): IssueKind {
  switch (type) {
    case SEERR_ISSUE_TYPE.video:
      return "video";
    case SEERR_ISSUE_TYPE.audio:
      return "audio";
    case SEERR_ISSUE_TYPE.subtitles:
      return "subtitles";
    default:
      return "other";
  }
}

export type MappedIssue = {
  mediaType: MediaType;
  tmdbId: number;
  kind: IssueKind;
  seasonNumber: number | null;
  episodeNumber: number | null;
  status: "open" | "resolved";
  /** The report itself: Seerr keeps it as the reporter's first comment. */
  message: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  /** The rest of the thread, oldest first, each with the Seerr user id of
   * whoever wrote it (null when Seerr no longer knows). */
  comments: { id: number; authorSeerrId: number | null; body: string; createdAt: Date }[];
};

/**
 * A Seerr issue as Marquee's problem report plus its comments. Seerr
 * stores the description as the reporter's first comment, so that one
 * becomes the report's message rather than a comment. Season/episode 0
 * mean "all".
 */
export function mapSeerrIssue(issue: SeerrIssue, now = new Date()): { ok: true; issue: MappedIssue } | { ok: false; reason: "no_media" } {
  const mediaType = mapSeerrMediaType(issue.media?.mediaType);
  const tmdbId = issue.media?.tmdbId;
  if (!mediaType || typeof tmdbId !== "number" || !Number.isInteger(tmdbId) || tmdbId <= 0) return { ok: false, reason: "no_media" };
  const createdAt = parseSeerrDate(issue.createdAt) ?? now;
  const reporterId = issue.createdBy?.id ?? null;
  const thread = [...(issue.comments ?? [])]
    .filter((c) => c && typeof c.id === "number" && text(c.message))
    .map((c) => ({ id: c.id, authorSeerrId: c.user?.id ?? null, body: text(c.message), createdAt: parseSeerrDate(c.createdAt) ?? createdAt }))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id);
  let message: string | null = null;
  if (thread.length > 0 && (reporterId === null || thread[0].authorSeerrId === reporterId)) {
    message = thread.shift()!.body;
  }
  const status = issue.status === SEERR_ISSUE_STATUS.resolved ? "resolved" : "open";
  const season = typeof issue.problemSeason === "number" && issue.problemSeason > 0 ? issue.problemSeason : null;
  return {
    ok: true,
    issue: {
      mediaType,
      tmdbId,
      kind: mapSeerrIssueKind(issue.issueType),
      seasonNumber: mediaType === "tv" ? season : null,
      episodeNumber: mediaType === "tv" && season && typeof issue.problemEpisode === "number" && issue.problemEpisode > 0 ? issue.problemEpisode : null,
      status,
      message,
      createdAt,
      resolvedAt: status === "resolved" ? (parseSeerrDate(issue.updatedAt) ?? createdAt) : null,
      comments: thread,
    },
  };
}

// ── Blocklist ───────────────────────────────────────────────────────────

export function mapSeerrBlocklistItem(item: { mediaType?: unknown; tmdbId?: unknown; title?: unknown }): { mediaType: MediaType; tmdbId: number; title: string | null } | null {
  const mediaType = mapSeerrMediaType(item.mediaType);
  const tmdbId = item.tmdbId;
  if (!mediaType || typeof tmdbId !== "number" || !Number.isInteger(tmdbId) || tmdbId <= 0) return null;
  return { mediaType, tmdbId, title: text(item.title).slice(0, 200) || null };
}
