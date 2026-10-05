import { describe, expect, it } from "vitest";
import { orError } from "./or-error";

describe("orError", () => {
  it("passes a result through", async () => {
    expect(await orError(Promise.resolve<{ ok?: boolean; error?: string }>({ ok: true }), "failed")).toEqual({ ok: true });
  });

  it("turns a failed call into the error to show", async () => {
    expect(await orError(Promise.reject<{ error?: string }>(new Error("fetch failed")), "Something went wrong.")).toEqual({
      error: "Something went wrong.",
    });
  });
});
