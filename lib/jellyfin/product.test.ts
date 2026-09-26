import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));

import { productOf } from "./product";

describe("productOf", () => {
  it("tells Jellyfin from Emby by the server's own product name", () => {
    expect(productOf({ ProductName: "Jellyfin Server", Version: "10.11.0" })).toBe("jellyfin");
    expect(productOf({ Version: "4.10.0.40" })).toBe("emby");
    expect(productOf({ ProductName: "Emby Server", Version: "4.9.0" })).toBe("emby");
    // Neither sign (a proxy dropping the field): stays Jellyfin.
    expect(productOf({ Version: "10.9.11" })).toBe("jellyfin");
    expect(productOf({})).toBe("jellyfin");
  });
});
