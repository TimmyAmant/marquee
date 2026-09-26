import { describe, expect, it } from "vitest";
import {
  MAX_LIVE_PLEX_PINS,
  MAX_LIVE_PLEX_PINS_PER_OWNER,
  MAX_LIVE_PLEX_PINS_SHARED,
  SHARED_PIN_OWNER,
  claimPlexPin,
  consumeLoginTicket,
  createPlexPinHandle,
  getPlexPin,
  issueLoginTicket,
  LOGIN_TICKET_TTL_MS,
  PIN_CHECK_SPACING_MS,
  PLEX_PIN_TTL_MS,
  shouldCheckPin,
} from "./login-tickets";


let ownerCount = 0;

/** createPlexPinHandle from a fresh address each time, so the caps don't
 * get in the way of the tests that aren't about them. */
function makeHandle(entry: Omit<Parameters<typeof createPlexPinHandle>[0], "owner">, now?: number) {
  const created = createPlexPinHandle({ ...entry, owner: `10.0.0.${++ownerCount}` }, now);
  if (!created) throw new Error("hit the live PIN cap");
  return created;
}

describe("login tickets", () => {
  it("are long random strings, different every time", () => {
    const a = issueLoginTicket("u1");
    const b = issueLoginTicket("u1");
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it("can be used exactly once", () => {
    const ticket = issueLoginTicket("u1");
    expect(consumeLoginTicket(ticket)).toBe("u1");
    expect(consumeLoginTicket(ticket)).toBeNull();
  });

  it("expire after two minutes, and an expired one is gone too", () => {
    const now = 1_000_000;
    const ticket = issueLoginTicket("u1", now);
    expect(consumeLoginTicket(ticket, now + LOGIN_TICKET_TTL_MS + 1)).toBeNull();
    expect(consumeLoginTicket(ticket, now)).toBeNull();
  });

  it("still work right up to the deadline", () => {
    const now = 2_000_000;
    const ticket = issueLoginTicket("u2", now);
    expect(consumeLoginTicket(ticket, now + LOGIN_TICKET_TTL_MS)).toBe("u2");
  });

  it("ignore anything that isn't a known ticket", () => {
    expect(consumeLoginTicket(undefined)).toBeNull();
    expect(consumeLoginTicket("")).toBeNull();
    expect(consumeLoginTicket(42)).toBeNull();
    expect(consumeLoginTicket("not-a-ticket")).toBeNull();
  });
});

describe("Plex PIN handles", () => {
  const signIn = { kind: "sign_in" } as const;

  it("find their PIN for the purpose that started them", () => {
    const { handle } = makeHandle({ pinId: 7, clientId: "c", purpose: signIn });
    const lookup = getPlexPin(handle, signIn);
    expect(lookup.status).toBe("ok");
    if (lookup.status === "ok") expect(lookup.entry.pinId).toBe(7);
  });

  it("are bound: a sign-in handle can't link, and a link handle only works for its account", () => {
    const signInHandle = makeHandle({ pinId: 1, clientId: "c", purpose: signIn }).handle;
    expect(getPlexPin(signInHandle, { kind: "link", userId: "u1" }).status).toBe("expired");

    const linkHandle = makeHandle({ pinId: 2, clientId: "c", purpose: { kind: "link", userId: "u1" } }).handle;
    expect(getPlexPin(linkHandle, { kind: "link", userId: "u2" }).status).toBe("expired");
    expect(getPlexPin(linkHandle, signIn).status).toBe("expired");
    expect(getPlexPin(linkHandle, { kind: "link", userId: "u1" }).status).toBe("ok");
  });

  it("expire after ten minutes", () => {
    const now = 5_000_000;
    const { handle, expiresAt } = makeHandle({ pinId: 3, clientId: "c", purpose: signIn }, now);
    expect(expiresAt).toBe(now + PLEX_PIN_TTL_MS);
    expect(getPlexPin(handle, signIn, now + PLEX_PIN_TTL_MS + 1).status).toBe("expired");
    expect(getPlexPin(handle, signIn, now).status).toBe("expired");
  });

  it("can be claimed once", () => {
    const { handle } = makeHandle({ pinId: 4, clientId: "c", purpose: signIn });
    expect(claimPlexPin(handle)).toBe(true);
    expect(claimPlexPin(handle)).toBe(false);
    expect(getPlexPin(handle, signIn).status).toBe("expired");
  });

  it("aren't checked with plex.tv more than once a second", () => {
    const { handle } = makeHandle({ pinId: 5, clientId: "c", purpose: signIn });
    const lookup = getPlexPin(handle, signIn);
    if (lookup.status !== "ok") throw new Error("expected a live handle");
    const now = 10_000_000;
    expect(shouldCheckPin(lookup.entry, now)).toBe(true);
    expect(shouldCheckPin(lookup.entry, now + PIN_CHECK_SPACING_MS - 1)).toBe(false);
    expect(shouldCheckPin(lookup.entry, now + PIN_CHECK_SPACING_MS)).toBe(true);
  });

  it("reject junk", () => {
    expect(getPlexPin(undefined, signIn).status).toBe("expired");
    expect(getPlexPin(123, signIn).status).toBe("expired");
    expect(getPlexPin("nope", signIn).status).toBe("expired");
  });
});

describe("the live Plex PIN caps", () => {
  const start = (owner: string, at: number) =>
    createPlexPinHandle({ pinId: 1, clientId: "c", purpose: { kind: "sign_in" }, owner }, at);

  it("allow a few per address, and other addresses still get in", () => {
    const now = Date.now() + 10 * 24 * 60 * 60 * 1000; // clear of other tests' PINs
    for (let i = 0; i < MAX_LIVE_PLEX_PINS_PER_OWNER; i++) expect(start("192.0.2.1", now)).not.toBeNull();
    expect(start("192.0.2.1", now)).toBeNull();
    expect(start("192.0.2.2", now)).not.toBeNull();
    // Once they've expired, the first address has room again.
    expect(start("192.0.2.1", now + 11 * 60 * 1000)).not.toBeNull();
  });

  it("give unknown addresses a shared, bigger allowance", () => {
    const now = Date.now() + 20 * 24 * 60 * 60 * 1000;
    for (let i = 0; i < MAX_LIVE_PLEX_PINS_SHARED; i++) expect(start(SHARED_PIN_OWNER, now)).not.toBeNull();
    expect(start(SHARED_PIN_OWNER, now)).toBeNull();
  });

  it("refuse new PINs past the overall cap until old ones expire", () => {
    const now = Date.now() + 30 * 24 * 60 * 60 * 1000;
    let made = 0;
    while (start(`198.51.100.${made}`, now) !== null) made++;
    expect(made).toBe(MAX_LIVE_PLEX_PINS);
    expect(start("203.0.113.9", now)).toBeNull();
    expect(start("203.0.113.9", now + 11 * 60 * 1000)).not.toBeNull();
  });
});

describe("Plex Watchlist handles", () => {
  it("only work for the watchlist of the account that started them", () => {
    const { handle } = makeHandle({ pinId: 9, clientId: "c", purpose: { kind: "watchlist", userId: "u1" } });
    expect(getPlexPin(handle, { kind: "watchlist", userId: "u1" }).status).toBe("ok");
    expect(getPlexPin(handle, { kind: "watchlist", userId: "u2" }).status).toBe("expired");
    expect(getPlexPin(handle, { kind: "link", userId: "u1" }).status).toBe("expired");
    expect(getPlexPin(handle, { kind: "sign_in" }).status).toBe("expired");
    const link = makeHandle({ pinId: 10, clientId: "c", purpose: { kind: "link", userId: "u1" } }).handle;
    expect(getPlexPin(link, { kind: "watchlist", userId: "u1" }).status).toBe("expired");
  });
});
