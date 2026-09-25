// Maps loader/DB/TMDb shapes onto the /api/v1 DTOs in lib/api/types.ts. Kept
// free of database and TMDb client imports (types only) so the mapping rules
// stay cheap to reason about and test.
import type * as Dto from "@/lib/api/types";
import type { FileInfo, TitleLibraryStatus, ArrTrackingInfo } from "@/lib/integrations/status";
import type { HouseholdMember as HouseholdMemberRow } from "@/lib/users/household";
import { avatarPath } from "@/lib/users/avatar-path";
import type { LibraryStatus } from "@/components/status-badge";
import type { MediaType, RequestStatus } from "@/lib/db/schema";
import { resolutionTierOf } from "@/lib/quality";
import { myRequestBadge, reviewedRequestLabel } from "@/lib/requests/labels";

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
export function titleViewerState(input: {
  isAdmin: boolean;
  status: LibraryStatus;
  configured: boolean;
  favorited: boolean;
  requestStatus: RequestStatus | null;
  otherRequesters: string[];
  arrTracking: ArrTrackingInfo | null;
}): Dto.TitleViewerState {
  const untracked = input.status === "untracked";
  const alreadyRequested = input.requestStatus === "pending";
  return {
    isAdmin: input.isAdmin,
    favorited: input.favorited,
    requestStatus: input.requestStatus,
    alreadyRequested,
    otherRequesters: input.otherRequesters,
    canAdd: untracked && input.isAdmin && input.configured,
    needsArrSetup: untracked && input.isAdmin && !input.configured,
    canRequest: untracked && !input.isAdmin && !alreadyRequested,
    canRelink: input.isAdmin && !untracked,
    arrTracking: input.isAdmin && input.arrTracking ? { arrId: input.arrTracking.arrId, monitored: input.arrTracking.monitored } : null,
  };
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

export function reviewedRequest(row: {
  id: string;
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  status: RequestStatus;
  manuallyApproved: boolean;
  rejectionReason: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
  requestedByName: string | null;
  requestedByUsername: string;
}): Dto.ReviewedRequest {
  return {
    id: row.id,
    mediaType: row.mediaType,
    tmdbId: row.tmdbId,
    title: row.title,
    posterPath: row.posterPath,
    status: row.status,
    manuallyApproved: row.manuallyApproved,
    rejectionReason: row.rejectionReason,
    statusLabel: reviewedRequestLabel(row.status, row.manuallyApproved),
    requestedBy: requestPerson({ displayName: row.requestedByName, username: row.requestedByUsername }),
    createdAt: isoRequired(row.createdAt),
    reviewedAt: iso(row.reviewedAt),
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
  };
}

export function syncedServers(servers: { name: string | null; lastSyncedAt: Date | null }[]): Dto.SyncedServer[] {
  return servers.map((s) => ({ name: s.name, lastSyncedAt: iso(s.lastSyncedAt) }));
}
