import { describe, expect, it } from "vitest";
import { englishT } from "@/lib/i18n/catalog";
import {
  applyPermissionChanges,
  autoApprovePermission,
  can,
  MEMBER_PRESET,
  NO_PERMISSIONS,
  normalizePermissions,
  parsePermissionChanges,
  PERMISSION_GROUPS,
  PERMISSIONS,
  permissionMap,
  presetFor,
  presetPermissions,
  requestPermission,
  roleForPermissions,
  storedPermissionFields,
  TRUSTED_PRESET,
  type Permission,
} from "./permissions";

// The can() matrix: every permission against the admin, each preset, a
// custom member, nobody — plus the presets, the change parsing and the role
// that goes with a set of switches.

const admin = { role: "admin", permissions: [] };
const member = { role: "member", permissions: [...MEMBER_PRESET] };
const trusted = { role: "trusted", permissions: [...TRUSTED_PRESET] };

const MEMBER_CAN = new Set<Permission>(["requestMovies", "requestTv", "request4kMovies", "request4kTv", "reportIssues"]);
const TRUSTED_CANNOT = new Set<Permission>(["manageBlocklist"]);

describe("can()", () => {
  it("gives the admin everything, whatever their switches say", () => {
    for (const p of PERMISSIONS) expect(can(admin, p), p).toBe(true);
    expect(permissionMap(admin)).toEqual(Object.fromEntries(PERMISSIONS.map((p) => [p, true])));
  });

  it("gives a member exactly the Member preset", () => {
    for (const p of PERMISSIONS) expect(can(member, p), p).toBe(MEMBER_CAN.has(p));
  });

  it("gives a trusted member everything but the blocklist", () => {
    for (const p of PERMISSIONS) expect(can(trusted, p), p).toBe(!TRUSTED_CANNOT.has(p));
  });

  it("goes by the switches, not the role", () => {
    const custom = { role: "member", permissions: ["requestMovies", "manageBlocklist"] };
    for (const p of PERMISSIONS) expect(can(custom, p), p).toBe(p === "requestMovies" || p === "manageBlocklist");
    // A "trusted" role with no switches can't do anything.
    for (const p of PERMISSIONS) expect(can({ role: "trusted", permissions: [] }, p), p).toBe(false);
  });

  it("lets reviewing requests bring seeing them along — and nothing else", () => {
    const reviewer = { role: "member", permissions: ["reviewRequests"] };
    expect(can(reviewer, "viewRequests")).toBe(true);
    expect(can(reviewer, "reviewRequests")).toBe(true);
    expect(can(reviewer, "manageIssues")).toBe(false);
    expect(can({ role: "member", permissions: ["viewRequests"] }, "reviewRequests")).toBe(false);
  });

  it("refuses nobody, unknown names and missing lists", () => {
    expect(can(null, "requestMovies")).toBe(false);
    expect(can(undefined, "requestMovies")).toBe(false);
    expect(can({ role: "member", permissions: null }, "requestMovies")).toBe(false);
    expect(can({ role: undefined, permissions: undefined }, "reportIssues")).toBe(false);
    expect(NO_PERMISSIONS.requestMovies).toBe(false);
  });

  it("names the request and auto-approve permission for each kind of title", () => {
    expect(requestPermission("movie", false)).toBe("requestMovies");
    expect(requestPermission("tv", false)).toBe("requestTv");
    expect(requestPermission("movie", true)).toBe("request4kMovies");
    expect(requestPermission("tv", true)).toBe("request4kTv");
    expect(autoApprovePermission("movie", false)).toBe("autoApproveMovies");
    expect(autoApprovePermission("tv", true)).toBe("autoApprove4kTv");
  });
});

describe("presets", () => {
  it("reads the switches as a preset, or custom", () => {
    expect(presetFor(admin)).toBe("admin");
    expect(presetFor(member)).toBe("member");
    expect(presetFor(trusted)).toBe("trusted");
    expect(presetFor({ role: "member", permissions: [...TRUSTED_PRESET].reverse() })).toBe("trusted");
    expect(presetFor({ role: "member", permissions: [...MEMBER_PRESET, "autoApproveMovies"] })).toBe("custom");
    expect(presetFor({ role: "trusted", permissions: [...TRUSTED_PRESET, "manageBlocklist"] })).toBe("custom");
  });

  it("stores the role that goes with the switches: trusted for exactly the Trusted preset", () => {
    expect(roleForPermissions(TRUSTED_PRESET)).toBe("trusted");
    expect(roleForPermissions(MEMBER_PRESET)).toBe("member");
    expect(roleForPermissions([...TRUSTED_PRESET, "manageBlocklist"])).toBe("member");
    expect(roleForPermissions(TRUSTED_PRESET.filter((p) => p !== "bypassLimits"))).toBe("member");
    expect(storedPermissionFields([...MEMBER_PRESET, "autoApproveTv"])).toEqual({
      permissions: normalizePermissions([...MEMBER_PRESET, "autoApproveTv"]),
      role: "member",
      autoApproveMovies: false,
      autoApproveTv: true,
    });
    expect(presetPermissions("trusted")).toEqual([...TRUSTED_PRESET]);
  });

  it("never lets a preset grant the blocklist", () => {
    expect(TRUSTED_PRESET).not.toContain("manageBlocklist");
    expect(MEMBER_PRESET).not.toContain("manageBlocklist");
  });

  it("describes every permission once in the editor's groups", () => {
    const listed = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.permission));
    expect([...listed].sort()).toEqual([...PERMISSIONS].sort());
  });
});

describe("permission changes", () => {
  it("takes known switches with true/false", () => {
    expect(parsePermissionChanges({ requestTv: false, viewRequests: true }, englishT())).toEqual({
      ok: true,
      changes: { requestTv: false, viewRequests: true },
    });
    expect(parsePermissionChanges({}, englishT())).toEqual({ ok: true, changes: {} });
  });

  it("refuses anything else — including trying to name an admin-only setting", () => {
    expect(parsePermissionChanges({ manageSettings: true }, englishT())).toMatchObject({ ok: false });
    expect(parsePermissionChanges({ admin: true }, englishT())).toMatchObject({ ok: false });
    expect(parsePermissionChanges({ requestTv: "yes" }, englishT())).toMatchObject({ ok: false });
    expect(parsePermissionChanges(["requestTv"], englishT())).toMatchObject({ ok: false });
    expect(parsePermissionChanges(null, englishT())).toMatchObject({ ok: false });
  });

  it("applies them in the canonical order, keeping the rest", () => {
    expect(applyPermissionChanges(MEMBER_PRESET, { requestTv: false, manageBlocklist: true })).toEqual([
      "requestMovies",
      "request4kMovies",
      "request4kTv",
      "reportIssues",
      "manageBlocklist",
    ]);
    expect(normalizePermissions(["bogus", "reportIssues", "reportIssues"])).toEqual(["reportIssues"]);
  });
});
