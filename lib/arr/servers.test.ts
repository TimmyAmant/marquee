import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));

import { arrServerWebhookUrl, compareServers, defaultServerName, toArrServerDto, type ArrServer } from "./servers";

function server(overrides: Partial<ArrServer> = {}): ArrServer {
  return {
    id: "4f0c2a8e-1b7d-4c1e-9a55-3c2d8e6f7a10",
    userId: "54caac33-0000-4000-8000-000000000000",
    kind: "sonarr",
    name: "Sonarr",
    baseUrl: "http://192.168.1.10:8989",
    apiKey: "super-secret-api-key",
    is4k: false,
    isDefault: true,
    qualityProfileId: 4,
    rootFolderPath: "/tv",
    tags: [],
    seriesType: "standard",
    seasonFolders: true,
    animeQualityProfileId: null,
    animeRootFolderPath: null,
    animeTags: [],
    webhookSecret: "9b1e",
    createdAt: new Date("2026-09-01T00:00:00Z"),
    ...overrides,
  };
}

describe("toArrServerDto", () => {
  it("never carries the API key or anything that holds it", () => {
    const dto = toArrServerDto(server(), "http://marquee.local:3000");
    expect(JSON.stringify(dto)).not.toContain("super-secret-api-key");
    expect(dto).not.toHaveProperty("apiKey");
    expect(dto.hasApiKey).toBe(true);
  });

  it("builds the per-server webhook URL with its own secret", () => {
    const dto = toArrServerDto(server(), "http://marquee.local:3000");
    expect(dto.webhookUrl).toBe(
      "http://marquee.local:3000/api/webhooks/servers/4f0c2a8e-1b7d-4c1e-9a55-3c2d8e6f7a10?secret=9b1e",
    );
    expect(arrServerWebhookUrl("https://m.example", { id: "x", webhookSecret: "y" })).toBe(
      "https://m.example/api/webhooks/servers/x?secret=y",
    );
  });

  it("gives a Radarr no Sonarr-only settings", () => {
    const dto = toArrServerDto(
      server({ kind: "radarr", seriesType: "anime", seasonFolders: true, animeTags: [1], animeRootFolderPath: "/a" }),
      "http://m",
    );
    expect(dto).toMatchObject({
      seriesType: null,
      seasonFolders: null,
      animeQualityProfileId: null,
      animeRootFolderPath: null,
      animeTags: [],
    });
  });

  it("says whether adding can work", () => {
    expect(toArrServerDto(server(), "http://m").fullyConfigured).toBe(true);
    expect(toArrServerDto(server({ rootFolderPath: null }), "http://m").fullyConfigured).toBe(false);
  });

  it("shows a migrated Sonarr (no season folders stored) as it adds", () => {
    expect(toArrServerDto(server({ seriesType: null, seasonFolders: null }), "http://m")).toMatchObject({
      seriesType: "standard",
      seasonFolders: false,
    });
  });
});

describe("compareServers", () => {
  it("orders Sonarr, then Radarr; standard before 4K; default, then oldest first", () => {
    const old = new Date("2026-01-01");
    const newer = new Date("2026-06-01");
    const list = [
      server({ id: "r4k", kind: "radarr", is4k: true, isDefault: true, createdAt: old }),
      server({ id: "r2", kind: "radarr", isDefault: false, createdAt: old }),
      server({ id: "r1", kind: "radarr", isDefault: true, createdAt: newer }),
      server({ id: "s2", kind: "sonarr", isDefault: false, createdAt: newer }),
      server({ id: "s3", kind: "sonarr", isDefault: false, createdAt: old }),
      server({ id: "s1", kind: "sonarr", isDefault: true, createdAt: newer }),
    ];
    expect([...list].sort(compareServers).map((s) => s.id)).toEqual(["s1", "s3", "s2", "r1", "r2", "r4k"]);
  });
});

describe("defaultServerName", () => {
  it("names a new server after its kind, numbering it when that's taken", () => {
    expect(defaultServerName("radarr", false, [])).toBe("Radarr");
    expect(defaultServerName("sonarr", true, ["Sonarr"])).toBe("4K Sonarr");
    expect(defaultServerName("radarr", false, ["Radarr", "radarr 2"])).toBe("Radarr 3");
  });
});
