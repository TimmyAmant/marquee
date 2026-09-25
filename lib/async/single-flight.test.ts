import { describe, expect, it, vi } from "vitest";
import { debounce, singleFlight, whenIdle } from "./single-flight";

describe("singleFlight", () => {
  it("shares one run between overlapping callers", async () => {
    const fn = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return 42;
    });
    const [a, b] = await Promise.all([singleFlight("k", fn), singleFlight("k", fn)]);
    expect([a, b]).toEqual([42, 42]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("runs again once the previous run finished", async () => {
    const fn = vi.fn(async () => 1);
    await singleFlight("k2", fn);
    await singleFlight("k2", fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("clears the key after a failure", async () => {
    await expect(singleFlight("k3", async () => Promise.reject(new Error("x")))).rejects.toThrow("x");
    expect(await singleFlight("k3", async () => "ok")).toBe("ok");
  });
});

describe("whenIdle", () => {
  it("resolves at once with nothing running", async () => {
    await expect(whenIdle("idle-none")).resolves.toBeUndefined();
  });

  it("waits for the running call to finish, even if it fails", async () => {
    let finished = false;
    const run = singleFlight("idle-fail", async () => {
      await new Promise((r) => setTimeout(r, 5));
      finished = true;
      throw new Error("boom");
    });
    run.catch(() => undefined);
    await whenIdle("idle-fail");
    expect(finished).toBe(true);
  });
});

describe("debounce", () => {
  it("fires once after a burst", () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    for (let i = 0; i < 10; i++) debounce("d", 100, fn);
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
