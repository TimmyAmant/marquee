import { describe, expect, it } from "vitest";
import {
  apiKeyActAsLabel,
  apiKeyCreatedLabel,
  apiKeyExpiryLabel,
  apiKeyLastUsedLabel,
  apiKeyScopeLabel,
} from "@/lib/api/api-key-labels";
import { englishT, translatorFor } from "@/lib/i18n/catalog";

const t = englishT();

describe("API key labels", () => {
  const now = new Date("2026-09-26T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const min = 60 * 1000;

  it("names the scope and who the key acts as", () => {
    expect(apiKeyScopeLabel(t, "read")).toBe("Read-only");
    expect(apiKeyScopeLabel(t, "full")).toBe("Full access");
    expect(apiKeyActAsLabel(t, { actAs: null })).toBeNull();
    expect(apiKeyActAsLabel(t, { actAs: { userId: "u", displayName: "Kid", username: "member1", label: "Kid" } })).toBe("as Kid");
  });

  it("says when it expires", () => {
    expect(apiKeyExpiryLabel(t, { expiresAt: null, expired: false })).toBe("Never expires");
    expect(apiKeyExpiryLabel(t, { expiresAt: "2026-12-19T08:30:00.000Z", expired: false })).toBe("Expires Dec 19, 2026");
    expect(apiKeyExpiryLabel(t, { expiresAt: "2026-01-01T00:00:00.000Z", expired: true })).toBe("Expired");
    expect(apiKeyCreatedLabel(t, { createdAt: "2026-09-20T08:30:00.000Z" })).toBe("Created Sep 20, 2026");
  });

  it("says when it was last used", () => {
    expect(apiKeyLastUsedLabel(t, { lastUsedAt: null }, now)).toBe("Never used");
    expect(apiKeyLastUsedLabel(t, { lastUsedAt: ago(30 * 1000) }, now)).toBe("Last used just now");
    expect(apiKeyLastUsedLabel(t, { lastUsedAt: ago(25 * min) }, now)).toBe("Last used 25 minutes ago");
    expect(apiKeyLastUsedLabel(t, { lastUsedAt: ago(60 * min) }, now)).toBe("Last used 1 hour ago");
    expect(apiKeyLastUsedLabel(t, { lastUsedAt: ago(30 * 60 * min) }, now)).toBe("Last used yesterday");
    expect(apiKeyLastUsedLabel(t, { lastUsedAt: ago(6 * 24 * 60 * min) }, now)).toBe("Last used 6 days ago");
    expect(apiKeyLastUsedLabel(t, { lastUsedAt: "2026-07-04T12:00:00.000Z" }, now)).toBe("Last used Jul 4, 2026");
  });

  it("speaks the page's language", () => {
    const fr = translatorFor("fr");
    expect(apiKeyLastUsedLabel(fr, { lastUsedAt: ago(25 * min) }, now)).toBe("Utilisée il y a 25 minutes");
    expect(apiKeyExpiryLabel(fr, { expiresAt: "2026-12-19T08:30:00.000Z", expired: false })).toBe("Expire le 19 déc. 2026");
  });
});
