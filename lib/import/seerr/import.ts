import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { arrServers, comments, importLinks, issues, requestBlocklist, requests, users, type ImportLinkKind, type MediaType } from "@/lib/db/schema";
import { fail, type CoreResult } from "@/lib/core-result";
import { failT } from "@/lib/core-failure";
import { getT } from "@/lib/i18n/server";
import { isTmdbConfigured } from "@/lib/tmdb/client";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { storedPermissionFields, type Permission } from "@/lib/users/permissions";
import { importedDisplayName, isUniqueViolation, uniqueUsername } from "@/lib/auth/media-accounts";
import { revalidatePathSafely } from "@/lib/cache/revalidate";
import { kindLabel } from "@/lib/arr/instances";
import {
  fetchSeerrBlocklist,
  fetchSeerrIssue,
  fetchSeerrIssues,
  fetchSeerrMainSettings,
  fetchSeerrMe,
  fetchSeerrRadarrServers,
  fetchSeerrRequests,
  fetchSeerrSonarrServers,
  fetchSeerrStatus,
  fetchSeerrUserQuota,
  fetchSeerrUsers,
  SeerrApiError,
  seerrUrlError,
  type SeerrConnection,
} from "@/lib/import/seerr/client";
import {
  isSeerrAdmin,
  mapSeerrBlocklistItem,
  mapSeerrIssue,
  mapSeerrPermissions,
  mapSeerrQuota,
  mapSeerrRequest,
  matchArrServer,
  matchSeerrUser,
  normalizeSeerrUrl,
  seerrAccountKind,
  seerrDisplayName,
  seerrInstanceKey,
  seerrUsernameFor,
  type MatchableArrServer,
  type MatchableUser,
  type SeerrAccountKind,
} from "@/lib/import/seerr/mapping";
import type { SeerrArrServer, SeerrBlocklistItem, SeerrIssue, SeerrQuota, SeerrRequest, SeerrUser } from "@/lib/import/seerr/types";

// "Import from Seerr" (Settings › General): everything a household
// built up in Seerr, Overseerr or Jellyseerr — accounts, requests, problem
// reports with their comments, the blocklist — read from that server's API
// with its admin key and written into Marquee. Preview first (what would
// happen), then run. Idempotent: what's been imported is remembered in
// import_links, so running it again only picks up what's new. Nothing is
// ever sent to Sonarr/Radarr by an import, and nobody is notified.
//
// Shared by the website's server actions and /api/v1/settings/import/seerr;
// callers verify the actor is the admin.

export type SeerrImportInput = { url: unknown; apiKey: unknown };

export type SeerrImportChoices = {
  users: boolean;
  /** Also set matched accounts' permissions and request limits from Seerr
   * (never the admin's). Off: only new accounts get them. */
  updateExistingUsers: boolean;
  requests: boolean;
  issues: boolean;
  blocklist: boolean;
};

export type SeerrServerInfo = { url: string; version: string | null; applicationTitle: string | null; adminName: string | null };

export type SeerrUserOutcome = "you" | "imported" | "matched" | "new";

export type SeerrUserPreview = {
  seerrId: number;
  name: string;
  kind: SeerrAccountKind;
  /** ADMIN in Seerr. */
  isAdmin: boolean;
  outcome: SeerrUserOutcome;
  /** For "matched"/"imported": the Marquee account's username. */
  matchedTo: string | null;
  matchedBy: "plex" | "jellyfin" | "email" | "username" | "link" | null;
  /** What a new account would get (or a matched one, with updateExistingUsers). */
  permissions: Permission[];
  /** Seerr permissions with no Marquee equivalent, dropped. */
  dropped: string[];
  movieQuotaLimit: number | null;
  movieQuotaDays: number;
  tvQuotaLimit: number | null;
  tvQuotaDays: number;
};

export type SeerrImportWarning = { code: SeerrWarningCode; detail?: string; count?: number };

export type SeerrWarningCode =
  | "tmdb_not_configured"
  | "seerr_admin_is_you"
  | "seerr_admins_trusted"
  | "arr_server_unmatched"
  | "requests_without_requester"
  | "issues_without_reporter"
  | "notifications_not_imported"
  | "local_users_no_password"
  | "links_dropped";

export type SeerrImportPreview = {
  server: SeerrServerInfo;
  tmdbConfigured: boolean;
  users: { total: number; you: number; imported: number; matched: number; new: number; items: SeerrUserPreview[] };
  requests: {
    total: number;
    new: number;
    imported: number;
    pending: number;
    approved: number;
    rejected: number;
    fourK: number;
    withoutRequester: number;
    unmappable: number;
    servers: { name: string; kind: "sonarr" | "radarr"; matchedTo: string | null }[];
  };
  issues: { total: number; new: number; imported: number; comments: number; withoutReporter: number; unmappable: number };
  blocklist: { total: number; new: number; imported: number; unmappable: number };
  warnings: SeerrImportWarning[];
};

export type SeerrImportReport = {
  startedAt: string;
  finishedAt: string;
  server: SeerrServerInfo;
  choices: SeerrImportChoices;
  users: {
    created: { seerrId: number; name: string; username: string; kind: SeerrAccountKind }[];
    matched: { seerrId: number; name: string; username: string; updated: boolean }[];
    skipped: { seerrId: number; name: string; reason: string }[];
  };
  requests: { created: number; skipped: number; failed: { seerrId: number; reason: string }[]; titlesWithoutTmdb: number };
  issues: { created: number; comments: number; skipped: number; failed: { seerrId: number; reason: string }[] };
  blocklist: { created: number; skipped: number; failed: { seerrId: number; reason: string }[] };
  warnings: SeerrImportWarning[];
};

const SOURCE = "seerr" as const;

// ── Connection ──────────────────────────────────────────────────────────

async function parseConnection(input: SeerrImportInput): Promise<CoreResult<{ connection: SeerrConnection }>> {
  const t = await getT();
  const raw = typeof input.url === "string" ? input.url : "";
  const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  const urlError = seerrUrlError(raw, t);
  if (urlError) return fail("invalid", urlError);
  if (!apiKey || apiKey.length > 200) return fail("invalid", t("server.seerrKeyRequired"));
  return { ok: true, connection: { baseUrl: normalizeSeerrUrl(raw), apiKey } };
}

/** A failure to reach or read Seerr, as a message for whoever's importing. */
async function seerrFailure(err: unknown): Promise<CoreResult<never>> {
  if (err instanceof SeerrApiError) {
    if (err.status === 401 || err.status === 403) return await failT("invalid_credentials", "server.seerrKeyRejected");
    if (err.status === 404) return await failT("upstream", "server.seerrNotSeerr");
    return await failT("upstream", "server.seerrUnreachable");
  }
  return await failT("upstream", "server.seerrUnreachable");
}

async function describeServer(connection: SeerrConnection): Promise<CoreResult<{ server: SeerrServerInfo }>> {
  try {
    const [status, me] = await Promise.all([fetchSeerrStatus(connection), fetchSeerrMe(connection)]);
    if (typeof status !== "object" || status === null || typeof me !== "object" || me === null || typeof me.id !== "number") {
      return await failT("upstream", "server.seerrNotSeerr");
    }
    if (!isSeerrAdmin(me)) return await failT("forbidden", "server.seerrKeyNotAdmin");
    const main = await fetchSeerrMainSettings(connection).catch(() => null);
    return {
      ok: true,
      server: {
        url: connection.baseUrl,
        version: typeof status.version === "string" ? status.version : null,
        applicationTitle: typeof main?.applicationTitle === "string" && main.applicationTitle.trim() ? main.applicationTitle.trim() : null,
        adminName: seerrDisplayName(me),
      },
    };
  } catch (err) {
    return await seerrFailure(err);
  }
}

/** "Test": the address answers like Seerr and the key is an admin's. */
export async function testSeerrConnection(input: SeerrImportInput): Promise<CoreResult<{ server: SeerrServerInfo }>> {
  const parsed = await parseConnection(input);
  if (!parsed.ok) return parsed;
  return describeServer(parsed.connection);
}

// ── Reading Seerr ───────────────────────────────────────────────────────

type SeerrData = {
  users: SeerrUser[];
  quotas: Map<number, SeerrQuota | null>;
  requests: SeerrRequest[];
  issues: SeerrIssue[];
  blocklist: SeerrBlocklistItem[];
  radarr: SeerrArrServer[];
  sonarr: SeerrArrServer[];
};

async function readSeerr(connection: SeerrConnection, choices: SeerrImportChoices): Promise<SeerrData> {
  const users = await fetchSeerrUsers(connection);
  const quotas = new Map<number, SeerrQuota | null>();
  if (choices.users) {
    for (const user of users) quotas.set(user.id, await fetchSeerrUserQuota(connection, user.id).catch(() => null));
  }
  const requests = choices.requests ? await fetchSeerrRequests(connection) : [];
  const [radarr, sonarr] =
    choices.requests
      ? await Promise.all([fetchSeerrRadarrServers(connection).catch(() => []), fetchSeerrSonarrServers(connection).catch(() => [])])
      : [[], []];
  let issues: SeerrIssue[] = [];
  if (choices.issues) {
    const listed = await fetchSeerrIssues(connection);
    // Seerr's listing carries each report's comments but not who wrote
    // them (3.4.1); the report on its own does. So each is read on its own
    // unless the listing already says.
    const complete = (issue: SeerrIssue) => Array.isArray(issue?.comments) && issue.comments.every((c) => c?.user && typeof c.user.id === "number");
    issues = await Promise.all(listed.map((issue) => (complete(issue) ? issue : fetchSeerrIssue(connection, issue.id).catch(() => issue))));
  }
  const blocklist = choices.blocklist ? await fetchSeerrBlocklist(connection) : [];
  return {
    users: users.filter((u) => u && typeof u.id === "number"),
    quotas,
    requests: requests.filter((r) => r && typeof r.id === "number"),
    issues: issues.filter((i) => i && typeof i.id === "number"),
    blocklist: blocklist.filter((b) => b && typeof b.id === "number"),
    radarr: Array.isArray(radarr) ? radarr : [],
    sonarr: Array.isArray(sonarr) ? sonarr : [],
  };
}

// ── What's already here ─────────────────────────────────────────────────

/** Links for one instance and kind whose target rows still exist; links to
 * rows since deleted are removed (their things get imported again). */
async function liveLinks(instance: string, kind: ImportLinkKind): Promise<{ links: Map<number, string>; dropped: number }> {
  const rows = await db
    .select({ id: importLinks.id, sourceId: importLinks.sourceId, targetId: importLinks.targetId })
    .from(importLinks)
    .where(and(eq(importLinks.source, SOURCE), eq(importLinks.instance, instance), eq(importLinks.kind, kind)));
  if (rows.length === 0) return { links: new Map(), dropped: 0 };
  const targets = rows.map((r) => r.targetId);
  const table = { user: users, request: requests, issue: issues, comment: comments, blocklist: requestBlocklist }[kind];
  const existing = new Set((await db.select({ id: table.id }).from(table).where(inArray(table.id, targets))).map((r) => r.id));
  const stale = rows.filter((r) => !existing.has(r.targetId));
  if (stale.length > 0) await db.delete(importLinks).where(inArray(importLinks.id, stale.map((r) => r.id)));
  return { links: new Map(rows.filter((r) => existing.has(r.targetId)).map((r) => [r.sourceId, r.targetId])), dropped: stale.length };
}

async function link(instance: string, kind: ImportLinkKind, sourceId: number, targetId: string): Promise<void> {
  await db.insert(importLinks).values({ source: SOURCE, instance, kind, sourceId, targetId }).onConflictDoNothing();
}

type UserResolution = {
  seerr: SeerrUser;
  preview: SeerrUserPreview;
  /** The Marquee account it is (null for "new" until created). */
  marqueeId: string | null;
};

/**
 * Which Marquee account each Seerr account is. Seerr's ADMIN accounts are
 * the Marquee admin (the one importing) unless one is linked or matched by
 * Plex/Jellyfin id to another existing account — then that account, with
 * the Trusted preset; an import never makes a second admin.
 */
async function resolveUsers(
  adminUserId: string,
  instance: string,
  data: SeerrData,
): Promise<{ resolved: Map<number, UserResolution>; dropped: number }> {
  const [candidates, { links, dropped }] = await Promise.all([
    db.select({ id: users.id, username: users.username, role: users.role, plexUserId: users.plexUserId, jellyfinUserId: users.jellyfinUserId }).from(users),
    liveLinks(instance, "user"),
  ]);
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const resolved = new Map<number, UserResolution>();
  for (const seerr of data.users) {
    const { permissions, dropped: droppedPermissions } = mapSeerrPermissions(seerr.permissions ?? 0);
    const quota = mapSeerrQuota(data.quotas.get(seerr.id) ?? null, seerr);
    const base: Omit<SeerrUserPreview, "outcome" | "matchedTo" | "matchedBy"> = {
      seerrId: seerr.id,
      name: seerrDisplayName(seerr),
      kind: seerrAccountKind(seerr),
      isAdmin: isSeerrAdmin(seerr),
      permissions,
      dropped: droppedPermissions,
      ...quota,
    };
    const linked = links.get(seerr.id);
    const linkedUser = linked ? byId.get(linked) : undefined;
    let marqueeId: string | null = null;
    let outcome: SeerrUserOutcome;
    let matchedTo: MatchableUser | null = null;
    let matchedBy: SeerrUserPreview["matchedBy"] = null;
    if (linkedUser) {
      marqueeId = linkedUser.id;
      matchedTo = linkedUser;
      matchedBy = "link";
      outcome = linkedUser.id === adminUserId ? "you" : "imported";
    } else {
      const match = matchSeerrUser(seerr, candidates);
      // The Seerr owner is you — unless their Plex/Jellyfin account is
      // already someone else's Marquee account.
      const strong = match && (match.by === "plex" || match.by === "jellyfin");
      if (base.isAdmin && !strong) {
        marqueeId = adminUserId;
        outcome = "you";
      } else if (match) {
        marqueeId = match.user.id;
        matchedTo = match.user;
        matchedBy = match.by;
        outcome = match.user.id === adminUserId ? "you" : "matched";
      } else {
        outcome = "new";
      }
    }
    if (outcome === "you" && !matchedTo) matchedTo = byId.get(adminUserId) ?? null;
    resolved.set(seerr.id, {
      seerr,
      marqueeId,
      preview: { ...base, outcome, matchedTo: matchedTo?.username ?? null, matchedBy },
    });
  }
  return { resolved, dropped };
}

/** The admin's Sonarr/Radarr servers, just what matching needs — their
 * keys stay encrypted. */
async function marqueeArrServers(adminUserId: string): Promise<MatchableArrServer[]> {
  return db
    .select({ id: arrServers.id, name: arrServers.name, baseUrl: arrServers.baseUrl, kind: arrServers.kind, is4k: arrServers.is4k })
    .from(arrServers)
    .where(eq(arrServers.userId, adminUserId));
}

function sameSeasons(a: number[] | null, b: number[] | null): boolean {
  if (a === null || b === null) return a === b;
  return a.length === b.length && a.every((n, i) => n === b[i]);
}

// ── Preview ─────────────────────────────────────────────────────────────

const ALL: SeerrImportChoices = { users: true, updateExistingUsers: false, requests: true, issues: true, blocklist: true };

export async function previewSeerrImport(adminUserId: string, input: SeerrImportInput): Promise<CoreResult<{ preview: SeerrImportPreview }>> {
  const parsed = await parseConnection(input);
  if (!parsed.ok) return parsed;
  const { connection } = parsed;
  const described = await describeServer(connection);
  if (!described.ok) return described;

  let data: SeerrData;
  try {
    data = await readSeerr(connection, ALL);
  } catch (err) {
    return await seerrFailure(err);
  }
  const instance = seerrInstanceKey(connection.baseUrl);
  const warnings: SeerrImportWarning[] = [];
  const tmdbConfigured = await isTmdbConfigured();
  if (!tmdbConfigured) warnings.push({ code: "tmdb_not_configured" });

  // Accounts.
  const { resolved, dropped: droppedUserLinks } = await resolveUsers(adminUserId, instance, data);
  const items = [...resolved.values()].map((r) => r.preview);
  const count = (outcome: SeerrUserOutcome) => items.filter((i) => i.outcome === outcome).length;
  if (items.some((i) => i.isAdmin && i.outcome === "you")) warnings.push({ code: "seerr_admin_is_you" });
  const trustedAdmins = items.filter((i) => i.isAdmin && i.outcome !== "you").length;
  if (trustedAdmins > 0) warnings.push({ code: "seerr_admins_trusted", count: trustedAdmins });
  const localNew = items.filter((i) => i.outcome === "new" && i.kind === "local").length;
  if (localNew > 0) warnings.push({ code: "local_users_no_password", count: localNew });

  // Requests.
  const [requestLinks, servers] = await Promise.all([liveLinks(instance, "request"), marqueeArrServers(adminUserId)]);
  const requestStats = { total: data.requests.length, new: 0, imported: 0, pending: 0, approved: 0, rejected: 0, fourK: 0, withoutRequester: 0, unmappable: 0 };
  for (const seerr of data.requests) {
    if (requestLinks.links.has(seerr.id)) {
      requestStats.imported++;
      continue;
    }
    const mapped = mapSeerrRequest(seerr);
    if (!mapped.ok) {
      requestStats.unmappable++;
      continue;
    }
    const requester = seerr.requestedBy ? resolved.get(seerr.requestedBy.id) : undefined;
    if (!requester) {
      requestStats.withoutRequester++;
      continue;
    }
    requestStats.new++;
    requestStats[mapped.request.status]++;
    if (mapped.request.is4k) requestStats.fourK++;
  }
  if (requestStats.withoutRequester > 0) warnings.push({ code: "requests_without_requester", count: requestStats.withoutRequester });
  const seerrServers = [
    ...data.sonarr.map((s) => ({ seerr: s, kind: "sonarr" as const })),
    ...data.radarr.map((s) => ({ seerr: s, kind: "radarr" as const })),
  ].map(({ seerr, kind }) => {
    const match = matchArrServer(seerr, kind, servers);
    return { name: seerr.name?.trim() || `${kindLabel(kind)} ${seerr.id}`, kind, matchedTo: match?.name ?? null };
  });
  for (const server of seerrServers) if (!server.matchedTo) warnings.push({ code: "arr_server_unmatched", detail: server.name });

  // Problem reports.
  const issueLinks = await liveLinks(instance, "issue");
  const issueStats = { total: data.issues.length, new: 0, imported: 0, comments: 0, withoutReporter: 0, unmappable: 0 };
  for (const seerr of data.issues) {
    if (issueLinks.links.has(seerr.id)) {
      issueStats.imported++;
      continue;
    }
    const mapped = mapSeerrIssue(seerr);
    if (!mapped.ok) {
      issueStats.unmappable++;
      continue;
    }
    const reporter = seerr.createdBy ? resolved.get(seerr.createdBy.id) : undefined;
    if (!reporter) {
      issueStats.withoutReporter++;
      continue;
    }
    issueStats.new++;
    issueStats.comments += mapped.issue.comments.length;
  }
  if (issueStats.withoutReporter > 0) warnings.push({ code: "issues_without_reporter", count: issueStats.withoutReporter });

  // Blocklist.
  const blockLinks = await liveLinks(instance, "blocklist");
  const blockStats = { total: data.blocklist.length, new: 0, imported: 0, unmappable: 0 };
  for (const seerr of data.blocklist) {
    if (blockLinks.links.has(seerr.id)) blockStats.imported++;
    else if (mapSeerrBlocklistItem(seerr)) blockStats.new++;
    else blockStats.unmappable++;
  }

  const droppedLinks = droppedUserLinks + requestLinks.dropped + issueLinks.dropped + blockLinks.dropped;
  if (droppedLinks > 0) warnings.push({ code: "links_dropped", count: droppedLinks });
  warnings.push({ code: "notifications_not_imported" });

  return {
    ok: true,
    preview: {
      server: described.server,
      tmdbConfigured,
      users: { total: items.length, you: count("you"), imported: count("imported"), matched: count("matched"), new: count("new"), items },
      requests: { ...requestStats, servers: seerrServers },
      issues: issueStats,
      blocklist: blockStats,
      warnings,
    },
  };
}

// ── Run ─────────────────────────────────────────────────────────────────

export type SeerrImportPhase = "connecting" | "users" | "requests" | "issues" | "blocklist" | "done";

export type SeerrImportProgress = (phase: SeerrImportPhase, done: number, total: number) => void;

export function parseSeerrImportChoices(input: Record<string, unknown>): SeerrImportChoices {
  const flag = (key: keyof SeerrImportChoices, fallback: boolean) => (typeof input[key] === "boolean" ? (input[key] as boolean) : fallback);
  return {
    users: flag("users", true),
    updateExistingUsers: flag("updateExistingUsers", false),
    requests: flag("requests", true),
    issues: flag("issues", true),
    blocklist: flag("blocklist", true),
  };
}

/** A title's name and poster for a request or report; a placeholder when
 * TMDb doesn't know it any more (the report counts these). */
async function titleFor(mediaType: MediaType, tmdbId: number): Promise<{ name: string; posterPath: string | null; known: boolean }> {
  const title = await getOrFetchTitle(mediaType, tmdbId).catch(() => null);
  if (title) return { name: title.name, posterPath: title.posterPath, known: true };
  return { name: `TMDb ${mediaType === "movie" ? "movie" : "series"} #${tmdbId}`, posterPath: null, known: false };
}

async function createMarqueeUser(resolution: UserResolution): Promise<{ id: string; username: string }> {
  const { seerr, preview } = resolution;
  const base = seerrUsernameFor(seerr);
  const stored = storedPermissionFields(preview.permissions);
  let linkColumn: { plexUserId?: string; jellyfinUserId?: string } =
    preview.kind === "plex" && seerr.plexId != null
      ? { plexUserId: String(seerr.plexId) }
      : preview.kind === "jellyfin" && seerr.jellyfinUserId
        ? { jellyfinUserId: String(seerr.jellyfinUserId) }
        : {};
  for (let attempt = 0; attempt < 5; attempt++) {
    const taken = new Set((await db.select({ username: users.username }).from(users)).map((r) => r.username));
    const username = uniqueUsername(base, taken);
    try {
      const [created] = await db
        .insert(users)
        .values({
          username,
          displayName: importedDisplayName(preview.name, username),
          passwordHash: null,
          ...stored,
          movieQuotaLimit: preview.movieQuotaLimit,
          movieQuotaDays: preview.movieQuotaDays,
          tvQuotaLimit: preview.tvQuotaLimit,
          tvQuotaDays: preview.tvQuotaDays,
          ...linkColumn,
        })
        .returning({ id: users.id, username: users.username });
      return created;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // The username was taken in the meantime, or the Plex/Jellyfin
      // account got linked to someone else since the preview: try again,
      // the second time without the link.
      if (attempt >= 1) linkColumn = {};
    }
  }
  throw new Error("Couldn't find a free username for the imported account");
}

export async function runSeerrImport(
  adminUserId: string,
  input: SeerrImportInput,
  choices: SeerrImportChoices,
  progress: SeerrImportProgress = () => undefined,
): Promise<CoreResult<{ report: SeerrImportReport }>> {
  const startedAt = new Date();
  if (!choices.users && !choices.requests && !choices.issues && !choices.blocklist) return await failT("invalid", "server.seerrNothingChosen");
  const parsed = await parseConnection(input);
  if (!parsed.ok) return parsed;
  const { connection } = parsed;
  progress("connecting", 0, 0);
  const described = await describeServer(connection);
  if (!described.ok) return described;
  if ((choices.requests || choices.issues) && !(await isTmdbConfigured())) return await failT("conflict", "server.seerrTmdbRequired");

  let data: SeerrData;
  try {
    data = await readSeerr(connection, choices);
  } catch (err) {
    return await seerrFailure(err);
  }
  const instance = seerrInstanceKey(connection.baseUrl);
  const warnings: SeerrImportWarning[] = [];
  const report: SeerrImportReport = {
    startedAt: startedAt.toISOString(),
    finishedAt: "",
    server: described.server,
    choices,
    users: { created: [], matched: [], skipped: [] },
    requests: { created: 0, skipped: 0, failed: [], titlesWithoutTmdb: 0 },
    issues: { created: 0, comments: 0, skipped: 0, failed: [] },
    blocklist: { created: 0, skipped: 0, failed: [] },
    warnings,
  };

  // Accounts — resolved even when not chosen, so requests and reports can
  // find their people among the accounts already here.
  const { resolved, dropped } = await resolveUsers(adminUserId, instance, data);
  let droppedLinks = dropped;
  const list = [...resolved.values()];
  progress("users", 0, list.length);
  let doneUsers = 0;
  for (const resolution of list) {
    const { preview } = resolution;
    if (preview.outcome === "new") {
      if (choices.users) {
        const created = await createMarqueeUser(resolution);
        resolution.marqueeId = created.id;
        await link(instance, "user", preview.seerrId, created.id);
        report.users.created.push({ seerrId: preview.seerrId, name: preview.name, username: created.username, kind: preview.kind });
      } else {
        report.users.skipped.push({ seerrId: preview.seerrId, name: preview.name, reason: "not_chosen" });
      }
    } else if (resolution.marqueeId) {
      const isAdmin = resolution.marqueeId === adminUserId;
      let updated = false;
      if (choices.users && choices.updateExistingUsers && !isAdmin) {
        await db
          .update(users)
          .set({
            ...storedPermissionFields(preview.permissions),
            movieQuotaLimit: preview.movieQuotaLimit,
            movieQuotaDays: preview.movieQuotaDays,
            tvQuotaLimit: preview.tvQuotaLimit,
            tvQuotaDays: preview.tvQuotaDays,
          })
          .where(and(eq(users.id, resolution.marqueeId), eq(users.role, "member")));
        updated = true;
      }
      if (choices.users && preview.matchedBy !== "link") await link(instance, "user", preview.seerrId, resolution.marqueeId);
      report.users.matched.push({ seerrId: preview.seerrId, name: preview.name, username: preview.matchedTo ?? "", updated });
    }
    progress("users", ++doneUsers, list.length);
  }
  if (list.some((r) => r.preview.isAdmin && r.marqueeId === adminUserId)) warnings.push({ code: "seerr_admin_is_you" });
  const trustedAdmins = list.filter((r) => r.preview.isAdmin && r.marqueeId !== adminUserId && r.marqueeId).length;
  if (trustedAdmins > 0) warnings.push({ code: "seerr_admins_trusted", count: trustedAdmins });
  const localCreated = report.users.created.filter((u) => u.kind === "local").length;
  if (localCreated > 0) warnings.push({ code: "local_users_no_password", count: localCreated });
  const marqueeIdOf = (seerr: SeerrUser | null | undefined): string | null => (seerr ? (resolved.get(seerr.id)?.marqueeId ?? null) : null);

  // Requests.
  if (choices.requests) {
    const [{ links, dropped: droppedRequests }, servers] = await Promise.all([liveLinks(instance, "request"), marqueeArrServers(adminUserId)]);
    droppedLinks += droppedRequests;
    const unmatchedServers = new Set<string>();
    const ordered = [...data.requests].sort((a, b) => a.id - b.id);
    progress("requests", 0, ordered.length);
    let done = 0;
    for (const seerr of ordered) {
      try {
        if (links.has(seerr.id)) {
          report.requests.skipped++;
          continue;
        }
        const mapped = mapSeerrRequest(seerr);
        if (!mapped.ok) {
          report.requests.failed.push({ seerrId: seerr.id, reason: mapped.reason });
          continue;
        }
        const requesterId = marqueeIdOf(seerr.requestedBy);
        if (!requesterId) {
          report.requests.failed.push({ seerrId: seerr.id, reason: "requester_missing" });
          continue;
        }
        const r = mapped.request;
        // The same request already here (a first import before links
        // existed, or one made by hand): remembered, not repeated.
        const existing = await db
          .select({ id: requests.id, seasons: requests.seasons })
          .from(requests)
          .where(
            and(
              eq(requests.requestedByUserId, requesterId),
              eq(requests.mediaType, r.mediaType),
              eq(requests.tmdbId, r.tmdbId),
              eq(requests.is4k, r.is4k),
              eq(requests.status, r.status),
            ),
          );
        const same = existing.find((e) => sameSeasons(e.seasons, r.seasons));
        if (same) {
          await link(instance, "request", seerr.id, same.id);
          report.requests.skipped++;
          continue;
        }
        const title = await titleFor(r.mediaType, r.tmdbId);
        if (!title.known) report.requests.titlesWithoutTmdb++;
        const seerrServer = (r.mediaType === "movie" ? data.radarr : data.sonarr).find((s) => s.id === r.serverId) ?? null;
        const kind = r.mediaType === "movie" ? "radarr" : "sonarr";
        const server = seerrServer ? matchArrServer(seerrServer, kind, servers) : null;
        if (seerrServer && !server) unmatchedServers.add(seerrServer.name?.trim() || `${kind} ${seerrServer.id}`);
        const reviewed = r.status !== "pending";
        const [inserted] = await db
          .insert(requests)
          .values({
            requestedByUserId: requesterId,
            mediaType: r.mediaType,
            tmdbId: r.tmdbId,
            title: title.name,
            posterPath: title.posterPath,
            status: r.status,
            reviewedByUserId: reviewed ? (marqueeIdOf(seerr.modifiedBy) ?? adminUserId) : null,
            reviewedAt: reviewed ? r.reviewedAt : null,
            createdAt: r.createdAt,
            seasons: r.seasons,
            is4k: r.is4k,
            arrServerId: server?.id ?? null,
            arrServerName: server?.name ?? seerrServer?.name?.trim() ?? null,
            arrQualityProfileId: seerrServer ? r.profileId : null,
            arrRootFolderPath: seerrServer ? r.rootFolder : null,
            arrTags: seerrServer && r.tags && r.tags.length > 0 ? r.tags : null,
          })
          // Two pending requests for one title by one person can't both
          // exist (requests_pending_unique_idx): the one here wins.
          .onConflictDoNothing()
          .returning({ id: requests.id });
        if (!inserted) {
          report.requests.skipped++;
          continue;
        }
        await link(instance, "request", seerr.id, inserted.id);
        report.requests.created++;
      } catch (err) {
        console.error(`[seerr-import] request ${seerr.id}:`, err);
        report.requests.failed.push({ seerrId: seerr.id, reason: "error" });
      } finally {
        progress("requests", ++done, ordered.length);
      }
    }
    for (const name of unmatchedServers) warnings.push({ code: "arr_server_unmatched", detail: name });
    const missing = report.requests.failed.filter((f) => f.reason === "requester_missing").length;
    if (missing > 0) warnings.push({ code: "requests_without_requester", count: missing });
  }

  // Problem reports and their comments.
  if (choices.issues) {
    const { links, dropped: droppedIssues } = await liveLinks(instance, "issue");
    droppedLinks += droppedIssues;
    const ordered = [...data.issues].sort((a, b) => a.id - b.id);
    progress("issues", 0, ordered.length);
    let done = 0;
    for (const seerr of ordered) {
      try {
        if (links.has(seerr.id)) {
          report.issues.skipped++;
          continue;
        }
        const mapped = mapSeerrIssue(seerr);
        if (!mapped.ok) {
          report.issues.failed.push({ seerrId: seerr.id, reason: mapped.reason });
          continue;
        }
        const reporterId = marqueeIdOf(seerr.createdBy);
        if (!reporterId) {
          report.issues.failed.push({ seerrId: seerr.id, reason: "reporter_missing" });
          continue;
        }
        const i = mapped.issue;
        const [existing] = await db
          .select({ id: issues.id })
          .from(issues)
          .where(
            and(
              eq(issues.reportedByUserId, reporterId),
              eq(issues.mediaType, i.mediaType),
              eq(issues.tmdbId, i.tmdbId),
              eq(issues.kind, i.kind),
              eq(issues.createdAt, i.createdAt),
            ),
          )
          .limit(1);
        if (existing) {
          await link(instance, "issue", seerr.id, existing.id);
          report.issues.skipped++;
          continue;
        }
        const title = await titleFor(i.mediaType, i.tmdbId);
        const [inserted] = await db
          .insert(issues)
          .values({
            reportedByUserId: reporterId,
            mediaType: i.mediaType,
            tmdbId: i.tmdbId,
            title: title.name,
            posterPath: title.posterPath,
            seasonNumber: i.seasonNumber,
            episodeNumber: i.episodeNumber,
            kind: i.kind,
            message: i.message,
            status: i.status,
            resolvedByUserId: i.status === "resolved" ? (marqueeIdOf(seerr.modifiedBy) ?? adminUserId) : null,
            resolvedAt: i.resolvedAt,
            createdAt: i.createdAt,
          })
          .returning({ id: issues.id });
        await link(instance, "issue", seerr.id, inserted.id);
        report.issues.created++;
        for (const comment of i.comments) {
          const authorId = comment.authorSeerrId !== null ? (resolved.get(comment.authorSeerrId)?.marqueeId ?? null) : null;
          if (!authorId) continue;
          const [created] = await db
            .insert(comments)
            .values({ issueId: inserted.id, authorUserId: authorId, body: comment.body.slice(0, 2000), createdAt: comment.createdAt })
            .returning({ id: comments.id });
          await link(instance, "comment", comment.id, created.id);
          report.issues.comments++;
        }
      } catch (err) {
        console.error(`[seerr-import] issue ${seerr.id}:`, err);
        report.issues.failed.push({ seerrId: seerr.id, reason: "error" });
      } finally {
        progress("issues", ++done, ordered.length);
      }
    }
    const missing = report.issues.failed.filter((f) => f.reason === "reporter_missing").length;
    if (missing > 0) warnings.push({ code: "issues_without_reporter", count: missing });
  }

  // Blocklist.
  if (choices.blocklist) {
    const { links, dropped: droppedBlocks } = await liveLinks(instance, "blocklist");
    droppedLinks += droppedBlocks;
    progress("blocklist", 0, data.blocklist.length);
    let done = 0;
    for (const seerr of data.blocklist) {
      try {
        if (links.has(seerr.id)) {
          report.blocklist.skipped++;
          continue;
        }
        const item = mapSeerrBlocklistItem(seerr);
        if (!item) {
          report.blocklist.failed.push({ seerrId: seerr.id, reason: "no_media" });
          continue;
        }
        const [inserted] = await db
          .insert(requestBlocklist)
          .values({ kind: "title", mediaType: item.mediaType, tmdbId: item.tmdbId, title: item.title })
          .onConflictDoNothing()
          .returning({ id: requestBlocklist.id });
        if (inserted) {
          await link(instance, "blocklist", seerr.id, inserted.id);
          report.blocklist.created++;
          continue;
        }
        const [existing] = await db
          .select({ id: requestBlocklist.id })
          .from(requestBlocklist)
          .where(and(eq(requestBlocklist.kind, "title"), eq(requestBlocklist.mediaType, item.mediaType), eq(requestBlocklist.tmdbId, item.tmdbId)))
          .limit(1);
        if (existing) await link(instance, "blocklist", seerr.id, existing.id);
        report.blocklist.skipped++;
      } catch (err) {
        console.error(`[seerr-import] blocklist ${seerr.id}:`, err);
        report.blocklist.failed.push({ seerrId: seerr.id, reason: "error" });
      } finally {
        progress("blocklist", ++done, data.blocklist.length);
      }
    }
  }

  if (droppedLinks > 0) warnings.push({ code: "links_dropped", count: droppedLinks });
  warnings.push({ code: "notifications_not_imported" });
  report.finishedAt = new Date().toISOString();
  progress("done", 1, 1);
  revalidatePathSafely("/requests");
  revalidatePathSafely("/settings", "layout");
  return { ok: true, report };
}

// ── Jobs ────────────────────────────────────────────────────────────────

export type SeerrImportJob = {
  id: string;
  state: "running" | "done" | "failed";
  phase: SeerrImportPhase;
  done: number;
  total: number;
  startedAt: string;
  finishedAt: string | null;
  report: SeerrImportReport | null;
  error: string | null;
};

declare global {
  var __marqueeSeerrImports: Map<string, SeerrImportJob> | undefined;
}

/** In memory only: an import runs for minutes at most, and its report is
 * downloaded from the page that started it. Kept an hour after finishing. */
const jobs: Map<string, SeerrImportJob> = (globalThis.__marqueeSeerrImports ??= new Map());
const JOB_TTL_MS = 60 * 60 * 1000;

function pruneJobs(now = Date.now()): void {
  for (const [id, job] of jobs) {
    if (job.finishedAt && now - new Date(job.finishedAt).getTime() > JOB_TTL_MS) jobs.delete(id);
  }
}

export function getSeerrImportJob(id: unknown): SeerrImportJob | null {
  pruneJobs();
  return typeof id === "string" ? (jobs.get(id) ?? null) : null;
}

/** Starts an import in the background and answers its id straight away;
 * one at a time. The address and key are held only by the running job. */
export async function startSeerrImport(
  adminUserId: string,
  input: SeerrImportInput,
  choices: SeerrImportChoices,
): Promise<CoreResult<{ job: SeerrImportJob }>> {
  pruneJobs();
  if ([...jobs.values()].some((job) => job.state === "running")) return await failT("conflict", "server.seerrImportRunning");
  const parsed = await parseConnection(input);
  if (!parsed.ok) return parsed;
  if (!choices.users && !choices.requests && !choices.issues && !choices.blocklist) return await failT("invalid", "server.seerrNothingChosen");

  const job: SeerrImportJob = {
    id: crypto.randomUUID(),
    state: "running",
    phase: "connecting",
    done: 0,
    total: 0,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    report: null,
    error: null,
  };
  jobs.set(job.id, job);
  void runSeerrImport(adminUserId, { url: parsed.connection.baseUrl, apiKey: parsed.connection.apiKey }, choices, (phase, done, total) => {
    job.phase = phase;
    job.done = done;
    job.total = total;
  })
    .then((result) => {
      if (result.ok) {
        job.state = "done";
        job.report = result.report;
      } else {
        job.state = "failed";
        job.error = result.error;
      }
    })
    .catch((err) => {
      console.error("[seerr-import] failed:", err);
      job.state = "failed";
      job.error = "The import stopped unexpectedly. Check the server log.";
    })
    .finally(() => {
      job.finishedAt = new Date().toISOString();
      if (job.phase !== "done") job.phase = "done";
    });
  return { ok: true, job };
}
