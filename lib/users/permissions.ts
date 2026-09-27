import type { UserRole } from "@/lib/db/schema";
import type { MessageKey, Translator } from "@/lib/i18n/translator";

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
  t: Translator,
): { ok: true; changes: Partial<PermissionMap> } | { ok: false; error: string } {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: t("server.permissionsShape", { example: '{ "requestTv": false }' }) };
  }
  const changes: Partial<PermissionMap> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!isPermission(key)) return { ok: false, error: t("server.noSuchPermission", { name: key.slice(0, 40) }) };
    if (typeof value !== "boolean") return { ok: false, error: t("server.permissionTrueOrFalse", { name: key }) };
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

/** Plain-language labels and descriptions (message keys, lib/i18n),
 * grouped as the member editor shows them (the apps carry the same words). */
export const PERMISSION_GROUPS: {
  id: "requests" | "autoApprove" | "helping";
  title: MessageKey;
  items: { permission: Permission; label: MessageKey; description: MessageKey }[];
}[] = [
  {
    id: "requests",
    title: "settings.permGroupRequests",
    items: [
      { permission: "requestMovies", label: "settings.permRequestMovies", description: "settings.permRequestMoviesHelp" },
      { permission: "requestTv", label: "settings.permRequestTv", description: "settings.permRequestTvHelp" },
      { permission: "request4kMovies", label: "settings.permRequest4kMovies", description: "settings.permRequest4kMoviesHelp" },
      { permission: "request4kTv", label: "settings.permRequest4kTv", description: "settings.permRequest4kTvHelp" },
      { permission: "advancedRequests", label: "settings.permAdvancedRequests", description: "settings.permAdvancedRequestsHelp" },
      { permission: "bypassLimits", label: "settings.permBypassLimits", description: "settings.permBypassLimitsHelp" },
    ],
  },
  {
    id: "autoApprove",
    title: "settings.permGroupAutoApprove",
    items: [
      { permission: "autoApproveMovies", label: "settings.permAutoApproveMovies", description: "settings.permAutoApproveMoviesHelp" },
      { permission: "autoApproveTv", label: "settings.permAutoApproveTv", description: "settings.permAutoApproveTvHelp" },
      { permission: "autoApprove4kMovies", label: "settings.permAutoApprove4kMovies", description: "settings.permAutoApprove4kMoviesHelp" },
      { permission: "autoApprove4kTv", label: "settings.permAutoApprove4kTv", description: "settings.permAutoApprove4kTvHelp" },
    ],
  },
  {
    id: "helping",
    title: "settings.permGroupHelping",
    items: [
      { permission: "viewRequests", label: "settings.permViewRequests", description: "settings.permViewRequestsHelp" },
      { permission: "reviewRequests", label: "settings.permReviewRequests", description: "settings.permReviewRequestsHelp" },
      { permission: "manageIssues", label: "settings.permManageIssues", description: "settings.permManageIssuesHelp" },
      { permission: "reportIssues", label: "settings.permReportIssues", description: "settings.permReportIssuesHelp" },
      { permission: "manageBlocklist", label: "settings.permManageBlocklist", description: "settings.permManageBlocklistHelp" },
    ],
  },
];

/** A permission's name on its own, out of its group ("Auto-approve 4K
 * movies" where the editor's group says just "4K movies"). */
const PERMISSION_NAMES: Record<Permission, MessageKey> = {
  requestMovies: "settings.permRequestMovies",
  requestTv: "settings.permRequestTv",
  request4kMovies: "settings.permRequest4kMovies",
  request4kTv: "settings.permRequest4kTv",
  autoApproveMovies: "settings.permAutoApproveMoviesName",
  autoApproveTv: "settings.permAutoApproveTvName",
  autoApprove4kMovies: "settings.permAutoApprove4kMoviesName",
  autoApprove4kTv: "settings.permAutoApprove4kTvName",
  advancedRequests: "settings.permAdvancedRequests",
  viewRequests: "settings.permViewRequests",
  reviewRequests: "settings.permReviewRequests",
  manageIssues: "settings.permManageIssues",
  reportIssues: "settings.permReportIssues",
  manageBlocklist: "settings.permManageBlocklist",
  bypassLimits: "settings.permBypassLimits",
};

/** "Review requests" — a permission's name in `t`'s language. */
export function permissionLabel(permission: Permission, t: Translator): string {
  return t(PERMISSION_NAMES[permission]);
}

/** "Member", "Trusted", "Custom", "Admin". */
export const PERMISSION_PRESET_LABELS: Record<PermissionPreset, MessageKey> = {
  admin: "settings.presetAdmin",
  member: "settings.presetMember",
  trusted: "settings.presetTrusted",
  custom: "settings.presetCustom",
};

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
