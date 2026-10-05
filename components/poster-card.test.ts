import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PosterCard } from "@/components/poster-card";
import { I18nProvider } from "@/lib/i18n/client";
import { clientMessagesFor } from "@/lib/i18n/catalog";

// The series poster's "have/total" on the title line: right of the name,
// muted when every aired episode is on disk, the Downloading tone while
// some are missing, and read out as "96 of 96 episodes".

function render(props: Partial<Parameters<typeof PosterCard>[0]>) {
  return renderToStaticMarkup(
    createElement(
      I18nProvider,
      // The children come as the third argument.
      { locale: "en", messages: clientMessagesFor("en") } as Parameters<typeof I18nProvider>[0],
      createElement(PosterCard, { href: "/title/tv/1407", posterPath: null, name: "Homeland", ...props }),
    ),
  );
}

describe("PosterCard episode count", () => {
  it("shows a complete count muted, with a spoken label", () => {
    const html = render({ episodes: { have: 96, total: 96 } });
    expect(html).toContain(">96/96<");
    expect(html).toContain("tabular-nums text-text-muted");
    expect(html).toContain("96 of 96 episodes");
    expect(html).not.toContain("text-downloading");
  });

  it("shows a partial count in the Downloading tone", () => {
    const html = render({ episodes: { have: 120, total: 125 } });
    expect(html).toContain(">120/125<");
    expect(html).toContain("text-downloading");
    expect(html).toContain("120 of 125 episodes");
  });

  it("sits on the title line, after the name", () => {
    const html = render({ episodes: { have: 1, total: 2 } });
    const name = html.indexOf(">Homeland</p>");
    const count = html.indexOf(">1/2<");
    expect(name).toBeGreaterThan(-1);
    expect(count).toBeGreaterThan(name);
    // Both inside the same title link.
    const link = html.lastIndexOf("<a", name);
    expect(html.indexOf("</a>", link)).toBeGreaterThan(count);
  });

  it("shows nothing without a count", () => {
    expect(render({})).not.toContain("tabular-nums");
    expect(render({ episodes: null })).not.toContain("episodes");
  });
});
