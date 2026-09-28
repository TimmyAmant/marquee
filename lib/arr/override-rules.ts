import type { ArrProvider, MediaType } from "@/lib/db/schema";
import type { AddOverrides } from "@/lib/arr/add-options";

// Override rules (Settings › Services, like Seerr's): "requests for Japanese
// anime go to the Anime Sonarr with the Anime profile", "Dad's requests go to
// /mnt/dad". Each rule names a server — which also says whether it's for
// movies or shows and for 4K requests or not — and conditions on the title
// (TMDb genres, original language, keywords) and on who asked. An empty list
// is "any"; within a list any one entry will do; every list that's set must
// match. When several rules match, the one with the most conditions set
// wins, then the one listed first. Pure: the database side is in
// lib/arr/override-rules-server.ts.

/** TMDb's "anime" keyword. An anime show already goes by its server's
 * anime profile, folder and tags (lib/arr/add-options.ts), so a rule only
 * takes one over when it names this keyword itself. */
export const ANIME_KEYWORD_ID = 210024;

export type OverrideRule = {
  id: string;
  serverId: string;
  name: string;
  enabled: boolean;
  genres: number[];
  languages: string[];
  keywords: { id: number; name: string }[];
  userIds: string[];
  qualityProfileId: number | null;
  rootFolderPath: string | null;
  tags: number[] | null;
  position: number;
};

export type RuleServer = { id: string; kind: ArrProvider; is4k: boolean };

/** What a rule is matched against: the request and its title. */
export type RuleSubject = {
  mediaType: MediaType;
  is4k: boolean;
  requesterId: string | null;
  genres: number[];
  language: string | null;
  keywords: number[];
};

type TmdbLike = {
  genres?: { id?: unknown }[];
  original_language?: unknown;
  keywords?: { keywords?: { id?: unknown }[]; results?: { id?: unknown }[] };
};

function ids(list: { id?: unknown }[] | undefined): number[] {
  return (list ?? []).map((item) => item.id).filter((id): id is number => typeof id === "number");
}

/** The genres, language and keywords of a TMDb movie or show record. */
export function subjectFromTmdb(
  raw: unknown,
  request: { mediaType: MediaType; is4k: boolean; requesterId: string | null },
): RuleSubject {
  const record = (raw && typeof raw === "object" ? raw : {}) as TmdbLike;
  return {
    ...request,
    genres: ids(record.genres),
    language: typeof record.original_language === "string" ? record.original_language.toLowerCase() : null,
    keywords: ids(record.keywords?.keywords ?? record.keywords?.results),
  };
}

/** How many kinds of condition a rule sets (0–4). */
export function ruleSpecificity(rule: Pick<OverrideRule, "genres" | "languages" | "keywords" | "userIds">): number {
  return [rule.genres, rule.languages, rule.keywords, rule.userIds].filter((list) => list.length > 0).length;
}

/** Whether the rule's conditions all hold for this title and requester
 * (the server's kind and 4K-ness are checked by pickRule). */
export function ruleMatches(rule: OverrideRule, subject: RuleSubject): boolean {
  if (!rule.enabled) return false;
  const keywordIds = rule.keywords.map((k) => k.id);
  if (subject.mediaType === "tv" && subject.keywords.includes(ANIME_KEYWORD_ID) && !keywordIds.includes(ANIME_KEYWORD_ID)) {
    return false;
  }
  if (rule.userIds.length > 0 && (!subject.requesterId || !rule.userIds.includes(subject.requesterId))) return false;
  if (rule.genres.length > 0 && !rule.genres.some((g) => subject.genres.includes(g))) return false;
  if (rule.languages.length > 0 && (!subject.language || !rule.languages.includes(subject.language))) return false;
  if (keywordIds.length > 0 && !keywordIds.some((k) => subject.keywords.includes(k))) return false;
  return true;
}

/** The rule that decides where this request goes, or null. With
 * `onlyServerId` (a reviewer picked a server) only that server's rules
 * count. */
export function pickRule(
  rules: readonly OverrideRule[],
  servers: readonly RuleServer[],
  subject: RuleSubject,
  onlyServerId?: string,
): OverrideRule | null {
  const kind: ArrProvider = subject.mediaType === "movie" ? "radarr" : "sonarr";
  const byId = new Map(servers.map((s) => [s.id, s]));
  const candidates = rules
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule }) => {
      const server = byId.get(rule.serverId);
      if (!server || server.kind !== kind || server.is4k !== subject.is4k) return false;
      if (onlyServerId && server.id !== onlyServerId) return false;
      return ruleMatches(rule, subject);
    })
    .sort(
      (a, b) =>
        ruleSpecificity(b.rule) - ruleSpecificity(a.rule) || a.rule.position - b.rule.position || a.index - b.index,
    );
  return candidates[0]?.rule ?? null;
}

/** What the rule changes, as Advanced picks. */
export function ruleOverrides(rule: OverrideRule): AddOverrides {
  return {
    serverId: rule.serverId,
    ...(rule.qualityProfileId ? { qualityProfileId: rule.qualityProfileId } : {}),
    ...(rule.rootFolderPath ? { rootFolderPath: rule.rootFolderPath } : {}),
    ...(rule.tags ? { tags: [...rule.tags] } : {}),
  };
}

/** A rule's picks under whatever someone chose by hand: their choices win
 * field by field, and choosing another server drops the rule entirely (its
 * profile, folder and tags belong to its own server). */
export function layerOverrides(rule: AddOverrides | null, manual: AddOverrides): AddOverrides {
  if (!rule) return manual;
  if (manual.serverId && manual.serverId !== rule.serverId) return manual;
  const layered: AddOverrides = { ...rule };
  for (const [key, value] of Object.entries(manual) as [keyof AddOverrides, AddOverrides[keyof AddOverrides]][]) {
    if (value !== undefined) (layered as Record<string, unknown>)[key] = value;
  }
  return layered;
}

export const MAX_RULE_NAME = 80;
export const MAX_RULE_ENTRIES = 50;
