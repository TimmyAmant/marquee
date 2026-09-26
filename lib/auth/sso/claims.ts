// Pure rules behind "Sign in with <SSO>" (lib/auth/sso/signin.ts does the
// I/O): what a verified OpenID Connect identity says about the person, and
// which Marquee account it becomes. Kept free of the database and the
// network so the security-relevant decisions are unit tested directly
// (claims.test.ts).

import { importedDisplayName, sanitizeUsername } from "@/lib/auth/media-accounts";

/** The parts of a verified identity Marquee uses. */
export type SsoIdentity = {
  issuer: string;
  subject: string;
  /** Lower-cased; null when the provider sent none. */
  email: string | null;
  /** Only an explicit `email_verified: true` counts. */
  emailVerified: boolean;
  /** What a new account's username is made from. */
  preferredUsername: string;
  displayName: string | null;
  groups: string[];
};

type Claims = Record<string, unknown>;

function stringClaim(claims: Claims, key: string): string | null {
  const value = claims[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** `email_verified` is a boolean by the spec; a few providers send the
 * string "true". Anything else — missing included — is unverified. */
export function isEmailVerified(value: unknown): boolean {
  return value === true || value === "true";
}

/**
 * The groups in `claim`: an array of strings (Authentik, Authelia, Pocket
 * ID, Keycloak with a group mapper), or a single string, or a
 * space/comma-separated string. `claim` may be a dotted path into nested
 * objects ("realm_access.roles" for Keycloak roles).
 */
export function groupsFromClaims(claims: Claims, claim: string): string[] {
  let value: unknown = claims;
  for (const part of claim.split(".")) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    value = (value as Claims)[part];
  }
  if (typeof value === "string") return value.split(/[\s,]+/).filter(Boolean);
  if (!Array.isArray(value)) return [];
  return value.filter((g): g is string => typeof g === "string" && g.length > 0);
}

/** Group names compared as the provider writes them, except that a
 * leading "/" (Keycloak's full group path) doesn't matter. */
export function hasGroup(groups: readonly string[], wanted: string): boolean {
  const norm = (g: string) => g.trim().replace(/^\/+/, "");
  const target = norm(wanted);
  return target.length > 0 && groups.some((g) => norm(g) === target);
}

/** The identity in a set of verified claims, or null without a `sub`. */
export function identityFromClaims(issuer: string, claims: Claims, groupsClaim: string): SsoIdentity | null {
  const subject = stringClaim(claims, "sub");
  if (!subject) return null;
  const email = stringClaim(claims, "email")?.toLowerCase() ?? null;
  const name = stringClaim(claims, "name");
  const preferred =
    stringClaim(claims, "preferred_username") ??
    stringClaim(claims, "nickname") ??
    (email ? email.split("@")[0] : null) ??
    name ??
    "user";
  return {
    issuer,
    subject,
    email,
    emailVerified: email !== null && isEmailVerified(claims.email_verified),
    preferredUsername: sanitizeUsername(preferred),
    displayName: importedDisplayName(name, preferred),
    groups: groupsFromClaims(claims, groupsClaim),
  };
}

export type SsoPolicy = {
  allowSignup: boolean;
  matchEmail: boolean;
  requiredGroup: string | null;
  trustedGroup: string | null;
};

/** An existing account whose username is the person's email address. */
export type EmailCandidate = { id: string; role: "admin" | "member" | "trusted"; ssoLinked: boolean };

export type SsoDecision =
  | { action: "sign_in"; userId: string }
  | { action: "link_email"; userId: string }
  | { action: "create" }
  | { action: "refuse"; reason: SsoRefusal };

export type SsoRefusal = "not_allowed" | "no_account";

/**
 * Which account a verified SSO identity signs in as. In order:
 *  0. with a required group set, someone without it is refused — linked
 *     or not, so taking them out of the group in the identity provider
 *     locks them out of Marquee too;
 *  1. the account linked to this issuer + subject;
 *  2. with email matching on, and the provider vouching for the email
 *     (`email_verified: true`), the one account whose username is that
 *     address — unless it's the admin (who links explicitly in Settings)
 *     or already linked to another SSO identity;
 *  3. a new member account when the admin allows it;
 *  4. otherwise refused.
 * Never by username or display name: those are whatever the person typed
 * into the identity provider.
 */
export function decideSsoSignIn(input: {
  identity: SsoIdentity;
  policy: SsoPolicy;
  linkedUserId: string | null;
  /** Accounts whose username equals the identity's email (case-insensitive). */
  emailCandidates: EmailCandidate[];
}): SsoDecision {
  const { identity, policy } = input;
  if (policy.requiredGroup && !hasGroup(identity.groups, policy.requiredGroup)) {
    return { action: "refuse", reason: "not_allowed" };
  }
  if (input.linkedUserId) return { action: "sign_in", userId: input.linkedUserId };
  if (policy.matchEmail && identity.email && identity.emailVerified && input.emailCandidates.length === 1) {
    const [candidate] = input.emailCandidates;
    if (candidate.role !== "admin" && !candidate.ssoLinked) return { action: "link_email", userId: candidate.id };
  }
  if (policy.allowSignup) return { action: "create" };
  return { action: "refuse", reason: "no_account" };
}

/** Whether signing in should make a member "trusted": only ever member →
 * trusted, never anything → admin, and never a demotion. */
export function shouldPromoteToTrusted(
  role: "admin" | "member" | "trusted",
  identity: Pick<SsoIdentity, "groups">,
  policy: Pick<SsoPolicy, "trustedGroup">,
): boolean {
  return role === "member" && policy.trustedGroup !== null && hasGroup(identity.groups, policy.trustedGroup);
}
