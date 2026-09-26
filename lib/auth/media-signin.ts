import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { appSettings, plexServers, users } from "@/lib/db/schema";
import { fail, type CoreResult } from "@/lib/core-result";
import { getAdminUserId } from "@/lib/auth/get-admin";
import { withLoginBudget } from "@/lib/auth/password-login";
import {
  claimPlexPin,
  createPlexPinHandle,
  hasPlexPinCapacity,
  SHARED_PIN_OWNER,
  getPlexPin,
  shouldCheckPin,
  type PlexPinEntry,
} from "@/lib/auth/login-tickets";
import {
  decideSignIn,
  importedDisplayName,
  MEDIA_PROVIDER_LABEL,
  noAccountMessage,
  PLEX_NO_ACCESS_MESSAGE,
  sanitizeUsername,
  uniqueUsername,
  unlinkWouldLockOut,
  type MediaProvider,
} from "@/lib/auth/media-accounts";
import { getJellyfinCredential, getPlexCredential } from "@/lib/integrations/credentials";
import { buildPlexAuthUrl, checkPin, createPin } from "@/lib/plex/client";
import { disableWatchlist, enableWatchlist, syncPlexWatchlist } from "@/lib/plex/watchlist";
import { getMediaServerName } from "@/lib/jellyfin/product";
import {
  getPlexAccount,
  getPlexSharedUsers,
  getServerResources,
  importablePlexUsers,
  plexServerAccess,
  type PlexAccount,
} from "@/lib/plex/accounts";
import {
  authenticateJellyfinUser,
  jellyfinUserImageUrl,
  listJellyfinUsers,
} from "@/lib/jellyfin/accounts";
import { checkRateLimit } from "@/lib/rate-limit";

// "Sign in with Plex / Jellyfin", linking those accounts in Settings, and the
// admin's "Import from Plex / Jellyfin" — shared by the website (login page
// and settings server actions) and /api/v1. Everything is judged against
// the admin's own connected Plex server / Jellyfin server (Settings →
// Integrations); with neither connected, none of this is offered.
//
// Security notes, since this is a way into accounts:
//  - Accounts are matched only by a stored Plex/Jellyfin user id (see
//    decideSignIn), never by username or email.
//  - A member's Plex token is used for two plex.tv lookups and dropped; a
//    Jellyfin password goes to the admin's Jellyfin server and nowhere else.
//    Neither is stored or logged.
//  - Plex PINs are known to clients only by a random handle bound to the
//    flow that started it (lib/auth/login-tickets.ts).

type UserRow = typeof users.$inferSelect;

export type SignInMethods = {
  password: true;
  plex: boolean;
  jellyfin: boolean;
  /** What to call the "jellyfin" server: "Jellyfin", or "Emby" when that's
   * what's connected (lib/jellyfin/product.ts). */
  jellyfinName: string;
  /** New accounts from Plex/Jellyfin sign-in are on, and at least one of
   * them is offered: the sign-in screens tell newcomers to use it. */
  signup: boolean;
};

type PlexContext = { adminId: string; clientId: string; authToken: string; machineIds: string[] };
type JellyfinContext = { adminId: string; baseUrl: string; apiKey: string; name: string };

/** The admin's Plex connection, when there's one with at least one synced
 * server to check access against. */
async function getPlexContext(): Promise<PlexContext | null> {
  const adminId = await getAdminUserId();
  if (!adminId) return null;
  const credential = await getPlexCredential(adminId);
  if (!credential) return null;
  const servers = await db
    .select({ machineIdentifier: plexServers.machineIdentifier })
    .from(plexServers)
    .where(eq(plexServers.userId, adminId));
  if (servers.length === 0) return null;
  return { adminId, ...credential, machineIds: servers.map((s) => s.machineIdentifier) };
}

async function getJellyfinContext(): Promise<JellyfinContext | null> {
  const adminId = await getAdminUserId();
  if (!adminId) return null;
  const credential = await getJellyfinCredential(adminId);
  return credential ? { adminId, ...credential, name: await getMediaServerName(adminId) } : null;
}

/** Which sign-in methods the login page and apps should offer. */
export async function getSignInMethods(): Promise<SignInMethods> {
  const [plex, jellyfin, signupAllowed] = await Promise.all([
    getPlexContext(),
    getJellyfinContext(),
    getMediaServerSignup(),
  ]);
  return {
    password: true,
    plex: Boolean(plex),
    jellyfin: Boolean(jellyfin),
    jellyfinName: jellyfin?.name ?? "Jellyfin",
    signup: signupAllowed && Boolean(plex || jellyfin),
  };
}

const PLEX_NOT_CONNECTED = "Plex sign-in isn't set up on this server.";
const JELLYFIN_NOT_CONNECTED = "Jellyfin sign-in isn't set up on this server.";

// ── The sign-up setting ────────────────────────────────────────────────────

/** "New accounts from Plex/Jellyfin sign-in" — off until the admin turns it
 * on. Off by default because on it lets everyone the admin has ever shared
 * Plex with (or who has a Jellyfin login) into Marquee, and lets a removed
 * member back in with a fresh account; with it off, only accounts the admin
 * imported or linked can use Plex/Jellyfin sign-in. */
export async function getMediaServerSignup(): Promise<boolean> {
  const [row] = await db.select({ value: appSettings.mediaServerSignup }).from(appSettings).limit(1);
  return row?.value ?? false;
}

export async function setMediaServerSignup(value: boolean): Promise<void> {
  const [row] = await db.select({ id: appSettings.id }).from(appSettings).limit(1);
  if (row) {
    await db.update(appSettings).set({ mediaServerSignup: value, updatedAt: new Date() }).where(eq(appSettings.id, row.id));
  } else {
    await db.insert(appSettings).values({ mediaServerSignup: value });
  }
}

// ── Link state ─────────────────────────────────────────────────────────────

export type LinkState = { linked: { plex: boolean; jellyfin: boolean }; hasPassword: boolean };

export async function getLinkState(userId: string): Promise<LinkState | null> {
  const [row] = await db
    .select({
      plex: sql<boolean>`${users.plexUserId} is not null`,
      jellyfin: sql<boolean>`${users.jellyfinUserId} is not null`,
      hasPassword: sql<boolean>`${users.passwordHash} is not null`,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ? { linked: { plex: row.plex, jellyfin: row.jellyfin }, hasPassword: row.hasPassword } : null;
}

// ── Accounts ───────────────────────────────────────────────────────────────

const LINK_COLUMN = { plex: users.plexUserId, jellyfin: users.jellyfinUserId } as const;

function isUniqueViolation(err: unknown): boolean {
  const codeOf = (e: unknown) => (e && typeof e === "object" && "code" in e ? (e as { code: unknown }).code : null);
  const cause = err && typeof err === "object" && "cause" in err ? (err as { cause: unknown }).cause : null;
  return codeOf(err) === "23505" || codeOf(cause) === "23505";
}

async function findLinkedUser(provider: MediaProvider, externalId: string): Promise<UserRow | null> {
  const [row] = await db.select().from(users).where(eq(LINK_COLUMN[provider], externalId)).limit(1);
  return row ?? null;
}

async function getUser(userId: string): Promise<UserRow | null> {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return row ?? null;
}

/**
 * A new member account linked to a Plex/Jellyfin user, with no password
 * (they sign in through the media server until they set one). The username
 * is theirs from the media server, made to fit Marquee's rules and unique.
 * Two sign-ins (or an import and a sign-in) racing for the same person end
 * up with one account: the unique link column refuses the second insert,
 * which then answers with the first one's account.
 */
async function createLinkedMember(
  provider: MediaProvider,
  externalId: string,
  preferredUsername: string,
  title: string | null,
): Promise<{ user: UserRow; created: boolean }> {
  const base = sanitizeUsername(preferredUsername);
  for (let attempt = 0; attempt < 5; attempt++) {
    const taken = new Set((await db.select({ username: users.username }).from(users)).map((r) => r.username));
    const username = uniqueUsername(base, taken);
    const [created] = await db
      .insert(users)
      .values({
        username,
        displayName: importedDisplayName(title, username),
        passwordHash: null,
        role: "member",
        [provider === "plex" ? "plexUserId" : "jellyfinUserId"]: externalId,
      })
      .onConflictDoNothing()
      .returning();
    if (created) return { user: created, created: true };

    const existing = await findLinkedUser(provider, externalId);
    if (existing) return { user: existing, created: false };
    // Otherwise the username was taken in the meantime; pick again.
  }
  throw new Error("Couldn't find a free username for a new account");
}

export type MediaSignInResult = CoreResult<{ user: UserRow }>;

/** Applies decideSignIn to a verified Plex/Jellyfin identity. */
async function resolveSignIn(
  provider: MediaProvider,
  identity: { externalId: string; username: string; title: string | null; ownsServer: boolean },
  adminId: string,
  /** "Plex", "Jellyfin" or "Emby", for the refusal. */
  providerName: string,
): Promise<MediaSignInResult> {
  const [linked, admin, signupAllowed] = await Promise.all([
    findLinkedUser(provider, identity.externalId),
    getUser(adminId),
    getMediaServerSignup(),
  ]);

  const decision = decideSignIn({
    provider,
    linkedUserId: linked?.id ?? null,
    ownsServer: identity.ownsServer,
    admin: admin ? { id: admin.id, linked: admin.plexUserId !== null } : null,
    signupAllowed,
    providerName,
  });

  switch (decision.action) {
    case "sign_in":
      return { ok: true, user: linked! };
    case "link_admin": {
      // Only while the admin still has no Plex link — a concurrent link
      // elsewhere wins, and this sign-in then goes through the checks again.
      const [updated] = await db
        .update(users)
        .set({ plexUserId: identity.externalId })
        .where(and(eq(users.id, decision.userId), isNull(users.plexUserId)))
        .returning()
        .catch((err) => {
          if (isUniqueViolation(err)) return [];
          throw err;
        });
      if (updated) return { ok: true, user: updated };
      const relinked = await findLinkedUser(provider, identity.externalId);
      return relinked ? { ok: true, user: relinked } : fail("forbidden", noAccountMessage(providerName));
    }
    case "create": {
      const { user } = await createLinkedMember(provider, identity.externalId, identity.username, identity.title);
      return { ok: true, user };
    }
    case "refuse":
      return fail("forbidden", decision.message);
  }
}

// ── Plex PIN flow ──────────────────────────────────────────────────────────

/** Plex PIN starts per client address per window. Generous, since a whole
 * household may be signing in from behind one address. */
const PIN_START_LIMIT = 30;
/** The shared bucket for requests whose address can't be known (no
 * TRUSTED_PROXY_HOPS): everyone lands in it, so it's larger still. */
const PIN_START_SHARED_LIMIT = 120;
const PIN_START_WINDOW_MS = 10 * 60 * 1000;
/** Polls per client address per window: a PIN polled every 2 s for its
 * whole 10 minutes is 300, and a few people can be at it at once. */
const PIN_POLL_LIMIT = 1200;
const PIN_POLL_WINDOW_MS = 10 * 60 * 1000;

export type PlexPinStart = { handle: string; authUrl: string; expiresAt: Date };

const TOO_MANY_WAITING = "Too many Plex sign-ins are waiting right now. Try again in a few minutes.";

/** Starts a Plex PIN for signing in (or, with `link`, for linking the
 * signed-in account) and returns the handle to poll with. */
export async function startPlexPin(
  purpose: PlexPinEntry["purpose"],
  ip: string | null,
): Promise<CoreResult<PlexPinStart>> {
  const allowed = ip
    ? checkRateLimit(`plex-pin:start:${ip}`, PIN_START_LIMIT, PIN_START_WINDOW_MS)
    : checkRateLimit("plex-pin:start:shared", PIN_START_SHARED_LIMIT, PIN_START_WINDOW_MS);
  if (!allowed) return fail("rate_limited", "Too many attempts. Try again in a few minutes.");

  const plex = await getPlexContext();
  if (!plex) return fail("conflict", PLEX_NOT_CONNECTED);

  const owner = ip ?? SHARED_PIN_OWNER;
  if (!hasPlexPinCapacity(owner)) return fail("rate_limited", TOO_MANY_WAITING);

  let pin;
  try {
    pin = await createPin(plex.clientId);
  } catch {
    return fail("upstream", "Couldn't start Plex sign-in. Try again.");
  }
  const created = createPlexPinHandle({ pinId: pin.id, clientId: plex.clientId, purpose, owner });
  if (!created) return fail("rate_limited", TOO_MANY_WAITING);
  const { handle, expiresAt } = created;
  return { ok: true, handle, authUrl: buildPlexAuthUrl(plex.clientId, pin.code), expiresAt: new Date(expiresAt) };
}

export type PlexPinPoll<T extends object> = { status: "pending" } | { status: "expired" } | ({ status: "done" } & CoreResult<T>);

/**
 * One poll of a PIN: "pending" until the person approves on plex.tv, then —
 * exactly once per handle — the verified Plex account and whether it can
 * use the admin's server. Sign-in and linking use the Plex token plex.tv
 * hands back for those two lookups and then drop it; only turning on the
 * Plex Watchlist (pollPlexWatchlist) keeps it, since reading a watchlist
 * needs its owner's own token.
 */
async function pollPlexPin(
  handle: unknown,
  purpose: PlexPinEntry["purpose"],
  ip: string | null,
): Promise<
  PlexPinPoll<{
    account: PlexAccount;
    access: { access: boolean; owner: boolean };
    plex: PlexContext;
    grant: { authToken: string; clientId: string };
  }>
> {
  // Polls need no shared bucket: a handle is only good for its own PIN,
  // plex.tv is asked at most every 2 s per handle, and at most
  // MAX_LIVE_PLEX_PINS handles exist at once.
  if (ip && !checkRateLimit(`plex-pin:poll:${ip}`, PIN_POLL_LIMIT, PIN_POLL_WINDOW_MS)) {
    return { status: "done", ...fail("rate_limited", "Too many attempts. Try again in a few minutes.") };
  }

  const lookup = getPlexPin(handle, purpose);
  if (lookup.status === "expired") return { status: "expired" };
  const { entry } = lookup;
  if (!shouldCheckPin(entry)) return { status: "pending" };

  const pin = await checkPin(entry.clientId, entry.pinId).catch(() => null);
  if (!pin?.authToken) return { status: "pending" };
  // First poll to see the token takes the handle; a racing poll gets
  // "expired" rather than a second sign-in.
  if (!claimPlexPin(handle as string)) return { status: "expired" };

  const plex = await getPlexContext();
  if (!plex) return { status: "done", ...fail("conflict", PLEX_NOT_CONNECTED) };

  try {
    const [account, resources, adminAccount] = await Promise.all([
      getPlexAccount(entry.clientId, pin.authToken),
      getServerResources(entry.clientId, pin.authToken),
      getAdminPlexAccount(plex),
    ]);
    if (!account) return { status: "done", ...fail("upstream", "Plex didn't say which account this is. Try again.") };
    // "Owner" — the one Plex identity that may become the Marquee admin —
    // is exactly the Plex account connected in Settings → Integrations, by
    // plex.tv's own id for that token. Not the `owned` flag in the member's
    // resource list: that's the member's view of things, and it would also
    // keep pointing at a server the admin has since moved away from.
    const { access } = plexServerAccess(resources, plex.machineIds);
    const owner = adminAccount !== null && account.id === adminAccount.id;
    return {
      status: "done",
      ok: true,
      account,
      access: { access, owner },
      plex,
      grant: { authToken: pin.authToken, clientId: entry.clientId },
    };
  } catch {
    return { status: "done", ...fail("upstream", "Couldn't reach Plex. Try again.") };
  }
}

/** The admin's own Plex account (whose token the integration holds), for the
 * owner check. Cached per token for a few minutes: it only changes when the
 * admin reconnects Plex, which brings a new token. */
const adminAccountCache = new Map<string, { account: PlexAccount; expires: number }>();
const ADMIN_ACCOUNT_TTL_MS = 10 * 60 * 1000;

async function getAdminPlexAccount(plex: PlexContext): Promise<PlexAccount | null> {
  const cached = adminAccountCache.get(plex.authToken);
  if (cached && cached.expires > Date.now()) return cached.account;
  const account = await getPlexAccount(plex.clientId, plex.authToken).catch(() => null);
  adminAccountCache.clear();
  if (account) adminAccountCache.set(plex.authToken, { account, expires: Date.now() + ADMIN_ACCOUNT_TTL_MS });
  return account;
}

export async function startPlexSignIn(ip: string | null) {
  return startPlexPin({ kind: "sign_in" }, ip);
}

/** A sign-in poll: pending/expired, or the account to sign in as. */
export async function pollPlexSignIn(handle: unknown, ip: string | null): Promise<PlexPinPoll<{ user: UserRow }>> {
  const poll = await pollPlexPin(handle, { kind: "sign_in" }, ip);
  if (poll.status !== "done") return poll;
  if (!poll.ok) return poll;
  if (!poll.access.access) return { status: "done", ...fail("forbidden", PLEX_NO_ACCESS_MESSAGE) };
  const result = await resolveSignIn(
    "plex",
    {
      externalId: poll.account.id,
      username: poll.account.username,
      title: poll.account.title,
      ownsServer: poll.access.owner,
    },
    poll.plex.adminId,
    "Plex",
  );
  return { status: "done", ...result };
}

export async function startPlexLink(userId: string, ip: string | null) {
  return startPlexPin({ kind: "link", userId }, ip);
}

/** A link poll for the signed-in account: pending/expired, or linked. */
export async function pollPlexLink(
  userId: string,
  handle: unknown,
  ip: string | null,
): Promise<PlexPinPoll<object>> {
  const poll = await pollPlexPin(handle, { kind: "link", userId }, ip);
  if (poll.status !== "done") return poll;
  if (!poll.ok) return poll;
  // Linking an account that couldn't sign in anyway would only look like it
  // worked.
  if (!poll.access.access) return { status: "done", ...fail("forbidden", PLEX_NO_ACCESS_MESSAGE) };
  return { status: "done", ...(await linkAccount(userId, "plex", poll.account.id)) };
}

// ── Plex Watchlist ─────────────────────────────────────────────────────────

const WATCHLIST_NEEDS_LINK = "Link your Plex account first.";

/** Starts the plex.tv approval that turns on "request what's on my Plex
 * Watchlist" for the signed-in account, which must have Plex linked. */
export async function startPlexWatchlist(userId: string, ip: string | null) {
  const state = await getLinkState(userId);
  if (!state) return fail("not_found", "Account not found.");
  if (!state.linked.plex) return fail("conflict", WATCHLIST_NEEDS_LINK);
  return startPlexPin({ kind: "watchlist", userId }, ip);
}

/** A watchlist poll: pending/expired, or turned on. The approving Plex
 * account must be the one linked here — its token reads only its own
 * watchlist, and requests are filed as this account. */
export async function pollPlexWatchlist(
  userId: string,
  handle: unknown,
  ip: string | null,
): Promise<PlexPinPoll<object>> {
  const poll = await pollPlexPin(handle, { kind: "watchlist", userId }, ip);
  if (poll.status !== "done") return poll;
  if (!poll.ok) return poll;
  const [user] = await db.select({ plexUserId: users.plexUserId }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user?.plexUserId) return { status: "done", ...fail("conflict", WATCHLIST_NEEDS_LINK) };
  if (user.plexUserId !== poll.account.id) {
    return {
      status: "done",
      ...fail("forbidden", "That's a different Plex account from the one linked here. Sign in to plex.tv as that one."),
    };
  }
  await enableWatchlist(userId, { plexUserId: poll.account.id, ...poll.grant });
  // The first read happens in the background: a long watchlist shouldn't
  // hold up the answer.
  void syncPlexWatchlist(userId).catch(() => undefined);
  return { status: "done", ok: true };
}

// ── Jellyfin ───────────────────────────────────────────────────────────────

/** Checks a Jellyfin username/password with the admin's Jellyfin server,
 * under the same limits as password sign-in (own buckets). */
async function verifyJellyfinUser(
  username: string,
  password: string,
  ip: string | null,
): Promise<CoreResult<{ jellyfin: JellyfinContext; jellyfinUser: { id: string; name: string } }>> {
  const jellyfin = await getJellyfinContext();
  if (!jellyfin) return fail("conflict", JELLYFIN_NOT_CONNECTED);

  let outcome;
  try {
    outcome = await withLoginBudget("jellyfin-login", username, ip, async () => {
      const result = await authenticateJellyfinUser(jellyfin.baseUrl, username, password);
      return result.ok ? { jellyfinUser: result.user } : null;
    });
  } catch {
    return fail("upstream", `Couldn't reach ${jellyfin.name}. Try again.`);
  }
  if (!outcome.ok) {
    return outcome.reason === "rate_limited"
      ? fail("rate_limited", "Too many attempts. Try again in a few minutes.")
      : fail("invalid_credentials", `Incorrect ${jellyfin.name} username or password`);
  }
  return { ok: true, jellyfin, jellyfinUser: outcome.jellyfinUser };
}

export async function signInWithJellyfin(username: string, password: string, ip: string | null): Promise<MediaSignInResult> {
  const verified = await verifyJellyfinUser(username, password, ip);
  if (!verified.ok) return verified;
  return resolveSignIn(
    "jellyfin",
    {
      externalId: verified.jellyfinUser.id,
      username: verified.jellyfinUser.name,
      title: verified.jellyfinUser.name,
      ownsServer: false,
    },
    verified.jellyfin.adminId,
    verified.jellyfin.name,
  );
}

export async function linkJellyfin(
  userId: string,
  username: string,
  password: string,
  ip: string | null,
): Promise<CoreResult> {
  const verified = await verifyJellyfinUser(username, password, ip);
  if (!verified.ok) return verified;
  return linkAccount(userId, "jellyfin", verified.jellyfinUser.id);
}

// ── Linking ────────────────────────────────────────────────────────────────

async function linkAccount(userId: string, provider: MediaProvider, externalId: string): Promise<CoreResult> {
  const label = MEDIA_PROVIDER_LABEL[provider];
  const existing = await findLinkedUser(provider, externalId);
  if (existing && existing.id !== userId) {
    return fail("conflict", `This ${label} account is already linked to another Marquee account.`);
  }
  if (existing) return { ok: true };

  const updated = await db
    .update(users)
    .set({ [provider === "plex" ? "plexUserId" : "jellyfinUserId"]: externalId })
    .where(eq(users.id, userId))
    .returning({ id: users.id })
    .catch((err) => {
      if (isUniqueViolation(err)) return null;
      throw err;
    });
  if (updated === null) return fail("conflict", `This ${label} account is already linked to another Marquee account.`);
  if (updated.length === 0) return fail("not_found", "Account not found.");
  return { ok: true };
}

export async function unlinkAccount(userId: string, provider: MediaProvider): Promise<CoreResult> {
  const state = await getLinkState(userId);
  if (!state) return fail("not_found", "Account not found.");
  if (!state.linked[provider]) return { ok: true };
  if (
    unlinkWouldLockOut(provider, {
      hasPassword: state.hasPassword,
      plexLinked: state.linked.plex,
      jellyfinLinked: state.linked.jellyfin,
    })
  ) {
    return fail(
      "conflict",
      `Set a password first — without ${MEDIA_PROVIDER_LABEL[provider]}, there'd be no way to sign in to this account.`,
    );
  }
  await db
    .update(users)
    .set({ [provider === "plex" ? "plexUserId" : "jellyfinUserId"]: null })
    .where(eq(users.id, userId));
  // The watchlist token belongs to the Plex account just unlinked.
  if (provider === "plex") await disableWatchlist(userId);
  return { ok: true };
}

// ── Import ─────────────────────────────────────────────────────────────────

export type ImportCandidate = {
  id: string;
  username: string;
  displayName: string | null;
  thumb: string | null;
  alreadyMember: boolean;
};

type ImportSource = { id: string; username: string; title: string | null; thumb: string | null };

/** Everyone on the admin's Plex (friends and Home users with access to
 * the admin's server) or Jellyfin (every enabled user) — fetched fresh each
 * time, so an import only ever creates accounts for people who are there
 * right now. */
async function importSources(provider: MediaProvider): Promise<CoreResult<{ sources: ImportSource[] }>> {
  if (provider === "plex") {
    const plex = await getPlexContext();
    if (!plex) return fail("conflict", "Connect Plex in Settings first.");
    try {
      const shared = importablePlexUsers(await getPlexSharedUsers(plex.clientId, plex.authToken), plex.machineIds);
      return {
        ok: true,
        sources: shared.map((u) => ({ id: u.id, username: u.username || u.title, title: u.title, thumb: u.thumb })),
      };
    } catch {
      return fail("upstream", "Couldn't reach Plex. Try again.");
    }
  }

  const jellyfin = await getJellyfinContext();
  if (!jellyfin) return fail("conflict", "Connect Jellyfin in Settings first.");
  try {
    const list = await listJellyfinUsers(jellyfin);
    return {
      ok: true,
      sources: list
        .filter((u) => !u.isDisabled)
        .map((u) => ({ id: u.id, username: u.name, title: u.name, thumb: jellyfinUserImageUrl(jellyfin.baseUrl, u) })),
    };
  } catch {
    return fail("upstream", `Couldn't reach ${jellyfin.name}. Try again.`);
  }
}

async function linkedIds(provider: MediaProvider): Promise<Set<string>> {
  const column = LINK_COLUMN[provider];
  const rows = await db.select({ id: column }).from(users).where(sql`${column} is not null`);
  return new Set(rows.map((r) => r.id).filter((id): id is string => id !== null));
}

export async function listImportCandidates(provider: MediaProvider): Promise<CoreResult<{ results: ImportCandidate[] }>> {
  const result = await importSources(provider);
  if (!result.ok) return result;
  const linked = await linkedIds(provider);
  return {
    ok: true,
    results: result.sources.map((s) => ({
      id: s.id,
      username: s.username,
      displayName: s.title && s.title !== s.username ? s.title : null,
      thumb: s.thumb,
      alreadyMember: linked.has(s.id),
    })),
  };
}

/** Upper bound on one import — far more than a household, and keeps a
 * single request from creating accounts without end. */
export const MAX_IMPORT_IDS = 200;

/** Creates linked member accounts for the chosen people. Ids are looked up
 * in a fresh listing — names never come from the caller — and anything not
 * there, or already a member, is skipped. */
export async function importMediaUsers(
  provider: MediaProvider,
  ids: unknown,
): Promise<CoreResult<{ createdIds: string[]; skipped: number }>> {
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
    return fail("invalid", '"ids" must be a list of ids.');
  }
  const wanted = [...new Set(ids as string[])];
  if (wanted.length === 0) return fail("invalid", "Choose at least one person to import.");
  if (wanted.length > MAX_IMPORT_IDS) return fail("invalid", `Import at most ${MAX_IMPORT_IDS} people at a time.`);

  const result = await importSources(provider);
  if (!result.ok) return result;
  const byId = new Map(result.sources.map((s) => [s.id, s]));
  const linked = await linkedIds(provider);

  const createdIds: string[] = [];
  let skipped = 0;
  for (const id of wanted) {
    const source = byId.get(id);
    if (!source || linked.has(id)) {
      skipped++;
      continue;
    }
    const { user, created } = await createLinkedMember(provider, source.id, source.username, source.title);
    if (created) createdIds.push(user.id);
    else skipped++;
  }
  return { ok: true, createdIds, skipped };
}
