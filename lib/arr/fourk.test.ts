import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/integrations/credentials", () => ({ getArrCredential: async () => null, isArrFullyConfigured: () => false }));
vi.mock("@/lib/radarr/client", () => ({}));
vi.mock("@/lib/sonarr/client", () => ({}));

import { arrInstanceFor, arrInstanceLabel, arrKindOf, getFourKStatus, isFourK } from "./fourk";

describe("4K instances", () => {
  it("map each title type to its instance, and back to the service it speaks", () => {
    expect(arrInstanceFor("movie", false)).toBe("radarr");
    expect(arrInstanceFor("movie", true)).toBe("radarr4k");
    expect(arrInstanceFor("tv", true)).toBe("sonarr4k");
    expect(arrKindOf("sonarr4k")).toBe("sonarr");
    expect(arrKindOf("radarr")).toBe("radarr");
    expect(isFourK("radarr4k")).toBe(true);
    expect(isFourK("sonarr")).toBe(false);
  });

  it("name them for people", () => {
    expect(arrInstanceLabel("radarr4k")).toBe("4K Radarr");
    expect(arrInstanceLabel("sonarr")).toBe("Sonarr");
  });

  it("have no 4K status without a 4K instance", async () => {
    expect(await getFourKStatus("admin", "movie", 603, null)).toBeNull();
  });
});
