import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authenticateJellyfinUser,
  jellyfinUserImageUrl,
  normalizeJellyfinUserId,
  parseJellyfinAuthResult,
  parseJellyfinUser,
} from "./accounts";

// Shaped after Jellyfin 10.x's real answers (OpenAPI: AuthenticationResult,
// UserDto, UserPolicy), trimmed.
const USER_DTO = {
  Name: "anna",
  ServerId: "3f8e5c2a9b7d4e1f8a6c5b4d3e2f1a0b",
  Id: "4c2d0e8f9a1b4c3d8e7f6a5b4c3d2e1f",
  PrimaryImageTag: "9a8b7c6d",
  HasPassword: true,
  HasConfiguredPassword: true,
  EnableAutoLogin: false,
  LastLoginDate: "2026-09-20T18:00:00.0000000Z",
  Configuration: { PlayDefaultAudioTrack: true },
  Policy: { IsAdministrator: false, IsHidden: true, IsDisabled: false, EnableAllFolders: true },
};

const AUTH_RESULT = {
  User: USER_DTO,
  SessionInfo: { Id: "session-1", UserId: USER_DTO.Id, DeviceId: "marquee-x" },
  AccessToken: "jf-access-token",
  ServerId: USER_DTO.ServerId,
};

describe("normalizeJellyfinUserId", () => {
  it("accepts both the dashed and the plain form", () => {
    expect(normalizeJellyfinUserId("4C2D0E8F-9A1B-4C3D-8E7F-6A5B4C3D2E1F")).toBe("4c2d0e8f9a1b4c3d8e7f6a5b4c3d2e1f");
    expect(normalizeJellyfinUserId("4c2d0e8f9a1b4c3d8e7f6a5b4c3d2e1f")).toBe("4c2d0e8f9a1b4c3d8e7f6a5b4c3d2e1f");
  });

  it("rejects anything else", () => {
    expect(normalizeJellyfinUserId("not-an-id")).toBeNull();
    expect(normalizeJellyfinUserId(12)).toBeNull();
    expect(normalizeJellyfinUserId("")).toBeNull();
  });
});

describe("parseJellyfinUser", () => {
  it("reads a UserDto", () => {
    expect(parseJellyfinUser(USER_DTO)).toEqual({
      id: "4c2d0e8f9a1b4c3d8e7f6a5b4c3d2e1f",
      name: "anna",
      isAdministrator: false,
      isDisabled: false,
      primaryImageTag: "9a8b7c6d",
    });
  });

  it("copes without a Policy or picture", () => {
    expect(parseJellyfinUser({ Name: "bob", Id: USER_DTO.Id })).toMatchObject({
      isAdministrator: false,
      isDisabled: false,
      primaryImageTag: null,
    });
  });

  it("refuses a user without a name or id", () => {
    expect(parseJellyfinUser({ Id: USER_DTO.Id })).toBeNull();
    expect(parseJellyfinUser({ Name: "x" })).toBeNull();
    expect(parseJellyfinUser(null)).toBeNull();
  });
});

describe("parseJellyfinAuthResult", () => {
  it("reads the user and the session token", () => {
    const parsed = parseJellyfinAuthResult(AUTH_RESULT);
    expect(parsed?.user.id).toBe("4c2d0e8f9a1b4c3d8e7f6a5b4c3d2e1f");
    expect(parsed?.accessToken).toBe("jf-access-token");
  });

  it("refuses an answer without a user", () => {
    expect(parseJellyfinAuthResult({ AccessToken: "x" })).toBeNull();
  });
});

describe("jellyfinUserImageUrl", () => {
  it("points at the user's primary image, or nothing", () => {
    const user = parseJellyfinUser(USER_DTO)!;
    expect(jellyfinUserImageUrl("http://jf:8096/", user)).toBe(
      "http://jf:8096/Users/4c2d0e8f9a1b4c3d8e7f6a5b4c3d2e1f/Images/Primary?tag=9a8b7c6d",
    );
    expect(jellyfinUserImageUrl("http://jf:8096", { ...user, primaryImageTag: null })).toBeNull();
  });
});

describe("authenticateJellyfinUser", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(answer: Response) {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init: RequestInit) => {
        calls.push({ url: String(url), init });
        return String(url).endsWith("/Sessions/Logout") ? new Response(null, { status: 204 }) : answer.clone();
      }),
    );
    return calls;
  }

  it("posts Username/Pw with a client descriptor, then logs the session out", async () => {
    const calls = stubFetch(Response.json(AUTH_RESULT));
    const result = await authenticateJellyfinUser("http://jf:8096/", "anna", 'pa"ss');
    expect(result).toEqual({ ok: true, user: parseJellyfinUser(USER_DTO) });

    const [signIn, logout] = calls;
    expect(signIn.url).toBe("http://jf:8096/Users/AuthenticateByName");
    expect(signIn.init.method).toBe("POST");
    expect(JSON.parse(String(signIn.init.body))).toEqual({ Username: "anna", Pw: 'pa"ss' });
    const headers = signIn.init.headers as Record<string, string>;
    expect(headers["X-Emby-Authorization"]).toMatch(/^MediaBrowser Client="Marquee", Device="[^"]+", DeviceId="marquee-[^"]+", Version="[^"]+"$/);
    expect(headers.Authorization).toBe(headers["X-Emby-Authorization"]);
    expect(headers["X-Emby-Token"]).toBeUndefined();

    expect(logout.url).toBe("http://jf:8096/Sessions/Logout");
    expect((logout.init.headers as Record<string, string>)["X-Emby-Token"]).toBe("jf-access-token");
  });

  it("answers ok: false for wrong credentials", async () => {
    stubFetch(new Response("Error processing request.", { status: 401 }));
    expect(await authenticateJellyfinUser("http://jf:8096", "anna", "wrong")).toEqual({ ok: false });
  });

  it("answers ok: false for a disabled user", async () => {
    stubFetch(Response.json({ ...AUTH_RESULT, User: { ...USER_DTO, Policy: { IsDisabled: true } } }));
    expect(await authenticateJellyfinUser("http://jf:8096", "anna", "pw")).toEqual({ ok: false });
  });

  it("throws when Jellyfin itself fails, so it isn't reported as a wrong password", async () => {
    stubFetch(new Response("boom", { status: 500 }));
    await expect(authenticateJellyfinUser("http://jf:8096", "anna", "pw")).rejects.toThrow("(500)");
  });
});
