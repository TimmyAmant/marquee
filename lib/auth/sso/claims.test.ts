import { describe, expect, it } from "vitest";
import {
  decideSsoSignIn,
  groupsFromClaims,
  hasGroup,
  identityFromClaims,
  isEmailVerified,
  shouldPromoteToTrusted,
  type SsoIdentity,
  type SsoPolicy,
} from "./claims";

const ISSUER = "https://auth.example.com/application/o/marquee/";

function identity(overrides: Partial<SsoIdentity> = {}): SsoIdentity {
  return {
    issuer: ISSUER,
    subject: "sub-1",
    email: "anna@example.com",
    emailVerified: true,
    preferredUsername: "anna",
    displayName: "Anna",
    groups: [],
    ...overrides,
  };
}

const closed: SsoPolicy = { allowSignup: false, matchEmail: false, requiredGroup: null, trustedGroup: null };

describe("identityFromClaims", () => {
  it("takes the subject, a lower-cased email, and a username that fits Marquee's rules", () => {
    const id = identityFromClaims(
      ISSUER,
      {
        sub: "abc",
        email: "Anna.Smith@Example.com",
        email_verified: true,
        preferred_username: "Anna Smith!",
        name: "Anna Smith",
        groups: ["family", 3, "admins"],
      },
      "groups",
    );
    expect(id).toEqual({
      issuer: ISSUER,
      subject: "abc",
      email: "anna.smith@example.com",
      emailVerified: true,
      preferredUsername: "Anna.Smith",
      displayName: "Anna Smith",
      groups: ["family", "admins"],
    });
  });

  it("is null without a subject", () => {
    expect(identityFromClaims(ISSUER, { email: "a@b.c" }, "groups")).toBeNull();
    expect(identityFromClaims(ISSUER, { sub: "  " }, "groups")).toBeNull();
  });

  it("only counts an explicitly verified email", () => {
    expect(identityFromClaims(ISSUER, { sub: "a", email: "a@b.c" }, "groups")?.emailVerified).toBe(false);
    expect(identityFromClaims(ISSUER, { sub: "a", email: "a@b.c", email_verified: "false" }, "groups")?.emailVerified).toBe(false);
    expect(identityFromClaims(ISSUER, { sub: "a", email: "a@b.c", email_verified: "true" }, "groups")?.emailVerified).toBe(true);
    // No email, nothing to verify.
    expect(identityFromClaims(ISSUER, { sub: "a", email_verified: true }, "groups")?.emailVerified).toBe(false);
    expect(isEmailVerified(1)).toBe(false);
  });

  it("falls back to the email's local part, then the name, for the username", () => {
    expect(identityFromClaims(ISSUER, { sub: "a", email: "zoe@x.io" }, "groups")?.preferredUsername).toBe("zoe");
    expect(identityFromClaims(ISSUER, { sub: "a", name: "Zoë K" }, "groups")?.preferredUsername).toBe("Zoe.K");
    expect(identityFromClaims(ISSUER, { sub: "a" }, "groups")?.preferredUsername).toBe("user");
  });
});

describe("groups", () => {
  it("reads arrays, strings and dotted paths", () => {
    expect(groupsFromClaims({ groups: ["a", "b"] }, "groups")).toEqual(["a", "b"]);
    expect(groupsFromClaims({ groups: "a b,c" }, "groups")).toEqual(["a", "b", "c"]);
    expect(groupsFromClaims({ realm_access: { roles: ["x"] } }, "realm_access.roles")).toEqual(["x"]);
    expect(groupsFromClaims({ groups: { nope: 1 } }, "groups")).toEqual([]);
    expect(groupsFromClaims({}, "groups")).toEqual([]);
  });

  it("matches a group exactly, ignoring Keycloak's leading slash", () => {
    expect(hasGroup(["/marquee"], "marquee")).toBe(true);
    expect(hasGroup(["marquee"], "/marquee")).toBe(true);
    expect(hasGroup(["marquee-users"], "marquee")).toBe(false);
    expect(hasGroup(["Marquee"], "marquee")).toBe(false);
    expect(hasGroup(["anything"], "")).toBe(false);
  });
});

describe("decideSsoSignIn", () => {
  it("signs in as the linked account", () => {
    expect(decideSsoSignIn({ identity: identity(), policy: closed, linkedUserId: "u1", emailCandidates: [] })).toEqual({
      action: "sign_in",
      userId: "u1",
    });
  });

  it("refuses anyone outside the required group — linked or not", () => {
    const policy = { ...closed, allowSignup: true, requiredGroup: "marquee" };
    expect(decideSsoSignIn({ identity: identity({ groups: ["other"] }), policy, linkedUserId: "u1", emailCandidates: [] })).toEqual({
      action: "refuse",
      reason: "not_allowed",
    });
    expect(decideSsoSignIn({ identity: identity({ groups: ["marquee"] }), policy, linkedUserId: "u1", emailCandidates: [] })).toEqual({
      action: "sign_in",
      userId: "u1",
    });
  });

  it("refuses an unknown identity while new accounts are off, and creates one while they're on", () => {
    expect(decideSsoSignIn({ identity: identity(), policy: closed, linkedUserId: null, emailCandidates: [] })).toEqual({
      action: "refuse",
      reason: "no_account",
    });
    expect(
      decideSsoSignIn({ identity: identity(), policy: { ...closed, allowSignup: true }, linkedUserId: null, emailCandidates: [] }),
    ).toEqual({ action: "create" });
  });

  describe("email matching", () => {
    const member = { id: "m1", role: "member" as const, ssoLinked: false };
    const policy = { ...closed, matchEmail: true };

    it("links the one account whose username is the verified email", () => {
      expect(decideSsoSignIn({ identity: identity(), policy, linkedUserId: null, emailCandidates: [member] })).toEqual({
        action: "link_email",
        userId: "m1",
      });
    });

    it("never when it's off, unverified, ambiguous, the admin, or already linked elsewhere", () => {
      const cases = [
        { identity: identity(), policy: closed, emailCandidates: [member] },
        { identity: identity({ emailVerified: false }), policy, emailCandidates: [member] },
        { identity: identity({ email: null, emailVerified: false }), policy, emailCandidates: [member] },
        { identity: identity(), policy, emailCandidates: [member, { ...member, id: "m2" }] },
        { identity: identity(), policy, emailCandidates: [{ ...member, role: "admin" as const }] },
        { identity: identity(), policy, emailCandidates: [{ ...member, ssoLinked: true }] },
      ];
      for (const c of cases) {
        expect(decideSsoSignIn({ ...c, linkedUserId: null })).toEqual({ action: "refuse", reason: "no_account" });
      }
    });

    it("prefers the existing link over an email match", () => {
      expect(decideSsoSignIn({ identity: identity(), policy, linkedUserId: "u9", emailCandidates: [member] })).toEqual({
        action: "sign_in",
        userId: "u9",
      });
    });
  });
});

describe("shouldPromoteToTrusted", () => {
  const policy = { trustedGroup: "trusted" };
  it("only ever makes a member trusted", () => {
    expect(shouldPromoteToTrusted("member", { groups: ["trusted"] }, policy)).toBe(true);
    expect(shouldPromoteToTrusted("member", { groups: ["family"] }, policy)).toBe(false);
    expect(shouldPromoteToTrusted("admin", { groups: ["trusted"] }, policy)).toBe(false);
    expect(shouldPromoteToTrusted("trusted", { groups: ["trusted"] }, policy)).toBe(false);
    expect(shouldPromoteToTrusted("member", { groups: ["trusted"] }, { trustedGroup: null })).toBe(false);
  });
});
