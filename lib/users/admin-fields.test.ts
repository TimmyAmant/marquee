import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("argon2", () => ({ hash: async () => "", verify: async () => true }));
vi.mock("@/lib/api/token-store", () => ({ revokeAllApiTokensForUser: async () => undefined }));
vi.mock("@/lib/push/deliver", () => ({ removeAllSubscriptions: async () => undefined }));

import { parseAdminFields } from "./household";

describe("parseAdminFields", () => {
  it("leaves out what wasn't sent", () => {
    expect(parseAdminFields({})).toEqual({ ok: true, set: {} });
  });

  it("takes a role and limits, with blank meaning no limit", () => {
    expect(
      parseAdminFields({ role: "trusted", movieQuotaLimit: "5", movieQuotaDays: "7", tvQuotaLimit: "", tvQuotaDays: 30 }),
    ).toEqual({ ok: true, set: { role: "trusted", movieQuotaLimit: 5, movieQuotaDays: 7, tvQuotaLimit: null, tvQuotaDays: 30 } });
    expect(parseAdminFields({ movieQuotaLimit: null })).toEqual({ ok: true, set: { movieQuotaLimit: null } });
  });

  it("refuses making anyone admin, and out-of-range numbers", () => {
    expect(parseAdminFields({ role: "admin" })).toMatchObject({ ok: false });
    expect(parseAdminFields({ movieQuotaLimit: 0 })).toMatchObject({ ok: false });
    expect(parseAdminFields({ tvQuotaLimit: 2.5 })).toMatchObject({ ok: false });
    expect(parseAdminFields({ tvQuotaDays: 400 })).toMatchObject({ ok: false });
  });
});
