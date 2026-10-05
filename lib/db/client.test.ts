import { afterEach, describe, expect, it, vi } from "vitest";

// The database pool is opened once per process, in production as well: a
// second copy of the module (Next.js loads one for server actions and one
// for route handlers) reuses it instead of opening a pool of its own.

const postgresMock = vi.hoisted(() => vi.fn((_url: string, _options: object) => ({ pool: Symbol("pool") })));
vi.mock("postgres", () => ({ default: postgresMock }));
vi.mock("drizzle-orm/postgres-js", () => ({ drizzle: (client: unknown) => ({ client }) }));

afterEach(() => {
  vi.unstubAllEnvs();
  globalThis.__marqueePgClient = undefined;
});

describe("the database client", () => {
  it("opens one pool however many times the module loads, in production too", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://marquee@localhost/marquee");
    vi.stubEnv("NODE_ENV", "production");
    globalThis.__marqueePgClient = undefined;

    const first = await import("./client");
    vi.resetModules();
    const second = await import("./client");

    expect(postgresMock).toHaveBeenCalledTimes(1);
    expect(postgresMock.mock.calls[0][1]).toEqual({ max: 10 });
    expect((second.db as unknown as { client: unknown }).client).toBe((first.db as unknown as { client: unknown }).client);
  });
});
