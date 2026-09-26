import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));

import { pushMessageFor } from "./deliver";

const base = { id: "n1", message: "Anna requested \"Dune\"", mediaType: "movie" as const, tmdbId: 438631, requestId: null };

describe("pushMessageFor", () => {
  it("opens the title for ordinary notifications", () => {
    expect(pushMessageFor({ ...base, eventType: "downloaded" })).toEqual({
      title: "Ready to watch",
      body: base.message,
      url: "/title/movie/438631",
      tag: "n1",
    });
  });

  it("carries the request, for Approve / Decline, and opens Requests", () => {
    expect(pushMessageFor({ ...base, eventType: "request_created", requestId: "r1" })).toEqual({
      title: "New request",
      body: base.message,
      url: "/requests",
      tag: "n1",
      requestId: "r1",
    });
  });
});
