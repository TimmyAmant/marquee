import { randomUUID, randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { integrationCredentials, users } from "@/lib/db/schema";
import type { ArrProvider } from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto/encryption";

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

export async function getArrCredential(
  userId: string,
  provider: ArrProvider,
): Promise<ArrCredential | null> {
  const [row] = await db
    .select()
    .from(integrationCredentials)
    .where(
      and(eq(integrationCredentials.userId, userId), eq(integrationCredentials.provider, provider)),
    )
    .limit(1);

  if (!row || !row.baseUrl || !row.apiKeyEnc || !row.apiKeyIv || !row.apiKeyTag) return null;

  const apiKey = decryptSecret({
    ciphertext: row.apiKeyEnc,
    iv: row.apiKeyIv,
    tag: row.apiKeyTag,
  });

  return {
    baseUrl: row.baseUrl,
    apiKey,
    qualityProfileId: row.qualityProfileId,
    rootFolderPath: row.rootFolderPath,
  };
}

export async function upsertArrCredential(
  userId: string,
  provider: ArrProvider,
  fields: {
    baseUrl: string;
    apiKey: string;
    qualityProfileId?: number | null;
    rootFolderPath?: string | null;
  },
) {
  const encrypted = encryptSecret(fields.apiKey);

  await db
    .insert(integrationCredentials)
    .values({
      userId,
      provider,
      baseUrl: fields.baseUrl,
      apiKeyEnc: encrypted.ciphertext,
      apiKeyIv: encrypted.iv,
      apiKeyTag: encrypted.tag,
      qualityProfileId: fields.qualityProfileId ?? null,
      rootFolderPath: fields.rootFolderPath ?? null,
    })
    .onConflictDoUpdate({
      target: [integrationCredentials.userId, integrationCredentials.provider],
      set: {
        baseUrl: fields.baseUrl,
        apiKeyEnc: encrypted.ciphertext,
        apiKeyIv: encrypted.iv,
        apiKeyTag: encrypted.tag,
        qualityProfileId: fields.qualityProfileId ?? null,
        rootFolderPath: fields.rootFolderPath ?? null,
        updatedAt: new Date(),
      },
    });
}

export async function updateArrDefaults(
  userId: string,
  provider: ArrProvider,
  fields: { qualityProfileId: number; rootFolderPath: string },
) {
  await db
    .update(integrationCredentials)
    .set({
      qualityProfileId: fields.qualityProfileId,
      rootFolderPath: fields.rootFolderPath,
      updatedAt: new Date(),
    })
    .where(
      and(eq(integrationCredentials.userId, userId), eq(integrationCredentials.provider, provider)),
    );
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
