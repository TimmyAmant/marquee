import { describe, expect, it } from "vitest";
import {
  MAX_LIVE_PLEX_PINS,
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


/** createPlexPinHandle, which is null only at the live-PIN cap. */
function makeHandle(...args: Parameters<typeof createPlexPinHandle>) {
  const created = createPlexPinHandle(...args);
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

describe("the live Plex PIN cap", () => {
  it("refuses new PINs past the cap until old ones expire", () => {
    const now = Date.now() + 10 * 24 * 60 * 60 * 1000; // clear of other tests' PINs
    const start = (at: number) => createPlexPinHandle({ pinId: 1, clientId: "c", purpose: { kind: "sign_in" } }, at);
    let made = 0;
    while (start(now) !== null) made++;
    expect(made).toBeLessThanOrEqual(MAX_LIVE_PLEX_PINS);
    expect(start(now)).toBeNull();
    // Once they've expired they're swept, and there's room again.
    expect(start(now + 11 * 60 * 1000)).not.toBeNull();
  });
});
