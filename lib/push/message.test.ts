import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));

import { pushMessageFor } from "./deliver";
import { englishT, translatorFor } from "@/lib/i18n/catalog";

const base = { id: "n1", message: "Anna requested \"Dune\"", mediaType: "movie" as const, tmdbId: 438631, requestId: null };

describe("pushMessageFor", () => {
  it("opens the title for ordinary notifications", () => {
    expect(pushMessageFor({ ...base, eventType: "downloaded" }, englishT())).toEqual({
      title: "Ready to watch",
      body: base.message,
      url: "/title/movie/438631",
      tag: "n1",
    });
  });

  it("opens a shared title under its own heading", () => {
    const message = "Susan shared “Ice Age” with you: Watch it";
    expect(pushMessageFor({ ...base, message, tmdbId: 425, eventType: "title_shared" }, englishT())).toEqual({
      title: "Shared with you",
      body: message,
      url: "/title/movie/425",
      tag: "n1",
    });
  });

  it("carries the request, for Approve / Decline, and opens Requests", () => {
    expect(pushMessageFor({ ...base, eventType: "request_created", requestId: "r1" }, englishT())).toEqual({
      title: "New request",
      body: base.message,
      url: "/requests",
      tag: "n1",
      requestId: "r1",
      labels: {
        approve: "Approve",
        decline: "Decline",
        approved: `Approved: ${base.message}`,
        declined: `Declined: ${base.message}`,
        signIn: "Open Marquee and sign in, then try again.",
        unreachable: "Couldn't reach your Marquee server.",
      },
    });
  });

  it("words the request's buttons in the recipient's language", () => {
    const labels = pushMessageFor({ ...base, eventType: "request_created", requestId: "r1" }, translatorFor("de")).labels;
    expect(labels?.approve).toBe("Genehmigen");
    expect(labels?.declined).toBe(`Abgelehnt: ${base.message}`);
  });

  it("heads it in the recipient's language", () => {
    expect(pushMessageFor({ ...base, eventType: "downloaded" }, translatorFor("fr")).title).toBe("Prêt à regarder");
  });
});
