import { describe, expect, it } from "vitest";
import { pickTitleLogo, trimTitleImages, type TmdbLogoImage } from "./logo";

const logo = (over: Partial<TmdbLogoImage>): TmdbLogoImage => ({
  file_path: "/a.png",
  iso_639_1: "en",
  aspect_ratio: 3,
  vote_average: 5,
  vote_count: 1,
  ...over,
});

describe("pickTitleLogo", () => {
  it("is null without logos", () => {
    expect(pickTitleLogo(undefined)).toBeNull();
    expect(pickTitleLogo({})).toBeNull();
    expect(pickTitleLogo({ logos: [] })).toBeNull();
  });

  it("prefers English over language-less, then the best voted", () => {
    const picked = pickTitleLogo({
      logos: [
        logo({ file_path: "/null.png", iso_639_1: null, vote_average: 9 }),
        logo({ file_path: "/en-low.png", vote_average: 4 }),
        logo({ file_path: "/en-high.png", vote_average: 6 }),
      ],
    });
    expect(picked?.file_path).toBe("/en-high.png");
  });

  it("falls back to a language-less logo", () => {
    expect(pickTitleLogo({ logos: [logo({ file_path: "/x.png", iso_639_1: null })] })?.file_path).toBe("/x.png");
  });

  it("skips SVGs, other languages and stacked (taller than wide) artwork", () => {
    expect(
      pickTitleLogo({
        logos: [
          logo({ file_path: "/a.svg" }),
          logo({ file_path: "/de.png", iso_639_1: "de" }),
          logo({ file_path: "/tall.png", aspect_ratio: 0.8 }),
        ],
      }),
    ).toBeNull();
  });
});

describe("trimTitleImages", () => {
  it("keeps only the chosen logo", () => {
    const details = { id: 1, images: { logos: [logo({ file_path: "/b.png", vote_average: 1 }), logo({ file_path: "/c.png" })] } };
    expect(trimTitleImages(details).images).toEqual({ logos: [logo({ file_path: "/c.png" })] });
  });

  it("leaves details without images alone", () => {
    const details: { id: number; images?: { logos: TmdbLogoImage[] } } = { id: 1 };
    expect(trimTitleImages(details)).toBe(details);
  });
});
