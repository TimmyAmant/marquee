import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { arrOverrideRules, arrServers, users, type MediaType } from "@/lib/db/schema";
import { fail, type CoreResult } from "@/lib/core-result";
import { getT } from "@/lib/i18n/server";
import { getOrFetchTitle } from "@/lib/tmdb/cache";
import { UUID_PATTERN } from "@/lib/arr/servers";
import {
  MAX_RULE_ENTRIES,
  MAX_RULE_NAME,
  pickRule,
  ruleOverrides,
  subjectFromTmdb,
  type OverrideRule,
} from "@/lib/arr/override-rules";
import type { AddOverrides } from "@/lib/arr/add-options";

// The database side of lib/arr/override-rules.ts: the admin's rules (Settings
// › Services, /api/v1/settings/override-rules) and the one that applies to a
// request. Only rules on the admin's own servers exist: a rule goes with its
// server when the server is removed.

type RuleRow = typeof arrOverrideRules.$inferSelect;

function toRule(row: RuleRow): OverrideRule {
  return {
    id: row.id,
    serverId: row.serverId,
    name: row.name,
    enabled: row.enabled,
    genres: row.genres ?? [],
    languages: row.languages ?? [],
    keywords: row.keywords ?? [],
    userIds: row.userIds ?? [],
    qualityProfileId: row.qualityProfileId,
    rootFolderPath: row.rootFolderPath,
    tags: row.tags,
    position: row.position,
  };
}

/** Every rule on the owner's servers, in their order. */
export async function listOverrideRules(ownerId: string): Promise<OverrideRule[]> {
  const rows = await db
    .select({ rule: arrOverrideRules })
    .from(arrOverrideRules)
    .innerJoin(arrServers, eq(arrServers.id, arrOverrideRules.serverId))
    .where(eq(arrServers.userId, ownerId))
    .orderBy(asc(arrOverrideRules.position), asc(arrOverrideRules.createdAt));
  return rows.map((r) => toRule(r.rule));
}

export type OverrideRuleInput = Omit<OverrideRule, "id" | "position">;

function intList(value: unknown): number[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || !value.every((v) => typeof v === "number" && Number.isSafeInteger(v) && v > 0)) return null;
  return [...new Set(value as number[])];
}

/** A rule from a JSON body or the website's form, checked. Pure apart from
 * the message language. */
export async function parseOverrideRuleInput(body: Record<string, unknown>): Promise<CoreResult<{ input: OverrideRuleInput }>> {
  const t = await getT();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return fail("invalid", t("notify.ruleNameMissing"));
  if (name.length > MAX_RULE_NAME) return fail("invalid", t("notify.ruleNameTooLong", { max: MAX_RULE_NAME }));
  if (typeof body.serverId !== "string" || !UUID_PATTERN.test(body.serverId)) {
    return fail("invalid", t("notify.ruleServerMissing"));
  }
  const genres = intList(body.genres);
  if (!genres) return fail("invalid", t("notify.ruleBadList", { field: "genres" }));
  const languages = body.languages === undefined || body.languages === null ? [] : body.languages;
  if (!Array.isArray(languages) || !languages.every((l) => typeof l === "string" && /^[a-z]{2,3}$/i.test(l))) {
    return fail("invalid", t("notify.ruleBadList", { field: "languages" }));
  }
  const rawKeywords = body.keywords === undefined || body.keywords === null ? [] : body.keywords;
  if (
    !Array.isArray(rawKeywords) ||
    !rawKeywords.every(
      (k) =>
        k &&
        typeof k === "object" &&
        Number.isSafeInteger((k as { id?: unknown }).id) &&
        ((k as { id: number }).id > 0) &&
        (typeof (k as { name?: unknown }).name === "string" || (k as { name?: unknown }).name === undefined),
    )
  ) {
    return fail("invalid", t("notify.ruleBadList", { field: "keywords" }));
  }
  const keywords = [
    ...new Map(
      (rawKeywords as { id: number; name?: string }[]).map((k) => [k.id, { id: k.id, name: (k.name ?? String(k.id)).slice(0, 80) }]),
    ).values(),
  ];
  const userIds = body.userIds === undefined || body.userIds === null ? [] : body.userIds;
  if (!Array.isArray(userIds) || !userIds.every((u) => typeof u === "string" && UUID_PATTERN.test(u))) {
    return fail("invalid", t("notify.ruleBadList", { field: "userIds" }));
  }
  if ([genres, languages, keywords, userIds].some((list) => list.length > MAX_RULE_ENTRIES)) {
    return fail("invalid", t("notify.ruleTooMany", { max: MAX_RULE_ENTRIES }));
  }
  const profile = body.qualityProfileId;
  if (profile !== undefined && profile !== null && !(Number.isSafeInteger(profile) && (profile as number) > 0)) {
    return fail("invalid", t("notify.ruleBadList", { field: "qualityProfileId" }));
  }
  const folder = body.rootFolderPath;
  if (folder !== undefined && folder !== null && typeof folder !== "string") {
    return fail("invalid", t("notify.ruleBadList", { field: "rootFolderPath" }));
  }
  let tags: number[] | null = null;
  if (body.tags !== undefined && body.tags !== null) {
    tags = intList(body.tags);
    if (!tags) return fail("invalid", t("notify.ruleBadList", { field: "tags" }));
  }
  const input: OverrideRuleInput = {
    serverId: body.serverId.toLowerCase(),
    name,
    enabled: body.enabled === undefined ? true : body.enabled === true,
    genres,
    languages: [...new Set((languages as string[]).map((l) => l.toLowerCase()))],
    keywords,
    userIds: [...new Set((userIds as string[]).map((u) => u.toLowerCase()))],
    qualityProfileId: (profile as number | null | undefined) ?? null,
    rootFolderPath: typeof folder === "string" && folder.trim() ? folder.trim() : null,
    tags,
  };
  // A rule with nothing but its server still means something: matching
  // requests go to that server, with its defaults.
  return { ok: true, input };
}

async function checkReferences(ownerId: string, input: OverrideRuleInput): Promise<CoreResult> {
  const t = await getT();
  const [server] = await db
    .select({ id: arrServers.id })
    .from(arrServers)
    .where(and(eq(arrServers.id, input.serverId), eq(arrServers.userId, ownerId)))
    .limit(1);
  if (!server) return fail("invalid", t("notify.ruleServerMissing"));
  if (input.userIds.length > 0) {
    const found = await db.select({ id: users.id }).from(users).where(inArray(users.id, input.userIds));
    if (found.length !== input.userIds.length) return fail("invalid", t("notify.ruleUnknownMember"));
  }
  return { ok: true };
}

async function ownRule(ownerId: string, id: string): Promise<RuleRow | null> {
  if (!UUID_PATTERN.test(id)) return null;
  const [row] = await db
    .select({ rule: arrOverrideRules })
    .from(arrOverrideRules)
    .innerJoin(arrServers, eq(arrServers.id, arrOverrideRules.serverId))
    .where(and(eq(arrOverrideRules.id, id), eq(arrServers.userId, ownerId)))
    .limit(1);
  return row?.rule ?? null;
}

export async function createOverrideRule(ownerId: string, input: OverrideRuleInput): Promise<CoreResult<{ rule: OverrideRule }>> {
  const checked = await checkReferences(ownerId, input);
  if (!checked.ok) return checked;
  const existing = await listOverrideRules(ownerId);
  const position = existing.reduce((max, r) => Math.max(max, r.position), -1) + 1;
  const [row] = await db
    .insert(arrOverrideRules)
    .values({ ...input, position })
    .returning();
  return { ok: true, rule: toRule(row) };
}

export async function updateOverrideRule(
  ownerId: string,
  id: string,
  input: OverrideRuleInput,
): Promise<CoreResult<{ rule: OverrideRule }>> {
  if (!(await ownRule(ownerId, id))) return fail("not_found", (await getT())("notify.ruleNotFound"));
  const checked = await checkReferences(ownerId, input);
  if (!checked.ok) return checked;
  const [row] = await db
    .update(arrOverrideRules)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(arrOverrideRules.id, id))
    .returning();
  return { ok: true, rule: toRule(row) };
}

export async function deleteOverrideRule(ownerId: string, id: string): Promise<CoreResult> {
  if (!(await ownRule(ownerId, id))) return fail("not_found", (await getT())("notify.ruleNotFound"));
  await db.delete(arrOverrideRules).where(eq(arrOverrideRules.id, id));
  return { ok: true };
}

export type AppliedRule = { rule: OverrideRule; overrides: AddOverrides };

/** The rule that applies to a request for this title by `requesterId`, if
 * any (with `onlyServerId`, only that server's rules). Never throws: a
 * title TMDb can't describe right now matches only rules without title
 * conditions. */
export async function ruleForRequest(
  ownerId: string,
  request: { mediaType: MediaType; tmdbId: number; is4k: boolean; requesterId: string | null },
  onlyServerId?: string,
): Promise<AppliedRule | null> {
  try {
    const rules = await listOverrideRules(ownerId);
    if (rules.length === 0) return null;
    const servers = await db
      .select({ id: arrServers.id, kind: arrServers.kind, is4k: arrServers.is4k })
      .from(arrServers)
      .where(eq(arrServers.userId, ownerId));
    const title = await getOrFetchTitle(request.mediaType, request.tmdbId).catch(() => null);
    const subject = subjectFromTmdb(title?.rawTmdb ?? null, request);
    const rule = pickRule(rules, servers, subject, onlyServerId);
    return rule ? { rule, overrides: ruleOverrides(rule) } : null;
  } catch (err) {
    console.error("[override-rules] couldn't check the rules:", err);
    return null;
  }
}
