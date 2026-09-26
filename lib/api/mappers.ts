// Maps loader/DB/TMDb shapes onto the /api/v1 DTOs in lib/api/types.ts. Kept
// free of database and TMDb client imports (types only) so the mapping rules
// stay cheap to reason about and test.
import type * as Dto from "@/lib/api/types";
import type { BlocklistEntry as BlocklistRow } from "@/lib/requests/blocklist";
import { ISSUE_KIND_LABELS, issueEpisodeLabel } from "@/lib/issues/labels";
import type { IssueRow } from "@/lib/issues";
import type { FileInfo, TitleLibraryStatus, ArrTrackingInfo } from "@/lib/integrations/status";
import type { HouseholdMember as HouseholdMemberRow } from "@/lib/users/household";
import { avatarPath } from "@/lib/users/avatar-path";
import type { LibraryStatus } from "@/components/status-badge";
import type { MediaType, RequestStatus } from "@/lib/db/schema";
import { resolutionTierOf } from "@/lib/quality";
import { myRequestBadge, reviewedRequestLabel, seasonsLabel } from "@/lib/requests/labels";
import type { NotFoundRow } from "@/lib/requests/not-found";
import { notFoundHint } from "@/lib/requests/not-found-rules";

export function iso(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function isoRequired(date: Date | string): string {
  return iso(date) ?? new Date(0).toISOString();
}

/** "YYYY-MM-DD" in the server's local time zone. */
export function localDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function yearOf(dateString: string | null | undefined): string | null {
  return (dateString || "").slice(0, 4) || null;
}

export function statusKey(mediaType: MediaType, tmdbId: number): string {
  return `${mediaType}:${tmdbId}`;
}

export function titleCard(
  base: { mediaType: MediaType; tmdbId: number; name: string; posterPath: string | null; year: string | null },
  extra: Partial<Omit<Dto.TitleCard, "mediaType" | "tmdbId" | "name" | "posterPath" | "year">> = {},
): Dto.TitleCard {
  return {
    mediaType: base.mediaType,
    tmdbId: base.tmdbId,
    name: base.name,
    posterPath: base.posterPath ?? null,
    year: base.year ?? null,
    subtitle: extra.subtitle ?? null,
    overview: extra.overview ?? null,
    rating: extra.rating ?? null,
    status: extra.status ?? null,
    favorited: extra.favorited ?? null,
    requested: extra.requested ?? null,
    canQuickAdd: extra.canQuickAdd ?? false,
    canRequest: extra.canRequest ?? false,
  };
}

export function fileDetails(file: FileInfo | null): Dto.FileDetails | null {
  if (!file) return null;
  return {
    path: file.path ?? null,
    sizeBytes: file.sizeBytes,
    quality: file.quality ?? null,
    resolutionTier: resolutionTierOf(file.quality, file.resolution),
    resolution: file.resolution ?? null,
    videoCodec: file.videoCodec ?? null,
    dynamicRange: file.dynamicRange ?? null,
    audioCodec: file.audioCodec ?? null,
    audioChannels: file.audioChannels ?? null,
    container: file.container ?? null,
    bitrateKbps: file.bitrateKbps ?? null,
    dateAdded: iso(file.dateAdded),
    releaseGroup: file.releaseGroup ?? null,
    edition: file.edition ?? null,
  };
}

export function libraryInfo(
  status: Pick<TitleLibraryStatus, "status" | "configured" | "file"> & Partial<Pick<TitleLibraryStatus, "provider">>,
): Dto.TitleLibraryInfo {
  return {
    status: status.status,
    provider: status.provider ?? null,
    configured: status.configured,
    file: fileDetails(status.file),
  };
}

/**
 * The title hero's action area, as components/add-to-library-button.tsx and
 * title-hero.tsx decide it for a signed-in viewer.
 */
/** The title page's 4K row (lib/arr/fourk.ts) for this viewer; null when
 * there's no 4K instance for the type. */
export function fourKViewerState(
  isAdmin: boolean,
  fourK: { configured: boolean; status: LibraryStatus; requestStatus: RequestStatus | null } | null,
): Dto.FourKViewerState | null {
  if (!fourK) return null;
  const free = fourK.configured && fourK.status === "untracked";
  return {
    status: fourK.status,
    requestStatus: fourK.requestStatus,
    canRequest: free && !isAdmin && fourK.requestStatus === null,
    canAdd: free && isAdmin,
  };
}

/** A problem can be reported once there's something to have a problem
 * with: a copy in the library, or one downloading. */
export function canReportProblem(status: LibraryStatus, fourKStatus: LibraryStatus | null): boolean {
  const has = (s: LibraryStatus | null) => s === "owned" || s === "tracked_downloading";
  return has(status) || has(fourKStatus);
}

function noFourKRequest(state: Dto.FourKViewerState | null): Dto.FourKViewerState | null {
  return state ? { ...state, canRequest: false } : null;
}

export function titleViewerState(input: {
  isAdmin: boolean;
  status: LibraryStatus;
  configured: boolean;
  favorited: boolean;
  requestStatus: RequestStatus | null;
  otherRequesters: string[];
  arrTracking: ArrTrackingInfo | null;
  /** From loadTitleStatus's seasonRequests; omitted for a movie. */
  seasonRequests?: { canRequestSeasons: boolean; requestedSeasons: number[] | null };
  /** From loadTitleStatus: null without a 4K instance for this type. */
  fourK?: { configured: boolean; status: LibraryStatus; requestStatus: RequestStatus | null } | null;
  /** The viewer's open problem reports for the title (loadTitleStatus). */
  openReports?: number;
  /** On the admin's blocklist (lib/requests/blocklist.ts). */
  blocked?: { reason: string | null; keyword: string | null } | null;
  /** Reviewers only (loadTitleStatus): listed under "Can't find" since. */
  notFoundSince?: Date | null;
}): Dto.TitleViewerState {
  const blocked = input.blocked ?? null;

  const untracked = input.status === "untracked";
  const alreadyRequested = input.requestStatus === "pending";
  return {
    isAdmin: input.isAdmin,
    favorited: input.favorited,
    requestStatus: input.requestStatus,
    alreadyRequested,
    otherRequesters: input.otherRequesters,
    // A title Sonarr/Radarr already has, unmonitored with nothing on disk,
    // reads as untracked — but it's "Start monitoring" (arrTracking) that
    // turns it back on; an Add next to it would do the same thing twice.
    canAdd: untracked && input.isAdmin && input.configured && !input.arrTracking,
    needsArrSetup: untracked && input.isAdmin && !input.configured,
    canRequest: untracked && !input.isAdmin && !alreadyRequested && !blocked,
    canRequestSeasons: !blocked && (input.seasonRequests?.canRequestSeasons ?? false),
    requestedSeasons: input.seasonRequests?.requestedSeasons ?? null,
    canRelink: input.isAdmin && !untracked,
    arrTracking: input.isAdmin && input.arrTracking ? { arrId: input.arrTracking.arrId, monitored: input.arrTracking.monitored } : null,
    fourK: blocked ? noFourKRequest(fourKViewerState(input.isAdmin, input.fourK ?? null)) : fourKViewerState(input.isAdmin, input.fourK ?? null),
    canReport: canReportProblem(input.status, input.fourK?.status ?? null),
    openReports: input.openReports ?? 0,
    blocked,
    notFoundSince: iso(input.notFoundSince ?? null),
  };
}

/** A request's seasons as every request DTO carries them. */
export function requestSeasons(seasons: number[] | null): { seasons: number[] | null; seasonsLabel: string | null } {
  return { seasons: seasons ?? null, seasonsLabel: seasonsLabel(seasons ?? null) };
}

export function requestPerson(input: {
  userId?: string | null;
  displayName: string | null;
  username: string;
}): Dto.RequestPerson {
  return {
    userId: input.userId ?? null,
    displayName: input.displayName,
    username: input.username,
    label: input.displayName || input.username,
  };
}

export function myRequest(row: {
  id: string;
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  seasons: number[] | null;
  is4k?: boolean;
  status: RequestStatus;
  manuallyApproved: boolean;
  rejectionReason: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
  libraryStatus: LibraryStatus | null;
}): Dto.MyRequest {
  const badge = myRequestBadge(row.status, row.libraryStatus, row.manuallyApproved);
  return {
    id: row.id,
    mediaType: row.mediaType,
    tmdbId: row.tmdbId,
    title: row.title,
    posterPath: row.posterPath,
    ...requestSeasons(row.seasons),
    is4k: row.is4k ?? false,
    status: row.status,
    manuallyApproved: row.manuallyApproved,
    rejectionReason: row.rejectionReason,
    libraryStatus: row.libraryStatus,
    statusLabel: badge.label,
    statusTone: badge.tone,
    createdAt: isoRequired(row.createdAt),
    reviewedAt: iso(row.reviewedAt),
  };
}

/** "Can't find" rows (GET /requests/not-found). */
export function notFoundRequest(row: NotFoundRow): Dto.NotFoundRequest {
  return {
    id: row.id,
    mediaType: row.mediaType,
    tmdbId: row.tmdbId,
    title: row.title,
    posterPath: row.posterPath,
    ...requestSeasons(row.seasons),
    is4k: row.is4k,
    requestedBy: requestPerson({
      userId: row.requestedByUserId,
      displayName: row.requestedByName,
      username: row.requestedByUsername,
    }),
    createdAt: isoRequired(row.createdAt),
    reviewedAt: iso(row.reviewedAt),
    notFoundSince: isoRequired(row.notFoundSince),
    server: row.server,
    arrUrl: row.arrUrl,
    hint: notFoundHint(row.mediaType),
  };
}

export function reviewedRequest(row: {
  id: string;
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  seasons: number[] | null;
  is4k?: boolean;
  status: RequestStatus;
  manuallyApproved: boolean;
  rejectionReason: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
  requestedByName: string | null;
  requestedByUsername: string;
  arrServerId?: string | null;
  arrServerName?: string | null;
  arrQualityProfileId?: number | null;
  arrRootFolderPath?: string | null;
  arrTags?: number[] | null;
  arrSeriesType?: string | null;
  notFoundSince?: Date | null;
}): Dto.ReviewedRequest {
  return {
    id: row.id,
    mediaType: row.mediaType,
    tmdbId: row.tmdbId,
    title: row.title,
    posterPath: row.posterPath,
    ...requestSeasons(row.seasons),
    is4k: row.is4k ?? false,
    status: row.status,
    manuallyApproved: row.manuallyApproved,
    rejectionReason: row.rejectionReason,
    statusLabel: reviewedRequestLabel(row.status, row.manuallyApproved),
    requestedBy: requestPerson({ displayName: row.requestedByName, username: row.requestedByUsername }),
    createdAt: isoRequired(row.createdAt),
    reviewedAt: iso(row.reviewedAt),
    addedTo: addedTo(row),
    notFoundSince: iso(row.notFoundSince ?? null),
  };
}

/** Where an approved request was added (0.43+): null unless it went through
 * Sonarr/Radarr since servers were recorded. */
export function addedTo(row: {
  status: RequestStatus;
  manuallyApproved: boolean;
  arrServerId?: string | null;
  arrServerName?: string | null;
  arrQualityProfileId?: number | null;
  arrRootFolderPath?: string | null;
  arrTags?: number[] | null;
  arrSeriesType?: string | null;
}): Dto.RequestAddedTo | null {
  if (row.status !== "approved" || row.manuallyApproved || !row.arrServerName) return null;
  return {
    serverId: row.arrServerId ?? null,
    serverName: row.arrServerName,
    qualityProfileId: row.arrQualityProfileId ?? null,
    rootFolderPath: row.arrRootFolderPath ?? null,
    tags: row.arrTags ?? null,
    seriesType: (row.arrSeriesType as Dto.RequestAddedTo["seriesType"]) ?? null,
  };
}

export function householdMember(row: HouseholdMemberRow, currentUserId: string): Dto.HouseholdMember {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    role: row.role,
    autoApproveMovies: row.autoApproveMovies,
    autoApproveTv: row.autoApproveTv,
    createdAt: isoRequired(row.createdAt),
    isCurrentUser: row.id === currentUserId,
    avatarUrl: avatarPath(row, "/api/v1"),
    linked: { plex: row.plexLinked, jellyfin: row.jellyfinLinked, sso: row.ssoLinked },
    hasPassword: row.hasPassword,
    lastActiveAt: iso(row.lastActiveAt),
    movieQuotaLimit: row.movieQuotaLimit,
    movieQuotaDays: row.movieQuotaDays,
    tvQuotaLimit: row.tvQuotaLimit,
    tvQuotaDays: row.tvQuotaDays,
  };
}

export function syncedServers(servers: { name: string | null; lastSyncedAt: Date | null }[]): Dto.SyncedServer[] {
  return servers.map((s) => ({ name: s.name, lastSyncedAt: iso(s.lastSyncedAt) }));
}

/** One notification as /notifications lists it and the live stream sends it. */
export function notificationItem(n: {
  id: string;
  mediaType: Dto.NotificationItem["mediaType"];
  tmdbId: number;
  title: string;
  eventType: Dto.NotificationItem["eventType"];
  message: string;
  read: boolean;
  alert?: boolean;
  createdAt: Date;
}): Dto.NotificationItem {
  return {
    id: n.id,
    mediaType: n.mediaType,
    tmdbId: n.tmdbId,
    title: n.title,
    eventType: n.eventType,
    message: n.message,
    read: n.read,
    alert: n.alert ?? true,
    createdAt: isoRequired(n.createdAt),
  };
}

export function issueDto(row: IssueRow, viewerUserId: string): Dto.Issue {
  return {
    id: row.id,
    mediaType: row.mediaType,
    tmdbId: row.tmdbId,
    title: row.title,
    posterPath: row.posterPath,
    seasonNumber: row.seasonNumber,
    episodeNumber: row.episodeNumber,
    episodeLabel: issueEpisodeLabel(row.seasonNumber, row.episodeNumber),
    kind: row.kind,
    kindLabel: ISSUE_KIND_LABELS[row.kind],
    message: row.message,
    status: row.status,
    resolution: row.resolution,
    reportedBy: requestPerson({
      userId: row.reportedByUserId,
      displayName: row.reportedByName,
      username: row.reportedByUsername,
    }),
    isMine: row.reportedByUserId === viewerUserId,
    createdAt: isoRequired(row.createdAt),
    resolvedAt: iso(row.resolvedAt),
  };
}

export function blocklistEntryDto(row: BlocklistRow): Dto.BlocklistEntry {
  return {
    id: row.id,
    kind: row.kind,
    mediaType: row.mediaType,
    tmdbId: row.tmdbId,
    title: row.title,
    keyword: row.keyword,
    reason: row.reason,
    createdAt: isoRequired(row.createdAt),
  };
}
