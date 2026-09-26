import { afterEach, describe, expect, it, vi } from "vitest";
import { ARR_LOOKUP_BUDGET_MS, askEachServer, bestByStatus, statusRank, withinBudget } from "./fan-out";

afterEach(() => {
  vi.useRealTimers();
});

describe("withinBudget", () => {
  it("answers with the promise when it's in time", async () => {
    await expect(withinBudget(Promise.resolve(5), 0)).resolves.toBe(5);
  });

  it("falls back when the promise fails", async () => {
    await expect(withinBudget(Promise.reject(new Error("down")), "fallback")).resolves.toBe("fallback");
  });

  it("falls back when the promise is slower than the budget", async () => {
    vi.useFakeTimers();
    const never = new Promise<string>(() => undefined);
    const answer = withinBudget(never, "slow");
    await vi.advanceTimersByTimeAsync(ARR_LOOKUP_BUDGET_MS);
    await expect(answer).resolves.toBe("slow");
  });
});

describe("askEachServer", () => {
  it("asks every server at once and keeps their order", async () => {
    vi.useFakeTimers();
    const started: string[] = [];
    const answers = askEachServer(
      ["default", "second", "down", "slow"],
      (server) => {
        started.push(server);
        if (server === "down") throw new Error("unreachable");
        if (server === "slow") return new Promise<string>(() => undefined);
        return new Promise<string>((resolve) => setTimeout(() => resolve(`${server}!`), server === "default" ? 200 : 100));
      },
      null as string | null,
    );
    // All four were asked before any answered: in parallel, not one by one.
    await vi.advanceTimersByTimeAsync(0);
    expect(started).toEqual(["default", "second", "down", "slow"]);
    await vi.advanceTimersByTimeAsync(ARR_LOOKUP_BUDGET_MS);
    await expect(answers).resolves.toEqual([
      { server: "default", value: "default!" },
      { server: "second", value: "second!" },
      { server: "down", value: null },
      { server: "slow", value: null },
    ]);
  });

  it("takes no time with no servers", async () => {
    await expect(askEachServer([], async () => 1, 0)).resolves.toEqual([]);
  });
});

describe("bestByStatus", () => {
  it("picks the furthest-along entry, the first of equals", () => {
    const entries = [
      { name: "a", status: "tracked_monitored" as const },
      { name: "b", status: "owned" as const },
      { name: "c", status: "owned" as const },
    ];
    expect(bestByStatus(entries, (e) => e.status)?.name).toBe("b");
    expect(bestByStatus([], () => "owned")).toBeNull();
  });

  it("ranks the statuses", () => {
    expect(statusRank("owned")).toBeGreaterThan(statusRank("tracked_downloading"));
    expect(statusRank("tracked_downloading")).toBeGreaterThan(statusRank("tracked_monitored"));
    expect(statusRank("tracked_monitored")).toBeGreaterThan(statusRank("coming_soon"));
    expect(statusRank("coming_soon")).toBeGreaterThan(statusRank("untracked"));
    expect(statusRank(null)).toBe(0);
    expect(statusRank("something new")).toBe(0);
  });
});
