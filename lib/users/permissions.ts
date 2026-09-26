import type { UserRole } from "@/lib/db/schema";

// Per-member permissions: the switches the admin sets in the household
// member editor. The one place that answers "may this account do X" is
// can() below — every page, server action and /api/v1 route asks it rather
// than looking at the role.
//
// The admin always has everything (can() doesn't even look at their
// switches). Everything that's the admin's alone — integrations, household
// accounts, API keys, single sign-on, sign-in settings, jobs, activity —
// isn't a permission at all, so it can't be granted to anyone.
//
// The role stays, for display and for older apps that read it: "member" or
// "trusted" are presets that fill the switches, and a member whose switches
// match neither is shown as "Custom". A "trusted" role always means exactly
// the Trusted preset (see roleForPermissions), so an older app that shows a
// trusted member the review queue never shows more than they may use.

export const PERMISSIONS = [
  "requestMovies",
  "requestTv",
  "request4kMovies",
  "request4kTv",
  "autoApproveMovies",
  "autoApproveTv",
  "autoApprove4kMovies",
  "autoApprove4kTv",
  "advancedRequests",
  "viewRequests",
  "reviewRequests",
  "manageIssues",
  "reportIssues",
  "manageBlocklist",
  "bypassLimits",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Every permission, on or off — what the API sends. */
export type PermissionMap = Record<Permission, boolean>;

const PERMISSION_SET = new Set<string>(PERMISSIONS);

export function isPermission(value: unknown): value is Permission {
  return typeof value === "string" && PERMISSION_SET.has(value);
}

/** What a new account can do, and what "Member" fills in. */
export const MEMBER_PRESET: readonly Permission[] = [
  "requestMovies",
  "requestTv",
  "request4kMovies",
  "request4kTv",
  "reportIssues",
];

/** What "Trusted" fills in: everything a trusted member could do before
 * permissions existed — reviewing requests and problem reports, requests
 * approved straight away, no limits. Not the blocklist (that was the
 * admin's). */
export const TRUSTED_PRESET: readonly Permission[] = [
  ...MEMBER_PRESET,
  "autoApproveMovies",
  "autoApproveTv",
  "autoApprove4kMovies",
  "autoApprove4kTv",
  "advancedRequests",
  "viewRequests",
  "reviewRequests",
  "manageIssues",
  "bypassLimits",
];

export type PermissionPreset = "admin" | "member" | "trusted" | "custom";

/** Anything that can be asked about: a session user, an API user, a row. */
export type PermissionSubject = {
  role: UserRole | string | null | undefined;
  permissions: readonly string[] | null | undefined;
};

/**
 * Whether this account may do `permission`. The admin always may. Reviewing
 * requests means seeing them, so it brings "View other people's requests"
 * along with it. Pure; unit tested.
 */
export function can(user: PermissionSubject | null | undefined, permission: Permission): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  const granted = user.permissions ?? [];
  if (granted.includes(permission)) return true;
  if (permission === "viewRequests") return granted.includes("reviewRequests");
  return false;
}

/** The permission for requesting this kind of title. */
export function requestPermission(mediaType: "movie" | "tv", is4k: boolean): Permission {
  if (mediaType === "movie") return is4k ? "request4kMovies" : "requestMovies";
  return is4k ? "request4kTv" : "requestTv";
}

/** The permission that approves such a request on its own. */
export function autoApprovePermission(mediaType: "movie" | "tv", is4k: boolean): Permission {
  if (mediaType === "movie") return is4k ? "autoApprove4kMovies" : "autoApproveMovies";
  return is4k ? "autoApprove4kTv" : "autoApproveTv";
}

/** Every permission with whether this account has it (can(), so the admin
 * is all true). */
export function permissionMap(user: PermissionSubject): PermissionMap {
  return Object.fromEntries(PERMISSIONS.map((p) => [p, can(user, p)])) as PermissionMap;
}

/** Nothing at all — someone signed out. */
export const NO_PERMISSIONS: PermissionMap = Object.fromEntries(PERMISSIONS.map((p) => [p, false])) as PermissionMap;

/** Stored form: known permissions only, each once, in the canonical order. */
export function normalizePermissions(values: Iterable<string>): Permission[] {
  const set = new Set(values);
  return PERMISSIONS.filter((p) => set.has(p));
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const left = normalizePermissions(a);
  const right = normalizePermissions(b);
  return left.length === right.length && left.every((p, i) => p === right[i]);
}

/** Which preset these switches are — "custom" when neither. The admin is
 * always "admin". */
export function presetFor(user: PermissionSubject): PermissionPreset {
  if (user.role === "admin") return "admin";
  const granted = user.permissions ?? [];
  if (sameSet(granted, TRUSTED_PRESET)) return "trusted";
  if (sameSet(granted, MEMBER_PRESET)) return "member";
  return "custom";
}

export function presetPermissions(preset: "member" | "trusted"): Permission[] {
  return [...(preset === "trusted" ? TRUSTED_PRESET : MEMBER_PRESET)];
}

/** The role a (non-admin) account with these switches is stored with:
 * "trusted" only for exactly the Trusted preset. */
export function roleForPermissions(permissions: readonly string[]): "member" | "trusted" {
  return sameSet(permissions, TRUSTED_PRESET) ? "trusted" : "member";
}

/** A permission change from a client: `{ "reviewRequests": true, ... }`,
 * each key optional (left as it is when missing). Unknown keys and
 * non-boolean values are refused, so a typo doesn't silently do nothing.
 * Pure. */
export function parsePermissionChanges(
  input: unknown,
): { ok: true; changes: Partial<PermissionMap> } | { ok: false; error: string } {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Permissions are an object of switches, like { \"requestTv\": false }." };
  }
  const changes: Partial<PermissionMap> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!isPermission(key)) return { ok: false, error: `There's no permission called “${key.slice(0, 40)}”.` };
    if (typeof value !== "boolean") return { ok: false, error: `“${key}” is true or false.` };
    changes[key] = value;
  }
  return { ok: true, changes };
}

/** `current` with `changes` applied. Pure. */
export function applyPermissionChanges(current: readonly string[], changes: Partial<PermissionMap>): Permission[] {
  const next = new Set<string>(normalizePermissions(current));
  for (const [key, on] of Object.entries(changes)) {
    if (on) next.add(key);
    else next.delete(key);
  }
  return normalizePermissions(next);
}

/** Plain-language labels and descriptions, grouped as the member editor
 * shows them (the apps carry the same words). */
export const PERMISSION_GROUPS: {
  title: string;
  items: { permission: Permission; label: string; description: string }[];
}[] = [
  {
    title: "Requests",
    items: [
      { permission: "requestMovies", label: "Request movies", description: "Ask for movies to be added." },
      { permission: "requestTv", label: "Request TV", description: "Ask for shows, or some of their seasons, to be added." },
      { permission: "request4kMovies", label: "Request 4K movies", description: "Ask for the 4K copy of a movie, once there's a 4K Radarr." },
      { permission: "request4kTv", label: "Request 4K TV", description: "Ask for the 4K copy of a show, once there's a 4K Sonarr." },
      {
        permission: "advancedRequests",
        label: "Advanced request options",
        description: "Pick the server, quality profile, folder and tags when asking for or approving a title.",
      },
      { permission: "bypassLimits", label: "No request limits", description: "Request limits don't apply to them." },
    ],
  },
  {
    title: "Approved straight away",
    items: [
      { permission: "autoApproveMovies", label: "Movies", description: "Their movie requests skip the review queue." },
      { permission: "autoApproveTv", label: "TV", description: "Their TV requests skip the review queue." },
      { permission: "autoApprove4kMovies", label: "4K movies", description: "Their 4K movie requests skip the review queue." },
      { permission: "autoApprove4kTv", label: "4K TV", description: "Their 4K TV requests skip the review queue." },
    ],
  },
  {
    title: "Helping run things",
    items: [
      { permission: "viewRequests", label: "See everyone's requests", description: "The Requests page lists what everyone has asked for." },
      {
        permission: "reviewRequests",
        label: "Review requests",
        description: "Approve, decline and change other people's requests, and handle Can't find and Couldn't add.",
      },
      { permission: "manageIssues", label: "Handle problem reports", description: "See everyone's problem reports and mark them fixed." },
      { permission: "reportIssues", label: "Report problems", description: "Tell you when something's wrong with a title." },
      { permission: "manageBlocklist", label: "Manage the blocklist", description: "Choose titles nobody can request." },
    ],
  },
];

/** "Review requests" — the label the member editor shows. */
export function permissionLabel(permission: Permission): string {
  for (const group of PERMISSION_GROUPS) {
    const item = group.items.find((i) => i.permission === permission);
    if (item) return group.title === "Approved straight away" ? `Auto-approve ${item.label.toLowerCase()}` : item.label;
  }
  return permission;
}

/** The columns a (non-admin) account's switches are stored in: the list
 * itself, the role that goes with it (roleForPermissions), and the old
 * auto-approve flags kept in step for anything that still reads them. */
export function storedPermissionFields(permissions: readonly string[]): {
  permissions: Permission[];
  role: "member" | "trusted";
  autoApproveMovies: boolean;
  autoApproveTv: boolean;
} {
  const normalized = normalizePermissions(permissions);
  return {
    permissions: normalized,
    role: roleForPermissions(normalized),
    autoApproveMovies: normalized.includes("autoApproveMovies"),
    autoApproveTv: normalized.includes("autoApproveTv"),
  };
}
