import { describe, expect, it } from "vitest";
import {
  importablePlexUsers,
  parsePlexAccount,
  parsePlexUsersXml,
  plexServerAccess,
  type PlexResourceSummary,
} from "./accounts";

// Shaped after plex.tv's real answers (python-plexapi's MyPlexAccount for
// /api/v2/user; Plexopedia's "Get Users" and Seerr/Tautulli's parsers for
// /api/users; Marquee's own lib/plex/client.ts for /api/v2/resources),
// trimmed to the fields that matter plus a few that don't.
const V2_USER = {
  id: 1234567,
  uuid: "a1b2c3d4e5f6a7b8",
  username: "anna.berg",
  title: "Anna Berg",
  friendlyName: "Anna",
  email: "anna@example.com",
  thumb: "https://plex.tv/users/a1b2c3d4e5f6a7b8/avatar?c=1690000000",
  authToken: "secret-token-never-kept",
  hasPassword: true,
  home: false,
  subscription: { active: false, status: "Inactive" },
};

const USERS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<MediaContainer friendlyName="myPlex" identifier="com.plexapp.plugins.myplex" machineIdentifier="acct-machine" totalSize="4" size="4">
<User id="1111" title="Friend &amp; Co" username="friendly" email="friend@example.com" recommendationsPlaylistId="" thumb="https://plex.tv/users/f1/avatar?c=1" protected="0" home="0" allowTuners="0" allowSync="1" allowCameraUpload="0" allowChannels="0" allowSubtitleAdmin="0" filterAll="" filterMovies="" filterMusic="" filterPhotos="" filterTelevision="" restricted="0">
<Server id="555" serverId="999" machineIdentifier="admin-server" name="Living Room" lastSeenAt="1690000000" numLibraries="3" allLibraries="1" owned="1" pending="0"/>
</User>
<User id="2222" title="Other Server Only" username="elsewhere" email="e@example.com" thumb="" protected="0" home="0" restricted="0">
<Server id="556" serverId="998" machineIdentifier="someone-elses-server" name="Cabin" owned="1" pending="0"/>
</User>
<User id="3333" title="Kids" username="" email="" thumb="https://plex.tv/users/k1/avatar?c=2" protected="1" home="1" restricted="1"/>
<User id="4444" title="Partner" username="partner" email="p@example.com" thumb="" home="1" restricted="0">
</User>
</MediaContainer>`;

describe("parsePlexAccount", () => {
  it("reads the account from /api/v2/user and leaves the token behind", () => {
    const account = parsePlexAccount(V2_USER);
    expect(account).toEqual({
      id: "1234567",
      uuid: "a1b2c3d4e5f6a7b8",
      username: "anna.berg",
      title: "Anna Berg",
      email: "anna@example.com",
      thumb: "https://plex.tv/users/a1b2c3d4e5f6a7b8/avatar?c=1690000000",
    });
    expect(JSON.stringify(account)).not.toContain("secret-token");
  });

  it("copes with missing optional fields", () => {
    expect(parsePlexAccount({ id: 42, username: "solo" })).toEqual({
      id: "42",
      uuid: null,
      username: "solo",
      title: "solo",
      email: null,
      thumb: null,
    });
  });

  it("refuses an answer without a usable id", () => {
    expect(parsePlexAccount({ username: "x" })).toBeNull();
    expect(parsePlexAccount({ id: 0, username: "x" })).toBeNull();
    expect(parsePlexAccount({ id: "abc", username: "x" })).toBeNull();
    expect(parsePlexAccount(null)).toBeNull();
    expect(parsePlexAccount([])).toBeNull();
  });
});

describe("parsePlexUsersXml", () => {
  const users = parsePlexUsersXml(USERS_XML);

  it("reads every User with its shared servers", () => {
    expect(users.map((u) => u.id)).toEqual(["1111", "2222", "3333", "4444"]);
    expect(users[0]).toMatchObject({
      id: "1111",
      username: "friendly",
      title: "Friend & Co",
      email: "friend@example.com",
      home: false,
      restricted: false,
      serverMachineIds: ["admin-server"],
    });
  });

  it("handles a self-closing managed Home user without a username", () => {
    expect(users[2]).toMatchObject({ id: "3333", username: "Kids", title: "Kids", home: true, restricted: true });
    expect(users[2].serverMachineIds).toEqual([]);
  });

  it("returns nothing for an empty or unrelated document", () => {
    expect(parsePlexUsersXml('<MediaContainer size="0"></MediaContainer>')).toEqual([]);
    expect(parsePlexUsersXml("")).toEqual([]);
    expect(parsePlexUsersXml("<html><body>error</body></html>")).toEqual([]);
  });
});

describe("importablePlexUsers", () => {
  it("keeps friends of the admin's server and Home users, drops friends of other servers only", () => {
    const kept = importablePlexUsers(parsePlexUsersXml(USERS_XML), ["admin-server"]);
    expect(kept.map((u) => u.id)).toEqual(["1111", "3333", "4444"]);
  });
});

describe("plexServerAccess", () => {
  const resources: PlexResourceSummary[] = [
    { clientIdentifier: "phone-1", provides: "client,player" },
    { clientIdentifier: "admin-server", provides: "server", owned: false },
    { clientIdentifier: "their-own", provides: "server", owned: true },
  ];

  it("grants access when one of the admin's servers is shared with the account", () => {
    expect(plexServerAccess(resources, ["admin-server"])).toEqual({ access: true, owner: false });
  });

  it("recognizes the server's owner", () => {
    expect(plexServerAccess(resources, ["their-own"])).toEqual({ access: true, owner: true });
  });

  it("denies accounts without the admin's server, and ignores non-server resources", () => {
    expect(plexServerAccess(resources, ["unknown"])).toEqual({ access: false, owner: false });
    expect(plexServerAccess(resources, ["phone-1"])).toEqual({ access: false, owner: false });
    expect(plexServerAccess([], ["admin-server"])).toEqual({ access: false, owner: false });
  });
});
