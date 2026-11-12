import { describe, expect, it } from "vitest";
import { crewJobsByTitle, jobMessageKey } from "./crew-jobs";

describe("crew jobs", () => {
  it("lists each title's jobs, most telling first, without thanks", () => {
    const jobs = crewJobsByTitle([
      { media_type: "movie", id: 27205, job: "Producer" },
      { media_type: "movie", id: 27205, job: "Writer" },
      { media_type: "movie", id: 27205, job: "Director" },
      { media_type: "movie", id: 27205, job: "Director" },
      { media_type: "movie", id: 1, job: "Thanks" },
      { media_type: "tv", id: 27205, job: "Executive Producer" },
    ]);
    expect(jobs.get("movie:27205")).toEqual(["Director", "Writer", "Producer"]);
    expect(jobs.has("movie:1")).toBe(false);
    expect(jobs.get("tv:27205")).toEqual(["Executive Producer"]);
  });

  it("keeps three jobs at most, unknown ones after the known", () => {
    const jobs = crewJobsByTitle(
      ["Gaffer", "Editor", "Producer", "Director"].map((job) => ({ media_type: "movie", id: 2, job })),
    );
    expect(jobs.get("movie:2")).toEqual(["Director", "Producer", "Editor"]);
  });

  it("names the common jobs for translation", () => {
    expect(jobMessageKey("Executive Producer")).toBe("discover.jobExecutiveProducer");
    expect(jobMessageKey("Gaffer")).toBeNull();
  });
});
