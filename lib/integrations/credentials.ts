import { randomUUID, randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { integrationCredentials, users } from "@/lib/db/schema";
import type { ArrInstance, IntegrationProvider } from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto/encryption";
import { getDefaultArrServer } from "@/lib/arr/servers";
import { arrKindOf, isFourK } from "@/lib/arr/instances";

export type ArrCredential = {
  baseUrl: string;
  apiKey: string;
  qualityProfileId: number | null;
  rootFolderPath: string | null;
};

export type ConfiguredArrCredential = ArrCredential & {
  qualityProfileId: number;
  rootFolderPath: string;
};

/** A credential row exists as soon as a base URL/API key are saved, but
 * add/quick-add actions also require a quality profile and root folder to be
 * picked in Settings — check both, not just that a row exists, so the UI
 * doesn't offer an "Add" button that's guaranteed to fail server-side. */
export function isArrFullyConfigured(
  credential: ArrCredential | null,
): credential is ConfiguredArrCredential {
  return Boolean(credential?.qualityProfileId && credential?.rootFolderPath);
}

/** The default Sonarr/Radarr server of this kind (the 4K one for
 * sonarr4k/radarr4k) in the shape the one-server-per-provider code used —
 * what "is Sonarr set up", the old settings endpoints and the pre-0.43
 * callers still ask. Anything that should consider every server uses
 * lib/arr/servers.ts instead. */
export async function getArrCredential(
  userId: string,
  provider: ArrInstance,
): Promise<ArrCredential | null> {
  const server = await getDefaultArrServer(userId, arrKindOf(provider), isFourK(provider));
  if (!server) return null;
  return {
    baseUrl: server.baseUrl,
    apiKey: server.apiKey,
    qualityProfileId: server.qualityProfileId,
    rootFolderPath: server.rootFolderPath,
  };
}

/** Whether the user still has this integration saved — cheap enough for a
 * long sync to re-check as it goes, so a disconnect partway through stops
 * it instead of letting it write the just-deleted data back. */
export async function hasIntegrationCredential(userId: string, provider: IntegrationProvider): Promise<boolean> {
  const [row] = await db
    .select({ id: integrationCredentials.id })
    .from(integrationCredentials)
    .where(and(eq(integrationCredentials.userId, userId), eq(integrationCredentials.provider, provider)))
    .limit(1);
  return Boolean(row);
}

/** Thrown by a sync that found its integration disconnected mid-run. */
export class IntegrationDisconnectedError extends Error {
  constructor(provider: IntegrationProvider) {
    super(`${provider} was disconnected during the sync`);
    this.name = "IntegrationDisconnectedError";
  }
}

/** Throws IntegrationDisconnectedError if the integration is gone. */
export async function assertStillConnected(userId: string, provider: IntegrationProvider): Promise<void> {
  if (!(await hasIntegrationCredential(userId, provider))) throw new IntegrationDisconnectedError(provider);
}

export type PlexCredential = {
  authToken: string;
  clientId: string;
};

export async function getPlexCredential(userId: string): Promise<PlexCredential | null> {
  const [row] = await db
    .select()
    .from(integrationCredentials)
    .where(and(eq(integrationCredentials.userId, userId), eq(integrationCredentials.provider, "plex")))
    .limit(1);

  if (!row || !row.plexAuthTokenEnc || !row.plexAuthTokenIv || !row.plexAuthTokenTag || !row.plexClientId) {
    return null;
  }

  const authToken = decryptSecret({
    ciphertext: row.plexAuthTokenEnc,
    iv: row.plexAuthTokenIv,
    tag: row.plexAuthTokenTag,
  });

  return { authToken, clientId: row.plexClientId };
}

export type JellyfinCredential = {
  baseUrl: string;
  apiKey: string;
};

/** Unlike Plex (OAuth token) and like Sonarr/Radarr, Jellyfin auths via a
 * plain server URL + API key — reuses the same generic baseUrl/apiKeyEnc
 * columns arr credentials use, just under provider: "jellyfin". No
 * quality-profile/root-folder fields since Jellyfin is read-only ownership
 * checking, not something Marquee adds content to. */
export async function getJellyfinCredential(userId: string): Promise<JellyfinCredential | null> {
  const [row] = await db
    .select()
    .from(integrationCredentials)
    .where(
      and(eq(integrationCredentials.userId, userId), eq(integrationCredentials.provider, "jellyfin")),
    )
    .limit(1);

  if (!row || !row.baseUrl || !row.apiKeyEnc || !row.apiKeyIv || !row.apiKeyTag) return null;

  const apiKey = decryptSecret({
    ciphertext: row.apiKeyEnc,
    iv: row.apiKeyIv,
    tag: row.apiKeyTag,
  });

  return { baseUrl: row.baseUrl, apiKey };
}

export async function upsertJellyfinCredential(
  userId: string,
  fields: { baseUrl: string; apiKey: string },
) {
  const encrypted = encryptSecret(fields.apiKey);

  await db
    .insert(integrationCredentials)
    .values({
      userId,
      provider: "jellyfin",
      baseUrl: fields.baseUrl,
      apiKeyEnc: encrypted.ciphertext,
      apiKeyIv: encrypted.iv,
      apiKeyTag: encrypted.tag,
    })
    .onConflictDoUpdate({
      target: [integrationCredentials.userId, integrationCredentials.provider],
      set: {
        baseUrl: fields.baseUrl,
        apiKeyEnc: encrypted.ciphertext,
        apiKeyIv: encrypted.iv,
        apiKeyTag: encrypted.tag,
        updatedAt: new Date(),
      },
    });
}

/** The shared secret embedded in this user's Sonarr/Radarr webhook URLs
 * (Settings > Integrations) — lazily created on first need, same pattern as
 * getOrCreatePlexClientId above. One secret covers both providers since the
 * URL path already identifies which provider a request is for. */
export async function getOrCreateWebhookSecret(userId: string): Promise<string> {
  const [row] = await db
    .select({ notificationWebhookSecret: users.notificationWebhookSecret })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (row?.notificationWebhookSecret) return row.notificationWebhookSecret;

  const secret = randomBytes(24).toString("hex");
  await db.update(users).set({ notificationWebhookSecret: secret }).where(eq(users.id, userId));
  return secret;
}

export async function regenerateWebhookSecret(userId: string): Promise<string> {
  const secret = randomBytes(24).toString("hex");
  await db.update(users).set({ notificationWebhookSecret: secret }).where(eq(users.id, userId));
  return secret;
}

export async function getWebhookSecret(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ notificationWebhookSecret: users.notificationWebhookSecret })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.notificationWebhookSecret ?? null;
}

export async function getOrCreatePlexClientId(userId: string): Promise<string> {
  const [row] = await db
    .select({ plexClientId: integrationCredentials.plexClientId })
    .from(integrationCredentials)
    .where(and(eq(integrationCredentials.userId, userId), eq(integrationCredentials.provider, "plex")))
    .limit(1);

  if (row?.plexClientId) return row.plexClientId;

  const clientId = randomUUID();
  await db
    .insert(integrationCredentials)
    .values({ userId, provider: "plex", plexClientId: clientId })
    .onConflictDoUpdate({
      target: [integrationCredentials.userId, integrationCredentials.provider],
      set: { plexClientId: clientId, updatedAt: new Date() },
    });
  return clientId;
}

export async function upsertPlexCredential(
  userId: string,
  fields: { authToken: string; clientId: string },
) {
  const encrypted = encryptSecret(fields.authToken);

  await db
    .insert(integrationCredentials)
    .values({
      userId,
      provider: "plex",
      plexClientId: fields.clientId,
      plexAuthTokenEnc: encrypted.ciphertext,
      plexAuthTokenIv: encrypted.iv,
      plexAuthTokenTag: encrypted.tag,
    })
    .onConflictDoUpdate({
      target: [integrationCredentials.userId, integrationCredentials.provider],
      set: {
        plexClientId: fields.clientId,
        plexAuthTokenEnc: encrypted.ciphertext,
        plexAuthTokenIv: encrypted.iv,
        plexAuthTokenTag: encrypted.tag,
        updatedAt: new Date(),
      },
    });
}
