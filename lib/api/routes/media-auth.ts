import { ApiError, apiJson } from "@/lib/api/errors";
import { invalid } from "@/lib/api/request";
import { normalizeDeviceName } from "@/lib/api/tokens";
import { issueApiToken } from "@/lib/api/token-store";
import { userDto } from "@/lib/api/users";
import { getLibraryOwnerUserId } from "@/lib/integrations/library-owner";
import { MAX_IMPORT_IDS } from "@/lib/auth/media-signin";
import type { MediaProvider } from "@/lib/auth/media-accounts";
import type { AuthResponse, PlexPollPending, PlexSignInStart } from "@/lib/api/types";
import type { users } from "@/lib/db/schema";

// Shared pieces of the Plex/Jellyfin endpoints under /api/v1/auth, /me/links
// and /users/import (lib/auth/media-signin.ts does the work).

/** The same answer as POST /auth/login: a new device token for `user`. */
export async function authResponseFor(user: typeof users.$inferSelect, deviceName: unknown): Promise<AuthResponse> {
  const [issued, libraryOwnerId] = await Promise.all([
    issueApiToken(user.id, normalizeDeviceName(deviceName)),
    getLibraryOwnerUserId(user.id),
  ]);
  return { token: issued.token, expiresAt: issued.expiresAt.toISOString(), user: userDto(user, libraryOwnerId) };
}

export function plexStartDto(start: { handle: string; authUrl: string; expiresAt: Date }): PlexSignInStart {
  return { handle: start.handle, authUrl: start.authUrl, expiresAt: start.expiresAt.toISOString() };
}

/** `202 { status: "pending" }` — plex.tv hasn't been approved yet. */
export function plexPending(): Response {
  const body: PlexPollPending = { status: "pending" };
  return apiJson(body, { status: 202 });
}

export function plexExpired(): ApiError {
  return ApiError.of("expired", "That Plex sign-in expired. Try again.");
}

/** A Plex poll's `handle`: required, and never longer than the 43-character
 * handles the server hands out (with room to spare). */
export function readHandle(body: Record<string, unknown>): string {
  const handle = body.handle;
  if (typeof handle !== "string" || !handle || handle.length > 128) throw invalid('"handle" is required.');
  return handle;
}

export function readJellyfinCredentials(body: Record<string, unknown>): { username: string; password: string } {
  const { username, password } = body;
  if (typeof username !== "string" || !username || typeof password !== "string" || !password) {
    throw invalid("Enter your Jellyfin username and password.");
  }
  return { username, password };
}

export function parseMediaProvider(value: string): MediaProvider {
  if (value === "plex" || value === "jellyfin") return value;
  throw ApiError.of("not_found", `Unknown provider "${value}".`);
}

export function readImportIds(body: Record<string, unknown>): string[] {
  const ids = body.ids;
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || !id || id.length > 64)) {
    throw invalid('"ids" must be a list of ids.');
  }
  if (ids.length > MAX_IMPORT_IDS) throw invalid(`Import at most ${MAX_IMPORT_IDS} people at a time.`);
  return ids as string[];
}
