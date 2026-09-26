import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { fail, type CoreErrorCode, type CoreFailure, type CoreResult } from "@/lib/core-result";
import { checkRateLimit } from "@/lib/rate-limit";
import { isUniqueViolation, uniqueUsername, unlinkWouldLockOut } from "@/lib/auth/media-accounts";
import { getLinkState } from "@/lib/auth/media-signin";
import { callbackUrlFor, getSsoConfig, type SsoConfig } from "@/lib/auth/sso/config";
import {
  decideSsoSignIn,
  identityFromClaims,
  shouldPromoteToTrusted,
  type SsoIdentity,
} from "@/lib/auth/sso/claims";
import {
  bindAppFlow,
  createSsoFlow,
  finishFlow,
  pollFlowHandle,
  SHARED_SSO_OWNER,
  takeFlowForCallback,
  type SsoFlow,
  type SsoFlowResult,
  type SsoPurpose,
} from "@/lib/auth/sso/flows";
import { ssoErrorMessage, type SsoErrorCode } from "@/lib/auth/sso/messages";
import {
  buildAuthorizationUrl,
  exchangeCode,
  fetchDiscovery,
  fetchUserinfo,
  mergeClaims,
  newAuthRequestSecrets,
  OidcError,
  sameIssuer,
  verifyIdToken,
  type Discovery,
} from "@/lib/auth/sso/oidc";

// "Sign in with <SSO>" and linking an SSO identity to an account — the
// website (login page, Settings → Account) and the apps (/api/v1/auth/sso,
// /api/v1/me/links/sso). The browser goes to the identity provider and comes
// back to /api/auth/sso/callback; everything that decides who that is
// happens here, on the server:
//
//  - the ID token is checked in full (lib/auth/sso/oidc.ts): signature,
//    issuer, audience, expiry, nonce; the code exchange uses PKCE and the
//    exact redirect URI the flow was started with;
//  - a callback is only accepted from the browser that started the flow
//    (lib/auth/sso/flows.ts), and each flow finishes once;
//  - accounts are found by issuer + subject; a verified email only ever
//    matches when the admin turned that on (lib/auth/sso/claims.ts);
//  - the apps never see the provider's tokens or the client secret: they
//    poll with a handle and get a Marquee API token.

type UserRow = typeof users.$inferSelect;

const START_LIMIT = 30;
const START_SHARED_LIMIT = 120;
const START_WINDOW_MS = 10 * 60 * 1000;
const CALLBACK_LIMIT = 60;
const POLL_LIMIT = 1200;
const RATE_LIMITED = "Too many attempts. Try again in a few minutes.";
const NOT_CONFIGURED = "Single sign-on isn't set up on this server.";
const TOO_MANY_WAITING = "Too many sign-ins are waiting right now. Try again in a few minutes.";

// ── Discovery, cached briefly ──────────────────────────────────────────────

const DISCOVERY_TTL_MS = 10 * 60 * 1000;
declare global {
  var __marqueeSsoDiscovery: { issuer: string; discovery: Discovery; expires: number } | undefined;
}

async function getDiscovery(issuer: string): Promise<Discovery> {
  const cached = globalThis.__marqueeSsoDiscovery;
  if (cached && cached.issuer === issuer && cached.expires > Date.now()) return cached.discovery;
  const discovery = await fetchDiscovery(issuer);
  // The saved issuer is the one discovery stated when it was saved; if the
  // provider now says otherwise, something's wrong — don't use it.
  if (discovery.issuer !== issuer) throw new OidcError("The provider's issuer has changed. Save the SSO settings again.");
  globalThis.__marqueeSsoDiscovery = { issuer, discovery, expires: Date.now() + DISCOVERY_TTL_MS };
  return discovery;
}

// ── Starting ───────────────────────────────────────────────────────────────

export type SsoStart = { flow: SsoFlow; binding: string | null; config: SsoConfig };

async function startFlow(purpose: SsoPurpose, ip: string | null): Promise<CoreResult<SsoStart>> {
  const allowed = ip
    ? checkRateLimit(`sso:start:${ip}`, START_LIMIT, START_WINDOW_MS)
    : checkRateLimit("sso:start:shared", START_SHARED_LIMIT, START_WINDOW_MS);
  if (!allowed) return fail("rate_limited", RATE_LIMITED);

  const config = await getSsoConfig();
  if (!config) return fail("conflict", NOT_CONFIGURED);
  let discovery: Discovery;
  try {
    discovery = await getDiscovery(config.issuer);
  } catch (err) {
    console.warn("[sso] discovery failed:", err instanceof Error ? err.message : err);
    return fail("upstream", `Couldn't reach ${config.name}. Try again.`);
  }

  const secrets = newAuthRequestSecrets();
  const redirectUri = callbackUrlFor(config.publicUrl);
  const created = createSsoFlow({
    ...secrets,
    issuer: config.issuer,
    clientId: config.clientId,
    redirectUri,
    purpose,
    owner: ip ?? SHARED_SSO_OWNER,
    authUrl: buildAuthorizationUrl({ discovery, clientId: config.clientId, redirectUri, scopes: config.scopes, secrets }),
  });
  if (!created) return fail("rate_limited", TOO_MANY_WAITING);
  return { ok: true, ...created, config };
}

/** The website's "Sign in with <SSO>": the provider URL to send the browser
 * to, and the binding for its cookie. */
export function startWebSsoSignIn(ip: string | null, remember: boolean) {
  return startFlow({ kind: "web_sign_in", remember }, ip);
}

/** Settings → Account's "Link <SSO>" for the signed-in account. */
export function startWebSsoLink(userId: string, ip: string | null) {
  return startFlow({ kind: "web_link", userId }, ip);
}

export type AppSsoStart = { handle: string; authUrl: string; expiresAt: Date };

/** The page an app opens in the browser: Marquee's own "continue?" page,
 * which goes on to the provider (see continueAppFlow). */
export function appFlowUrl(publicUrl: string, appKey: string): string {
  return `${publicUrl.replace(/\/+$/, "")}/login/sso/app?key=${encodeURIComponent(appKey)}`;
}

function appStart(result: CoreResult<SsoStart>): CoreResult<AppSsoStart> {
  if (!result.ok) return result;
  const { flow, config } = result;
  return { ok: true, handle: flow.handle!, authUrl: appFlowUrl(config.publicUrl, flow.appKey!), expiresAt: new Date(flow.expiresAt) };
}

export async function startAppSsoSignIn(ip: string | null, deviceName: string | null) {
  return appStart(await startFlow({ kind: "app_sign_in", deviceName }, ip));
}

export async function startAppSsoLink(user: { id: string; username: string }, ip: string | null) {
  return appStart(await startFlow({ kind: "app_link", userId: user.id, username: user.username }, ip));
}

/** "Continue" on an app flow's page: binds this browser and hands back the
 * provider URL. Null when the link is unknown, used or expired. */
export function continueAppFlow(appKey: unknown): { authUrl: string; binding: string } | null {
  const bound = bindAppFlow(appKey);
  return bound ? { authUrl: bound.flow.authUrl, binding: bound.binding } : null;
}

// ── The callback ───────────────────────────────────────────────────────────

export type CallbackOutcome =
  | { kind: "web_sign_in"; ok: true; userId: string; remember: boolean }
  | { kind: "web_link"; ok: true }
  | { kind: "app_sign_in" | "app_link"; ok: true }
  | { kind: SsoPurpose["kind"] | "unknown"; ok: false; code: SsoErrorCode };

/** A failure that also says which fixed message code describes it, for
 * the web redirects (lib/auth/sso/messages.ts). */
type SsoFailure = CoreFailure & { reason: SsoErrorCode };

function refuse(code: CoreErrorCode, reason: SsoErrorCode, name: string): SsoFailure {
  return { ...fail(code, ssoErrorMessage(reason, name)), reason };
}

function reasonOf(failure: CoreFailure): SsoErrorCode {
  if ("reason" in failure) return (failure as SsoFailure).reason;
  return failure.code === "rate_limited" ? "rate_limited" : "failed";
}

/**
 * Handles the provider's redirect back: `state`, `code` (or `error`), and
 * the browser's binding cookie. `sessionUserId` is who this browser is
 * signed in as, if anyone — a web link only completes for that same
 * account.
 */
export async function completeSsoCallback(input: {
  state: string | null;
  code: string | null;
  error: string | null;
  cookie: string | null;
  ip: string | null;
  sessionUserId: string | null;
}): Promise<CallbackOutcome> {
  if (input.ip && !checkRateLimit(`sso:callback:${input.ip}`, CALLBACK_LIMIT, START_WINDOW_MS)) {
    return { kind: "unknown", ok: false, code: "rate_limited" };
  }
  const lookup = takeFlowForCallback(input.state, input.cookie);
  if (lookup.status !== "ok") return { kind: "unknown", ok: false, code: "expired" };
  const { flow } = lookup;
  const kind = flow.purpose.kind;

  const end = (result: SsoFlowResult): CallbackOutcome => {
    finishFlow(flow, result);
    if (!result.ok) return { kind, ok: false, code: reasonOf(result) };
    if (flow.purpose.kind === "web_sign_in") {
      return { kind: "web_sign_in", ok: true, userId: result.userId, remember: flow.purpose.remember };
    }
    return flow.purpose.kind === "web_link" ? { kind: "web_link", ok: true } : { kind: flow.purpose.kind, ok: true };
  };

  const config = await getSsoConfig();
  if (!config || !sameIssuer(config.issuer, flow.issuer) || config.clientId !== flow.clientId) {
    return end(refuse("conflict", "not_configured", config?.name ?? "single sign-on"));
  }
  const name = config.name;

  if (input.error || !input.code) {
    const cancelled = input.error === "access_denied" || input.error === "login_required";
    return end(refuse("forbidden", cancelled ? "cancelled" : "failed", name));
  }
  if (flow.purpose.kind === "web_link" && flow.purpose.userId !== input.sessionUserId) {
    return end(refuse("forbidden", "wrong_account", name));
  }

  let identity: SsoIdentity;
  try {
    identity = await verifiedIdentity(config, flow, input.code);
  } catch (err) {
    console.warn("[sso] sign-in failed:", err instanceof Error ? err.message : err);
    return end(refuse("upstream", "failed", name));
  }

  if (flow.purpose.kind === "web_link" || flow.purpose.kind === "app_link") {
    const linked = await linkSsoIdentity(flow.purpose.userId, identity, config);
    return end(linked.ok ? { ok: true, userId: flow.purpose.userId } : linked);
  }
  const signedIn = await resolveSsoSignIn(identity, config);
  return end(signedIn.ok ? { ok: true, userId: signedIn.user.id } : signedIn);
}

/** The code traded in and the ID token checked; the person it says this is. */
async function verifiedIdentity(config: SsoConfig, flow: SsoFlow, code: string): Promise<SsoIdentity> {
  const discovery = await getDiscovery(config.issuer);
  const client = { clientId: config.clientId, clientSecret: config.clientSecret };
  const tokens = await exchangeCode({
    discovery,
    client,
    code,
    redirectUri: flow.redirectUri,
    codeVerifier: flow.codeVerifier,
  });
  const idClaims = await verifyIdToken(tokens.idToken, { discovery, client, nonce: flow.nonce });
  const userinfo = await fetchUserinfo({ discovery, accessToken: tokens.accessToken, subject: String(idClaims.sub) });
  const identity = identityFromClaims(discovery.issuer, mergeClaims(idClaims, userinfo), config.groupsClaim);
  if (!identity) throw new OidcError("The ID token has no subject.");
  return identity;
}

// ── Accounts ───────────────────────────────────────────────────────────────

async function findLinkedUser(identity: Pick<SsoIdentity, "issuer" | "subject">): Promise<UserRow | null> {
  const [row] = await db
    .select()
    .from(users)
    .where(and(eq(users.ssoIssuer, identity.issuer), eq(users.ssoSubject, identity.subject)))
    .limit(1);
  return row ?? null;
}

async function emailCandidates(email: string) {
  return db
    .select({ id: users.id, role: users.role, ssoLinked: sql<boolean>`${users.ssoSubject} is not null` })
    .from(users)
    .where(sql`lower(${users.username}) = ${email}`)
    .limit(2);
}

async function createSsoMember(identity: SsoIdentity, role: "member" | "trusted"): Promise<UserRow> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const taken = new Set((await db.select({ username: users.username }).from(users)).map((r) => r.username));
    const username = uniqueUsername(identity.preferredUsername, taken);
    const [created] = await db
      .insert(users)
      .values({
        username,
        displayName: identity.displayName,
        passwordHash: null,
        role,
        ssoIssuer: identity.issuer,
        ssoSubject: identity.subject,
      })
      .onConflictDoNothing()
      .returning();
    if (created) return created;
    // Two first sign-ins racing: the second finds the first one's account.
    const existing = await findLinkedUser(identity);
    if (existing) return existing;
  }
  throw new Error("Couldn't find a free username for a new account");
}

export type SsoSignInResult = CoreResult<{ user: UserRow }>;

/** Applies decideSsoSignIn to a verified identity, then the trusted-group
 * promotion. */
export async function resolveSsoSignIn(identity: SsoIdentity, config: SsoConfig): Promise<SsoSignInResult> {
  const policy = config;
  const [linked, candidates] = await Promise.all([
    findLinkedUser(identity),
    config.matchEmail && identity.email && identity.emailVerified ? emailCandidates(identity.email) : Promise.resolve([]),
  ]);
  const decision = decideSsoSignIn({ identity, policy, linkedUserId: linked?.id ?? null, emailCandidates: candidates });

  let user: UserRow;
  switch (decision.action) {
    case "refuse":
      return refuse("forbidden", decision.reason, config.name);
    case "sign_in":
      user = linked!;
      break;
    case "link_email": {
      // Only while that account still has no SSO link.
      const [updated] = await db
        .update(users)
        .set({ ssoIssuer: identity.issuer, ssoSubject: identity.subject })
        .where(and(eq(users.id, decision.userId), isNull(users.ssoSubject)))
        .returning()
        .catch((err) => {
          if (isUniqueViolation(err)) return [];
          throw err;
        });
      const relinked = updated ?? (await findLinkedUser(identity));
      if (!relinked) return refuse("forbidden", "no_account", config.name);
      user = relinked;
      break;
    }
    case "create":
      user = await createSsoMember(identity, shouldPromoteToTrusted("member", identity, policy) ? "trusted" : "member");
      break;
  }

  if (shouldPromoteToTrusted(user.role, identity, policy)) {
    const [promoted] = await db
      .update(users)
      .set({ role: "trusted" })
      .where(and(eq(users.id, user.id), eq(users.role, "member")))
      .returning();
    if (promoted) user = promoted;
  }
  return { ok: true, user };
}

/** Links a verified identity to `userId` (replacing any earlier SSO link of
 * that account). Refused when it's linked to someone else, or when the
 * required group would keep it from signing in anyway. */
export async function linkSsoIdentity(userId: string, identity: SsoIdentity, config: SsoConfig): Promise<CoreResult> {
  const decision = decideSsoSignIn({
    identity,
    policy: { ...config, allowSignup: true, matchEmail: false },
    linkedUserId: null,
    emailCandidates: [],
  });
  if (decision.action === "refuse") return refuse("forbidden", decision.reason, config.name);

  const existing = await findLinkedUser(identity);
  if (existing && existing.id !== userId) return refuse("conflict", "linked_elsewhere", config.name);
  if (existing) return { ok: true };
  const updated = await db
    .update(users)
    .set({ ssoIssuer: identity.issuer, ssoSubject: identity.subject })
    .where(eq(users.id, userId))
    .returning({ id: users.id })
    .catch((err) => {
      if (isUniqueViolation(err)) return null;
      throw err;
    });
  if (updated === null) return refuse("conflict", "linked_elsewhere", config.name);
  if (updated.length === 0) return fail("not_found", "Account not found.");
  return { ok: true };
}

// ── App polls ──────────────────────────────────────────────────────────────

export type SsoPoll<T extends object> = { status: "pending" } | { status: "expired" } | ({ status: "done" } & CoreResult<T>);

function pollAllowed(ip: string | null): boolean {
  return !ip || checkRateLimit(`sso:poll:${ip}`, POLL_LIMIT, START_WINDOW_MS);
}

/** An app's sign-in poll: pending/expired, or the account to issue a token
 * for (read fresh — it may have been removed meanwhile). */
export async function pollAppSsoSignIn(handle: unknown, ip: string | null): Promise<SsoPoll<{ user: UserRow; deviceName: string | null }>> {
  if (!pollAllowed(ip)) return { status: "done", ...fail("rate_limited", RATE_LIMITED) };
  const poll = pollFlowHandle(handle, { kind: "app_sign_in" });
  if (poll.status !== "done") return poll;
  if (!poll.result.ok) return { status: "done", ...poll.result };
  const [user] = await db.select().from(users).where(eq(users.id, poll.result.userId)).limit(1);
  if (!user) return { status: "done", ...fail("forbidden", "This account no longer exists.") };
  const deviceName = poll.flow.purpose.kind === "app_sign_in" ? poll.flow.purpose.deviceName : null;
  return { status: "done", ok: true, user, deviceName };
}

/** An app's link poll, for the account that started it. */
export async function pollAppSsoLink(userId: string, handle: unknown, ip: string | null): Promise<SsoPoll<object>> {
  if (!pollAllowed(ip)) return { status: "done", ...fail("rate_limited", RATE_LIMITED) };
  const poll = pollFlowHandle(handle, { kind: "app_link", userId });
  if (poll.status !== "done") return poll;
  return poll.result.ok ? { status: "done", ok: true } : { status: "done", ...poll.result };
}

// ── Unlinking ──────────────────────────────────────────────────────────────

/** Removes the account's SSO link; refused when that would leave it with no
 * way to sign in. */
export async function unlinkSso(userId: string): Promise<CoreResult> {
  const state = await getLinkState(userId);
  if (!state) return fail("not_found", "Account not found.");
  if (!state.linked.sso) return { ok: true };
  if (
    unlinkWouldLockOut("sso", {
      hasPassword: state.hasPassword,
      plexLinked: state.linked.plex,
      jellyfinLinked: state.linked.jellyfin,
      ssoLinked: true,
    })
  ) {
    return fail("conflict", "Set a password first — without single sign-on, there'd be no way to sign in to this account.");
  }
  await db.update(users).set({ ssoIssuer: null, ssoSubject: null }).where(eq(users.id, userId));
  return { ok: true };
}
