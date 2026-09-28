import { describe, expect, it } from "vitest";
import {
  ANIME_KEYWORD_ID,
  layerOverrides,
  pickRule,
  ruleMatches,
  ruleOverrides,
  subjectFromTmdb,
  type OverrideRule,
  type RuleServer,
} from "@/lib/arr/override-rules";

const SONARR = "00000000-0000-4000-8000-000000000001";
const ANIME_SONARR = "00000000-0000-4000-8000-000000000002";
const RADARR = "00000000-0000-4000-8000-000000000003";
const RADARR_4K = "00000000-0000-4000-8000-000000000004";
const DAD = "00000000-0000-4000-8000-0000000000da";
const KID = "00000000-0000-4000-8000-0000000000c1";

const servers: RuleServer[] = [
  { id: SONARR, kind: "sonarr", is4k: false },
  { id: ANIME_SONARR, kind: "sonarr", is4k: false },
  { id: RADARR, kind: "radarr", is4k: false },
  { id: RADARR_4K, kind: "radarr", is4k: true },
];

function rule(patch: Partial<OverrideRule>): OverrideRule {
  return {
    id: patch.name ?? "rule",
    serverId: RADARR,
    name: "rule",
    enabled: true,
    genres: [],
    languages: [],
    keywords: [],
    userIds: [],
    qualityProfileId: null,
    rootFolderPath: null,
    tags: null,
    position: 0,
    ...patch,
  };
}

const spiritedAway = subjectFromTmdb(
  {
    genres: [{ id: 16, name: "Animation" }, { id: 14, name: "Fantasy" }],
    original_language: "ja",
    keywords: { keywords: [{ id: 1, name: "spirit" }, { id: 2, name: "bathhouse" }] },
  },
  { mediaType: "movie", is4k: false, requesterId: KID },
);

const frieren = subjectFromTmdb(
  {
    genres: [{ id: 16, name: "Animation" }],
    original_language: "ja",
    keywords: { results: [{ id: ANIME_KEYWORD_ID, name: "anime" }] },
  },
  { mediaType: "tv", is4k: false, requesterId: DAD },
);

describe("subjectFromTmdb", () => {
  it("reads movie and show keywords, genres and language", () => {
    expect(spiritedAway).toMatchObject({ genres: [16, 14], language: "ja", keywords: [1, 2], requesterId: KID });
    expect(frieren.keywords).toEqual([ANIME_KEYWORD_ID]);
  });

  it("copes with nothing from TMDb", () => {
    expect(subjectFromTmdb(null, { mediaType: "movie", is4k: false, requesterId: null })).toMatchObject({
      genres: [],
      language: null,
      keywords: [],
    });
  });
});

describe("ruleMatches", () => {
  it("matches everything when no condition is set", () => {
    expect(ruleMatches(rule({}), spiritedAway)).toBe(true);
  });

  it("needs any one entry of each list that's set", () => {
    expect(ruleMatches(rule({ genres: [99, 16] }), spiritedAway)).toBe(true);
    expect(ruleMatches(rule({ genres: [99] }), spiritedAway)).toBe(false);
    expect(ruleMatches(rule({ languages: ["fr", "ja"] }), spiritedAway)).toBe(true);
    expect(ruleMatches(rule({ languages: ["fr"] }), spiritedAway)).toBe(false);
    expect(ruleMatches(rule({ keywords: [{ id: 2, name: "bathhouse" }] }), spiritedAway)).toBe(true);
    expect(ruleMatches(rule({ keywords: [{ id: 3, name: "robot" }] }), spiritedAway)).toBe(false);
  });

  it("needs every list that's set", () => {
    expect(ruleMatches(rule({ genres: [16], languages: ["ja"], userIds: [KID] }), spiritedAway)).toBe(true);
    expect(ruleMatches(rule({ genres: [16], languages: ["ja"], userIds: [DAD] }), spiritedAway)).toBe(false);
  });

  it("goes by who asked", () => {
    const show = { ...frieren, keywords: [] };
    expect(ruleMatches(rule({ userIds: [DAD] }), show)).toBe(true);
    expect(ruleMatches(rule({ userIds: [DAD] }), { ...show, requesterId: null })).toBe(false);
  });

  it("skips a turned-off rule", () => {
    expect(ruleMatches(rule({ enabled: false }), spiritedAway)).toBe(false);
  });

  it("leaves an anime show to its server's anime settings unless the rule names the anime keyword", () => {
    expect(ruleMatches(rule({ genres: [16] }), frieren)).toBe(false);
    expect(ruleMatches(rule({ keywords: [{ id: ANIME_KEYWORD_ID, name: "anime" }] }), frieren)).toBe(true);
  });
});

describe("pickRule", () => {
  it("only picks a rule on a server of the request's kind and 4K-ness", () => {
    const rules = [rule({ name: "shows", serverId: SONARR }), rule({ name: "4k", serverId: RADARR_4K })];
    expect(pickRule(rules, servers, spiritedAway)).toBeNull();
    expect(pickRule(rules, servers, { ...spiritedAway, is4k: true })?.name).toBe("4k");
  });

  it("prefers the rule with the most conditions, then the one listed first", () => {
    const rules = [
      rule({ name: "catch-all", position: 0 }),
      rule({ name: "japanese", languages: ["ja"], position: 1 }),
      rule({ name: "japanese animation", languages: ["ja"], genres: [16], position: 2 }),
      rule({ name: "japanese animation, later", languages: ["ja"], genres: [16], position: 3 }),
    ];
    expect(pickRule(rules, servers, spiritedAway)?.name).toBe("japanese animation");
    expect(pickRule(rules.slice(0, 2), servers, { ...spiritedAway, language: "en" })?.name).toBe("catch-all");
  });

  it("with a server picked by hand, only looks at that server's rules", () => {
    const rules = [
      rule({ name: "anime", serverId: ANIME_SONARR, keywords: [{ id: ANIME_KEYWORD_ID, name: "anime" }] }),
      rule({ name: "dad", serverId: SONARR, userIds: [DAD] }),
    ];
    expect(pickRule(rules, servers, frieren)?.name).toBe("anime");
    expect(pickRule(rules, servers, frieren, SONARR)).toBeNull();
    expect(pickRule(rules, servers, { ...frieren, keywords: [] }, SONARR)?.name).toBe("dad");
  });

  it("ignores a rule whose server is gone", () => {
    expect(pickRule([rule({ serverId: "00000000-0000-4000-8000-00000000dead" })], servers, spiritedAway)).toBeNull();
  });
});

describe("applying a rule", () => {
  const anime = rule({ serverId: ANIME_SONARR, qualityProfileId: 7, rootFolderPath: "/anime", tags: [3] });

  it("turns the rule into Advanced picks, leaving unset fields to the server", () => {
    expect(ruleOverrides(anime)).toEqual({ serverId: ANIME_SONARR, qualityProfileId: 7, rootFolderPath: "/anime", tags: [3] });
    expect(ruleOverrides(rule({ serverId: RADARR }))).toEqual({ serverId: RADARR });
  });

  it("lets picks made by hand win field by field", () => {
    expect(layerOverrides(ruleOverrides(anime), { qualityProfileId: 9 })).toEqual({
      serverId: ANIME_SONARR,
      qualityProfileId: 9,
      rootFolderPath: "/anime",
      tags: [3],
    });
    expect(layerOverrides(ruleOverrides(anime), {})).toEqual(ruleOverrides(anime));
    expect(layerOverrides(null, { tags: [1] })).toEqual({ tags: [1] });
  });

  it("drops the rule when another server is picked by hand", () => {
    expect(layerOverrides(ruleOverrides(anime), { serverId: SONARR })).toEqual({ serverId: SONARR });
  });
});
