import { describe, expect, it, vi } from "vitest";

const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath }));

import { revalidatePathSafely } from "./revalidate";

describe("revalidatePathSafely", () => {
  it("revalidates inside a request", () => {
    revalidatePath.mockImplementation(() => undefined);
    revalidatePathSafely("/requests");
    expect(revalidatePath).toHaveBeenCalledWith("/requests");
  });

  it("does nothing outside one, where Next.js has no store", () => {
    revalidatePath.mockImplementation(() => {
      throw new Error("Invariant: static generation store missing in revalidatePath /requests");
    });
    expect(() => revalidatePathSafely("/requests")).not.toThrow();
  });

  it("still throws anything else", () => {
    revalidatePath.mockImplementation(() => {
      throw new Error('Route /x used "revalidatePath /requests" during render which is unsupported.');
    });
    expect(() => revalidatePathSafely("/requests")).toThrow(/during render/);
  });
});
