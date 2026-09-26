import { and, asc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db/client";
import { apiKeys, users } from "@/lib/db/schema";
import type { ApiKeyScope } from "@/lib/db/schema";
import type { ApiKey as ApiKeyDto, ApiKeyCreated } from "@/lib/api/types";
import { requestPerson } from "@/lib/api/mappers";
import type { AuthenticatedToken } from "@/lib/api/token-store";
import { fail, type CoreResult } from "@/lib/core-result";
import {
  apiKeyExpiresAt,
  apiKeyHint,
  generateApiKey,
  hashApiKey,
  hashesMatch,
  isApiKeyExpired,
  shouldTouchApiKey,
  type ApiKeyInput,
} from "@/lib/api/api-keys";

// Admin-issued API keys (Settings › Integrations › API keys). Shared by the
// website's server actions and /api/v1/settings/api-keys; callers check that
// the caller is the admin (and is not itself using a key).

const actAsUsers = alias(users, "act_as_users");

function toDto(
  row: {
    id: string;
    name: string;
    scope: ApiKeyScope;
    hint: string;
    createdAt: Date;
    lastUsedAt: Date | null;
    expiresAt: Date | null;
    actAsUserId: string | null;
    actAsUsername: string | null;
    actAsDisplayName: string | null;
  },
  now: Date,
): ApiKeyDto {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    actAs:
      row.actAsUserId && row.actAsUsername
        ? requestPerson({ userId: row.actAsUserId, username: row.actAsUsername, displayName: row.actAsDisplayName })
        : null,
    hint: row.hint,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    expired: isApiKeyExpired(row.expiresAt, now),
  };
}

function listQuery() {
  return db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      scope: apiKeys.scope,
      hint: apiKeys.hint,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
      expiresAt: apiKeys.expiresAt,
      actAsUserId: apiKeys.actAsUserId,
      actAsUsername: actAsUsers.username,
      actAsDisplayName: actAsUsers.displayName,
    })
    .from(apiKeys)
    .leftJoin(actAsUsers, eq(actAsUsers.id, apiKeys.actAsUserId))
    .$dynamic();
}

/** Every key, oldest first. */
export async function listApiKeys(now = new Date()): Promise<ApiKeyDto[]> {
  const rows = await listQuery().orderBy(asc(apiKeys.createdAt), asc(apiKeys.id));
  return rows.map((row) => toDto(row, now));
}

/** Creates a key for the admin `createdByUserId`. The secret is returned
 * exactly once, here — only its hash is stored. */
export async function createApiKey(
  createdByUserId: string,
  input: ApiKeyInput,
  now = new Date(),
): Promise<CoreResult<ApiKeyCreated>> {
  // Acting as yourself is the same as not acting as anyone.
  const actAsUserId = input.actAsUserId === createdByUserId ? null : input.actAsUserId;
  if (actAsUserId) {
    const [member] = await db.select({ id: users.id }).from(users).where(eq(users.id, actAsUserId)).limit(1);
    if (!member) return fail("not_found", "That household member doesn't exist any more.");
  }

  const key = generateApiKey();
  const [row] = await db
    .insert(apiKeys)
    .values({
      name: input.name,
      keyHash: hashApiKey(key),
      hint: apiKeyHint(key),
      scope: input.scope,
      createdByUserId,
      actAsUserId,
      createdAt: now,
      expiresAt: apiKeyExpiresAt(input.expiresInDays, now),
    })
    .returning({ id: apiKeys.id });

  const [created] = await listQuery().where(eq(apiKeys.id, row.id)).limit(1);
  return { ok: true, key, apiKey: toDto(created, now) };
}

/** Revokes (deletes) a key; false when there was no such key. */
export async function revokeApiKey(id: string): Promise<boolean> {
  const deleted = await db.delete(apiKeys).where(eq(apiKeys.id, id)).returning({ id: apiKeys.id });
  return deleted.length > 0;
}

export type AuthenticatedApiKey = {
  keyId: string;
  keyName: string;
  scope: ApiKeyScope;
  user: AuthenticatedToken["user"];
};

/**
 * Resolves a raw key to the account it acts as (its member, else the admin
 * who made it), or null when it's unknown, revoked or expired. The user row
 * — and so the role — is read fresh every time. Notes the use at most once
 * a minute. Deliberately doesn't count as the member being "active".
 */
export async function authenticateApiKey(key: string, now = new Date()): Promise<AuthenticatedApiKey | null> {
  const keyHash = hashApiKey(key);
  const [row] = await db
    .select({
      keyId: apiKeys.id,
      keyName: apiKeys.name,
      keyHash: apiKeys.keyHash,
      scope: apiKeys.scope,
      lastUsedAt: apiKeys.lastUsedAt,
      expiresAt: apiKeys.expiresAt,
      userId: users.id,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
      autoApproveMovies: users.autoApproveMovies,
      autoApproveTv: users.autoApproveTv,
      permissions: users.permissions,
      avatarUpdatedAt: users.avatarUpdatedAt,
      createdAt: users.createdAt,
      language: users.language,
    })
    .from(apiKeys)
    .innerJoin(users, sql`${users.id} = coalesce(${apiKeys.actAsUserId}, ${apiKeys.createdByUserId})`)
    .where(eq(apiKeys.keyHash, keyHash))
    .limit(1);

  if (!row || !hashesMatch(row.keyHash, keyHash)) return null;
  if (isApiKeyExpired(row.expiresAt, now)) return null;

  if (shouldTouchApiKey(row.lastUsedAt, now)) {
    await db
      .update(apiKeys)
      .set({ lastUsedAt: now })
      .where(and(eq(apiKeys.id, row.keyId)))
      .catch((err) => {
        // Bookkeeping only: never fail the request over it.
        console.error("[api-keys] failed to record last use:", err instanceof Error ? err.message : err);
      });
  }

  return {
    keyId: row.keyId,
    keyName: row.keyName,
    scope: row.scope,
    user: {
      id: row.userId,
      username: row.username,
      displayName: row.displayName,
      role: row.role,
      autoApproveMovies: row.autoApproveMovies,
      autoApproveTv: row.autoApproveTv,
      permissions: row.permissions,
      avatarUpdatedAt: row.avatarUpdatedAt,
      createdAt: row.createdAt,
      language: row.language,
    },
  };
}
