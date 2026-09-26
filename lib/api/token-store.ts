import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { apiTokens, users } from "@/lib/db/schema";
import type { UserRole } from "@/lib/db/schema";
import { recordActivity } from "@/lib/users/last-active";
import {
  computeExpiresAt,
  generateApiToken,
  hashApiToken,
  isTokenExpired,
  shouldSlideExpiry,
} from "@/lib/api/tokens";

export type IssuedApiToken = { token: string; tokenId: string; expiresAt: Date };

/** Creates a new token for a device. The raw token is returned exactly once,
 * here — only its hash is persisted. */
export async function issueApiToken(userId: string, deviceName: string): Promise<IssuedApiToken> {
  const token = generateApiToken();
  const now = new Date();
  const expiresAt = computeExpiresAt(now);
  const [row] = await db
    .insert(apiTokens)
    .values({
      userId,
      name: deviceName,
      tokenHash: hashApiToken(token),
      createdAt: now,
      lastUsedAt: now,
      expiresAt,
    })
    .returning({ id: apiTokens.id });
  return { token, tokenId: row.id, expiresAt };
}

export type AuthenticatedToken = {
  tokenId: string;
  tokenName: string;
  expiresAt: Date;
  user: {
    id: string;
    username: string;
    displayName: string | null;
    role: UserRole;
    autoApproveMovies: boolean;
    autoApproveTv: boolean;
    avatarUpdatedAt: Date | null;
    createdAt: Date;
  };
};

/**
 * Resolves a raw bearer token to its user, or null if it's unknown, expired or
 * revoked. The user row (and so the role) is joined fresh on every call —
 * never cached on the token. Slides expiry forward at most once an hour.
 */
export async function authenticateApiToken(token: string): Promise<AuthenticatedToken | null> {
  const [row] = await db
    .select({
      tokenId: apiTokens.id,
      tokenName: apiTokens.name,
      lastUsedAt: apiTokens.lastUsedAt,
      expiresAt: apiTokens.expiresAt,
      userId: users.id,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
      autoApproveMovies: users.autoApproveMovies,
      autoApproveTv: users.autoApproveTv,
      avatarUpdatedAt: users.avatarUpdatedAt,
      createdAt: users.createdAt,
      lastActiveAt: users.lastActiveAt,
    })
    .from(apiTokens)
    .innerJoin(users, eq(users.id, apiTokens.userId))
    .where(eq(apiTokens.tokenHash, hashApiToken(token)))
    .limit(1);

  if (!row) return null;

  const now = new Date();
  if (isTokenExpired(row.expiresAt, now)) {
    await db.delete(apiTokens).where(eq(apiTokens.id, row.tokenId)).catch(() => undefined);
    return null;
  }

  recordActivity(row.userId, row.lastActiveAt, now);

  let expiresAt = row.expiresAt;
  if (shouldSlideExpiry(row.lastUsedAt, now)) {
    expiresAt = computeExpiresAt(now);
    await db
      .update(apiTokens)
      .set({ lastUsedAt: now, expiresAt })
      .where(eq(apiTokens.id, row.tokenId))
      .catch((err) => {
        // A failed bookkeeping write shouldn't fail the request itself.
        console.error("[api-tokens] failed to slide expiry:", err);
      });
  }

  return {
    tokenId: row.tokenId,
    tokenName: row.tokenName,
    expiresAt,
    user: {
      id: row.userId,
      username: row.username,
      displayName: row.displayName,
      role: row.role,
      autoApproveMovies: row.autoApproveMovies,
      autoApproveTv: row.autoApproveTv,
      avatarUpdatedAt: row.avatarUpdatedAt,
      createdAt: row.createdAt,
    },
  };
}

export async function revokeApiToken(tokenId: string, userId: string): Promise<void> {
  await db.delete(apiTokens).where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId)));
}

/** Signs every native client out of an account — called whenever that
 * account's password is changed or reset. */
export async function revokeAllApiTokensForUser(userId: string): Promise<void> {
  await db.delete(apiTokens).where(eq(apiTokens.userId, userId));
}
