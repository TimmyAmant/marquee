import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));

import { productOf } from "./product";

describe("productOf", () => {
  it("tells Jellyfin from Emby by the server's own product name", () => {
    expect(productOf({ ProductName: "Jellyfin Server" })).toBe("jellyfin");
    expect(productOf({})).toBe("emby");
    expect(productOf({ ProductName: "Emby Server" })).toBe("emby");
  });
});
