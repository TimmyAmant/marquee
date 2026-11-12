import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// One account, "admin"/"correct horse". argon2 is stubbed so a hash is just
// "hash:<password>", and the users lookup answers from that one row.
const { verifyMock } = vi.hoisted(() => ({
  verifyMock: vi.fn(async (hash: string, password: string) => hash === `hash:${password}`),
}));
vi.mock("argon2", () => ({
  hash: vi.fn(async (password: string) => `hash:${password}`),
  verify: verifyMock,
}));
vi.mock("drizzle-orm", () => ({ eq: (_column: unknown, value: unknown) => value }));
vi.mock("@/lib/db/schema", () => ({ users: { username: "username" } }));
vi.mock("@/lib/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (username: string) => ({
          limit: async () =>
            username === currentAdmin ? [{ id: "u1", username, passwordHash: "hash:correct horse" }] : [],
        }),
      }),
    }),
  },
}));

let currentAdmin = "";

import {
  authenticateWithPassword,
  LOGIN_BACKOFF_AFTER,
  LOGIN_CLIENT_LIMIT,
  LOGIN_IP_LIMIT,
  loginBackoffMs,
} from "./password-login";

// Buckets live for the whole process, so every test signs in as a fresh
// username (and, where addresses matter, from fresh addresses).
let run = 0;
beforeEach(() => {
  run++;
  currentAdmin = `admin${run}`;
  verifyMock.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("authenticateWithPassword", () => {
  it("refuses an address after its failures, but not the owner signing in from elsewhere", async () => {
    const attacker = `198.51.100.${run}`;
    for (let i = 0; i < LOGIN_CLIENT_LIMIT; i++) {
      expect(await authenticateWithPassword(currentAdmin, "guess", attacker)).toMatchObject({
        reason: "invalid_credentials",
      });
    }
    expect(await authenticateWithPassword(currentAdmin, "guess", attacker)).toMatchObject({
      reason: "rate_limited",
    });
    // Even the right password is refused from the address that ran out…
    expect(await authenticateWithPassword(currentAdmin, "correct horse", attacker)).toMatchObject({
      reason: "rate_limited",
    });
    // …but the owner, somewhere else, still gets in.
    expect(await authenticateWithPassword(currentAdmin, "correct horse", `203.0.113.${run}`)).toMatchObject({
      ok: true,
    });
  });

  it("refuses an address spraying guesses across many usernames", async () => {
    const attacker = `198.51.101.${run}`;
    for (let i = 0; i < LOGIN_IP_LIMIT; i++) {
      await authenticateWithPassword(`spray${run}-${i}`, "guess", attacker);
    }
    expect(await authenticateWithPassword(`spray${run}-new`, "guess", attacker)).toMatchObject({
      reason: "rate_limited",
    });
  });

  it("never locks a username out when the client address is unknown — it slows attempts down instead", async () => {
    vi.useFakeTimers();
    const attempt = async (password: string) => {
      const pending = authenticateWithPassword(currentAdmin, password, null);
      await vi.runAllTimersAsync();
      return pending;
    };

    for (let i = 0; i < 12; i++) {
      expect(await attempt("guess")).toMatchObject({ reason: "invalid_credentials" });
    }
    expect(await attempt("correct horse")).toMatchObject({ ok: true });
  });

  it("queues attempts on a busy username so parallel guesses can't outrun the backoff", async () => {
    vi.useFakeTimers();
    const start = Date.now();
    const settledAt: number[] = [];
    const attempts = Array.from({ length: LOGIN_BACKOFF_AFTER + 3 }, () =>
      authenticateWithPassword(currentAdmin, "guess", null).then(() => settledAt.push(Date.now() - start)),
    );
    await vi.runAllTimersAsync();
    await Promise.all(attempts);

    // The first LOGIN_BACKOFF_AFTER go straight through; after that each one
    // waits for the one before it plus the growing spacing.
    const b = (n: number) => loginBackoffMs(n);
    const expected = [0, b(LOGIN_BACKOFF_AFTER), b(LOGIN_BACKOFF_AFTER) + b(LOGIN_BACKOFF_AFTER + 1)];
    expect(settledAt.slice(0, LOGIN_BACKOFF_AFTER)).toEqual(Array(LOGIN_BACKOFF_AFTER).fill(0));
    expect(settledAt.slice(LOGIN_BACKOFF_AFTER)).toEqual(expected);
  });

  it("refuses instead of queueing once a burst would push the wait past the cap, and recovers quickly", async () => {
    vi.useFakeTimers();
    const start = Date.now();
    const results = await (async () => {
      const attempts = Array.from({ length: 500 }, () => authenticateWithPassword(currentAdmin, "guess", null));
      await vi.runAllTimersAsync();
      return Promise.all(attempts);
    })();

    // Only a handful got queued; the rest were turned away rather than
    // booking slots stretching an hour out.
    const queued = results.filter((r) => !r.ok && r.reason === "invalid_credentials").length;
    expect(queued).toBeLessThan(15);
    expect(results.filter((r) => !r.ok && r.reason === "rate_limited").length).toBe(500 - queued);
    // The whole burst drained in well under a minute…
    expect(Date.now() - start).toBeLessThan(60_000);

    // …so the owner's right password gets in without waiting behind it.
    const pending = authenticateWithPassword(currentAdmin, "correct horse", null);
    await vi.runAllTimersAsync();
    expect(await pending).toMatchObject({ ok: true });
  });

  it("gives a correct password its attempt back", async () => {
    const ip = `192.0.2.${run}`;
    for (let i = 0; i < LOGIN_CLIENT_LIMIT * 2; i++) {
      expect(await authenticateWithPassword(currentAdmin, "correct horse", ip)).toMatchObject({ ok: true });
    }
  });

  it("checks an unknown username against a dummy hash, so it takes as long as a wrong password", async () => {
    expect(await authenticateWithPassword(`nobody${run}`, "guess", null)).toMatchObject({
      reason: "invalid_credentials",
    });
    expect(verifyMock).toHaveBeenCalledTimes(1);
    expect(verifyMock.mock.calls[0][0]).toMatch(/^hash:/);
  });
});

describe("loginBackoffMs", () => {
  it("is free below the threshold, then doubles up to the cap", () => {
    expect(loginBackoffMs(LOGIN_BACKOFF_AFTER - 1)).toBe(0);
    expect(loginBackoffMs(LOGIN_BACKOFF_AFTER)).toBe(1000);
    expect(loginBackoffMs(LOGIN_BACKOFF_AFTER + 1)).toBe(2000);
    expect(loginBackoffMs(LOGIN_BACKOFF_AFTER + 20)).toBe(10_000);
  });
});
