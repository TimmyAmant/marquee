import { describe, expect, it } from "vitest";
import {
  decideSignIn,
  importedDisplayName,
  noAccountMessage,
  sanitizeUsername,
  uniqueUsername,
  unlinkWouldLockOut,
  USERNAME_MAX,
} from "./media-accounts";

const admin = { id: "admin-id", linked: false };

describe("decideSignIn", () => {
  it("signs in as the account linked to that Plex/Jellyfin user, whatever else is true", () => {
    for (const provider of ["plex", "jellyfin"] as const) {
      expect(
        decideSignIn({ provider, linkedUserId: "u1", ownsServer: true, admin, signupAllowed: false }),
      ).toEqual({ action: "sign_in", userId: "u1" });
    }
  });

  it("links the server's Plex owner to the admin account while the admin has no Plex link", () => {
    expect(
      decideSignIn({ provider: "plex", linkedUserId: null, ownsServer: true, admin, signupAllowed: false }),
    ).toEqual({ action: "link_admin", userId: "admin-id" });
  });

  it("never links the admin once the admin already has a Plex link", () => {
    expect(
      decideSignIn({
        provider: "plex",
        linkedUserId: null,
        ownsServer: true,
        admin: { id: "admin-id", linked: true },
        signupAllowed: false,
      }),
    ).toEqual({ action: "refuse", message: noAccountMessage("Plex") });
  });

  it("never links the admin for a Plex account that doesn't own the server", () => {
    expect(
      decideSignIn({ provider: "plex", linkedUserId: null, ownsServer: false, admin, signupAllowed: true }),
    ).toEqual({ action: "create" });
  });

  it("has no owner shortcut for Jellyfin", () => {
    expect(
      decideSignIn({ provider: "jellyfin", linkedUserId: null, ownsServer: true, admin, signupAllowed: false }),
    ).toEqual({ action: "refuse", message: noAccountMessage("Jellyfin") });
  });

  it("creates a member when allowed and refuses with the admin message when not", () => {
    const base = { provider: "jellyfin" as const, linkedUserId: null, ownsServer: false, admin };
    expect(decideSignIn({ ...base, signupAllowed: true })).toEqual({ action: "create" });
    expect(decideSignIn({ ...base, signupAllowed: false })).toEqual({
      action: "refuse",
      message: "There's no Marquee account for this Jellyfin account yet. Ask the admin to add you.",
    });
    expect(decideSignIn({ ...base, signupAllowed: false, providerName: "Emby" })).toEqual({
      action: "refuse",
      message: "There's no Marquee account for this Emby account yet. Ask the admin to add you.",
    });
  });

  it("takes no username or email at all, so it can't match on them", () => {
    // The input type is the guarantee; this documents it.
    const input = { provider: "plex" as const, linkedUserId: null, ownsServer: false, admin: null, signupAllowed: true };
    expect(Object.keys(input)).not.toContain("username");
    expect(decideSignIn(input)).toEqual({ action: "create" });
  });
});

describe("sanitizeUsername", () => {
  it("keeps a valid name as it is", () => {
    expect(sanitizeUsername("anna_b.92")).toBe("anna_b.92");
  });

  it("folds accents, turns spaces into dots, and drops other characters", () => {
    expect(sanitizeUsername("Zoë  Müller")).toBe("Zoe.Muller");
    expect(sanitizeUsername("john@example.com")).toBe("johnexample.com");
    expect(sanitizeUsername("  Mom's iPad!  ")).toBe("Moms.iPad");
  });

  it("cuts to the maximum length without a trailing dot", () => {
    const long = sanitizeUsername("a".repeat(31) + ".bcdef");
    expect(long.length).toBeLessThanOrEqual(USERNAME_MAX);
    expect(long.endsWith(".")).toBe(false);
  });

  it("falls back to 'user' when too little is left", () => {
    expect(sanitizeUsername("🎬🍿")).toBe("user");
    expect(sanitizeUsername("Al")).toBe("user");
    expect(sanitizeUsername("")).toBe("user");
  });

  it("always passes the household username rules", () => {
    for (const raw of ["Zoë", "...", "a b c d e f g h i j k l m n o p q r s t", "北京", "x-y-z", "-dash-"]) {
      expect(sanitizeUsername(raw)).toMatch(/^[a-zA-Z0-9_.-]{3,32}$/);
    }
  });
});

describe("uniqueUsername", () => {
  it("keeps a free name", () => {
    expect(uniqueUsername("anna", new Set(["bob"]))).toBe("anna");
  });

  it("appends the first free number, comparing case-insensitively", () => {
    expect(uniqueUsername("anna", new Set(["Anna"]))).toBe("anna2");
    expect(uniqueUsername("anna", new Set(["anna", "anna2", "ANNA3"]))).toBe("anna4");
  });

  it("trims the base so the number still fits", () => {
    const base = "b".repeat(USERNAME_MAX);
    const result = uniqueUsername(base, new Set([base]));
    expect(result).toBe("b".repeat(USERNAME_MAX - 1) + "2");
    expect(result.length).toBe(USERNAME_MAX);
  });
});

describe("importedDisplayName", () => {
  it("keeps a real name, drops a copy of the username or an empty one", () => {
    expect(importedDisplayName("Anna Berg", "anna")).toBe("Anna Berg");
    expect(importedDisplayName("anna", "anna")).toBeNull();
    expect(importedDisplayName("  ", "anna")).toBeNull();
    expect(importedDisplayName(null, "anna")).toBeNull();
  });

  it("cuts to 80 characters", () => {
    expect(importedDisplayName("x".repeat(100), "anna")).toHaveLength(80);
  });
});

describe("unlinkWouldLockOut", () => {
  it("never with a password", () => {
    expect(unlinkWouldLockOut("plex", { hasPassword: true, plexLinked: true, jellyfinLinked: false })).toBe(false);
  });

  it("without a password, only when it's the last link", () => {
    expect(unlinkWouldLockOut("plex", { hasPassword: false, plexLinked: true, jellyfinLinked: false })).toBe(true);
    expect(unlinkWouldLockOut("plex", { hasPassword: false, plexLinked: true, jellyfinLinked: true })).toBe(false);
    expect(unlinkWouldLockOut("jellyfin", { hasPassword: false, plexLinked: false, jellyfinLinked: true })).toBe(true);
  });

  it("counts a single sign-on link as a way in, and guards unlinking it", () => {
    const ssoOnly = { hasPassword: false, plexLinked: false, jellyfinLinked: false, ssoLinked: true };
    expect(unlinkWouldLockOut("sso", ssoOnly)).toBe(true);
    expect(unlinkWouldLockOut("plex", { ...ssoOnly, plexLinked: true })).toBe(false);
    expect(unlinkWouldLockOut("sso", { ...ssoOnly, jellyfinLinked: true })).toBe(false);
    expect(unlinkWouldLockOut("sso", { ...ssoOnly, hasPassword: true })).toBe(false);
  });
});
