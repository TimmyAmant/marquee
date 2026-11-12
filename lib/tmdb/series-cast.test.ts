import { describe, expect, it } from "vitest";
import { wholeSeriesCast } from "./series-cast";

describe("wholeSeriesCast", () => {
  it("keeps billing order and each person's main character", () => {
    const cast = wholeSeriesCast(
      [
        { id: 3, name: "Sandra Oh", profile_path: null, order: 2, roles: [{ character: "Cristina Yang", episode_count: 221 }] },
        { id: 1, name: "Ellen Pompeo", profile_path: "/e.jpg", order: 0, roles: [{ character: "Meredith Grey", episode_count: 420 }] },
        {
          id: 9,
          name: "Two Parts",
          profile_path: null,
          order: 5,
          roles: [{ character: "Small", episode_count: 1 }, { character: "Main", episode_count: 40 }, { character: "" }],
        },
      ],
      2,
    );
    expect(cast.map((m) => [m.name, m.character])).toEqual([
      ["Ellen Pompeo", "Meredith Grey"],
      ["Sandra Oh", "Cristina Yang"],
    ]);
    expect(wholeSeriesCast([{ id: 9, name: "X", profile_path: null, order: 0, roles: [{ character: "Small", episode_count: 1 }, { character: "Main", episode_count: 40 }] }])[0].character).toBe("Main / Small");
  });
});

describe("wholeSeriesCrew", () => {
  it("lists one entry per job, most episodes first", async () => {
    const { wholeSeriesCrew } = await import("./series-cast");
    const crew = wholeSeriesCrew([
      { id: 1, name: "Late", department: "Production", jobs: [{ job: "Executive Producer", episode_count: 20 }] },
      { id: 2, name: "Shonda", department: "Production", jobs: [{ job: "Executive Producer", episode_count: 400 }, { job: "Writer", episode_count: 30 }] },
    ]);
    expect(crew.map((c) => `${c.name}:${c.job}`)).toEqual(["Shonda:Executive Producer", "Shonda:Writer", "Late:Executive Producer"]);
  });
});
