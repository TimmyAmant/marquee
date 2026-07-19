import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { appSettings } from "@/lib/db/schema";
import { encryptSecret, decryptSecret } from "@/lib/crypto/encryption";

// Short-lived cache so every TMDb request doesn't hit the database just to
// resolve the access token — the setting changes rarely (only when someone
// edits it in Settings), so a brief staleness window is an easy tradeoff.
const CACHE_TTL_MS = 30_000;
let cached: { value: string | null; expiresAt: number } | null = null;

async function getRow() {
  const [row] = await db.select().from(appSettings).limit(1);
  return row ?? null;
}

/** The TMDb v4 access token to use — whatever was saved in Settings, or the
 * TMDB_ACCESS_TOKEN environment variable if nothing's been saved there. */
export async function getTmdbAccessToken(): Promise<string | null> {
  if (cached && Date.now() < cached.expiresAt) return cached.value;

  const row = await getRow();
  const value =
    row?.tmdbAccessTokenEnc && row.tmdbAccessTokenIv && row.tmdbAccessTokenTag
      ? decryptSecret({
          ciphertext: row.tmdbAccessTokenEnc,
          iv: row.tmdbAccessTokenIv,
          tag: row.tmdbAccessTokenTag,
        })
      : (process.env.TMDB_ACCESS_TOKEN ?? null);

  cached = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

export async function isTmdbAccessTokenSavedInSettings(): Promise<boolean> {
  const row = await getRow();
  return Boolean(row?.tmdbAccessTokenEnc);
}

export async function setTmdbAccessToken(token: string): Promise<void> {
  const encrypted = encryptSecret(token);
  const existing = await getRow();

  if (existing) {
    await db
      .update(appSettings)
      .set({
        tmdbAccessTokenEnc: encrypted.ciphertext,
        tmdbAccessTokenIv: encrypted.iv,
        tmdbAccessTokenTag: encrypted.tag,
        updatedAt: new Date(),
      })
      .where(eq(appSettings.id, existing.id));
  } else {
    await db.insert(appSettings).values({
      tmdbAccessTokenEnc: encrypted.ciphertext,
      tmdbAccessTokenIv: encrypted.iv,
      tmdbAccessTokenTag: encrypted.tag,
    });
  }

  cached = null;
}

/** Removes the saved token, falling back to TMDB_ACCESS_TOKEN from the
 * environment (if any) rather than leaving TMDb totally unconfigured. */
export async function clearTmdbAccessToken(): Promise<void> {
  const existing = await getRow();
  if (existing) {
    await db
      .update(appSettings)
      .set({
        tmdbAccessTokenEnc: null,
        tmdbAccessTokenIv: null,
        tmdbAccessTokenTag: null,
        updatedAt: new Date(),
      })
      .where(eq(appSettings.id, existing.id));
  }
  cached = null;
}

let traktCached: { value: string | null; expiresAt: number } | null = null;

export async function getTraktClientId(): Promise<string | null> {
  if (traktCached && Date.now() < traktCached.expiresAt) return traktCached.value;

  const row = await getRow();
  const value =
    row?.traktClientIdEnc && row.traktClientIdIv && row.traktClientIdTag
      ? decryptSecret({
          ciphertext: row.traktClientIdEnc,
          iv: row.traktClientIdIv,
          tag: row.traktClientIdTag,
        })
      : null;

  traktCached = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

export async function setTraktClientId(clientId: string): Promise<void> {
  const encrypted = encryptSecret(clientId);
  const existing = await getRow();

  if (existing) {
    await db
      .update(appSettings)
      .set({
        traktClientIdEnc: encrypted.ciphertext,
        traktClientIdIv: encrypted.iv,
        traktClientIdTag: encrypted.tag,
        updatedAt: new Date(),
      })
      .where(eq(appSettings.id, existing.id));
  } else {
    await db.insert(appSettings).values({
      traktClientIdEnc: encrypted.ciphertext,
      traktClientIdIv: encrypted.iv,
      traktClientIdTag: encrypted.tag,
    });
  }

  traktCached = null;
}

export async function clearTraktClientId(): Promise<void> {
  const existing = await getRow();
  if (existing) {
    await db
      .update(appSettings)
      .set({
        traktClientIdEnc: null,
        traktClientIdIv: null,
        traktClientIdTag: null,
        updatedAt: new Date(),
      })
      .where(eq(appSettings.id, existing.id));
  }
  traktCached = null;
}

let tvdbCached: { value: string | null; expiresAt: number } | null = null;

export async function getTvdbApiKey(): Promise<string | null> {
  if (tvdbCached && Date.now() < tvdbCached.expiresAt) return tvdbCached.value;

  const row = await getRow();
  const value =
    row?.tvdbApiKeyEnc && row.tvdbApiKeyIv && row.tvdbApiKeyTag
      ? decryptSecret({
          ciphertext: row.tvdbApiKeyEnc,
          iv: row.tvdbApiKeyIv,
          tag: row.tvdbApiKeyTag,
        })
      : null;

  tvdbCached = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

export async function setTvdbApiKey(apiKey: string): Promise<void> {
  const encrypted = encryptSecret(apiKey);
  const existing = await getRow();

  if (existing) {
    await db
      .update(appSettings)
      .set({
        tvdbApiKeyEnc: encrypted.ciphertext,
        tvdbApiKeyIv: encrypted.iv,
        tvdbApiKeyTag: encrypted.tag,
        updatedAt: new Date(),
      })
      .where(eq(appSettings.id, existing.id));
  } else {
    await db.insert(appSettings).values({
      tvdbApiKeyEnc: encrypted.ciphertext,
      tvdbApiKeyIv: encrypted.iv,
      tvdbApiKeyTag: encrypted.tag,
    });
  }

  tvdbCached = null;
}

export async function clearTvdbApiKey(): Promise<void> {
  const existing = await getRow();
  if (existing) {
    await db
      .update(appSettings)
      .set({
        tvdbApiKeyEnc: null,
        tvdbApiKeyIv: null,
        tvdbApiKeyTag: null,
        updatedAt: new Date(),
      })
      .where(eq(appSettings.id, existing.id));
  }
  tvdbCached = null;
}
